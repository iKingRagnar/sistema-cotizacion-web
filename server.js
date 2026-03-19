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
    const { codigo, descripcion, marca, origen, precio_unitario, unidad } = req.body || {};
    await db.runQuery(
      `INSERT INTO refacciones (codigo, descripcion, marca, origen, precio_unitario, unidad) VALUES (?, ?, ?, ?, ?, ?)`,
      [codigo || '', descripcion || '', marca || null, origen || null, Number(precio_unitario) || 0, unidad || 'PZA']
    );
    const r = await db.getOne('SELECT * FROM refacciones ORDER BY id DESC LIMIT 1');
    res.status(201).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put('/api/refacciones/:id', async (req, res) => {
  try {
    const { codigo, descripcion, marca, origen, precio_unitario, unidad } = req.body || {};
    await db.runQuery(
      `UPDATE refacciones SET codigo=?, descripcion=?, marca=?, origen=?, precio_unitario=?, unidad=? WHERE id=?`,
      [codigo || '', descripcion || '', marca || null, origen || null, Number(precio_unitario) || 0, unidad || 'PZA', req.params.id]
    );
    const r = await db.getOne('SELECT * FROM refacciones WHERE id = ?', [req.params.id]);
    res.json(r || {});
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
    const clienteId = req.query.cliente_id;
    let sql = 'SELECT m.*, c.nombre as cliente_nombre FROM maquinas m LEFT JOIN clientes c ON c.id = m.cliente_id WHERE m.activo = 1 ORDER BY m.nombre';
    let params = [];
    if (clienteId) {
      sql = 'SELECT m.*, c.nombre as cliente_nombre FROM maquinas m LEFT JOIN clientes c ON c.id = m.cliente_id WHERE m.activo = 1 AND m.cliente_id = ? ORDER BY m.nombre';
      params = [clienteId];
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
    res.json(row);
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
    const { cliente_id, tipo, fecha, subtotal, iva, total, folio } = req.body || {};
    if (!cliente_id) return res.status(400).json({ error: 'cliente_id requerido' });
    const f = folio || generarFolio(tipo === 'mano_obra' ? 'COT-MO' : 'COT-REF');
    const st = Number(subtotal) || 0;
    const iv = Number(iva) || 0;
    const tot = Number(total) != null ? Number(total) : st + iv;
    await db.runQuery(
      `INSERT INTO cotizaciones (folio, cliente_id, tipo, fecha, subtotal, iva, total) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [f, cliente_id, tipo || 'refacciones', fecha || new Date().toISOString().slice(0, 10), st, iv, tot]
    );
    const r = await db.getOne('SELECT co.*, c.nombre as cliente_nombre FROM cotizaciones co JOIN clientes c ON c.id = co.cliente_id ORDER BY co.id DESC LIMIT 1');
    res.status(201).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put('/api/cotizaciones/:id', async (req, res) => {
  try {
    const { folio, cliente_id, tipo, fecha, subtotal, iva, total } = req.body || {};
    await db.runQuery(
      `UPDATE cotizaciones SET folio=?, cliente_id=?, tipo=?, fecha=?, subtotal=?, iva=?, total=? WHERE id=?`,
      [folio || null, cliente_id || null, tipo || 'refacciones', fecha || null, Number(subtotal) || 0, Number(iva) || 0, Number(total) || 0, req.params.id]
    );
    const r = await db.getOne('SELECT co.*, c.nombre as cliente_nombre FROM cotizaciones co JOIN clientes c ON c.id = co.cliente_id WHERE co.id = ?', [req.params.id]);
    res.json(r || {});
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
    const rows = await db.getAll(
      `SELECT b.*, i.folio as incidente_folio, co.folio as cotizacion_folio
       FROM bitacoras b
       LEFT JOIN incidentes i ON i.id = b.incidente_id
       LEFT JOIN cotizaciones co ON co.id = b.cotizacion_id
       ORDER BY b.fecha DESC, b.id DESC LIMIT 500`
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
    if (!incidente_id && !cotizacion_id) return res.status(400).json({ error: 'Indica incidente_id o cotizacion_id' });
    await db.runQuery(
      `INSERT INTO bitacoras (incidente_id, cotizacion_id, fecha, tecnico, actividades, tiempo_horas, materiales_usados) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [incidente_id || null, cotizacion_id || null, fecha || new Date().toISOString().slice(0, 10), tecnico || null, actividades || null, Number(tiempo_horas) || 0, materiales_usados || null]
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
    await db.runQuery(
      `UPDATE bitacoras SET incidente_id=?, cotizacion_id=?, fecha=?, tecnico=?, actividades=?, tiempo_horas=?, materiales_usados=? WHERE id=?`,
      [incidente_id || null, cotizacion_id || null, fecha || null, tecnico || null, actividades || null, Number(tiempo_horas) || 0, materiales_usados || null, req.params.id]
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
    const [cCount] = await db.getAll('SELECT COUNT(*) as n FROM clientes');
    if (cCount && cCount.n > 0) {
      return res.status(400).json({ error: 'Ya hay datos cargados. El demo solo se puede cargar cuando no hay clientes. Si quieres volver a cargar, elimina primero los clientes desde la pestaña Clientes.' });
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
        `INSERT INTO refacciones (codigo, descripcion, marca, origen, precio_unitario, unidad) VALUES (?, ?, ?, ?, ?, ?)`,
        [safeStrReq(r.codigo), safeStrReq(r.descripcion), safeStr(r.marca), safeStr(r.origen), r.precio_unitario != null ? Number(r.precio_unitario) : 0, safeStr(r.unidad) || 'PZA']
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
      const subtotal = 3000 + (i * 800) + (i % 5) * 500;
      const iva = Math.round(subtotal * 0.16);
      const total = subtotal + iva;
      const dayOffset = diasAtras[i % diasAtras.length];
      const fecha = new Date(Date.now() - dayOffset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const folio = (tipo === 'mano_obra' ? 'COT-MO' : 'COT-REF') + '-' + fecha.replace(/-/g, '') + '-' + String(1001 + i);
      await db.runQuery(
        `INSERT INTO cotizaciones (folio, cliente_id, tipo, fecha, subtotal, iva, total) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [folio, clienteId, tipo, fecha, subtotal, iva, total]
      );
      cotizacionesCount++;
    }

    res.json({
      ok: true,
      clientes: clientes.length,
      refacciones: refacciones.length,
      maquinas: maquinas.length,
      incidentes: incidentesCount,
      bitacoras: bitacorasCount,
      cotizaciones: cotizacionesCount,
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

app.get('/api/seed-status', async (req, res) => {
  try {
    const [c] = await db.getAll('SELECT COUNT(*) as n FROM clientes');
    const [r] = await db.getAll('SELECT COUNT(*) as n FROM refacciones');
    const [m] = await db.getAll('SELECT COUNT(*) as n FROM maquinas');
    const [i] = await db.getAll('SELECT COUNT(*) as n FROM incidentes');
    const [b] = await db.getAll('SELECT COUNT(*) as n FROM bitacoras');
    const [co] = await db.getAll('SELECT COUNT(*) as n FROM cotizaciones');
    res.json({ clientes: c.n, refacciones: r.n, maquinas: m.n, incidentes: i.n, bitacoras: b.n, cotizaciones: co.n });
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

// SPA: todas las rutas no-API sirven index.html (sin caché para que siempre cargue la última versión)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).end();
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  await db.init();
  await auth.ensureSeedUsers();
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
