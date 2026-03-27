/**
 * Sistema de Cotización - API y sitio web. Ver todo en línea.
 * Base de datos: Turso (nube) o SQLite local. 100% gratuito.
 */
try { require('dotenv').config(); } catch (_) { /* dotenv opcional: en producción usamos variables del entorno */ }
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');

const app = express();
const auth = require('./auth');
// En la nube (Render, etc.) usan process.env.PORT. Local: 3456 para evitar conflicto con otros servicios en 3000
const PORT = process.env.PORT || 3456;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/config', (req, res) => {
  res.json(auth.getPublicConfig());
});

app.get('/api/storage-health', async (req, res) => {
  try {
    const storage = db.getStorageInfo ? db.getStorageInfo() : { mode: db.useTurso ? 'turso' : 'sqlite', path: null };
    const payload = {
      mode: storage.mode,
      path: storage.path || null,
      persistence: 'unknown',
      details: '',
      now: new Date().toISOString(),
    };
    if (storage.mode === 'turso') {
      payload.persistence = 'persistent_cloud';
      payload.details = 'Base en nube (Turso): persistente entre reinicios y cierres.';
      return res.json(payload);
    }
    if (!storage.path) {
      payload.persistence = 'unknown';
      payload.details = 'No se pudo resolver la ruta del archivo SQLite.';
      return res.json(payload);
    }
    const exists = fs.existsSync(storage.path);
    payload.exists = exists;
    if (!exists) {
      payload.persistence = 'local_file_missing';
      payload.details = 'Aun no existe el archivo SQLite en disco.';
      return res.json(payload);
    }
    const st = fs.statSync(storage.path);
    payload.fileSizeBytes = st.size;
    payload.lastModified = st.mtime.toISOString();
    payload.persistence = 'local_file_persistent';
    payload.details = 'SQLite local en archivo. Persistente mientras no borres/muevas el archivo ni redeployes sobre disco efimero.';
    return res.json(payload);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    if (!auth.AUTH_ENABLED) {
      return res.status(400).json({ error: 'Autenticación desactivada en el servidor (AUTH_ENABLED=0).' });
    }
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    const result = await auth.attemptLogin(username, password);
    if (!result) return res.status(401).json({ error: 'Credenciales incorrectas' });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.use(auth.createApiMiddleware());

app.get('/api/audit', async (req, res) => {
  try {
    if (!auth.AUTH_ENABLED) return res.json({ rows: [], total: 0 });
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const offset = Math.max(0, parseInt(req.query.offset || '0', 10));
    const rows = await db.getAll(
      'SELECT id, username, role, action, method, path, detail, ip, creado_en FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    const one = await db.getOne('SELECT COUNT(*) as c FROM audit_log');
    const total = one && one.c != null ? Number(one.c) : 0;
    res.json({ rows, total, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

/** Normaliza para búsqueda: minúsculas y sin acentos (manómetro === manometro). */
function normalizeForSearch(str) {
  if (str == null || str === '') return '';
  return String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// --- API Catálogos ---
app.get('/api/clientes', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    let rows = await db.getAll('SELECT * FROM clientes ORDER BY nombre LIMIT 500', []);
    if (q) {
      const normQ = normalizeForSearch(q);
      rows = rows.filter(c => normalizeForSearch(c.nombre).includes(normQ) || normalizeForSearch(c.codigo).includes(normQ) || normalizeForSearch(c.rfc).includes(normQ));
      rows = rows.slice(0, 100);
    }
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/clientes/:id', async (req, res) => {
  try {
    const row = await db.getOne('SELECT * FROM clientes WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post('/api/clientes', async (req, res) => {
  try {
    const { codigo, nombre, rfc, contacto, direccion, telefono, email, ciudad } = req.body || {};
    await db.runQuery(
      `INSERT INTO clientes (codigo, nombre, rfc, contacto, direccion, telefono, email, ciudad)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [codigo || null, nombre || '', rfc || null, contacto || null, direccion || null, telefono || null, email || null, ciudad || null]
    );
    const r = await db.getOne('SELECT * FROM clientes ORDER BY id DESC LIMIT 1');
    res.status(201).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put('/api/clientes/:id', async (req, res) => {
  try {
    const { codigo, nombre, rfc, contacto, direccion, telefono, email, ciudad } = req.body || {};
    await db.runQuery(
      `UPDATE clientes SET codigo=?, nombre=?, rfc=?, contacto=?, direccion=?, telefono=?, email=?, ciudad=? WHERE id=?`,
      [codigo || null, nombre || '', rfc || null, contacto || null, direccion || null, telefono || null, email || null, ciudad || null, req.params.id]
    );
    const r = await db.getOne('SELECT * FROM clientes WHERE id = ?', [req.params.id]);
    res.json(r || {});
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.delete('/api/clientes/:id', async (req, res) => {
  try {
    await db.runQuery('DELETE FROM clientes WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// --- Refacciones ---
app.get('/api/refacciones', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    let sql = 'SELECT * FROM refacciones WHERE activo = 1 ORDER BY codigo';
    let params = [];
    if (q) {
      sql = 'SELECT * FROM refacciones WHERE activo = 1 AND (codigo LIKE ? OR descripcion LIKE ?) ORDER BY codigo LIMIT 100';
      const p = `%${q}%`;
      params = [p, p];
    }
    const rows = await db.getAll(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/refacciones/:id', async (req, res) => {
  try {
    const row = await db.getOne('SELECT * FROM refacciones WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post('/api/refacciones', async (req, res) => {
  try {
    const { codigo, descripcion, zona, stock, stock_minimo, precio_unitario, precio_usd, unidad, categoria, subcategoria, imagen_url, manual_url, numero_parte_manual } = req.body || {};
    await db.runQuery(
      `INSERT INTO refacciones (codigo, descripcion, zona, stock, stock_minimo, precio_unitario, precio_usd, unidad, categoria, subcategoria, imagen_url, manual_url, numero_parte_manual)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [codigo || '', descripcion || '', zona || null, Number(stock) || 0, Number(stock_minimo) || 1,
       Number(precio_unitario) || 0, Number(precio_usd) || 0, unidad || 'PZA',
       categoria || null, subcategoria || null, imagen_url || null, manual_url || null, numero_parte_manual || null]
    );
    const r = await db.getOne('SELECT * FROM refacciones ORDER BY id DESC LIMIT 1');
    // Registrar entrada en movimientos_stock si hay stock inicial
    if (r && Number(stock) > 0) {
      await db.runQuery(
        `INSERT INTO movimientos_stock (refaccion_id, tipo, cantidad, costo_unitario, referencia, fecha) VALUES (?, 'entrada', ?, ?, 'Alta inicial', date('now','localtime'))`,
        [r.id, Number(stock), Number(precio_unitario) || 0]
      );
    }
    res.status(201).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put('/api/refacciones/:id', async (req, res) => {
  try {
    const { codigo, descripcion, zona, stock, stock_minimo, precio_unitario, precio_usd, unidad, categoria, subcategoria, imagen_url, manual_url, numero_parte_manual } = req.body || {};
    await db.runQuery(
      `UPDATE refacciones SET codigo=?, descripcion=?, zona=?, stock=?, stock_minimo=?, precio_unitario=?, precio_usd=?, unidad=?, categoria=?, subcategoria=?, imagen_url=?, manual_url=?, numero_parte_manual=? WHERE id=?`,
      [codigo || '', descripcion || '', zona || null, Number(stock) || 0, Number(stock_minimo) || 1,
       Number(precio_unitario) || 0, Number(precio_usd) || 0, unidad || 'PZA',
       categoria || null, subcategoria || null, imagen_url || null, manual_url || null, numero_parte_manual || null,
       req.params.id]
    );
    const r = await db.getOne('SELECT * FROM refacciones WHERE id = ?', [req.params.id]);
    res.json(r || {});
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Ajuste rápido de stock (entrada manual)
app.post('/api/refacciones/:id/ajuste-stock', async (req, res) => {
  try {
    const { cantidad, tipo, costo_unitario, referencia } = req.body || {};
    const ref = await db.getOne('SELECT * FROM refacciones WHERE id = ?', [req.params.id]);
    if (!ref) return res.status(404).json({ error: 'No encontrado' });
    const cant = Number(cantidad) || 0;
    const tipoMov = tipo === 'salida' ? 'salida' : 'entrada';
    const nuevoStock = tipoMov === 'entrada' ? ref.stock + cant : Math.max(0, ref.stock - cant);
    await db.runQuery('UPDATE refacciones SET stock=? WHERE id=?', [nuevoStock, req.params.id]);
    await db.runQuery(
      `INSERT INTO movimientos_stock (refaccion_id, tipo, cantidad, costo_unitario, referencia, fecha) VALUES (?, ?, ?, ?, ?, date('now','localtime'))`,
      [req.params.id, tipoMov, cant, Number(costo_unitario) || 0, referencia || 'Ajuste manual']
    );
    res.json({ ok: true, stock: nuevoStock });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Movimientos de stock de una refacción
app.get('/api/refacciones/:id/movimientos', async (req, res) => {
  try {
    const rows = await db.getAll(
      `SELECT m.*, co.folio as cotizacion_folio FROM movimientos_stock m
       LEFT JOIN cotizaciones co ON co.id = m.cotizacion_id
       WHERE m.refaccion_id = ? ORDER BY m.id DESC LIMIT 100`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Categorías de refacciones (árbol)
app.get('/api/refacciones-categorias', async (req, res) => {
  try {
    const rows = await db.getAll(
      `SELECT DISTINCT categoria, subcategoria FROM refacciones WHERE activo=1 AND categoria IS NOT NULL ORDER BY categoria, subcategoria`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.delete('/api/refacciones/:id', async (req, res) => {
  try {
    await db.runQuery('UPDATE refacciones SET activo = 0 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// --- Máquinas ---
app.get('/api/maquinas', async (req, res) => {
  try {
    const raw = req.query && req.query.cliente_id;
    const clienteNum = raw != null && raw !== '' ? Number(raw) : NaN;
    // COALESCE: filas antiguas con activo NULL deben verse como activas (antes quedaban fuera del listado).
    let sql = 'SELECT m.*, c.nombre as cliente_nombre FROM maquinas m LEFT JOIN clientes c ON c.id = m.cliente_id WHERE COALESCE(m.activo, 1) = 1 ORDER BY m.nombre';
    let params = [];
    if (Number.isFinite(clienteNum) && clienteNum > 0) {
      sql = 'SELECT m.*, c.nombre as cliente_nombre FROM maquinas m LEFT JOIN clientes c ON c.id = m.cliente_id WHERE COALESCE(m.activo, 1) = 1 AND m.cliente_id = ? ORDER BY m.nombre';
      params = [clienteNum];
    }
    const rows = await db.getAll(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/maquinas/:id', async (req, res) => {
  try {
    const row = await db.getOne('SELECT m.*, c.nombre as cliente_nombre FROM maquinas m LEFT JOIN clientes c ON c.id = m.cliente_id WHERE m.id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post('/api/maquinas', async (req, res) => {
  try {
    const { cliente_id, codigo, nombre, marca, modelo, numero_serie, ubicacion } = req.body || {};
    if (!cliente_id) return res.status(400).json({ error: 'cliente_id requerido' });
    await db.runQuery(
      `INSERT INTO maquinas (cliente_id, codigo, nombre, marca, modelo, numero_serie, ubicacion) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [cliente_id, codigo || null, nombre || '', marca || null, modelo || null, numero_serie || null, ubicacion || null]
    );
    const r = await db.getOne('SELECT * FROM maquinas ORDER BY id DESC LIMIT 1');
    res.status(201).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put('/api/maquinas/:id', async (req, res) => {
  try {
    const { cliente_id, codigo, nombre, marca, modelo, numero_serie, ubicacion } = req.body || {};
    await db.runQuery(
      `UPDATE maquinas SET cliente_id=?, codigo=?, nombre=?, marca=?, modelo=?, numero_serie=?, ubicacion=? WHERE id=?`,
      [cliente_id || null, codigo || null, nombre || '', marca || null, modelo || null, numero_serie || null, ubicacion || null, req.params.id]
    );
    const r = await db.getOne('SELECT * FROM maquinas WHERE id = ?', [req.params.id]);
    res.json(r || {});
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.delete('/api/maquinas/:id', async (req, res) => {
  try {
    await db.runQuery('UPDATE maquinas SET activo = 0 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// --- Cotizaciones ---
app.get('/api/cotizaciones', async (req, res) => {
  try {
    const rows = await db.getAll(
      `SELECT co.*, c.nombre as cliente_nombre FROM cotizaciones co JOIN clientes c ON c.id = co.cliente_id ORDER BY co.fecha DESC, co.id DESC LIMIT 500`
    );
    res.json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/cotizaciones/:id', async (req, res) => {
  try {
    const row = await db.getOne(
      'SELECT co.*, c.nombre as cliente_nombre FROM cotizaciones co JOIN clientes c ON c.id = co.cliente_id WHERE co.id = ?',
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    const lineas = await db.getAll(
      `SELECT l.*, r.codigo as codigo, r.descripcion as refaccion_descripcion, m.nombre as maquina_nombre,
              b.fecha as bitacora_fecha, b.tecnico as bitacora_tecnico, b.tiempo_horas as bitacora_tiempo_horas, b.actividades as bitacora_actividades
       FROM cotizacion_lineas l
       LEFT JOIN refacciones r ON r.id = l.refaccion_id
       LEFT JOIN maquinas m ON m.id = l.maquina_id
       LEFT JOIN bitacoras b ON b.id = l.bitacora_id
       WHERE l.cotizacion_id = ?
       ORDER BY l.orden ASC, l.id ASC`,
      [req.params.id]
    );
    res.json({ ...row, lineas: Array.isArray(lineas) ? lineas : [] });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

function calcLinea(tipo, cantidad, precioUnitario, moneda, tipoCambio) {
  const qty = Number(cantidad) || 0;
  const pu = Number(precioUnitario) || 0;
  const st = Math.round(qty * pu * 100) / 100;
  const iv = Math.round(st * 0.16 * 100) / 100;
  const tot = Math.round((st + iv) * 100) / 100;
  const tc = Number(tipoCambio) || 0;
  const mon = (moneda || 'MXN').toUpperCase();
  const puUsd = mon === 'USD' ? pu : (tc > 0 ? Math.round((pu / tc) * 100) / 100 : 0);
  return {
    tipo_linea: tipo,
    cantidad: qty,
    precio_unitario: pu,
    precio_usd: puUsd,
    subtotal: st,
    iva: iv,
    total: tot,
  };
}

async function recalcCotizacionTotals(cotizacionId) {
  const cot = await db.getOne('SELECT * FROM cotizaciones WHERE id = ?', [cotizacionId]);
  if (!cot) return null;
  const lineas = await db.getAll('SELECT * FROM cotizacion_lineas WHERE cotizacion_id = ?', [cotizacionId]);
  const subtotal = (lineas || []).reduce((s, l) => s + (Number(l.subtotal) || 0), 0);
  const iva = (lineas || []).reduce((s, l) => s + (Number(l.iva) || 0), 0);
  const total = (lineas || []).reduce((s, l) => s + (Number(l.total) || 0), 0);
  await db.runQuery('UPDATE cotizaciones SET subtotal=?, iva=?, total=? WHERE id=?', [
    Math.round(subtotal * 100) / 100,
    Math.round(iva * 100) / 100,
    Math.round(total * 100) / 100,
    cotizacionId,
  ]);
  return { subtotal, iva, total };
}

app.get('/api/cotizaciones/:id/lineas', async (req, res) => {
  try {
    const rows = await db.getAll(
      `SELECT l.*, r.codigo as codigo, r.descripcion as refaccion_descripcion, m.nombre as maquina_nombre,
              b.fecha as bitacora_fecha, b.tecnico as bitacora_tecnico, b.tiempo_horas as bitacora_tiempo_horas, b.actividades as bitacora_actividades
       FROM cotizacion_lineas l
       LEFT JOIN refacciones r ON r.id = l.refaccion_id
       LEFT JOIN maquinas m ON m.id = l.maquina_id
       LEFT JOIN bitacoras b ON b.id = l.bitacora_id
       WHERE l.cotizacion_id = ?
       ORDER BY l.orden ASC, l.id ASC`,
      [req.params.id]
    );
    res.json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post('/api/cotizaciones/:id/lineas', async (req, res) => {
  try {
    const cot = await db.getOne('SELECT * FROM cotizaciones WHERE id = ?', [req.params.id]);
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada' });
    const {
      tipo_linea,
      refaccion_id,
      maquina_id,
      bitacora_id,
      descripcion,
      cantidad,
      precio_unitario,
      orden,
    } = req.body || {};
    const tipo = String(tipo_linea || '').trim() || 'otro';
    if (!['refaccion', 'vuelta', 'mano_obra', 'otro'].includes(tipo)) {
      return res.status(400).json({ error: 'tipo_linea inválido' });
    }
    if (tipo === 'refaccion' && !refaccion_id) return res.status(400).json({ error: 'refaccion_id requerido' });
    if (tipo === 'mano_obra' && bitacora_id) {
      const bit = await db.getOne('SELECT * FROM bitacoras WHERE id = ? AND cotizacion_id = ?', [bitacora_id, req.params.id]);
      if (!bit) return res.status(400).json({ error: 'bitacora_id inválido para esta cotización' });
    }
    const calc = calcLinea(tipo, cantidad, precio_unitario, cot.moneda, cot.tipo_cambio);
    await db.runQuery(
      `INSERT INTO cotizacion_lineas (cotizacion_id, refaccion_id, maquina_id, bitacora_id, tipo_linea, descripcion, cantidad, precio_unitario, precio_usd, subtotal, iva, total, orden)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(req.params.id),
        refaccion_id || null,
        maquina_id || null,
        bitacora_id || null,
        calc.tipo_linea,
        descripcion || null,
        calc.cantidad,
        calc.precio_unitario,
        calc.precio_usd,
        calc.subtotal,
        calc.iva,
        calc.total,
        Number.isFinite(Number(orden)) ? Number(orden) : 0,
      ]
    );
    await recalcCotizacionTotals(req.params.id);
    const r = await db.getOne('SELECT * FROM cotizacion_lineas ORDER BY id DESC LIMIT 1');
    res.status(201).json(r || {});
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put('/api/cotizaciones/:id/lineas/:lineaId', async (req, res) => {
  try {
    const cot = await db.getOne('SELECT * FROM cotizaciones WHERE id = ?', [req.params.id]);
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada' });
    const linea = await db.getOne(
      'SELECT * FROM cotizacion_lineas WHERE id = ? AND cotizacion_id = ?',
      [req.params.lineaId, req.params.id]
    );
    if (!linea) return res.status(404).json({ error: 'Línea no encontrada' });

    const nextTipo = (req.body && req.body.tipo_linea) != null ? String(req.body.tipo_linea).trim() : String(linea.tipo_linea || 'otro');
    if (!['refaccion', 'vuelta', 'mano_obra', 'otro'].includes(nextTipo)) {
      return res.status(400).json({ error: 'tipo_linea inválido' });
    }
    const nextRefaccionId = (req.body && 'refaccion_id' in req.body) ? req.body.refaccion_id : linea.refaccion_id;
    if (nextTipo === 'refaccion' && !nextRefaccionId) return res.status(400).json({ error: 'refaccion_id requerido' });
    const nextBitacoraId = (req.body && 'bitacora_id' in req.body) ? req.body.bitacora_id : linea.bitacora_id;
    if (nextTipo === 'mano_obra' && nextBitacoraId) {
      const bit = await db.getOne('SELECT * FROM bitacoras WHERE id = ? AND cotizacion_id = ?', [nextBitacoraId, req.params.id]);
      if (!bit) return res.status(400).json({ error: 'bitacora_id inválido para esta cotización' });
    }
    const nextCantidad = (req.body && 'cantidad' in req.body) ? req.body.cantidad : linea.cantidad;
    const nextPrecio = (req.body && 'precio_unitario' in req.body) ? req.body.precio_unitario : linea.precio_unitario;
    const calc = calcLinea(nextTipo, nextCantidad, nextPrecio, cot.moneda, cot.tipo_cambio);

    await db.runQuery(
      `UPDATE cotizacion_lineas
       SET refaccion_id=?, maquina_id=?, bitacora_id=?, tipo_linea=?, descripcion=?, cantidad=?, precio_unitario=?, precio_usd=?, subtotal=?, iva=?, total=?, orden=?
       WHERE id=? AND cotizacion_id=?`,
      [
        nextRefaccionId || null,
        (req.body && 'maquina_id' in req.body) ? (req.body.maquina_id || null) : (linea.maquina_id || null),
        nextBitacoraId || null,
        calc.tipo_linea,
        (req.body && 'descripcion' in req.body) ? (req.body.descripcion || null) : (linea.descripcion || null),
        calc.cantidad,
        calc.precio_unitario,
        calc.precio_usd,
        calc.subtotal,
        calc.iva,
        calc.total,
        (req.body && 'orden' in req.body) ? (Number(req.body.orden) || 0) : (Number(linea.orden) || 0),
        req.params.lineaId,
        req.params.id,
      ]
    );
    await recalcCotizacionTotals(req.params.id);
    const r = await db.getOne('SELECT * FROM cotizacion_lineas WHERE id = ?', [req.params.lineaId]);
    res.json(r || {});
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.delete('/api/cotizaciones/:id/lineas/:lineaId', async (req, res) => {
  try {
    await db.runQuery('DELETE FROM cotizacion_lineas WHERE id = ? AND cotizacion_id = ?', [req.params.lineaId, req.params.id]);
    await recalcCotizacionTotals(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

function generarFolio(prefijo) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${prefijo}-${y}${m}${day}-${Math.floor(Math.random() * 9000) + 1000}`;
}

app.post('/api/cotizaciones', async (req, res) => {
  try {
    const { cliente_id, tipo, fecha, subtotal, iva, total, folio, tipo_cambio, moneda, maquinas_ids, estado, notas } = req.body || {};
    if (!cliente_id) return res.status(400).json({ error: 'cliente_id requerido' });
    const f = folio || generarFolio(tipo === 'mano_obra' ? 'COT-MO' : 'COT-REF');
    const st = Number(subtotal) || 0;
    const iv = Number(iva) || 0;
    const tot = Number(total) != null ? Number(total) : st + iv;
    const tc = Number(tipo_cambio) || 17.0;
    const mon = moneda || 'MXN';
    const maqIds = typeof maquinas_ids === 'string' ? maquinas_ids : JSON.stringify(maquinas_ids || []);
    await db.runQuery(
      `INSERT INTO cotizaciones (folio, cliente_id, tipo, fecha, subtotal, iva, total, tipo_cambio, moneda, maquinas_ids, estado, notas) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [f, cliente_id, tipo || 'refacciones', fecha || new Date().toISOString().slice(0, 10), st, iv, tot, tc, mon, maqIds, estado || 'borrador', notas || null]
    );
    const r = await db.getOne('SELECT co.*, c.nombre as cliente_nombre FROM cotizaciones co JOIN clientes c ON c.id = co.cliente_id ORDER BY co.id DESC LIMIT 1');
    res.status(201).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put('/api/cotizaciones/:id', async (req, res) => {
  try {
    const existing = await db.getOne('SELECT * FROM cotizaciones WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'No encontrada' });
    const { folio, cliente_id, tipo, fecha, subtotal, iva, total, tipo_cambio, moneda, maquinas_ids, estado, notas } = req.body || {};
    const maqIds = typeof maquinas_ids === 'string' ? maquinas_ids : JSON.stringify(maquinas_ids || []);
    // No pisar fecha con NULL si el cliente no envía el campo (JSON.stringify omite undefined) o el input falló.
    let fechaSql = existing.fecha || null;
    if (fecha != null && String(fecha).trim() !== '') {
      fechaSql = String(fecha).trim().slice(0, 10);
    } else if (!fechaSql) {
      fechaSql = new Date().toISOString().slice(0, 10);
    }
    await db.runQuery(
      `UPDATE cotizaciones SET folio=?, cliente_id=?, tipo=?, fecha=?, subtotal=?, iva=?, total=?, tipo_cambio=?, moneda=?, maquinas_ids=?, estado=?, notas=? WHERE id=?`,
      [folio || null, cliente_id || null, tipo || 'refacciones', fechaSql,
       Number(subtotal) || 0, Number(iva) || 0, Number(total) || 0,
       Number(tipo_cambio) || 17.0, moneda || 'MXN', maqIds, estado || 'borrador', notas || null,
       req.params.id]
    );
    const r = await db.getOne('SELECT co.*, c.nombre as cliente_nombre FROM cotizaciones co JOIN clientes c ON c.id = co.cliente_id WHERE co.id = ?', [req.params.id]);
    res.json(r || {});
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Aplicar cotización: descontar stock FIFO
app.post('/api/cotizaciones/:id/aplicar', async (req, res) => {
  try {
    const cot = await db.getOne('SELECT * FROM cotizaciones WHERE id = ?', [req.params.id]);
    if (!cot) return res.status(404).json({ error: 'No encontrada' });
    if (cot.estado === 'aplicada') return res.status(400).json({ error: 'Cotización ya aplicada' });
    const lineas = await db.getAll('SELECT * FROM cotizacion_lineas WHERE cotizacion_id = ?', [req.params.id]);
    const errores = [];
    for (const l of lineas) {
      if (!l.refaccion_id || l.tipo_linea !== 'refaccion') continue;
      const ref = await db.getOne('SELECT * FROM refacciones WHERE id = ?', [l.refaccion_id]);
      if (!ref) continue;
      const cant = Number(l.cantidad) || 0;
      if (ref.stock < cant) {
        errores.push(`Sin stock suficiente: ${ref.codigo} (disponible: ${ref.stock}, requerido: ${cant})`);
        continue;
      }
      const nuevoStock = ref.stock - cant;
      await db.runQuery('UPDATE refacciones SET stock=? WHERE id=?', [nuevoStock, ref.id]);
      await db.runQuery(
        `INSERT INTO movimientos_stock (refaccion_id, tipo, cantidad, costo_unitario, cotizacion_id, referencia, fecha)
         VALUES (?, 'salida', ?, ?, ?, ?, date('now','localtime'))`,
        [ref.id, cant, Number(l.precio_unitario) || 0, cot.id, `Cot: ${cot.folio}`]
      );
    }
    await db.runQuery(`UPDATE cotizaciones SET estado='aplicada' WHERE id=?`, [req.params.id]);
    res.json({ ok: true, errores });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Tecnicos
app.get('/api/tecnicos', async (req, res) => {
  try {
    const rows = await db.getAll('SELECT * FROM tecnicos WHERE activo=1 ORDER BY nombre');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});
app.post('/api/tecnicos', async (req, res) => {
  try {
    const { nombre } = req.body || {};
    if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
    await db.runQuery('INSERT OR IGNORE INTO tecnicos (nombre) VALUES (?)', [nombre]);
    const r = await db.getOne('SELECT * FROM tecnicos WHERE nombre=?', [nombre]);
    res.status(201).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.delete('/api/cotizaciones/:id', async (req, res) => {
  try {
    await db.runQuery('DELETE FROM cotizacion_lineas WHERE cotizacion_id = ?', [req.params.id]);
    await db.runQuery('DELETE FROM cotizaciones WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// --- Incidentes ---
app.get('/api/incidentes', async (req, res) => {
  try {
    const rows = await db.getAll(
      `SELECT i.*, c.nombre as cliente_nombre, m.nombre as maquina_nombre FROM incidentes i JOIN clientes c ON c.id = i.cliente_id LEFT JOIN maquinas m ON m.id = i.maquina_id ORDER BY i.fecha_reporte DESC LIMIT 500`
    );
    res.json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/incidentes/:id', async (req, res) => {
  try {
    const row = await db.getOne(
      `SELECT i.*, c.nombre as cliente_nombre, m.nombre as maquina_nombre FROM incidentes i JOIN clientes c ON c.id = i.cliente_id LEFT JOIN maquinas m ON m.id = i.maquina_id WHERE i.id = ?`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

function generarFolioIncidente() {
  const d = new Date();
  return `INC-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${Math.floor(Math.random() * 9000) + 1000}`;
}

app.post('/api/incidentes', async (req, res) => {
  try {
    const { cliente_id, maquina_id, descripcion, prioridad, fecha_reporte, fecha_cerrado, fecha_vencimiento, tecnico_responsable, estatus } = req.body || {};
    if (!cliente_id) return res.status(400).json({ error: 'cliente_id requerido' });
    if (!descripcion || !descripcion.trim()) return res.status(400).json({ error: 'descripcion requerida' });
    const folio = generarFolioIncidente();
    const est = estatus || 'abierto';
    const fCerr = fecha_cerrado || (est === 'cerrado' ? new Date().toISOString().slice(0, 10) : null);
    const fVenc = fecha_vencimiento && String(fecha_vencimiento).trim() ? String(fecha_vencimiento).slice(0, 10) : null;
    await db.runQuery(
      `INSERT INTO incidentes (folio, cliente_id, maquina_id, descripcion, prioridad, fecha_reporte, fecha_cerrado, fecha_vencimiento, tecnico_responsable, estatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [folio, cliente_id, maquina_id || null, descripcion.trim(), prioridad || 'media', fecha_reporte || new Date().toISOString().slice(0, 10), fCerr, fVenc, tecnico_responsable || null, est]
    );
    const r = await db.getOne('SELECT i.*, c.nombre as cliente_nombre, m.nombre as maquina_nombre FROM incidentes i JOIN clientes c ON c.id = i.cliente_id LEFT JOIN maquinas m ON m.id = i.maquina_id ORDER BY i.id DESC LIMIT 1');
    res.status(201).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put('/api/incidentes/:id', async (req, res) => {
  try {
    const { cliente_id, maquina_id, descripcion, prioridad, fecha_reporte, fecha_cerrado, fecha_vencimiento, tecnico_responsable, estatus } = req.body || {};
    const est = estatus || 'abierto';
    let fCerr = fecha_cerrado;
    if (est === 'cerrado' && !fCerr) fCerr = new Date().toISOString().slice(0, 10);
    else if (est !== 'cerrado') fCerr = null;
    const fVenc = fecha_vencimiento && String(fecha_vencimiento).trim() ? String(fecha_vencimiento).slice(0, 10) : null;
    await db.runQuery(
      `UPDATE incidentes SET cliente_id=?, maquina_id=?, descripcion=?, prioridad=?, fecha_reporte=?, fecha_cerrado=?, fecha_vencimiento=?, tecnico_responsable=?, estatus=? WHERE id=?`,
      [cliente_id || null, maquina_id || null, descripcion || '', prioridad || 'media', fecha_reporte || null, fCerr, fVenc, tecnico_responsable || null, est, req.params.id]
    );
    const r = await db.getOne('SELECT i.*, c.nombre as cliente_nombre, m.nombre as maquina_nombre FROM incidentes i JOIN clientes c ON c.id = i.cliente_id LEFT JOIN maquinas m ON m.id = i.maquina_id WHERE i.id = ?', [req.params.id]);
    res.json(r || {});
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.delete('/api/incidentes/:id', async (req, res) => {
  try {
    await db.runQuery('DELETE FROM incidentes WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// --- Bitácoras (horas / servicio realizado) ---
app.get('/api/bitacoras', async (req, res) => {
  try {
    const cotizacionId = req.query && req.query.cotizacion_id ? Number(req.query.cotizacion_id) : null;
    const incidenteId = req.query && req.query.incidente_id ? Number(req.query.incidente_id) : null;
    const where = [];
    const args = [];
    if (Number.isFinite(cotizacionId) && cotizacionId > 0) { where.push('b.cotizacion_id = ?'); args.push(cotizacionId); }
    if (Number.isFinite(incidenteId) && incidenteId > 0) { where.push('b.incidente_id = ?'); args.push(incidenteId); }
    const rows = await db.getAll(
      `SELECT b.*, i.folio as incidente_folio, co.folio as cotizacion_folio
       FROM bitacoras b
       LEFT JOIN incidentes i ON i.id = b.incidente_id
       LEFT JOIN cotizaciones co ON co.id = b.cotizacion_id
       ${where.length ? ('WHERE ' + where.join(' AND ')) : ''}
       ORDER BY b.fecha DESC, b.id DESC LIMIT 500`,
      args
    );
    res.json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/bitacoras/:id', async (req, res) => {
  try {
    const row = await db.getOne(
      `SELECT b.*, i.folio as incidente_folio, co.folio as cotizacion_folio FROM bitacoras b
       LEFT JOIN incidentes i ON i.id = b.incidente_id LEFT JOIN cotizaciones co ON co.id = b.cotizacion_id WHERE b.id = ?`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post('/api/bitacoras', async (req, res) => {
  try {
    const { incidente_id, cotizacion_id, fecha, tecnico, actividades, tiempo_horas, materiales_usados } = req.body || {};
    const incN = incidente_id != null && incidente_id !== '' ? Number(incidente_id) : NaN;
    const cotN = cotizacion_id != null && cotizacion_id !== '' ? Number(cotizacion_id) : NaN;
    const iid = Number.isFinite(incN) && incN > 0 ? incN : null;
    const cid = Number.isFinite(cotN) && cotN > 0 ? cotN : null;
    if (!iid && !cid) return res.status(400).json({ error: 'Indica incidente_id o cotizacion_id' });
    await db.runQuery(
      `INSERT INTO bitacoras (incidente_id, cotizacion_id, fecha, tecnico, actividades, tiempo_horas, materiales_usados) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [iid, cid, fecha || new Date().toISOString().slice(0, 10), tecnico || null, actividades || null, Number(tiempo_horas) || 0, materiales_usados || null]
    );
    const r = await db.getOne('SELECT * FROM bitacoras ORDER BY id DESC LIMIT 1');
    res.status(201).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put('/api/bitacoras/:id', async (req, res) => {
  try {
    const { incidente_id, cotizacion_id, fecha, tecnico, actividades, tiempo_horas, materiales_usados } = req.body || {};
    const incN = incidente_id != null && incidente_id !== '' ? Number(incidente_id) : NaN;
    const cotN = cotizacion_id != null && cotizacion_id !== '' ? Number(cotizacion_id) : NaN;
    const iid = Number.isFinite(incN) && incN > 0 ? incN : null;
    const cid = Number.isFinite(cotN) && cotN > 0 ? cotN : null;
    await db.runQuery(
      `UPDATE bitacoras SET incidente_id=?, cotizacion_id=?, fecha=?, tecnico=?, actividades=?, tiempo_horas=?, materiales_usados=? WHERE id=?`,
      [iid, cid, fecha || null, tecnico || null, actividades || null, Number(tiempo_horas) || 0, materiales_usados || null, req.params.id]
    );
    const r = await db.getOne('SELECT * FROM bitacoras WHERE id = ?', [req.params.id]);
    res.json(r || {});
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.delete('/api/bitacoras/:id', async (req, res) => {
  try {
    await db.runQuery('DELETE FROM bitacoras WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// --- Dashboard estadísticas avanzadas: periodos y pronósticos ---
function toYMD(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function addYears(d, n) { const x = new Date(d); x.setFullYear(x.getFullYear() + n); return x; }
function startOfWeekMonday(d) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}
function startOfMonth(d) { const x = new Date(d); x.setDate(1); return x; }
function startOfYear(d) { const x = new Date(d); x.setMonth(0); x.setDate(1); return x; }
function endOfMonth(d) { return addDays(addMonths(startOfMonth(d), 1), -1); }
function endOfYear(d) { const x = new Date(d); x.setMonth(11); x.setDate(31); return x; }

app.get('/api/dashboard-stats', async (req, res) => {
  try {
    const today = new Date();
    const todayStr = toYMD(today);

    // Semana actual (lunes a hoy) y semana anterior (lunes a domingo)
    const weekStart = startOfWeekMonday(today);
    const weekEnd = addDays(weekStart, 6);
    const prevWeekStart = addDays(weekStart, -7);
    const prevWeekEnd = addDays(weekStart, -1);

    const ranges = {
      semana_actual: { inicio: toYMD(weekStart), fin: todayStr },
      semana_anterior: { inicio: toYMD(prevWeekStart), fin: toYMD(prevWeekEnd) },
      mes_actual: { inicio: toYMD(startOfMonth(today)), fin: todayStr },
      mes_anterior: { inicio: toYMD(startOfMonth(addMonths(today, -1))), fin: toYMD(endOfMonth(addMonths(today, -1))) },
      año_actual: { inicio: toYMD(startOfYear(today)), fin: todayStr },
      año_anterior: { inicio: toYMD(startOfYear(addYears(today, -1))), fin: toYMD(endOfYear(addYears(today, -1))) },
    };

    async function queryCotizaciones(inicio, fin) {
      const rows = await db.getAll(
        `SELECT COUNT(*) as n, COALESCE(SUM(CAST(total AS REAL)), 0) as monto FROM cotizaciones WHERE fecha >= ? AND fecha <= ?`,
        [inicio, fin]
      );
      return { count: (rows[0] && rows[0].n) || 0, monto: Number(rows[0] && rows[0].monto) || 0 };
    }
    async function queryIncidentes(inicio, fin) {
      const rows = await db.getAll(
        `SELECT COUNT(*) as n FROM incidentes WHERE fecha_reporte >= ? AND fecha_reporte <= ?`,
        [inicio, fin]
      );
      return { count: (rows[0] && rows[0].n) || 0 };
    }
    async function queryBitacoras(inicio, fin) {
      const rows = await db.getAll(
        `SELECT COUNT(*) as n, COALESCE(SUM(CAST(tiempo_horas AS REAL)), 0) as horas FROM bitacoras WHERE fecha >= ? AND fecha <= ?`,
        [inicio, fin]
      );
      return { count: (rows[0] && rows[0].n) || 0, horas: Number(rows[0] && rows[0].horas) || 0 };
    }

    const [cot_sem, cot_semAnt, cot_mes, cot_mesAnt, cot_año, cot_añoAnt] = await Promise.all([
      queryCotizaciones(ranges.semana_actual.inicio, ranges.semana_actual.fin),
      queryCotizaciones(ranges.semana_anterior.inicio, ranges.semana_anterior.fin),
      queryCotizaciones(ranges.mes_actual.inicio, ranges.mes_actual.fin),
      queryCotizaciones(ranges.mes_anterior.inicio, ranges.mes_anterior.fin),
      queryCotizaciones(ranges.año_actual.inicio, ranges.año_actual.fin),
      queryCotizaciones(ranges.año_anterior.inicio, ranges.año_anterior.fin),
    ]);
    const [inc_sem, inc_semAnt, inc_mes, inc_mesAnt, inc_año, inc_añoAnt] = await Promise.all([
      queryIncidentes(ranges.semana_actual.inicio, ranges.semana_actual.fin),
      queryIncidentes(ranges.semana_anterior.inicio, ranges.semana_anterior.fin),
      queryIncidentes(ranges.mes_actual.inicio, ranges.mes_actual.fin),
      queryIncidentes(ranges.mes_anterior.inicio, ranges.mes_anterior.fin),
      queryIncidentes(ranges.año_actual.inicio, ranges.año_actual.fin),
      queryIncidentes(ranges.año_anterior.inicio, ranges.año_anterior.fin),
    ]);
    const [bit_sem, bit_semAnt, bit_mes, bit_mesAnt, bit_año, bit_añoAnt] = await Promise.all([
      queryBitacoras(ranges.semana_actual.inicio, ranges.semana_actual.fin),
      queryBitacoras(ranges.semana_anterior.inicio, ranges.semana_anterior.fin),
      queryBitacoras(ranges.mes_actual.inicio, ranges.mes_actual.fin),
      queryBitacoras(ranges.mes_anterior.inicio, ranges.mes_anterior.fin),
      queryBitacoras(ranges.año_actual.inicio, ranges.año_actual.fin),
      queryBitacoras(ranges.año_anterior.inicio, ranges.año_anterior.fin),
    ]);

    const periodos = {
      semana_actual: { cotizaciones: cot_sem, incidentes: inc_sem, bitacoras: bit_sem, etiqueta: 'Semana actual' },
      semana_anterior: { cotizaciones: cot_semAnt, incidentes: inc_semAnt, bitacoras: bit_semAnt, etiqueta: 'Semana anterior' },
      mes_actual: { cotizaciones: cot_mes, incidentes: inc_mes, bitacoras: bit_mes, etiqueta: 'Mes actual' },
      mes_anterior: { cotizaciones: cot_mesAnt, incidentes: inc_mesAnt, bitacoras: bit_mesAnt, etiqueta: 'Mes anterior' },
      año_actual: { cotizaciones: cot_año, incidentes: inc_año, bitacoras: bit_año, etiqueta: 'Año actual' },
      año_anterior: { cotizaciones: cot_añoAnt, incidentes: inc_añoAnt, bitacoras: bit_añoAnt, etiqueta: 'Año anterior' },
    };

    // Pronósticos: promedio del periodo actual y anterior (siguiente semana/mes/año)
    const pronostico_semana = {
      cotizaciones_count: Math.round((cot_semAnt.count + cot_sem.count) / 2) || cot_sem.count,
      cotizaciones_monto: Math.round(((cot_semAnt.monto + cot_sem.monto) / 2) * 100) / 100,
      incidentes_count: Math.round((inc_semAnt.count + inc_sem.count) / 2) || inc_sem.count,
      bitacoras_count: Math.round((bit_semAnt.count + bit_sem.count) / 2) || bit_sem.count,
      bitacoras_horas: Math.round(((bit_semAnt.horas + bit_sem.horas) / 2) * 10) / 10 || bit_sem.horas,
    };
    const pronostico_mes = {
      cotizaciones_count: Math.round((cot_mesAnt.count + cot_mes.count) / 2) || cot_mes.count,
      cotizaciones_monto: Math.round(((cot_mesAnt.monto + cot_mes.monto) / 2) * 100) / 100,
      incidentes_count: Math.round((inc_mesAnt.count + inc_mes.count) / 2) || inc_mes.count,
      bitacoras_count: Math.round((bit_mesAnt.count + bit_mes.count) / 2) || bit_mes.count,
      bitacoras_horas: Math.round(((bit_mesAnt.horas + bit_mes.horas) / 2) * 10) / 10 || bit_mes.horas,
    };
    const pronostico_año = {
      cotizaciones_count: cot_añoAnt.count || cot_año.count,
      cotizaciones_monto: Math.round((cot_añoAnt.monto || cot_año.monto) * 100) / 100,
      incidentes_count: inc_añoAnt.count || inc_año.count,
      bitacoras_count: bit_añoAnt.count || bit_año.count,
      bitacoras_horas: Math.round((bit_añoAnt.horas || bit_año.horas) * 10) / 10 || bit_año.horas,
    };

    res.json({
      periodos,
      pronosticos: {
        proxima_semana: pronostico_semana,
        proximo_mes: pronostico_mes,
        proximo_año: pronostico_año,
      },
      rangos: ranges,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// --- Cargar datos demo (desde seed-demo.json) ---
// Normaliza para matching: quita acentos, minúsculas, espacios colapsados
function norm(s) {
  if (s == null || typeof s !== 'string') return '';
  const sinAcentos = String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return sinAcentos.toLowerCase().replace(/\s+/g, ' ').trim();
}
function safeStr(v) { return (v != null && String(v).trim() !== '') ? String(v).trim() : null; }
function safeStrReq(v) { return (v != null && String(v).trim() !== '') ? String(v).trim() : ''; }
app.post('/api/seed-demo', async (req, res) => {
  try {
    const force = !!(req.body && req.body.force);
    const [cCount] = await db.getAll('SELECT COUNT(*) as n FROM clientes');
    if (cCount && cCount.n > 0 && !force) {
      return res.status(400).json({ error: 'Ya hay datos cargados. El demo solo se puede cargar cuando no hay clientes. Si quieres volver a cargar, elimina primero los clientes desde la pestaña Clientes.' });
    }
    // ── FORCE: vaciar todas las tablas de negocio en orden FK ──────────────
    if (force && cCount && cCount.n > 0) {
      const tablasOrden = [
        'movimientos_stock','mantenimientos_garantia','bonos','viajes',
        'mantenimientos','bitacoras','cotizacion_lineas','cotizaciones',
        'incidentes','garantias','reportes','maquinas','refacciones','clientes',
      ];
      for (const t of tablasOrden) {
        try { await db.runQuery(`DELETE FROM ${t}`); } catch (_) { /* tabla puede no existir en bd vieja */ }
      }
    }
    const seedPath = path.join(__dirname, 'seed-demo.json');
    if (!fs.existsSync(seedPath)) return res.status(404).json({ error: 'No existe seed-demo.json. Ejecuta: python exportar_demo.py' });
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

    const clientes = (seed.clientes || []).filter(c => c && typeof c === 'object');
    const refacciones = (seed.refacciones || []).filter(r => r && typeof r === 'object');
    const maquinas = (seed.maquinas || []).filter(m => m && typeof m === 'object');
    const incidentes = (seed.incidentes || []).filter(i => i && typeof i === 'object');
    const bitacoras = (seed.bitacoras || []).filter(b => b && typeof b === 'object');

    const idMap = {};
    for (const c of clientes) {
      await db.runQuery(
        `INSERT INTO clientes (codigo, nombre, rfc, contacto, direccion, telefono, email, ciudad) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [safeStr(c.codigo) || '', safeStrReq(c.nombre), safeStr(c.rfc), safeStr(c.contacto), safeStr(c.direccion), safeStr(c.telefono), safeStr(c.email), safeStr(c.ciudad)]
      );
      const r = await db.getOne('SELECT id FROM clientes ORDER BY id DESC LIMIT 1');
      if (r) idMap[clientes.indexOf(c) + 1] = r.id;
    }
    for (const r of refacciones) {
      await db.runQuery(
        `INSERT INTO refacciones (codigo, descripcion, precio_unitario, unidad) VALUES (?, ?, ?, ?)`,
        [safeStrReq(r.codigo), safeStrReq(r.descripcion), r.precio_unitario != null ? Number(r.precio_unitario) : 0, safeStr(r.unidad) || 'PZA']
      );
    }
    for (const m of maquinas) {
      const cid = m.cliente_id != null ? (idMap[m.cliente_id] || m.cliente_id) : null;
      if (!cid) continue;
      await db.runQuery(
        `INSERT INTO maquinas (cliente_id, nombre, marca, modelo, numero_serie, ubicacion) VALUES (?, ?, ?, ?, ?, ?)`,
        [cid, safeStrReq(m.nombre), safeStr(m.marca), safeStr(m.modelo), safeStr(m.numero_serie), safeStr(m.ubicacion)]
      );
    }

    const clientesDb = await db.getAll('SELECT id, nombre FROM clientes');
    let maquinasDb = await db.getAll('SELECT id, cliente_id, nombre FROM maquinas');
    // Demo presentable: cada cliente debe tener al menos un equipo (el JSON solo asigna ~16 máquinas a unos pocos clientes).
    const clienteIdsConMaquina = new Set((maquinasDb || []).map((m) => m && m.cliente_id).filter((id) => id != null));
    const tiposDemo = ['Compresor', 'Celda CNC', 'Línea transporte', 'Robot soldador', 'Bomba proceso'];
    let demoMaqIdx = 0;
    for (const c of clientesDb) {
      if (!clienteIdsConMaquina.has(c.id)) {
        const nombre = 'Equipo demo — ' + (String(c.nombre || 'Cliente').slice(0, 42));
        await db.runQuery(
          `INSERT INTO maquinas (cliente_id, nombre, marca, modelo, numero_serie, ubicacion) VALUES (?, ?, ?, ?, ?, ?)`,
          [c.id, nombre, 'Demo seed', 'DM-' + String((demoMaqIdx % tiposDemo.length) + 1), 'SN-DEMO-' + c.id, 'Planta principal (demo)']
        );
        clienteIdsConMaquina.add(c.id);
        demoMaqIdx++;
      }
    }
    maquinasDb = await db.getAll('SELECT id, cliente_id, nombre FROM maquinas');
    const clienteByNombre = {};
    clientesDb.forEach(c => { clienteByNombre[norm(c && c.nombre)] = c.id; });
    const maquinaByClienteYNombre = {};
    maquinasDb.forEach(m => { maquinaByClienteYNombre[(m && m.cliente_id) + '|' + norm(m && m.nombre)] = m.id; });

    let incidentesCount = 0;
    const incidenteByFolio = {};
    for (const inc of incidentes) {
      const clienteId = clienteByNombre[norm(inc && inc.cliente_nombre)];
      if (!clienteId) continue;
      let maquinaId = null;
      const maqNom = inc && inc.maquina_nombre;
      if (maqNom) {
        maquinaId = maquinaByClienteYNombre[clienteId + '|' + norm(maqNom)];
      }
      await db.runQuery(
        `INSERT INTO incidentes (folio, cliente_id, maquina_id, descripcion, prioridad, fecha_reporte, fecha_cerrado, fecha_vencimiento, tecnico_responsable, estatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [safeStr(inc.folio), clienteId, maquinaId, safeStrReq(inc.descripcion) || '-', safeStr(inc.prioridad) || 'media', (inc.fecha_reporte && String(inc.fecha_reporte).slice(0, 10)) || new Date().toISOString().slice(0, 10), inc.estatus === 'cerrado' ? (safeStr(inc.fecha_cerrado) || new Date().toISOString().slice(0, 10)) : null, safeStr(inc.fecha_vencimiento), safeStr(inc.tecnico_responsable), (inc.estatus && String(inc.estatus).trim()) || 'abierto']
      );
      const r = await db.getOne('SELECT id FROM incidentes ORDER BY id DESC LIMIT 1');
      if (r) { incidenteByFolio[(inc.folio || '').toUpperCase()] = r.id; incidentesCount++; }
    }

    // Si no hubo match con nombres del seed, crear incidentes y bitácoras demo con los clientes/máquinas insertados
    const hoy = new Date().toISOString().slice(0, 10);
    if (incidentesCount === 0 && clientesDb.length > 0) {
      const maquinasList = maquinasDb.length > 0 ? maquinasDb : [];
      const tecnicos = ['Juan Pérez', 'María García', 'Carlos López', 'Ana Torres', 'Luis Martínez'];
      const descripciones = ['Revisión preventiva', 'Ajuste de bandas', 'Cambio de aceite', 'Diagnóstico de falla', 'Reparación de motor', 'Calibración de sensores'];
      for (let i = 1; i <= 15; i++) {
        const cliente = clientesDb[(i - 1) % clientesDb.length];
        let maquinaId = null;
        const maqsDelCliente = maquinasList.filter(m => m.cliente_id === cliente.id);
        if (maqsDelCliente.length > 0) maquinaId = maqsDelCliente[(i - 1) % maqsDelCliente.length].id;
        const folio = 'INC-DEMO-' + String(1000 + i);
        // Repartir fechas: semana pasada, mes pasado, año pasado
        const diasAtrasLista = [1, 2, 4, 7, 10, 15, 22, 30, 45, 60, 90, 120, 180, 270, 365];
        const diasAtras = diasAtrasLista[i % diasAtrasLista.length];
        const fechaReporte = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const fVencDemo = new Date(Date.now() + (7 + (i % 14)) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const cerrado = i % 5 === 0;
        const fechaCerr = cerrado ? new Date(Date.now() - (diasAtras - 2) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : null;
        await db.runQuery(
          `INSERT INTO incidentes (folio, cliente_id, maquina_id, descripcion, prioridad, fecha_reporte, fecha_cerrado, fecha_vencimiento, tecnico_responsable, estatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [folio, cliente.id, maquinaId, descripciones[i % descripciones.length], i % 3 === 0 ? 'alta' : (i % 3 === 1 ? 'media' : 'baja'), fechaReporte, fechaCerr, fVencDemo, tecnicos[i % tecnicos.length], cerrado ? 'cerrado' : 'abierto']
        );
        const r = await db.getOne('SELECT id FROM incidentes ORDER BY id DESC LIMIT 1');
        if (r) { incidenteByFolio[folio] = r.id; incidentesCount++; }
      }
    }

    let bitacorasCount = 0;
    const foliosParaBitacoras = Object.keys(incidenteByFolio);
    for (const bit of bitacoras) {
      const folioInc = bit && bit.folio_incidente;
      const incidenteId = incidenteByFolio[(folioInc != null ? String(folioInc) : '').toUpperCase()];
      if (!incidenteId) continue;
      await db.runQuery(
        `INSERT INTO bitacoras (incidente_id, cotizacion_id, fecha, tecnico, actividades, tiempo_horas, materiales_usados) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [incidenteId, null, (bit.fecha && String(bit.fecha).slice(0, 10)) || new Date().toISOString().slice(0, 10), safeStr(bit.tecnico), safeStr(bit.actividades), Number(bit.tiempo_horas) || 0, safeStr(bit.materiales_usados)]
      );
      bitacorasCount++;
    }
    if (bitacorasCount === 0 && foliosParaBitacoras.length > 0) {
      const actividades = ['Revisión de equipo', 'Cambio de refacciones', 'Pruebas de funcionamiento', 'Lubricación', 'Ajustes mecánicos'];
      const diasBitacora = [0, 1, 3, 5, 7, 10, 15, 20, 30, 45, 60, 90, 120, 180];
      for (let i = 0; i < Math.max(25, foliosParaBitacoras.length * 2); i++) {
        const folio = foliosParaBitacoras[i % foliosParaBitacoras.length];
        const incidenteId = incidenteByFolio[folio];
        const diasAtras = diasBitacora[i % diasBitacora.length];
        const fechaBit = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        await db.runQuery(
          `INSERT INTO bitacoras (incidente_id, cotizacion_id, fecha, tecnico, actividades, tiempo_horas, materiales_usados) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [incidenteId, null, fechaBit, ['Juan Pérez', 'María García', 'Carlos López'][i % 3], actividades[i % actividades.length], Number((1.5 + (i % 4) * 0.5).toFixed(1)), i % 2 === 0 ? 'Grasa, aceite' : null]
        );
        bitacorasCount++;
      }
    }

    let cotizacionesCount = 0;
    const tipos = ['refacciones', 'mano_obra'];
    // Fechas repartidas: semana pasada (1-7 días), mes pasado (8-35), trimestre (40-100), año pasado (120-365)
    const diasAtras = [0, 1, 2, 3, 5, 7, 10, 12, 15, 20, 25, 30, 40, 55, 70, 90, 120, 180, 250, 365];
    const nCotizaciones = Math.min(60, clientesDb.length * 3);
    for (let i = 0; i < nCotizaciones; i++) {
      const clienteId = clientesDb[i % clientesDb.length].id;
      const tipo = tipos[i % 2];
      const dayOffset = diasAtras[i % diasAtras.length];
      const fecha = new Date(Date.now() - dayOffset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const folio = (tipo === 'mano_obra' ? 'COT-MO' : 'COT-REF') + '-' + fecha.replace(/-/g, '') + '-' + String(1001 + i);
      await db.runQuery(
        `INSERT INTO cotizaciones (folio, cliente_id, tipo, fecha, subtotal, iva, total, tipo_cambio, moneda, maquinas_ids, estado, notas) VALUES (?, ?, ?, ?, 0, 0, 0, 17.0, 'MXN', '[]', 'borrador', ?)`,
        [folio, clienteId, tipo, fecha, tipo === 'mano_obra' ? 'Cotización demo (mano de obra ligada a bitácora).' : 'Cotización demo (refacciones + vueltas).']
      );
      const cotRow = await db.getOne('SELECT id FROM cotizaciones ORDER BY id DESC LIMIT 1');
      const cotId = cotRow && cotRow.id;
      if (!cotId) { cotizacionesCount++; continue; }

      // Crear líneas coherentes: refacciones (2) + vuelta (1) o mano de obra ligada a bitácora + posible vuelta
      const refDb = await db.getAll('SELECT id, precio_unitario FROM refacciones ORDER BY id DESC LIMIT 50');
      const maqsCliente = maquinasDb.filter(m => m.cliente_id === clienteId);
      const maqId = maqsCliente.length ? maqsCliente[i % maqsCliente.length].id : null;

      if (tipo === 'refacciones') {
        const picks = refDb.length ? [refDb[i % refDb.length], refDb[(i + 7) % refDb.length]] : [];
        let orden = 0;
        for (const p of picks) {
          const cant = (1 + (i % 3));
          const precio = Number(p.precio_unitario) || (450 + (i % 6) * 75);
          const calc = calcLinea('refaccion', cant, precio, 'MXN', 17.0);
          await db.runQuery(
            `INSERT INTO cotizacion_lineas (cotizacion_id, refaccion_id, maquina_id, bitacora_id, tipo_linea, descripcion, cantidad, precio_unitario, precio_usd, subtotal, iva, total, orden)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [cotId, p.id, maqId, null, 'refaccion', null, calc.cantidad, calc.precio_unitario, calc.precio_usd, calc.subtotal, calc.iva, calc.total, orden++]
          );
        }
        // Vuelta demo (traslado)
        const calcV = calcLinea('vuelta', 1, 650, 'MXN', 17.0);
        await db.runQuery(
          `INSERT INTO cotizacion_lineas (cotizacion_id, refaccion_id, maquina_id, bitacora_id, tipo_linea, descripcion, cantidad, precio_unitario, precio_usd, subtotal, iva, total, orden)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [cotId, null, maqId, null, 'vuelta', 'Traslado (ida)', calcV.cantidad, calcV.precio_unitario, calcV.precio_usd, calcV.subtotal, calcV.iva, calcV.total, 99]
        );
      } else {
        // Crear bitácora ligada a la cotización y luego línea de mano de obra que la referencia
        const horas = Number((1.5 + (i % 5) * 0.5).toFixed(1));
        const actividadesMO = ['Diagnóstico y revisión', 'Ajuste y calibración', 'Reparación en sitio', 'Mantenimiento preventivo', 'Pruebas y puesta en marcha'][i % 5];
        await db.runQuery(
          `INSERT INTO bitacoras (incidente_id, cotizacion_id, fecha, tecnico, actividades, tiempo_horas, materiales_usados)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [null, cotId, fecha, ['Juan Pérez','María García','Carlos López'][i % 3], actividadesMO, horas, null]
        );
        const bitRow = await db.getOne('SELECT id FROM bitacoras ORDER BY id DESC LIMIT 1');
        const bitId = bitRow && bitRow.id;
        const tarifa = 750; // MXN/h demo
        const calcMO = calcLinea('mano_obra', horas, tarifa, 'MXN', 17.0);
        await db.runQuery(
          `INSERT INTO cotizacion_lineas (cotizacion_id, refaccion_id, maquina_id, bitacora_id, tipo_linea, descripcion, cantidad, precio_unitario, precio_usd, subtotal, iva, total, orden)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [cotId, null, maqId, bitId || null, 'mano_obra', actividadesMO, calcMO.cantidad, calcMO.precio_unitario, calcMO.precio_usd, calcMO.subtotal, calcMO.iva, calcMO.total, 0]
        );
        if (i % 3 === 0) {
          const calcV2 = calcLinea('vuelta', 1, 650, 'MXN', 17.0);
          await db.runQuery(
            `INSERT INTO cotizacion_lineas (cotizacion_id, refaccion_id, maquina_id, bitacora_id, tipo_linea, descripcion, cantidad, precio_unitario, precio_usd, subtotal, iva, total, orden)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [cotId, null, maqId, null, 'vuelta', 'Traslado (ida)', calcV2.cantidad, calcV2.precio_unitario, calcV2.precio_usd, calcV2.subtotal, calcV2.iva, calcV2.total, 50]
          );
        }
      }

      await recalcCotizacionTotals(cotId);
      cotizacionesCount++;
    }

    // ── REPORTES demo ─────────────────────────────────────────────────────
    const subtiposServ = ['falla_electrica','falla_mecanica','falla_electronica','instalacion','capacitacion','garantia'];
    const tecnicos2 = ['Juan Pérez','María García','Carlos López','Ana Torres','Luis Martínez'];
    const diasRep = [0,1,2,5,7,10,14,20,30,45,60,90,120,180,270,365];
    let reportesIds = [];
    const nRep = Math.min(20, clientesDb.length * 2);
    for (let i = 0; i < nRep; i++) {
      const cli = clientesDb[i % clientesDb.length];
      const maqsC = maquinasDb.filter(m => m.cliente_id === cli.id);
      const maqId = maqsC.length ? maqsC[i % maqsC.length].id : null;
      const tipo = i % 4 === 0 ? 'venta' : 'servicio';
      const subtipo = tipo === 'venta' ? null : subtiposServ[i % subtiposServ.length];
      const diasAtrasR = diasRep[i % diasRep.length];
      const fechaR = new Date(Date.now() - diasAtrasR * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const folio = (tipo === 'venta' ? 'REP-VEN-' : 'REP-SRV-') + fechaR.replace(/-/g,'') + '-' + String(100 + i);
      const est = i % 5 === 0 ? 'cerrado' : 'abierto';
      await db.runQuery(
        `INSERT INTO reportes (folio, cliente_id, razon_social, maquina_id, tipo_reporte, subtipo, descripcion, tecnico, fecha, estatus)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [folio, cli.id, cli.nombre, maqId, tipo, subtipo,
         ['Mantenimiento preventivo demo','Reparación demo','Instalación de equipo demo','Capacitación técnica demo','Ajuste y calibración demo'][i % 5],
         tecnicos2[i % tecnicos2.length], fechaR, est]
      );
      const rr = await db.getOne('SELECT id FROM reportes ORDER BY id DESC LIMIT 1');
      if (rr) reportesIds.push(rr.id);
    }

    // ── GARANTÍAS demo ────────────────────────────────────────────────────
    let garantiasCount = 0;
    const modelosGar = ['Hidráulico HY-200','CNC Torno 450','Compresor CI-90','Robot Soldador RS-3','Cortadora Láser CL-1'];
    for (let i = 0; i < Math.min(8, clientesDb.length * 2); i++) {
      const cli = clientesDb[i % clientesDb.length];
      const meses = [6, 9, 12, 18, 24];
      const mesesAtras = meses[i % meses.length];
      const fEnt = new Date(Date.now() - mesesAtras * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const activa = mesesAtras <= 12 ? 1 : 0;
      await db.runQuery(
        `INSERT INTO garantias (cliente_id, razon_social, modelo_maquina, numero_serie, tipo_maquina, fecha_entrega, activa)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [cli.id, cli.nombre, modelosGar[i % modelosGar.length],
         'SN-DEMO-' + String(1000 + i), ['Industrial','CNC','Hidráulica','Eléctrica'][i % 4], fEnt, activa]
      );
      const rg = await db.getOne('SELECT id FROM garantias ORDER BY id DESC LIMIT 1');
      if (rg) {
        // 2 mantenimientos de garantía por año
        for (let num = 1; num <= 2; num++) {
          const fProg = new Date(Date.now() + (num * 180 - mesesAtras * 30) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const confirmado = num === 1 && mesesAtras >= 6 ? 1 : 0;
          await db.runQuery(
            `INSERT INTO mantenimientos_garantia (garantia_id, numero, anio, fecha_programada, fecha_realizada, confirmado, costo)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [rg.id, num, new Date().getFullYear(), fProg,
             confirmado ? fProg : null, confirmado, confirmado ? 1500 : 0]
          );
        }
        garantiasCount++;
      }
    }

    // ── BONOS demo ────────────────────────────────────────────────────────
    let bonosCount = 0;
    const tiposCapacitacion = ['Operación básica','Mantenimiento preventivo','Programación CNC','Seguridad industrial','Actualización firmware'];
    for (let i = 0; i < Math.min(10, reportesIds.length); i++) {
      const repId = reportesIds[i];
      const tecnico = tecnicos2[i % tecnicos2.length];
      const monto = [500, 750, 1000, 1250, 1500][i % 5];
      const diasB = [0, 5, 10, 15, 30, 60, 90][i % 7];
      const fechaB = new Date(Date.now() - diasB * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await db.runQuery(
        `INSERT INTO bonos (reporte_id, tecnico, tipo_capacitacion, monto_bono, fecha, pagado)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [repId, tecnico, tiposCapacitacion[i % tiposCapacitacion.length], monto, fechaB, i % 3 === 0 ? 1 : 0]
      );
      bonosCount++;
    }
    // Bonos sin reporte si no hubo reportes con capacitación
    if (bonosCount === 0) {
      for (let i = 0; i < 5; i++) {
        const diasB = [0, 7, 14, 30, 60][i];
        const fechaB = new Date(Date.now() - diasB * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        await db.runQuery(
          `INSERT INTO bonos (reporte_id, tecnico, tipo_capacitacion, monto_bono, fecha, pagado)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [null, tecnicos2[i], tiposCapacitacion[i], (i + 1) * 500, fechaB, i < 2 ? 1 : 0]
        );
        bonosCount++;
      }
    }

    // ── VIAJES demo ───────────────────────────────────────────────────────
    let viajesCount = 0;
    const descripsViaje = ['Instalación en planta','Diagnóstico en campo','Servicio correctivo urgente','Capacitación operadores','Arranque de equipo nuevo'];
    const activsViaje = ['Revisión, ajuste y pruebas','Cambio de componentes y prueba final','Capacitación a personal','Instalación y puesta en marcha','Diagnóstico y cotización'];
    for (let i = 0; i < Math.min(12, clientesDb.length * 2); i++) {
      const cli = clientesDb[i % clientesDb.length];
      const dias = [1, 2, 3, 1, 2, 4, 1, 3, 2, 1, 2, 5][i];
      const diasAtrasV = [0, 3, 7, 10, 14, 20, 30, 45, 60, 90, 120, 180][i % 12];
      const fIni = new Date(Date.now() - diasAtrasV * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const fFin = new Date(Date.now() - diasAtrasV * 24 * 60 * 60 * 1000 + (dias - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const monto = dias * 1000;
      const repId = reportesIds.length > i ? reportesIds[i] : null;
      const mesLiq = fIni.slice(0, 7);
      const liquidado = diasAtrasV >= 30 ? 1 : 0;
      await db.runQuery(
        `INSERT INTO viajes (tecnico, cliente_id, razon_social, fecha_inicio, fecha_fin, dias, monto_viaticos, descripcion, actividades, reporte_id, mes_liquidacion, liquidado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tecnicos2[i % tecnicos2.length], cli.id, cli.nombre, fIni, fFin, dias, monto,
         descripsViaje[i % descripsViaje.length], activsViaje[i % activsViaje.length],
         repId, mesLiq, liquidado]
      );
      viajesCount++;
    }

    const maqCountRow = await db.getOne('SELECT COUNT(*) as n FROM maquinas');
    const maquinasTotal = maqCountRow && maqCountRow.n != null ? Number(maqCountRow.n) : maquinas.length;

    res.json({
      ok: true,
      force,
      clientes: clientes.length,
      refacciones: refacciones.length,
      maquinas: maquinasTotal,
      incidentes: incidentesCount,
      bitacoras: bitacorasCount,
      cotizaciones: cotizacionesCount,
      reportes: reportesIds.length,
      garantias: garantiasCount,
      bonos: bonosCount,
      viajes: viajesCount,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Cargar solo incidentes, bitácoras y cotizaciones demo (cuando ya tienes clientes/máquinas)
app.post('/api/seed-demo-extra', async (req, res) => {
  try {
    const seedPath = path.join(__dirname, 'seed-demo.json');
    if (!fs.existsSync(seedPath)) return res.status(404).json({ error: 'No existe seed-demo.json' });
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    const incidentes = (seed.incidentes || []).filter(i => i && typeof i === 'object');
    const bitacoras = (seed.bitacoras || []).filter(b => b && typeof b === 'object');
    const clientesDb = await db.getAll('SELECT id, nombre FROM clientes');
    const maquinasDb = await db.getAll('SELECT id, cliente_id, nombre FROM maquinas');
    const clienteByNombre = {};
    clientesDb.forEach(c => { clienteByNombre[norm(c && c.nombre)] = c.id; });
    const maquinaByClienteYNombre = {};
    maquinasDb.forEach(m => { maquinaByClienteYNombre[(m && m.cliente_id) + '|' + norm(m && m.nombre)] = m.id; });
    let incidentesCount = 0;
    const incidenteByFolio = {};
    for (const inc of incidentes) {
      const clienteId = clienteByNombre[norm(inc && inc.cliente_nombre)];
      if (!clienteId) continue;
      let maquinaId = null;
      const maqNom = inc && inc.maquina_nombre;
      if (maqNom) maquinaId = maquinaByClienteYNombre[clienteId + '|' + norm(maqNom)];
      await db.runQuery(
        `INSERT INTO incidentes (folio, cliente_id, maquina_id, descripcion, prioridad, fecha_reporte, fecha_cerrado, fecha_vencimiento, tecnico_responsable, estatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [safeStr(inc.folio), clienteId, maquinaId, safeStrReq(inc.descripcion) || '-', safeStr(inc.prioridad) || 'media', (inc.fecha_reporte && String(inc.fecha_reporte).slice(0, 10)) || new Date().toISOString().slice(0, 10), inc.estatus === 'cerrado' ? (safeStr(inc.fecha_cerrado) || new Date().toISOString().slice(0, 10)) : null, safeStr(inc.fecha_vencimiento), safeStr(inc.tecnico_responsable), (inc.estatus && String(inc.estatus).trim()) || 'abierto']
      );
      const r = await db.getOne('SELECT id FROM incidentes ORDER BY id DESC LIMIT 1');
      if (r) { incidenteByFolio[(inc.folio != null ? String(inc.folio) : '').toUpperCase()] = r.id; incidentesCount++; }
    }
    if (incidentesCount === 0 && clientesDb.length > 0) {
      const maquinasList = maquinasDb.length > 0 ? maquinasDb : [];
      const tecnicos = ['Juan Pérez', 'María García', 'Carlos López', 'Ana Torres', 'Luis Martínez'];
      const descripciones = ['Revisión preventiva', 'Ajuste de bandas', 'Diagnóstico de falla', 'Reparación', 'Cambio de rodamiento', 'Calibración'];
      const diasExtra = [1, 2, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180, 365];
      for (let i = 1; i <= 25; i++) {
        const cliente = clientesDb[(i - 1) % clientesDb.length];
        let maquinaId = null;
        const maqsDelCliente = maquinasList.filter(m => m.cliente_id === cliente.id);
        if (maqsDelCliente.length > 0) maquinaId = maqsDelCliente[i % maqsDelCliente.length].id;
        const folio = 'INC-EXTRA-' + String(2000 + i);
        const diasAtras = diasExtra[i % diasExtra.length];
        const fechaReporte = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const fVencExtra = new Date(Date.now() + (5 + (i % 14)) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const cerrado = i % 4 === 0;
        const fechaCerr = cerrado ? new Date(Date.now() - (diasAtras - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : null;
        await db.runQuery(
          `INSERT INTO incidentes (folio, cliente_id, maquina_id, descripcion, prioridad, fecha_reporte, fecha_cerrado, fecha_vencimiento, tecnico_responsable, estatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [folio, cliente.id, maquinaId, descripciones[i % descripciones.length], i % 3 === 0 ? 'alta' : (i % 3 === 1 ? 'media' : 'baja'), fechaReporte, fechaCerr, fVencExtra, tecnicos[i % tecnicos.length], cerrado ? 'cerrado' : 'abierto']
        );
        const r = await db.getOne('SELECT id FROM incidentes ORDER BY id DESC LIMIT 1');
        if (r) { incidenteByFolio[folio] = r.id; incidentesCount++; }
      }
    }
    let bitacorasCount = 0;
    const foliosExtra = Object.keys(incidenteByFolio);
    for (const bit of bitacoras) {
      const folioInc = bit && bit.folio_incidente;
      const incidenteId = incidenteByFolio[(folioInc != null ? String(folioInc) : '').toUpperCase()];
      if (!incidenteId) continue;
      await db.runQuery(
        `INSERT INTO bitacoras (incidente_id, cotizacion_id, fecha, tecnico, actividades, tiempo_horas, materiales_usados) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [incidenteId, null, (bit.fecha && String(bit.fecha).slice(0, 10)) || new Date().toISOString().slice(0, 10), safeStr(bit.tecnico), safeStr(bit.actividades), Number(bit.tiempo_horas) || 0, safeStr(bit.materiales_usados)]
      );
      bitacorasCount++;
    }
    if (bitacorasCount === 0 && foliosExtra.length > 0) {
      const actividades = ['Revisión', 'Reparación', 'Pruebas', 'Cambio de refacciones', 'Lubricación'];
      const diasBitExtra = [0, 1, 3, 5, 8, 12, 20, 30, 45, 60, 90];
      for (let i = 0; i < Math.max(20, foliosExtra.length * 2); i++) {
        const incidenteId = incidenteByFolio[foliosExtra[i % foliosExtra.length]];
        const fechaBit = new Date(Date.now() - diasBitExtra[i % diasBitExtra.length] * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        await db.runQuery(
          `INSERT INTO bitacoras (incidente_id, cotizacion_id, fecha, tecnico, actividades, tiempo_horas, materiales_usados) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [incidenteId, null, fechaBit, ['Juan Pérez', 'María García', 'Carlos López'][i % 3], actividades[i % actividades.length], Number((2 + (i % 3)).toFixed(1)), null]
        );
        bitacorasCount++;
      }
    }
    let cotizacionesCount = 0;
    const tipos = ['refacciones', 'mano_obra'];
    const diasCotExtra = [0, 1, 2, 4, 7, 10, 15, 22, 30, 45, 60, 90, 150, 270, 365];
    const nCotExtra = Math.min(40, clientesDb.length * 2);
    for (let i = 0; i < nCotExtra; i++) {
      const clienteId = clientesDb[i % clientesDb.length].id;
      const tipo = tipos[i % 2];
      const subtotal = 4000 + (i * 600) + (i % 4) * 400;
      const iva = Math.round(subtotal * 0.16);
      const total = subtotal + iva;
      const dayOff = diasCotExtra[i % diasCotExtra.length];
      const fecha = new Date(Date.now() - dayOff * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const folio = (tipo === 'mano_obra' ? 'COT-MO' : 'COT-REF') + '-' + fecha.replace(/-/g, '') + '-' + String(2000 + i);
      await db.runQuery(
        `INSERT INTO cotizaciones (folio, cliente_id, tipo, fecha, subtotal, iva, total) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [folio, clienteId, tipo, fecha, subtotal, iva, total]
      );
      cotizacionesCount++;
    }
    res.json({ ok: true, incidentes: incidentesCount, bitacoras: bitacorasCount, cotizaciones: cotizacionesCount });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

/** Asegura hasta 2 equipos activos por cliente (idempotente). Desactivar arranque con COTIZACION_AUTO_ENSURE_MAQUINAS=0 */
async function runDemoEnsureMaquinas() {
  await db.runQuery('UPDATE maquinas SET activo = 1 WHERE activo IS NULL');
  const clientesDb = await db.getAll('SELECT id, nombre FROM clientes ORDER BY id');
  const plantillas = [
    { nombre: 'Compresor de Tornillo #2', marca: 'Ingersoll', modelo: 'SSR-75', prefijo: 'SN-CT-' },
    { nombre: 'Robot soldador FANUC', marca: 'FANUC', modelo: 'ARC Mate 120iD', prefijo: 'SN-RB-' },
  ];
  let inserted = 0;
  for (const c of clientesDb) {
    const row = await db.getOne(
      'SELECT COUNT(*) as n FROM maquinas WHERE COALESCE(activo, 1) = 1 AND cliente_id = ?',
      [c.id]
    );
    const n = row && row.n != null ? Number(row.n) : 0;
    if (n >= 2) continue;
    for (let k = n; k < 2; k++) {
      const t = plantillas[k % plantillas.length];
      const nomCli = String(c.nombre || 'Cliente').slice(0, 40);
      await db.runQuery(
        `INSERT INTO maquinas (cliente_id, nombre, marca, modelo, numero_serie, ubicacion, activo) VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [
          c.id,
          t.nombre + ' — ' + nomCli,
          t.marca,
          t.modelo,
          t.prefijo + c.id + '-' + (k + 1),
          'Planta principal (demo)',
        ]
      );
      inserted++;
    }
  }
  const total = await db.getOne('SELECT COUNT(*) as n FROM maquinas WHERE COALESCE(activo, 1) = 1');
  return {
    ok: true,
    clientes: clientesDb.length,
    inserted,
    maquinas_activas: total && total.n != null ? Number(total.n) : 0,
  };
}

// Asegura al menos 2 equipos “presentables” por cliente (sin borrar datos). Útil cuando ya hay clientes pero faltan máquinas o activo quedó NULL.
app.post('/api/demo-ensure-maquinas', async (req, res) => {
  try {
    const out = await runDemoEnsureMaquinas();
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/seed-status', async (req, res) => {
  try {
    const [c] = await db.getAll('SELECT COUNT(*) as n FROM clientes');
    const [r] = await db.getAll('SELECT COUNT(*) as n FROM refacciones');
    const [m] = await db.getAll('SELECT COUNT(*) as n FROM maquinas WHERE COALESCE(activo, 1) = 1');
    const [i] = await db.getAll('SELECT COUNT(*) as n FROM incidentes');
    const [b] = await db.getAll('SELECT COUNT(*) as n FROM bitacoras');
    const [co] = await db.getAll('SELECT COUNT(*) as n FROM cotizaciones');
    const nc = Number(c && c.n) || 0;
    const nm = Number(m && m.n) || 0;
    const maquinas_incompletas = nc > 0 && nm < nc * 2;
    res.json({
      clientes: c.n,
      refacciones: r.n,
      maquinas: m.n,
      incidentes: i.n,
      bitacoras: b.n,
      cotizaciones: co.n,
      maquinas_incompletas,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

const BACKUP_TABLES = [
  'clientes',
  'refacciones',
  'maquinas',
  'cotizaciones',
  'cotizacion_lineas',
  'incidentes',
  'bitacoras',
  'mantenimientos',
  'tecnicos',
  'app_users',
  'audit_log',
];
const BACKUP_AUTO_ENABLED = process.env.BACKUP_AUTO_ENABLED !== '0' && process.env.BACKUP_AUTO_ENABLED !== 'false';
const BACKUP_AUTO_INTERVAL_MS = Math.max(1, parseInt(process.env.BACKUP_AUTO_INTERVAL_HOURS || '24', 10)) * 60 * 60 * 1000;
const BACKUP_AUTO_MAX_FILES = Math.max(1, parseInt(process.env.BACKUP_AUTO_MAX_FILES || '14', 10));
const BACKUP_AUTO_MAX_AGE_DAYS = Math.max(0, parseInt(process.env.BACKUP_AUTO_MAX_AGE_DAYS || '30', 10));
let backupAutoTimer = null;

function requireAdminIfAuth(req, res) {
  if (!auth.AUTH_ENABLED) return true;
  if (!req.authUser) {
    res.status(401).json({ error: 'No autorizado. Inicia sesión.' });
    return false;
  }
  if (req.authUser.role !== 'admin') {
    res.status(403).json({ error: 'Solo el administrador puede ejecutar respaldos.' });
    return false;
  }
  return true;
}

function getBackupDir() {
  const custom = (process.env.BACKUP_AUTO_DIR || '').trim();
  if (custom) return path.isAbsolute(custom) ? custom : path.join(__dirname, custom);
  const storage = db.getStorageInfo ? db.getStorageInfo() : null;
  if (storage && storage.mode === 'sqlite' && storage.path) {
    return path.join(path.dirname(storage.path), 'backups');
  }
  return path.join(__dirname, 'data', 'backups');
}

async function buildBackupPayload() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    storage: db.getStorageInfo ? db.getStorageInfo() : { mode: db.useTurso ? 'turso' : 'sqlite', path: null },
    data: {},
  };
  for (const t of BACKUP_TABLES) {
    payload.data[t] = await db.getAll(`SELECT * FROM ${t} ORDER BY id ASC`);
  }
  return payload;
}

async function writeAutoBackupFile() {
  const dir = getBackupDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
  const filename = `microsip-auto-backup-${stamp}.json`;
  const finalPath = path.join(dir, filename);
  const tmpPath = finalPath + '.tmp';
  const payload = await buildBackupPayload();
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmpPath, finalPath);
  // Retención por antigüedad.
  if (BACKUP_AUTO_MAX_AGE_DAYS > 0) {
    const maxAgeMs = BACKUP_AUTO_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    const nowTs = Date.now();
    for (const f of fs.readdirSync(dir).filter(x => /^microsip-auto-backup-\d{8}-\d{6}\.json$/i.test(x))) {
      const full = path.join(dir, f);
      try {
        const st = fs.statSync(full);
        if (nowTs - st.mtimeMs > maxAgeMs) fs.unlinkSync(full);
      } catch (_) {}
    }
  }
  // Retención simple por cantidad.
  const files = fs.readdirSync(dir)
    .filter(f => /^microsip-auto-backup-\d{8}-\d{6}\.json$/i.test(f))
    .sort();
  const extra = Math.max(0, files.length - BACKUP_AUTO_MAX_FILES);
  for (let i = 0; i < extra; i++) {
    try { fs.unlinkSync(path.join(dir, files[i])); } catch (_) {}
  }
  return finalPath;
}

function startAutoBackupScheduler() {
  if (!BACKUP_AUTO_ENABLED) {
    console.log('[backup-auto] Desactivado por BACKUP_AUTO_ENABLED=0');
    return;
  }
  const run = async () => {
    try {
      const saved = await writeAutoBackupFile();
      console.log('[backup-auto] Respaldo creado:', saved);
    } catch (e) {
      console.error('[backup-auto] Error al crear respaldo:', e && e.message ? e.message : e);
    }
  };
  // Primer respaldo al arrancar para tener punto de recuperación inmediato.
  run();
  if (backupAutoTimer) clearInterval(backupAutoTimer);
  backupAutoTimer = setInterval(run, BACKUP_AUTO_INTERVAL_MS);
}

app.get('/api/backup/export', async (req, res) => {
  try {
    if (!requireAdminIfAuth(req, res)) return;
    const payload = await buildBackupPayload();
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post('/api/backup/import', async (req, res) => {
  try {
    if (!requireAdminIfAuth(req, res)) return;
    const backup = req.body && req.body.backup;
    if (!backup || typeof backup !== 'object' || !backup.data || typeof backup.data !== 'object') {
      return res.status(400).json({ error: 'Respaldo inválido. Debe contener { backup: { data: ... } }' });
    }
    const data = backup.data;
    if (!db.useTurso) {
      await db.runQuery('PRAGMA foreign_keys = OFF');
      await db.runQuery('PRAGMA wal_checkpoint(FULL)');
    }
    await db.runQuery('BEGIN');
    try {
      // Orden para respetar dependencias al limpiar e insertar.
      const deleteOrder = ['cotizacion_lineas', 'bitacoras', 'incidentes', 'cotizaciones', 'mantenimientos', 'maquinas', 'refacciones', 'clientes', 'tecnicos', 'audit_log', 'app_users'];
      for (const t of deleteOrder) {
        await db.runQuery(`DELETE FROM ${t}`);
      }
      const insertOrder = ['clientes', 'refacciones', 'maquinas', 'cotizaciones', 'cotizacion_lineas', 'incidentes', 'bitacoras', 'mantenimientos', 'tecnicos', 'app_users', 'audit_log'];
      const counts = {};
      for (const t of insertOrder) {
        const rows = Array.isArray(data[t]) ? data[t] : [];
        if (!rows.length) {
          counts[t] = 0;
          continue;
        }
        const colsInfo = await db.getAll(`PRAGMA table_info(${t})`);
        const validCols = (colsInfo || []).map(c => c.name);
        let inserted = 0;
        for (const row of rows) {
          if (!row || typeof row !== 'object') continue;
          const cols = validCols.filter(c => Object.prototype.hasOwnProperty.call(row, c));
          if (!cols.length) continue;
          const placeholders = cols.map(() => '?').join(',');
          const values = cols.map(c => row[c]);
          await db.runQuery(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${placeholders})`, values);
          inserted++;
        }
        counts[t] = inserted;
      }
      await db.runQuery('COMMIT');
      if (!db.useTurso) {
        await db.runQuery('PRAGMA wal_checkpoint(TRUNCATE)');
        await db.runQuery('PRAGMA foreign_keys = ON');
      }
      res.json({ ok: true, importedAt: new Date().toISOString(), counts });
    } catch (inner) {
      try { await db.runQuery('ROLLBACK'); } catch (_) {}
      if (!db.useTurso) {
        try { await db.runQuery('PRAGMA foreign_keys = ON'); } catch (_) {}
      }
      throw inner;
    }
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/backup/files', async (req, res) => {
  try {
    if (!requireAdminIfAuth(req, res)) return;
    const dir = getBackupDir();
    if (!fs.existsSync(dir)) return res.json({ dir, files: [] });
    const files = fs.readdirSync(dir)
      .filter(f => /^microsip-auto-backup-\d{8}-\d{6}\.json$/i.test(f))
      .map(f => {
        const full = path.join(dir, f);
        const st = fs.statSync(full);
        return {
          name: f,
          sizeBytes: st.size,
          modifiedAt: st.mtime.toISOString(),
        };
      })
      .sort((a, b) => String(b.name).localeCompare(String(a.name)));
    res.json({
      dir,
      policy: {
        enabled: BACKUP_AUTO_ENABLED,
        intervalHours: Math.round(BACKUP_AUTO_INTERVAL_MS / (60 * 60 * 1000)),
        maxFiles: BACKUP_AUTO_MAX_FILES,
        maxAgeDays: BACKUP_AUTO_MAX_AGE_DAYS,
      },
      files,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/backup/file', async (req, res) => {
  try {
    if (!requireAdminIfAuth(req, res)) return;
    const name = String(req.query.name || '').trim();
    if (!/^[a-zA-Z0-9._-]+\.json$/.test(name)) {
      return res.status(400).json({ error: 'Nombre de archivo inválido.' });
    }
    const full = path.join(getBackupDir(), name);
    const base = path.basename(full);
    if (base !== name) return res.status(400).json({ error: 'Ruta inválida.' });
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'Archivo no encontrado.' });
    const raw = fs.readFileSync(full, 'utf8');
    let payload = null;
    try { payload = JSON.parse(raw); } catch (_) {}
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'El archivo no contiene un respaldo válido.' });
    }
    res.json({ name, backup: payload });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post('/api/backup/create-now', async (req, res) => {
  try {
    if (!requireAdminIfAuth(req, res)) return;
    const saved = await writeAutoBackupFile();
    res.json({ ok: true, file: path.basename(saved), fullPath: saved, createdAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.delete('/api/backup/file', async (req, res) => {
  try {
    if (!requireAdminIfAuth(req, res)) return;
    const name = String((req.body && req.body.name) || '').trim();
    if (!/^[a-zA-Z0-9._-]+\.json$/.test(name)) {
      return res.status(400).json({ error: 'Nombre de archivo inválido.' });
    }
    const full = path.join(getBackupDir(), name);
    const base = path.basename(full);
    if (base !== name) return res.status(400).json({ error: 'Ruta inválida.' });
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'Archivo no encontrado.' });
    fs.unlinkSync(full);
    res.json({ ok: true, deleted: name });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// --- Asistente IA: solo OpenAI-compatible (Bearer). La key de Cursor (crsr_) es para el app Cursor, no para este chat.
const AI_SYSTEM_BASE = `Eres el Agente de Soporte del Sistema de Cotización y Gestión.

REGLAS ESTRICTAS:
- Responde SIEMPRE en español. Sé amable pero directo.
- NO repitas saludos genéricos ("¡Hola!", "¿En qué puedo ayudarte?") en cada respuesta. Usa el CONTEXTO de la conversación: si el usuario ya te dio una fecha o un dato, ÚSALO para responder.
- Si el usuario pide "cotizaciones de hoy" o da una fecha (ej. 18 de marzo de 2026), usa los datos que te proporcione el sistema en este mensaje para listar o resumir las cotizaciones. No pidas de nuevo el dato que ya te dieron.
- Si tienes datos actuales del sistema (cotizaciones, clientes, etc.) en el contexto, responde con esa información de forma clara. Si no hay datos, dilo en una frase.
- No inventes datos. Si no tienes información, indica que puede revisar la pestaña correspondiente en el sistema.
- Respuestas concisas y útiles. Sin relleno ni redundancia.

ACCIONES PARA ABRIR FORMULARIOS (cuando el usuario pida crear, agregar, registrar, abrir algo por VOZ o texto):
- Frases que debes reconocer (ejemplos): "agrega un cliente", "dame de alta a Juan Pérez", "registra un incidente", "abre una cotización", "abre cotización para [cliente]", "nueva cotización de refacciones", "anota en la bitácora", "registra 2 horas de trabajo", "quiero crear un cliente", "abre formulario de incidente".
- Responde en UNA frase y al FINAL añade exactamente una línea: ACTION:{"type":"...","data":{...}}
  Tipos: open_cliente, open_incidente, open_bitacora, open_cotizacion.
  open_cliente data: nombre, rfc, direccion, ciudad, email, telefono, contacto. Si el usuario dice "cliente [nombre]" usa ese nombre.
  open_incidente data: descripcion, prioridad (baja|media|alta|critica), cliente_id (número si en la lista de clientes hay uno que coincida con lo que dice el usuario) o cliente_nombre.
  open_bitacora data: actividades, tiempo_horas (número), tecnico, materiales_usados.
  open_cotizacion data: tipo ("refacciones" o "mano_obra"), cliente_id (número si en la lista de clientes hay coincidencia) o cliente_nombre.
- Si en este mensaje te doy una lista de "Clientes (id, nombre)", usa el id cuando el usuario mencione ese cliente por nombre (ej. "cotización para Acme" → cliente_id del Acme de la lista).
- Extrae TODO lo que el usuario diga o escriba; para lo no dicho usa null.`;
const AI_WELCOME = `¡Hola! 👋 Soy tu Agente de Soporte.

Puedo ayudarte a consultar **cotizaciones** (por fecha, cliente), **clientes**, **refacciones**, **máquinas**, **incidentes** y **bitácora**. También puedo explicarte cómo usar el sistema.

Pregunta lo que necesites, por ejemplo: "¿Cuántas cotizaciones hay de hoy?" o "Dame las cotizaciones del 18 de marzo."`;

app.get('/api/ai/welcome', (req, res) => {
  res.json({ message: AI_WELCOME });
});

app.post('/api/ai/chat', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
  if (process.env.CURSOR_API_KEY && !apiKey) {
    return res.status(400).json({
      error: 'La API key de Cursor (crsr_...) es para el editor Cursor, no para este chat.',
      hint: 'Para el asistente de esta página usa una API compatible con OpenAI. En Render → Environment añade OPENAI_API_KEY con una key de OpenAI (crea una en https://platform.openai.com/api-keys).',
    });
  }
  if (!apiKey) {
    return res.status(503).json({
      error: 'API de IA no configurada',
      hint: 'En Render → tu servicio → Environment añade OPENAI_API_KEY (key de OpenAI). Ver CONFIG_IA.md.',
    });
  }
  if (String(apiKey).startsWith('crsr_')) {
    return res.status(400).json({
      error: 'La key que configuraste es de Cursor (crsr_...). Para este chat se necesita una key de OpenAI.',
      hint: 'Crea una en https://platform.openai.com/api-keys y añádela en Render como OPENAI_API_KEY.',
    });
  }
  try {
    const { message, messages: history } = req.body || {};
    const text = (message || '').trim();
    if (!text) return res.status(400).json({ error: 'Falta el mensaje (message)' });

    let systemContent = AI_SYSTEM_BASE;
    const lower = text.toLowerCase();
    const historyText = (Array.isArray(history) ? history : []).map(m => (m && m.content) || '').join(' ');
    const wantsCotizaciones = /\b(cotizaciones?|cotización)\b/i.test(text + ' ' + historyText) || (/\bhoy\b|fecha|\d{1,2}\s+de\s+\w+/i.test(text) && !/\bincidentes?\b/i.test(text));
    if (wantsCotizaciones) {
      try {
        const rows = await db.getAll(
          `SELECT co.id, co.folio, co.fecha, co.tipo, co.subtotal, co.iva, co.total, c.nombre as cliente_nombre
           FROM cotizaciones co JOIN clientes c ON c.id = co.cliente_id
           ORDER BY co.fecha DESC, co.id DESC LIMIT 80`
        );
        const hoy = new Date().toISOString().slice(0, 10);
        const paraHoy = rows.filter(r => r.fecha === hoy);
        systemContent += `\n\nDatos actuales del sistema (usa esto para responder):\n- Cotizaciones de HOY (${hoy}): ${paraHoy.length}. ${paraHoy.length ? paraHoy.map(c => `Folio ${c.folio}, ${c.cliente_nombre}, $${(c.total || 0).toFixed(2)}`).join('; ') : 'Ninguna.'}\n- Últimas cotizaciones (total ${rows.length}): ${rows.slice(0, 15).map(c => `${c.folio} (${c.fecha}) ${c.cliente_nombre} $${(c.total || 0).toFixed(2)}`).join('; ')}`;
      } catch (_) {}
    }
    const wantsIncidentes = /\bincidentes?\b/i.test(text + ' ' + historyText) || /\bcuántos\s+incidentes?\b|\bincidentes\s+de\s+hoy\b|\bincidentes\s+hoy\b/i.test(text);
    if (wantsIncidentes) {
      try {
        const rows = await db.getAll(
          `SELECT i.id, i.folio, i.fecha_reporte, i.fecha_cerrado, i.descripcion, i.prioridad, i.estatus, c.nombre as cliente_nombre
           FROM incidentes i JOIN clientes c ON c.id = i.cliente_id
           ORDER BY i.fecha_reporte DESC, i.id DESC LIMIT 80`
        );
        const hoy = new Date().toISOString().slice(0, 10);
        const paraHoy = rows.filter(r => (r.fecha_reporte || '').toString().slice(0, 10) === hoy);
        systemContent += `\n\nDatos actuales de incidentes (usa esto para responder):\n- Incidentes reportados HOY (${hoy}): ${paraHoy.length}. ${paraHoy.length ? paraHoy.map(inc => `${inc.folio} ${inc.cliente_nombre} ${(inc.descripcion || '').slice(0, 40)} (${inc.estatus})`).join('; ') : 'Ninguno.'}\n- Últimos incidentes (total ${rows.length}): ${rows.slice(0, 15).map(inc => `${inc.folio} (${(inc.fecha_reporte || '').slice(0, 10)}) ${inc.cliente_nombre} ${inc.estatus}`).join('; ')}`;
      } catch (_) {}
    }
    const wantsCreate = /\b(agregar|agrega|registrar|registra|crear|crea|abre|abrir|nueva|nuevo|dame de alta|anota|anotar|pon|poner)\b/i.test(text) && /\b(cliente|incidente|bitácora|bitacora|cotización|cotizacion)\b/i.test(text);
    if (wantsCreate) {
      try {
        const clientes = await db.getAll('SELECT id, nombre FROM clientes ORDER BY nombre LIMIT 80');
        if (clientes.length) {
          systemContent += `\n\nClientes (id, nombre) para elegir cuando el usuario mencione un cliente por nombre:\n${clientes.map(c => `${c.id}: ${c.nombre}`).join('\n')}`;
        }
      } catch (_) {}
    }

    const apiMessages = [{ role: 'system', content: systemContent }];
    if (Array.isArray(history) && history.length) {
      history.forEach(m => {
        if (m && m.role && m.content) apiMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 2000) });
      });
    }
    apiMessages.push({ role: 'user', content: text });

    const apiUrl = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1/chat/completions';
    const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        max_tokens: 500,
      }),
    });
    const data = await response.json();
    if (data.error) {
      return res.status(response.ok ? 500 : response.status).json({ error: data.error.message || 'Error de la API de IA' });
    }
    let reply = data.choices?.[0]?.message?.content || 'Sin respuesta';
    const actionMatch = reply.match(/ACTION:\s*(\{[\s\S]*?\})\s*$/m);
    let payload = { reply };
    if (actionMatch) {
      try {
        const parsed = JSON.parse(actionMatch[1]);
        reply = reply.replace(/\s*ACTION:\s*\{[\s\S]*\}\s*$/m, '').trim();
        payload.reply = reply || 'Listo.';
        if (parsed.type && parsed.data) {
          payload.action = parsed.type;
          if (parsed.type === 'open_cotizacion') {
            payload.cotizacion = parsed.data;
          } else {
            payload.data = parsed.data;
          }
        }
      } catch (_) { /* mantener solo reply si el JSON es inválido */ }
    }
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// --- Extraer datos fiscales de imagen (constancia / datos fiscales) para alta de cliente
app.post('/api/ai/extract-client', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
  if (!apiKey || String(apiKey).startsWith('crsr_')) {
    return res.status(503).json({
      error: 'Para extraer datos de imagen se necesita OPENAI_API_KEY (OpenAI) en Render.',
      hint: 'La key de Cursor no sirve para esta función. Usa una key de https://platform.openai.com/api-keys',
    });
  }
  try {
    const { fileBase64, mimeType } = req.body || {};
    if (!fileBase64) return res.status(400).json({ error: 'Falta fileBase64' });
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const mime = (mimeType || 'image/jpeg').toLowerCase();
    if (!allowed.includes(mime)) {
      return res.status(400).json({
        error: 'Por ahora solo se aceptan imágenes (JPG, PNG, GIF, WebP). PDF y Excel en una próxima versión.',
      });
    }
    const dataUrl = `data:${mime};base64,${fileBase64.replace(/^data:[^;]+;base64,/, '')}`;
    const apiUrl = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1/chat/completions';
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const extractPrompt = `Extrae de esta imagen (constancia fiscal, datos fiscales o documento similar) los datos del cliente. Responde ÚNICAMENTE un JSON válido, sin markdown, con estas claves (usa null si no aparece): nombre, rfc, direccion, ciudad, codigoPostal, regimenFiscal, email, telefono. Ejemplo: {"nombre":"RAZÓN SOCIAL S.A.","rfc":"ABC123456789","direccion":"Calle 1","ciudad":"Ciudad","codigoPostal":"12345","regimenFiscal":"601","email":null,"telefono":null}`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model.includes('gpt-4') ? model : 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Eres un asistente que extrae datos fiscales de imágenes. Responde solo JSON válido.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: extractPrompt },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 400,
      }),
    });
    const data = await response.json();
    if (data.error) {
      return res.status(response.ok ? 500 : response.status).json({ error: data.error.message || 'Error al analizar la imagen' });
    }
    const raw = data.choices?.[0]?.message?.content || '{}';
    let parsed = {};
    try {
      const cleaned = raw.replace(/```json?\s*|\s*```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (_) {
      parsed = { nombre: raw.slice(0, 200) || null };
    }
    const fields = ['nombre', 'rfc', 'direccion', 'ciudad', 'codigoPostal', 'regimenFiscal', 'email', 'telefono'];
    const result = {};
    fields.forEach(f => { result[f] = parsed[f] != null && String(parsed[f]).trim() !== '' ? String(parsed[f]).trim() : null; });
    const missing = fields.filter(f => !result[f]);
    res.json({ data: result, missing });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// --- Extraer texto de PDF, Excel o Word para el chat; opcionalmente devolver acción "open_cotizacion" ---
const DOCUMENT_MIMES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
};
app.post('/api/ai/extract-document', async (req, res) => {
  try {
    const { fileBase64, mimeType, message: userMessage } = req.body || {};
    if (!fileBase64) return res.status(400).json({ error: 'Falta fileBase64' });
    const mime = (mimeType || '').toLowerCase();
    const docType = DOCUMENT_MIMES[mime];
    if (!docType) {
      return res.status(400).json({
        error: 'Tipo de archivo no soportado. Usa PDF, Excel (.xls, .xlsx) o Word (.docx).',
      });
    }
    const raw = fileBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(raw, 'base64');
    let extractedText = '';
    if (docType === 'pdf') {
      const data = await pdfParse(buffer);
      extractedText = (data && data.text) ? data.text.trim() : '';
    } else if (docType === 'docx' || docType === 'doc') {
      try {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = (result && result.value) ? result.value.trim() : '';
      } catch (err) {
        if (docType === 'doc') {
          return res.status(400).json({
            error: 'El formato Word antiguo (.doc) no está soportado. Guarda el archivo como .docx e inténtalo de nuevo.',
          });
        }
        throw err;
      }
    } else {
      const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const firstSheet = wb.SheetNames[0];
      if (firstSheet && wb.Sheets[firstSheet]) {
        const csv = XLSX.utils.sheet_to_txt(wb.Sheets[firstSheet], { FS: '\t', RS: '\n' });
        extractedText = csv.trim().slice(0, 50000);
      }
    }
    if (!extractedText) extractedText = '(Sin texto extraíble)';
    const wantsCotizacion = userMessage && /(nueva\s+)?cotizaci[oó]n|pon(er)?\s+(esto|lo|el\s+documento)/i.test(userMessage);
    const apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
    if (wantsCotizacion && apiKey && !String(apiKey).startsWith('crsr_')) {
      try {
        const clientes = await db.getAll('SELECT id, nombre FROM clientes ORDER BY nombre LIMIT 200', []);
        const clientesList = clientes.map(c => `id ${c.id}: ${c.nombre}`).join('\n');
        const prompt = `Del siguiente contenido de un documento (PDF, Excel o Word), extrae datos para una cotización. Responde ÚNICAMENTE un JSON válido, sin markdown, con estas claves: cliente_id (id del cliente que mejor coincida, o null), subtotal (número, 0 si no hay), tipo ("refacciones" o "mano_obra"). Usa esta lista de clientes para elegir cliente_id por nombre:\n${clientesList}\n\nContenido del documento:\n${extractedText.slice(0, 6000)}`;
        const apiUrl = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1/chat/completions';
        const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: 'Eres un asistente que extrae datos para cotizaciones. Responde solo JSON válido con las claves indicadas.' },
              { role: 'user', content: prompt },
            ],
            max_tokens: 200,
          }),
        });
        const data = await response.json();
        const rawReply = data.choices?.[0]?.message?.content || '{}';
        let cotizacion = {};
        try {
          const cleaned = rawReply.replace(/```json?\s*|\s*```/g, '').trim();
          cotizacion = JSON.parse(cleaned);
        } catch (_) {}
        const cliente_id = cotizacion.cliente_id != null ? parseInt(cotizacion.cliente_id, 10) : null;
        const subtotal = typeof cotizacion.subtotal === 'number' ? cotizacion.subtotal : (parseFloat(cotizacion.subtotal) || 0);
        return res.json({
          text: extractedText.slice(0, 3000),
          reply: 'Listo. Encontré datos en el documento. Abre el formulario de cotización para que revises y completes.',
          action: 'open_cotizacion',
          cotizacion: { cliente_id: isNaN(cliente_id) ? null : cliente_id, subtotal, tipo: cotizacion.tipo === 'mano_obra' ? 'mano_obra' : 'refacciones' },
        });
      } catch (_) { /* si falla IA, seguimos solo con texto */ }
    }
    const reply = extractedText.length > 800
      ? `Extraje el documento (${extractedText.length} caracteres). Puedes pedirme que lo pase a una nueva cotización o que resuma algo en concreto.`
      : `Contenido del documento:\n\n${extractedText}`;
    res.json({ text: extractedText.slice(0, 3000), reply });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// =================== REPORTES ===================
function generarFolioReporte(tipo) {
  const d = new Date();
  const pre = tipo === 'venta' ? 'REP-V' : 'REP-S';
  return `${pre}-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.floor(Math.random()*9000)+1000}`;
}

app.get('/api/reportes', async (req, res) => {
  try {
    const rows = await db.getAll(
      `SELECT r.*, c.nombre as cliente_nombre, m.nombre as maquina_nombre
       FROM reportes r
       LEFT JOIN clientes c ON c.id = r.cliente_id
       LEFT JOIN maquinas m ON m.id = r.maquina_id
       ORDER BY r.fecha DESC, r.id DESC LIMIT 500`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.get('/api/reportes/:id', async (req, res) => {
  try {
    const row = await db.getOne(
      `SELECT r.*, c.nombre as cliente_nombre, m.nombre as maquina_nombre
       FROM reportes r LEFT JOIN clientes c ON c.id=r.cliente_id LEFT JOIN maquinas m ON m.id=r.maquina_id
       WHERE r.id=?`, [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.post('/api/reportes', async (req, res) => {
  try {
    const { cliente_id, razon_social, maquina_id, numero_maquina, tipo_reporte, subtipo, descripcion, tecnico, fecha, estatus, notas } = req.body || {};
    const folio = generarFolioReporte(tipo_reporte);
    await db.runQuery(
      `INSERT INTO reportes (folio, cliente_id, razon_social, maquina_id, numero_maquina, tipo_reporte, subtipo, descripcion, tecnico, fecha, estatus, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [folio, cliente_id || null, razon_social || null, maquina_id || null, numero_maquina || null,
       tipo_reporte || 'servicio', subtipo || null, descripcion || null, tecnico || null,
       fecha || new Date().toISOString().slice(0,10), estatus || 'abierto', notas || null]
    );
    const r = await db.getOne('SELECT r.*, c.nombre as cliente_nombre FROM reportes r LEFT JOIN clientes c ON c.id=r.cliente_id ORDER BY r.id DESC LIMIT 1');
    res.status(201).json(r);
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.put('/api/reportes/:id', async (req, res) => {
  try {
    const { cliente_id, razon_social, maquina_id, numero_maquina, tipo_reporte, subtipo, descripcion, tecnico, fecha, estatus, notas } = req.body || {};
    await db.runQuery(
      `UPDATE reportes SET cliente_id=?, razon_social=?, maquina_id=?, numero_maquina=?, tipo_reporte=?, subtipo=?, descripcion=?, tecnico=?, fecha=?, estatus=?, notas=? WHERE id=?`,
      [cliente_id || null, razon_social || null, maquina_id || null, numero_maquina || null,
       tipo_reporte || 'servicio', subtipo || null, descripcion || null, tecnico || null,
       fecha || null, estatus || 'abierto', notas || null, req.params.id]
    );
    const r = await db.getOne('SELECT r.*, c.nombre as cliente_nombre FROM reportes r LEFT JOIN clientes c ON c.id=r.cliente_id WHERE r.id=?', [req.params.id]);
    res.json(r || {});
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.delete('/api/reportes/:id', async (req, res) => {
  try {
    await db.runQuery('DELETE FROM reportes WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

// =================== GARANTÍAS ===================
// Calcula fechas de los 2 mantenimientos del año según fecha de entrega
function calcularMantenimientosAnio(fechaEntrega, anio) {
  const base = new Date(fechaEntrega + 'T00:00:00');
  // Primer mantenimiento: 6 meses después; Segundo: 12 meses después
  const m1 = new Date(base); m1.setMonth(m1.getMonth() + 6); m1.setFullYear(anio || m1.getFullYear());
  const m2 = new Date(base); m2.setMonth(m2.getMonth() + 12); m2.setFullYear(anio || m2.getFullYear());
  return [m1.toISOString().slice(0,10), m2.toISOString().slice(0,10)];
}

app.get('/api/garantias', async (req, res) => {
  try {
    const rows = await db.getAll(
      `SELECT g.*, c.nombre as cliente_nombre FROM garantias g LEFT JOIN clientes c ON c.id=g.cliente_id ORDER BY g.fecha_entrega DESC LIMIT 500`
    );
    for (const g of rows) {
      g.mantenimientos = await db.getAll('SELECT * FROM mantenimientos_garantia WHERE garantia_id=? ORDER BY anio, numero', [g.id]);
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.get('/api/garantias/:id', async (req, res) => {
  try {
    const g = await db.getOne('SELECT g.*, c.nombre as cliente_nombre FROM garantias g LEFT JOIN clientes c ON c.id=g.cliente_id WHERE g.id=?', [req.params.id]);
    if (!g) return res.status(404).json({ error: 'No encontrado' });
    g.mantenimientos = await db.getAll('SELECT * FROM mantenimientos_garantia WHERE garantia_id=? ORDER BY anio, numero', [g.id]);
    res.json(g);
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.post('/api/garantias', async (req, res) => {
  try {
    const { cliente_id, razon_social, modelo_maquina, numero_serie, tipo_maquina, fecha_entrega } = req.body || {};
    if (!razon_social || !modelo_maquina || !fecha_entrega) return res.status(400).json({ error: 'razon_social, modelo_maquina y fecha_entrega requeridos' });
    await db.runQuery(
      `INSERT INTO garantias (cliente_id, razon_social, modelo_maquina, numero_serie, tipo_maquina, fecha_entrega) VALUES (?, ?, ?, ?, ?, ?)`,
      [cliente_id || null, razon_social, modelo_maquina, numero_serie || null, tipo_maquina || null, fecha_entrega]
    );
    const g = await db.getOne('SELECT * FROM garantias ORDER BY id DESC LIMIT 1');
    // Crear automáticamente los 2 mantenimientos del año 1
    const anioEntrega = new Date(fecha_entrega + 'T00:00:00').getFullYear();
    const [f1, f2] = calcularMantenimientosAnio(fecha_entrega, anioEntrega);
    await db.runQuery(
      `INSERT INTO mantenimientos_garantia (garantia_id, numero, anio, fecha_programada) VALUES (?, 1, ?, ?)`,
      [g.id, anioEntrega, f1]
    );
    await db.runQuery(
      `INSERT INTO mantenimientos_garantia (garantia_id, numero, anio, fecha_programada) VALUES (?, 2, ?, ?)`,
      [g.id, anioEntrega, f2]
    );
    g.mantenimientos = await db.getAll('SELECT * FROM mantenimientos_garantia WHERE garantia_id=? ORDER BY anio, numero', [g.id]);
    res.status(201).json(g);
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.put('/api/garantias/:id', async (req, res) => {
  try {
    const { cliente_id, razon_social, modelo_maquina, numero_serie, tipo_maquina, fecha_entrega, activa } = req.body || {};
    await db.runQuery(
      `UPDATE garantias SET cliente_id=?, razon_social=?, modelo_maquina=?, numero_serie=?, tipo_maquina=?, fecha_entrega=?, activa=? WHERE id=?`,
      [cliente_id || null, razon_social || '', modelo_maquina || '', numero_serie || null, tipo_maquina || null, fecha_entrega || null, activa != null ? Number(activa) : 1, req.params.id]
    );
    const g = await db.getOne('SELECT * FROM garantias WHERE id=?', [req.params.id]);
    if (g) g.mantenimientos = await db.getAll('SELECT * FROM mantenimientos_garantia WHERE garantia_id=? ORDER BY anio, numero', [g.id]);
    res.json(g || {});
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.delete('/api/garantias/:id', async (req, res) => {
  try {
    await db.runQuery('DELETE FROM mantenimientos_garantia WHERE garantia_id=?', [req.params.id]);
    await db.runQuery('DELETE FROM garantias WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

// Confirmar mantenimiento de garantía
app.put('/api/mantenimientos-garantia/:id', async (req, res) => {
  try {
    const { fecha_realizada, confirmado, costo, pagado, notas } = req.body || {};
    await db.runQuery(
      `UPDATE mantenimientos_garantia SET fecha_realizada=?, confirmado=?, costo=?, pagado=?, notas=? WHERE id=?`,
      [fecha_realizada || null, confirmado != null ? Number(confirmado) : 0, Number(costo) || 0, Number(pagado) || 0, notas || null, req.params.id]
    );
    const r = await db.getOne('SELECT * FROM mantenimientos_garantia WHERE id=?', [req.params.id]);
    res.json(r || {});
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

// Garantías próximas a mantenimiento (alerta)
app.get('/api/garantias-alertas', async (req, res) => {
  try {
    const hoy = new Date();
    const en30 = new Date(); en30.setDate(en30.getDate() + 30);
    const hoyStr = hoy.toISOString().slice(0,10);
    const en30Str = en30.toISOString().slice(0,10);
    const rows = await db.getAll(
      `SELECT mg.*, g.razon_social, g.modelo_maquina, g.numero_serie, g.cliente_id, c.nombre as cliente_nombre, c.email
       FROM mantenimientos_garantia mg
       JOIN garantias g ON g.id = mg.garantia_id
       LEFT JOIN clientes c ON c.id = g.cliente_id
       WHERE mg.confirmado = 0 AND mg.fecha_programada BETWEEN ? AND ?
       ORDER BY mg.fecha_programada ASC`,
      [hoyStr, en30Str]
    );
    const vencidos = await db.getAll(
      `SELECT mg.*, g.razon_social, g.modelo_maquina, g.numero_serie, g.cliente_id, c.nombre as cliente_nombre
       FROM mantenimientos_garantia mg
       JOIN garantias g ON g.id = mg.garantia_id
       LEFT JOIN clientes c ON c.id = g.cliente_id
       WHERE mg.confirmado = 0 AND mg.fecha_programada < ?
       ORDER BY mg.fecha_programada ASC`,
      [hoyStr]
    );
    res.json({ proximos: rows, vencidos });
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

// =================== BONOS ===================
app.get('/api/bonos', async (req, res) => {
  try {
    const rows = await db.getAll(
      `SELECT b.*, r.folio as reporte_folio, r.tipo_reporte, r.subtipo
       FROM bonos b LEFT JOIN reportes r ON r.id = b.reporte_id
       ORDER BY b.fecha DESC, b.id DESC LIMIT 500`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.post('/api/bonos', async (req, res) => {
  try {
    const { reporte_id, tecnico, tipo_capacitacion, monto_bono, fecha, notas } = req.body || {};
    if (!tecnico) return res.status(400).json({ error: 'tecnico requerido' });
    await db.runQuery(
      `INSERT INTO bonos (reporte_id, tecnico, tipo_capacitacion, monto_bono, fecha, notas) VALUES (?, ?, ?, ?, ?, ?)`,
      [reporte_id || null, tecnico, tipo_capacitacion || null, Number(monto_bono) || 0, fecha || new Date().toISOString().slice(0,10), notas || null]
    );
    const r = await db.getOne('SELECT * FROM bonos ORDER BY id DESC LIMIT 1');
    res.status(201).json(r);
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.put('/api/bonos/:id', async (req, res) => {
  try {
    const { reporte_id, tecnico, tipo_capacitacion, monto_bono, fecha, pagado, notas } = req.body || {};
    await db.runQuery(
      `UPDATE bonos SET reporte_id=?, tecnico=?, tipo_capacitacion=?, monto_bono=?, fecha=?, pagado=?, notas=? WHERE id=?`,
      [reporte_id || null, tecnico || '', tipo_capacitacion || null, Number(monto_bono) || 0, fecha || null, Number(pagado) || 0, notas || null, req.params.id]
    );
    const r = await db.getOne('SELECT * FROM bonos WHERE id=?', [req.params.id]);
    res.json(r || {});
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.delete('/api/bonos/:id', async (req, res) => {
  try {
    await db.runQuery('DELETE FROM bonos WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

// Resumen de bonos por técnico
app.get('/api/bonos-resumen', async (req, res) => {
  try {
    const { mes } = req.query;
    let sql = `SELECT tecnico, SUM(monto_bono) as total_bonos, COUNT(*) as cantidad, SUM(CASE WHEN pagado=1 THEN monto_bono ELSE 0 END) as pagado
               FROM bonos`;
    const params = [];
    if (mes) { sql += ' WHERE strftime("%Y-%m", fecha) = ?'; params.push(mes); }
    sql += ' GROUP BY tecnico ORDER BY tecnico';
    const rows = await db.getAll(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

// =================== VIAJES ===================
const VIATICO_DIARIO = 1000; // MXN por día

app.get('/api/viajes', async (req, res) => {
  try {
    const rows = await db.getAll(
      `SELECT v.*, c.nombre as cliente_nombre, r.folio as reporte_folio
       FROM viajes v
       LEFT JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN reportes r ON r.id = v.reporte_id
       ORDER BY v.fecha_inicio DESC, v.id DESC LIMIT 500`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.post('/api/viajes', async (req, res) => {
  try {
    const { tecnico, cliente_id, razon_social, fecha_inicio, fecha_fin, descripcion, actividades, reporte_id, mes_liquidacion } = req.body || {};
    if (!tecnico || !fecha_inicio || !fecha_fin) return res.status(400).json({ error: 'tecnico, fecha_inicio y fecha_fin requeridos' });
    const d1 = new Date(fecha_inicio + 'T00:00:00');
    const d2 = new Date(fecha_fin + 'T00:00:00');
    const dias = Math.max(1, Math.round((d2 - d1) / (86400000)) + 1);
    const monto = dias * VIATICO_DIARIO;
    await db.runQuery(
      `INSERT INTO viajes (tecnico, cliente_id, razon_social, fecha_inicio, fecha_fin, dias, monto_viaticos, descripcion, actividades, reporte_id, mes_liquidacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tecnico, cliente_id || null, razon_social || null, fecha_inicio, fecha_fin, dias, monto, descripcion || null, actividades || null, reporte_id || null, mes_liquidacion || null]
    );
    const r = await db.getOne('SELECT * FROM viajes ORDER BY id DESC LIMIT 1');
    res.status(201).json(r);
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.put('/api/viajes/:id', async (req, res) => {
  try {
    const { tecnico, cliente_id, razon_social, fecha_inicio, fecha_fin, descripcion, actividades, reporte_id, mes_liquidacion, liquidado } = req.body || {};
    const d1 = new Date((fecha_inicio || '') + 'T00:00:00');
    const d2 = new Date((fecha_fin || '') + 'T00:00:00');
    const dias = isNaN(d1) || isNaN(d2) ? 1 : Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
    const monto = dias * VIATICO_DIARIO;
    await db.runQuery(
      `UPDATE viajes SET tecnico=?, cliente_id=?, razon_social=?, fecha_inicio=?, fecha_fin=?, dias=?, monto_viaticos=?, descripcion=?, actividades=?, reporte_id=?, mes_liquidacion=?, liquidado=? WHERE id=?`,
      [tecnico || '', cliente_id || null, razon_social || null, fecha_inicio || null, fecha_fin || null, dias, monto, descripcion || null, actividades || null, reporte_id || null, mes_liquidacion || null, Number(liquidado) || 0, req.params.id]
    );
    const r = await db.getOne('SELECT * FROM viajes WHERE id=?', [req.params.id]);
    res.json(r || {});
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.delete('/api/viajes/:id', async (req, res) => {
  try {
    await db.runQuery('DELETE FROM viajes WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

// Resumen mensual de viajes + bonos por técnico
app.get('/api/liquidacion-mensual', async (req, res) => {
  try {
    const { mes } = req.query; // formato: YYYY-MM
    if (!mes) return res.status(400).json({ error: 'Parámetro mes requerido (YYYY-MM)' });
    const viajes = await db.getAll(
      `SELECT v.*, c.nombre as cliente_nombre FROM viajes v LEFT JOIN clientes c ON c.id=v.cliente_id
       WHERE strftime('%Y-%m', v.fecha_inicio) = ? ORDER BY v.tecnico, v.fecha_inicio`,
      [mes]
    );
    const bonos = await db.getAll(
      `SELECT * FROM bonos WHERE strftime('%Y-%m', fecha) = ? ORDER BY tecnico, fecha`, [mes]
    );
    // Agrupar por técnico
    const porTecnico = {};
    for (const v of viajes) {
      if (!porTecnico[v.tecnico]) porTecnico[v.tecnico] = { viajes: [], bonos: [], total_viaticos: 0, total_bonos: 0 };
      porTecnico[v.tecnico].viajes.push(v);
      porTecnico[v.tecnico].total_viaticos += Number(v.monto_viaticos) || 0;
    }
    for (const b of bonos) {
      if (!porTecnico[b.tecnico]) porTecnico[b.tecnico] = { viajes: [], bonos: [], total_viaticos: 0, total_bonos: 0 };
      porTecnico[b.tecnico].bonos.push(b);
      porTecnico[b.tecnico].total_bonos += Number(b.monto_bono) || 0;
    }
    res.json({ mes, porTecnico });
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

// SPA: todas las rutas no-API sirven index.html (sin caché para que siempre cargue la última versión)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).end();
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  await db.init();
  await auth.ensureSeedUsers();
  const autoEnsure =
    process.env.COTIZACION_AUTO_ENSURE_MAQUINAS !== '0' && process.env.COTIZACION_AUTO_ENSURE_MAQUINAS !== 'false';
  if (autoEnsure) {
    try {
      const [cRow] = await db.getAll('SELECT COUNT(*) as n FROM clientes');
      const [mRow] = await db.getAll('SELECT COUNT(*) as n FROM maquinas WHERE COALESCE(activo, 1) = 1');
      const nc = Number(cRow && cRow.n) || 0;
      const nm = Number(mRow && mRow.n) || 0;
      if (nc > 0 && nm < nc * 2) {
        const r = await runDemoEnsureMaquinas();
        console.log('[demo-ensure] Arranque: insertados', r.inserted, 'máquinas activas:', r.maquinas_activas);
      }
    } catch (e) {
      console.warn('[demo-ensure] Arranque omitido:', e && e.message);
    }
  }
  startAutoBackupScheduler();
  app.listen(PORT, () => {
    console.log('Sistema de Cotización - En línea');
    console.log('Abre en el navegador: http://localhost:' + PORT);
    if (db.useTurso) console.log('Base de datos: Turso (nube)');
    else {
      const storage = db.getStorageInfo && db.getStorageInfo();
      console.log('Base de datos: SQLite local');
      if (storage && storage.path) console.log('Archivo SQLite: ' + storage.path);
    }
    console.log('[backup-auto] Intervalo (h):', Math.round(BACKUP_AUTO_INTERVAL_MS / (60 * 60 * 1000)));
    console.log('[backup-auto] Directorio:', getBackupDir());
    console.log('[backup-auto] Retención: max archivos =', BACKUP_AUTO_MAX_FILES, '| max días =', BACKUP_AUTO_MAX_AGE_DAYS);
  });
}

start().catch(err => {
  console.error(err);
  process.exit(1);
});
