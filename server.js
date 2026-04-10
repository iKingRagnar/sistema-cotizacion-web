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

/**
 * Destinatarios internos (admin / operaciones): aprobación de cotización, garantías, reportes automáticos futuros.
 * Por defecto: David (admin). Opcional: segundo correo de operaciones.
 * Override: ADMIN_NOTIFY_EMAILS=uno@x.com,otro@y.com  (reemplaza la lista por defecto)
 * Extra: SMTP_ADMIN_EMAIL se añade si no está ya en la lista (compatibilidad).
 */
function getAdminNotifyEmails() {
  const csv = (process.env.ADMIN_NOTIFY_EMAILS || '').trim();
  if (csv) {
    return [...new Set(csv.split(/[,;]/).map((e) => e.trim()).filter(Boolean))];
  }
  const list = ['dcantu746@gmail.com', 'guillermorc44@gmail.com'];
  const extra = (process.env.SMTP_ADMIN_EMAIL || '').trim();
  if (extra && !list.some((x) => x.toLowerCase() === extra.toLowerCase())) {
    list.push(extra);
  }
  return list;
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));

/** Sin BD: útil en Vercel para ver que la función vive aunque falle Turso. */
app.get('/health', (req, res) => {
  res.status(200).type('text/plain').send('ok');
});

/** BD lista antes del resto de rutas (initServer al final del archivo, hoisting). */
app.use((req, res, next) => {
  initServer()
    .then(() => next())
    .catch(next);
});

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

app.get('/api/auth/me', (req, res) => {
  try {
    if (!auth.AUTH_ENABLED) {
      return res.json({
        user: { id: 0, username: 'local', role: 'admin', displayName: 'Local' },
      });
    }
    if (!req.authUser) return res.status(401).json({ error: 'No autorizado. Inicia sesión.' });
    res.json({
      user: {
        id: req.authUser.id,
        username: req.authUser.username,
        role: req.authUser.role,
        displayName: req.authUser.displayName,
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

const APP_USER_ROLES = ['admin', 'usuario', 'operador', 'consulta', 'invitado'];

app.get('/api/app-users', async (req, res) => {
  try {
    if (!req.authUser || req.authUser.role !== 'admin') {
      return res.status(403).json({ error: 'Solo el administrador puede ver usuarios' });
    }
    const rows = await db.getAll(
      'SELECT id, username, role, display_name, activo, creado_en FROM app_users ORDER BY username ASC'
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post('/api/app-users', async (req, res) => {
  try {
    if (!req.authUser || req.authUser.role !== 'admin') {
      return res.status(403).json({ error: 'Solo el administrador puede crear usuarios' });
    }
    const { username, password, role, display_name } = req.body || {};
    const u = String(username || '').trim().toLowerCase();
    if (!u || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    if (!/^[a-z0-9._-]{2,64}$/.test(u)) {
      return res.status(400).json({ error: 'Usuario: solo letras minúsculas, números, . _ - (2–64 caracteres)' });
    }
    const r = String(role || 'invitado').trim();
    if (!APP_USER_ROLES.includes(r)) return res.status(400).json({ error: 'Rol no válido' });
    const exists = await db.getOne('SELECT id FROM app_users WHERE lower(username)=?', [u]);
    if (exists) return res.status(409).json({ error: 'Ese nombre de usuario ya existe' });
    const dn = String(display_name || u).trim() || u;
    await db.runQuery(
      'INSERT INTO app_users (username, password_hash, role, display_name, activo) VALUES (?,?,?,?,1)',
      [u, auth.hashPassword(String(password)), r, dn]
    );
    const row = await db.getOne(
      'SELECT id, username, role, display_name, activo, creado_en FROM app_users WHERE lower(username)=?',
      [u]
    );
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.patch('/api/app-users/:id', async (req, res) => {
  try {
    if (!req.authUser || req.authUser.role !== 'admin') {
      return res.status(403).json({ error: 'Solo el administrador puede editar usuarios' });
    }
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
    const target = await db.getOne('SELECT * FROM app_users WHERE id=?', [id]);
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });

    const b = req.body || {};
    let role = target.role;
    if (b.role !== undefined) {
      const r = String(b.role).trim();
      if (!APP_USER_ROLES.includes(r)) return res.status(400).json({ error: 'Rol no válido' });
      role = r;
    }
    let activo = target.activo != null ? Number(target.activo) : 1;
    if (b.activo !== undefined) activo = b.activo ? 1 : 0;

    if (Number(req.authUser.id) === id && (role !== 'admin' || !activo)) {
      return res.status(400).json({ error: 'No puedes quitarte el rol administrador ni desactivarte a ti mismo' });
    }

    const admins = await db.getAll("SELECT id FROM app_users WHERE role='admin' AND activo=1");
    const wasAdmin = target.role === 'admin' && Number(target.activo) === 1;
    const willBeAdmin = role === 'admin' && activo === 1;
    if (wasAdmin && !willBeAdmin) {
      const others = admins.filter((a) => Number(a.id) !== id);
      if (others.length < 1) {
        return res.status(400).json({ error: 'Debe quedar al menos un administrador activo' });
      }
    }

    let display_name = target.display_name;
    if (b.display_name !== undefined) display_name = String(b.display_name).trim() || target.username;

    let password_hash = target.password_hash;
    if (b.password != null && String(b.password).trim() !== '') {
      password_hash = auth.hashPassword(String(b.password));
    }

    await db.runQuery(
      'UPDATE app_users SET role=?, display_name=?, activo=?, password_hash=? WHERE id=?',
      [role, display_name, activo, password_hash, id]
    );
    const row = await db.getOne(
      'SELECT id, username, role, display_name, activo, creado_en FROM app_users WHERE id=?',
      [id]
    );
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

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

/* En Vercel los estáticos salen por CDN desde public/; express.static no aplica allí. */
if (!process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, 'public')));
}

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

app.get('/api/catalogo-universal-maquinas', async (req, res) => {
  try {
    const p = path.join(__dirname, 'public', 'data', 'catalogo-universal-maquinas.json');
    if (!fs.existsSync(p)) return res.json([]);
    const raw = fs.readFileSync(p, 'utf8');
    const data = JSON.parse(raw);
    res.json(Array.isArray(data) ? data : data.items || []);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post('/api/maquinas', async (req, res) => {
  try {
    const {
      cliente_id,
      codigo,
      nombre,
      marca,
      modelo,
      numero_serie,
      ubicacion,
      categoria,
      categoria_principal,
      imagen_pieza_url,
      imagen_ensamble_url,
      stock,
      precio_lista_usd,
    } = req.body || {};
    if (!cliente_id) return res.status(400).json({ error: 'cliente_id requerido' });
    const stockNum = stock != null && stock !== '' ? Number(stock) : 0;
    const plUsd = precio_lista_usd != null && precio_lista_usd !== '' ? Number(precio_lista_usd) : 0;
    await db.runQuery(
      `INSERT INTO maquinas (cliente_id, codigo, nombre, marca, modelo, numero_serie, ubicacion, categoria, categoria_principal, imagen_pieza_url, imagen_ensamble_url, stock, precio_lista_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cliente_id,
        codigo || null,
        nombre || modelo || '',
        marca || null,
        modelo || null,
        numero_serie || null,
        ubicacion || null,
        categoria || null,
        categoria_principal || null,
        imagen_pieza_url || null,
        imagen_ensamble_url || null,
        Number.isFinite(stockNum) ? stockNum : 0,
        Number.isFinite(plUsd) ? plUsd : 0,
      ]
    );
    const r = await db.getOne('SELECT * FROM maquinas ORDER BY id DESC LIMIT 1');
    res.status(201).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put('/api/maquinas/:id', async (req, res) => {
  try {
    const {
      cliente_id,
      codigo,
      nombre,
      marca,
      modelo,
      numero_serie,
      ubicacion,
      categoria,
      categoria_principal,
      imagen_pieza_url,
      imagen_ensamble_url,
      stock,
      precio_lista_usd,
    } = req.body || {};
    const stockNum = stock != null && stock !== '' ? Number(stock) : 0;
    const plUsd = precio_lista_usd != null && precio_lista_usd !== '' ? Number(precio_lista_usd) : 0;
    await db.runQuery(
      `UPDATE maquinas SET cliente_id=?, codigo=?, nombre=?, marca=?, modelo=?, numero_serie=?, ubicacion=?, categoria=?, categoria_principal=?,
       imagen_pieza_url=?, imagen_ensamble_url=?, stock=?, precio_lista_usd=? WHERE id=?`,
      [
        cliente_id || null,
        codigo || null,
        nombre || modelo || '',
        marca || null,
        modelo || null,
        numero_serie || null,
        ubicacion || null,
        categoria || null,
        categoria_principal || null,
        imagen_pieza_url || null,
        imagen_ensamble_url || null,
        Number.isFinite(stockNum) ? stockNum : 0,
        Number.isFinite(plUsd) ? plUsd : 0,
        req.params.id,
      ]
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

// --- Tipo de cambio: Banxico (token opcional) + respaldo ExchangeRate-API (clave en env) ---
let tipoCambioCache = { valor: 17.0, fecha: null, fuente: 'default', banxico: null, exchangerate: null };

function httpsGetJson(url, timeoutMs = 8000) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const req2 = https.get(url, { headers: { Accept: 'application/json' } }, (r) => {
      let body = '';
      r.on('data', d => { body += d; });
      r.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req2.on('error', reject);
    req2.setTimeout(timeoutMs, () => { req2.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchTipoCambioBanxico() {
  const prev = { ...tipoCambioCache };
  const parseBanxicoDato = (data) => {
    const dato = data?.bmx?.series?.[0]?.datos?.[0]?.dato;
    if (dato != null && !isNaN(parseFloat(dato))) return parseFloat(dato);
    return null;
  };
  const tokenPreferido = (process.env.BANXICO_TOKEN || process.env.BANXICO_API_TOKEN || '').trim();
  const tokens = tokenPreferido ? [tokenPreferido, 'none'] : ['none'];

  for (const tok of tokens) {
    try {
      const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/oportuno?token=${encodeURIComponent(tok)}`;
      const data = await httpsGetJson(url);
      const v = parseBanxicoDato(data);
      if (v != null) {
        tipoCambioCache = {
          valor: v,
          fecha: new Date().toISOString().slice(0, 10),
          fuente: 'banxico',
          banxico: v,
          exchangerate: prev.exchangerate,
        };
        return tipoCambioCache;
      }
    } catch (_) { /* siguiente fuente */ }
  }

  const erKey = (process.env.EXCHANGE_RATE_API_KEY || '').trim();
  if (erKey) {
    try {
      const url = `https://v6.exchangerate-api.com/v6/${encodeURIComponent(erKey)}/latest/USD`;
      const data = await httpsGetJson(url);
      const mxn = data?.conversion_rates?.MXN;
      if (mxn != null && !isNaN(parseFloat(mxn))) {
        const v = parseFloat(mxn);
        const fechaUp = data.time_last_update_utc ? String(data.time_last_update_utc).slice(0, 10) : new Date().toISOString().slice(0, 10);
        tipoCambioCache = {
          valor: v,
          fecha: fechaUp,
          fuente: 'exchangerate-api',
          banxico: prev.banxico,
          exchangerate: v,
        };
        return tipoCambioCache;
      }
    } catch (_) { /* mantener cache */ }
  }

  if (prev.valor && prev.valor > 0) {
    tipoCambioCache = { ...prev, fuente: prev.fuente || 'cache' };
    return tipoCambioCache;
  }
  tipoCambioCache = { valor: 17.0, fecha: null, fuente: 'default', banxico: null, exchangerate: null };
  return tipoCambioCache;
}
fetchTipoCambioBanxico();
setInterval(fetchTipoCambioBanxico, 60 * 60 * 1000);

app.get('/api/tipo-cambio', async (req, res) => {
  try {
    const tc = await fetchTipoCambioBanxico();
    res.json(tc);
  } catch (e) {
    res.json(tipoCambioCache);
  }
});

/** Centro de alertas: stock bajo, incidentes por vencer */
app.get('/api/alertas', async (req, res) => {
  try {
    const items = [];
    const refs = await db.getAll(
      `SELECT id, codigo, descripcion, stock, stock_minimo, zona FROM refacciones
       WHERE activo = 1 AND COALESCE(stock_minimo, 0) > 0 AND stock <= stock_minimo
       ORDER BY stock ASC, codigo LIMIT 200`
    );
    for (const r of refs || []) {
      items.push({
        id: `ref-stock-${r.id}`,
        tipo: 'stock_bajo',
        severidad: Number(r.stock) <= 0 ? 'danger' : 'warning',
        titulo: `Stock bajo: ${r.codigo || '—'}`,
        detalle: `Disponible ${r.stock}, mínimo ${r.stock_minimo}${r.zona ? ' · ' + r.zona : ''}`,
        refaccion_id: r.id,
      });
    }
    const incs = await db.getAll(
      `SELECT i.id, i.folio, i.fecha_vencimiento, i.cliente_id, c.nombre as cliente_nombre
       FROM incidentes i JOIN clientes c ON c.id = i.cliente_id
       WHERE i.estatus = 'abierto' AND i.fecha_vencimiento IS NOT NULL AND i.fecha_vencimiento != ''
         AND date(i.fecha_vencimiento) <= date('now','localtime','+7 days')
       ORDER BY i.fecha_vencimiento ASC LIMIT 100`
    );
    for (const inc of incs || []) {
      items.push({
        id: `inc-${inc.id}`,
        tipo: 'incidente_vence',
        severidad: 'warning',
        titulo: `Incidente por vencer: ${inc.folio || '#' + inc.id}`,
        detalle: `${inc.cliente_nombre || ''} · vence ${inc.fecha_vencimiento}`,
        incidente_id: inc.id,
      });
    }
    res.json({ items, generado_en: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

function shouldStripCommissions(req) {
  return auth.AUTH_ENABLED && (!req.authUser || req.authUser.role !== 'admin');
}

// --- Ventas (cotizaciones aprobadas / aplicadas) ---
app.get('/api/ventas', async (req, res) => {
  try {
    const rows = await db.getAll(
      `SELECT co.*, c.nombre as cliente_nombre,
              COALESCE(vp.comision_maquinas_pct, vn.comision_maquinas_pct) as v_comision_maquinas_pct,
              COALESCE(vp.comision_refacciones_pct, vn.comision_refacciones_pct) as v_comision_refacciones_pct,
              COALESCE(vp.puesto, vn.puesto) as vendedor_puesto
       FROM cotizaciones co
       JOIN clientes c ON c.id = co.cliente_id
       LEFT JOIN tecnicos vp ON vp.id = co.vendedor_personal_id
       LEFT JOIN tecnicos vn ON co.vendedor_personal_id IS NULL AND vn.nombre = co.vendedor
       WHERE co.estado IN ('aplicada','venta')
       ORDER BY co.fecha_aprobacion DESC, co.id DESC LIMIT 500`
    );
    const list = Array.isArray(rows) ? rows : [];
    if (!shouldStripCommissions(req)) return res.json(list);
    res.json(
      list.map((r) => {
        const o = { ...r };
        delete o.v_comision_maquinas_pct;
        delete o.v_comision_refacciones_pct;
        return o;
      })
    );
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

/** Valores por defecto alineados con la UI y “Cómo se calculan las tarifas” (editables después). */
const DEFAULT_TARIFAS = {
  mecanico_mxn: '450',
  mecanico_usd: '25',
  mecanico_nota: 'Tarifa estándar taller',
  electronico_mxn: '520',
  electronico_usd: '30',
  electronico_nota: 'PLC, variadores, sensores',
  cnc_mxn: '650',
  cnc_usd: '38',
  cnc_nota: 'Programación y ajuste CNC',
  ayudante_mxn: '280',
  ayudante_usd: '15',
  ayudante_nota: 'Apoyo en campo',
  zona_a_ciudades: 'Monterrey, área metropolitana',
  zona_a_viatico: '800',
  zona_a_hrs: '1',
  zona_a_km: '5',
  zona_b_ciudades: 'Guanajuato, Querétaro, Saltillo',
  zona_b_viatico: '1200',
  zona_b_hrs: '3',
  zona_b_km: '8',
  zona_c_ciudades: 'CDMX, Guadalajara, resto de la República',
  zona_c_viatico: '1800',
  zona_c_hrs: '6',
  zona_c_km: '12',
  comision_ref: '15',
  comision_svc: '15',
  comision_maq_david: '10',
  bono_20k: '1000',
  bono_40k: '2000',
  bono_dia: '500',
};

async function ensureTarifasDefaults() {
  try {
    const rows = await db.getAll('SELECT clave FROM tarifas', []);
    const have = new Set((rows || []).map(r => r.clave));
    for (const [k, v] of Object.entries(DEFAULT_TARIFAS)) {
      if (!have.has(k)) {
        await db.runQuery(
          `INSERT INTO tarifas (clave, valor, actualizado_en) VALUES (?, ?, datetime('now','localtime'))`,
          [k, String(v)]
        );
      }
    }
  } catch (e) {
    console.warn('[tarifas-defaults]', e && e.message);
  }
}

function addDaysIso(isoDate, days) {
  const d = new Date(String(isoDate || '').slice(0, 10) + 'T12:00:00');
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Completa categorías/zonas/precios demo y SLA cuando faltan (idempotente). */
async function backfillCatalogDefaults() {
  try {
    const updates = [
      [`UPDATE refacciones SET categoria = 'Correas y transmisión'
        WHERE (categoria IS NULL OR TRIM(categoria) = '') AND UPPER(codigo) LIKE 'COR%'`],
      [`UPDATE refacciones SET categoria = 'Eléctrico y control'
        WHERE (categoria IS NULL OR TRIM(categoria) = '') AND UPPER(codigo) LIKE 'ELE%'`],
      [`UPDATE refacciones SET categoria = 'Hidráulico'
        WHERE (categoria IS NULL OR TRIM(categoria) = '') AND UPPER(codigo) LIKE 'HID%'`],
      [`UPDATE refacciones SET categoria = 'Mecánico'
        WHERE (categoria IS NULL OR TRIM(categoria) = '') AND UPPER(codigo) LIKE 'MEC%'`],
      [`UPDATE refacciones SET categoria = 'Neumático'
        WHERE (categoria IS NULL OR TRIM(categoria) = '') AND UPPER(codigo) LIKE 'NEU%'`],
      [`UPDATE refacciones SET categoria = 'Refacciones generales'
        WHERE (categoria IS NULL OR TRIM(categoria) = '')`],
      [`UPDATE refacciones SET zona = 'Almacén principal'
        WHERE zona IS NULL OR TRIM(zona) = ''`],
      [`UPDATE refacciones SET precio_usd = ROUND(precio_unitario / 17.0, 2)
        WHERE (precio_usd IS NULL OR precio_usd = 0) AND COALESCE(precio_unitario, 0) > 0`],
      [`UPDATE maquinas SET categoria = 'Torno CNC'
        WHERE (categoria IS NULL OR TRIM(categoria) = '')
          AND (UPPER(COALESCE(modelo,'')) LIKE '%CNC%' OR UPPER(COALESCE(modelo,'')) LIKE '%TORNO%')`],
      [`UPDATE maquinas SET categoria = 'Fresadora CNC'
        WHERE (categoria IS NULL OR TRIM(categoria) = '')
          AND (UPPER(COALESCE(modelo,'')) LIKE '%VCN%' OR UPPER(COALESCE(modelo,'')) LIKE '%FRES%')`],
      [`UPDATE maquinas SET categoria = 'Centro de Maquinado'
        WHERE (categoria IS NULL OR TRIM(categoria) = '')`],
    ];
    for (const [sql] of updates) {
      await db.runQuery(sql);
    }
    const incs = await db.getAll(
      `SELECT id, cliente_id, fecha_reporte FROM incidentes
       WHERE (fecha_vencimiento IS NULL OR TRIM(fecha_vencimiento) = '')
         AND COALESCE(estatus,'') != 'cerrado'`
    );
    for (const inc of incs || []) {
      const base = (inc.fecha_reporte && String(inc.fecha_reporte).slice(0, 10)) || new Date().toISOString().slice(0, 10);
      const venc = addDaysIso(base, 14);
      if (venc) await db.runQuery('UPDATE incidentes SET fecha_vencimiento = ? WHERE id = ?', [venc, inc.id]);
    }
    const sinMaq = await db.getAll(
      `SELECT i.id, i.cliente_id FROM incidentes i
       WHERE i.maquina_id IS NULL AND i.cliente_id IS NOT NULL`
    );
    for (const row of sinMaq || []) {
      const m = await db.getOne(
        'SELECT id FROM maquinas WHERE cliente_id = ? AND COALESCE(activo,1) = 1 ORDER BY id LIMIT 1',
        [row.cliente_id]
      );
      if (m && m.id) {
        await db.runQuery('UPDATE incidentes SET maquina_id = ? WHERE id = ?', [m.id, row.id]);
      }
    }
  } catch (e) {
    console.warn('[backfill-catalog]', e && e.message);
  }
}

// --- Tarifas (clave-valor) ---
const TARIFAS_COMISION_KEYS = ['comision_ref', 'comision_svc', 'comision_maq_david', 'bono_20k', 'bono_40k', 'bono_dia'];

app.get('/api/tarifas', async (req, res) => {
  try {
    const rows = await db.getAll('SELECT clave, valor FROM tarifas', []);
    const obj = { ...DEFAULT_TARIFAS };
    (rows || []).forEach(r => {
      if (r && r.clave != null && r.valor !== undefined && r.valor !== null) obj[r.clave] = r.valor;
    });
    if (shouldStripCommissions(req)) {
      TARIFAS_COMISION_KEYS.forEach((k) => {
        delete obj[k];
      });
    }
    res.json(obj);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put('/api/tarifas', async (req, res) => {
  try {
    const updates = req.body || {};
    for (const [clave, valor] of Object.entries(updates)) {
      if (typeof clave !== 'string' || !clave) continue;
      await db.runQuery(
        `INSERT INTO tarifas (clave, valor, actualizado_en) VALUES (?, ?, datetime('now','localtime'))
         ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor, actualizado_en=excluded.actualizado_en`,
        [clave, String(valor)]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// --- Revisión de Máquinas ---
app.get('/api/revision-maquinas', async (req, res) => {
  try {
    const rows = await db.getAll(
      `SELECT r.*, m.modelo as maquina_modelo, m.categoria as maquina_categoria
       FROM revision_maquinas r LEFT JOIN maquinas m ON m.id = r.maquina_id
       ORDER BY r.id DESC`, []
    );
    res.json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post('/api/revision-maquinas', async (req, res) => {
  try {
    const { maquina_id, categoria, modelo, numero_serie, entregado, prueba, comentarios } = req.body || {};
    await db.runQuery(
      `INSERT INTO revision_maquinas (maquina_id, categoria, modelo, numero_serie, entregado, prueba, comentarios)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [maquina_id || null, categoria || null, modelo || null, numero_serie || null,
       entregado || 'No', prueba || 'En Proceso', comentarios || null]
    );
    const r = await db.getOne('SELECT * FROM revision_maquinas ORDER BY id DESC LIMIT 1');
    res.status(201).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put('/api/revision-maquinas/:id', async (req, res) => {
  try {
    const { maquina_id, categoria, modelo, numero_serie, entregado, prueba, comentarios } = req.body || {};
    await db.runQuery(
      `UPDATE revision_maquinas SET maquina_id=?, categoria=?, modelo=?, numero_serie=?, entregado=?, prueba=?, comentarios=? WHERE id=?`,
      [maquina_id || null, categoria || null, modelo || null, numero_serie || null,
       entregado || 'No', prueba || 'En Proceso', comentarios || null, req.params.id]
    );
    const r = await db.getOne('SELECT * FROM revision_maquinas WHERE id=?', [req.params.id]);
    res.json(r || {});
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.delete('/api/revision-maquinas/:id', async (req, res) => {
  try {
    await db.runQuery('DELETE FROM revision_maquinas WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// --- Cotizaciones ---
app.get('/api/cotizaciones', async (req, res) => {
  try {
    const rows = await db.getAll(
      `SELECT co.*, c.nombre as cliente_nombre, vp.puesto as vendedor_puesto
       FROM cotizaciones co
       JOIN clientes c ON c.id = co.cliente_id
       LEFT JOIN tecnicos vp ON vp.id = co.vendedor_personal_id
       ORDER BY co.fecha DESC, co.id DESC LIMIT 500`
    );
    res.json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/cotizaciones/:id', async (req, res) => {
  try {
    const row = await db.getOne(
      `SELECT co.*, c.nombre as cliente_nombre, vp.puesto as vendedor_puesto, vp.nombre as vendedor_catalogo_nombre
       FROM cotizaciones co
       JOIN clientes c ON c.id = co.cliente_id
       LEFT JOIN tecnicos vp ON vp.id = co.vendedor_personal_id
       WHERE co.id = ?`,
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

async function precioUnitarioDesdeLista(cot, tipo, refaccionId, maquinaId, precioUnitario) {
  let pu = Number(precioUnitario);
  if (pu > 0) return pu;
  const mon = (cot.moneda || 'MXN').toUpperCase();
  const tc = Number(cot.tipo_cambio) || 17;
  if (tipo === 'refaccion' && refaccionId) {
    const ref = await db.getOne('SELECT precio_usd, precio_unitario FROM refacciones WHERE id=?', [refaccionId]);
    if (!ref) return 0;
    const usd = Number(ref.precio_usd) || 0;
    if (usd > 0) return mon === 'USD' ? usd : Math.round(usd * tc * 100) / 100;
    return Number(ref.precio_unitario) || 0;
  }
  if (tipo === 'equipo' && maquinaId) {
    const m = await db.getOne('SELECT precio_lista_usd FROM maquinas WHERE id=?', [maquinaId]);
    const usd = m ? Number(m.precio_lista_usd) || 0 : 0;
    if (usd > 0) return mon === 'USD' ? usd : Math.round(usd * tc * 100) / 100;
  }
  return 0;
}

async function recalcCotizacionTotals(cotizacionId) {
  const cot = await db.getOne('SELECT * FROM cotizaciones WHERE id = ?', [cotizacionId]);
  if (!cot) return null;
  const lineas = await db.getAll('SELECT * FROM cotizacion_lineas WHERE cotizacion_id = ?', [cotizacionId]);
  const subtotalBruto = (lineas || []).reduce((s, l) => s + (Number(l.subtotal) || 0), 0);
  const d = Math.min(100, Math.max(0, Number(cot.descuento_pct) || 0));
  const factor = 1 - d / 100;
  const subtotal = Math.round(subtotalBruto * factor * 100) / 100;
  const iva = Math.round(subtotal * 0.16 * 100) / 100;
  const total = Math.round((subtotal + iva) * 100) / 100;
  await db.runQuery('UPDATE cotizaciones SET subtotal=?, iva=?, total=? WHERE id=?', [subtotal, iva, total, cotizacionId]);
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
      es_ida,
      horas_trabajo,
      horas_traslado,
      zona,
      ayudantes,
      tarifa_aplicada,
    } = req.body || {};
    const tipo = String(tipo_linea || '').trim() || 'otro';
    if (!['refaccion', 'vuelta', 'mano_obra', 'otro', 'equipo'].includes(tipo)) {
      return res.status(400).json({ error: 'tipo_linea inválido' });
    }
    if (tipo === 'refaccion' && !refaccion_id) return res.status(400).json({ error: 'refaccion_id requerido' });
    if (tipo === 'equipo' && !maquina_id) return res.status(400).json({ error: 'maquina_id requerido para línea equipo' });
    if (tipo === 'mano_obra' && bitacora_id) {
      const bit = await db.getOne('SELECT * FROM bitacoras WHERE id = ? AND cotizacion_id = ?', [bitacora_id, req.params.id]);
      if (!bit) return res.status(400).json({ error: 'bitacora_id inválido para esta cotización' });
    }
    let descFinal = descripcion || null;
    if (tipo === 'equipo' && maquina_id && !String(descFinal || '').trim()) {
      const mq = await db.getOne('SELECT nombre, modelo, marca FROM maquinas WHERE id=?', [maquina_id]);
      if (mq) {
        descFinal = [mq.marca, mq.modelo || mq.nombre].filter(Boolean).join(' ') || mq.nombre || 'Equipo';
      }
    }
    const puLista = await precioUnitarioDesdeLista(cot, tipo, refaccion_id, maquina_id, precio_unitario);
    const calc = calcLinea(tipo, cantidad, puLista, cot.moneda, cot.tipo_cambio);
    await db.runQuery(
      `INSERT INTO cotizacion_lineas (cotizacion_id, refaccion_id, maquina_id, bitacora_id, tipo_linea, descripcion, cantidad, precio_unitario, precio_usd, subtotal, iva, total, orden, es_ida, horas_trabajo, horas_traslado, zona, ayudantes, tarifa_aplicada)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(req.params.id),
        refaccion_id || null,
        maquina_id || null,
        bitacora_id || null,
        calc.tipo_linea,
        descFinal,
        calc.cantidad,
        calc.precio_unitario,
        calc.precio_usd,
        calc.subtotal,
        calc.iva,
        calc.total,
        Number.isFinite(Number(orden)) ? Number(orden) : 0,
        es_ida ? 1 : 0,
        Number(horas_trabajo) || 0,
        Number(horas_traslado) || 0,
        zona || null,
        Number(ayudantes) || 0,
        tarifa_aplicada || null,
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
    if (!['refaccion', 'vuelta', 'mano_obra', 'otro', 'equipo'].includes(nextTipo)) {
      return res.status(400).json({ error: 'tipo_linea inválido' });
    }
    const nextRefaccionId = (req.body && 'refaccion_id' in req.body) ? req.body.refaccion_id : linea.refaccion_id;
    const nextMaquinaId = (req.body && 'maquina_id' in req.body) ? req.body.maquina_id : linea.maquina_id;
    if (nextTipo === 'refaccion' && !nextRefaccionId) return res.status(400).json({ error: 'refaccion_id requerido' });
    if (nextTipo === 'equipo' && !nextMaquinaId) return res.status(400).json({ error: 'maquina_id requerido para línea equipo' });
    const nextBitacoraId = (req.body && 'bitacora_id' in req.body) ? req.body.bitacora_id : linea.bitacora_id;
    if (nextTipo === 'mano_obra' && nextBitacoraId) {
      const bit = await db.getOne('SELECT * FROM bitacoras WHERE id = ? AND cotizacion_id = ?', [nextBitacoraId, req.params.id]);
      if (!bit) return res.status(400).json({ error: 'bitacora_id inválido para esta cotización' });
    }
    const nextCantidad = (req.body && 'cantidad' in req.body) ? req.body.cantidad : linea.cantidad;
    const nextPrecioRaw = (req.body && 'precio_unitario' in req.body) ? req.body.precio_unitario : linea.precio_unitario;
    const nextPrecio = await precioUnitarioDesdeLista(cot, nextTipo, nextRefaccionId, nextMaquinaId, nextPrecioRaw);
    const calc = calcLinea(nextTipo, nextCantidad, nextPrecio, cot.moneda, cot.tipo_cambio);

    // Extraer nuevos campos si se envían
    const esIda = (req.body && 'es_ida' in req.body) ? (req.body.es_ida ? 1 : 0) : (linea.es_ida || 0);
    const horasTrabajo = (req.body && 'horas_trabajo' in req.body) ? Number(req.body.horas_trabajo) : (linea.horas_trabajo || 0);
    const horasTraslado = (req.body && 'horas_traslado' in req.body) ? Number(req.body.horas_traslado) : (linea.horas_traslado || 0);
    const zona = (req.body && 'zona' in req.body) ? req.body.zona : (linea.zona || null);
    const ayudantes = (req.body && 'ayudantes' in req.body) ? Number(req.body.ayudantes) : (linea.ayudantes || 0);
    const tarifaAplicada = (req.body && 'tarifa_aplicada' in req.body) ? req.body.tarifa_aplicada : (linea.tarifa_aplicada || null);

    await db.runQuery(
      `UPDATE cotizacion_lineas
       SET refaccion_id=?, maquina_id=?, bitacora_id=?, tipo_linea=?, descripcion=?, cantidad=?, precio_unitario=?, precio_usd=?, subtotal=?, iva=?, total=?, orden=?, es_ida=?, horas_trabajo=?, horas_traslado=?, zona=?, ayudantes=?, tarifa_aplicada=?
       WHERE id=? AND cotizacion_id=?`,
      [
        nextRefaccionId || null,
        nextMaquinaId || null,
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
        esIda,
        horasTrabajo,
        horasTraslado,
        zona,
        ayudantes,
        tarifaAplicada,
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
    const {
      cliente_id,
      tipo,
      fecha,
      subtotal,
      iva,
      total,
      folio,
      tipo_cambio,
      moneda,
      maquinas_ids,
      estado,
      notas,
      vendedor_personal_id,
      descuento_pct,
      vendedor,
    } = req.body || {};
    if (!cliente_id) return res.status(400).json({ error: 'cliente_id requerido' });
    const prefijoFolio = tipo === 'mano_obra' ? 'COT-MO' : tipo === 'maquina' ? 'COT-MAQ' : 'COT-REF';
    const f = folio || generarFolio(prefijoFolio);
    const st = Number(subtotal) || 0;
    const iv = Number(iva) || 0;
    const tot = Number(total) != null ? Number(total) : st + iv;
    const tc = Number(tipo_cambio) || 17.0;
    const mon = moneda || 'MXN';
    const maqIds = typeof maquinas_ids === 'string' ? maquinas_ids : JSON.stringify(maquinas_ids || []);
    const dct = Math.min(100, Math.max(0, Number(descuento_pct) || 0));
    const vid = vendedor_personal_id != null && String(vendedor_personal_id).trim() !== '' ? Number(vendedor_personal_id) : null;
    await db.runQuery(
      `INSERT INTO cotizaciones (folio, cliente_id, tipo, fecha, subtotal, iva, total, tipo_cambio, moneda, maquinas_ids, estado, notas, vendedor_personal_id, descuento_pct, vendedor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        f,
        cliente_id,
        tipo || 'refacciones',
        fecha || new Date().toISOString().slice(0, 10),
        st,
        iv,
        tot,
        tc,
        mon,
        maqIds,
        estado || 'borrador',
        notas || null,
        Number.isFinite(vid) && vid > 0 ? vid : null,
        dct,
        vendedor ? String(vendedor).trim() : null,
      ]
    );
    const r = await db.getOne(
      `SELECT co.*, c.nombre as cliente_nombre, vp.puesto as vendedor_puesto
       FROM cotizaciones co JOIN clientes c ON c.id = co.cliente_id
       LEFT JOIN tecnicos vp ON vp.id = co.vendedor_personal_id
       ORDER BY co.id DESC LIMIT 1`
    );
    res.status(201).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.put('/api/cotizaciones/:id', async (req, res) => {
  try {
    const existing = await db.getOne('SELECT * FROM cotizaciones WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'No encontrada' });
    const { folio, cliente_id, tipo, fecha, tipo_cambio, moneda, maquinas_ids, estado, notas, vendedor_personal_id, descuento_pct, vendedor } = req.body || {};
    const hasBody = req.body && typeof req.body === 'object';
    const hasMaqIds = hasBody && Object.prototype.hasOwnProperty.call(req.body, 'maquinas_ids');
    const hasNotas = hasBody && Object.prototype.hasOwnProperty.call(req.body, 'notas');
    const hasEstado = hasBody && Object.prototype.hasOwnProperty.call(req.body, 'estado');
    const hasVendedorId = hasBody && Object.prototype.hasOwnProperty.call(req.body, 'vendedor_personal_id');
    const hasDescuento = hasBody && Object.prototype.hasOwnProperty.call(req.body, 'descuento_pct');
    const hasVendedorNombre = hasBody && Object.prototype.hasOwnProperty.call(req.body, 'vendedor');
    const maqIds = hasMaqIds
      ? (typeof maquinas_ids === 'string' ? maquinas_ids : JSON.stringify(maquinas_ids || []))
      : (existing.maquinas_ids || '[]');
    // No pisar fecha con NULL si el cliente no envía el campo (JSON.stringify omite undefined) o el input falló.
    let fechaSql = existing.fecha || null;
    if (fecha != null && String(fecha).trim() !== '') {
      fechaSql = String(fecha).trim().slice(0, 10);
    } else if (!fechaSql) {
      fechaSql = new Date().toISOString().slice(0, 10);
    }
    const vidPut = hasVendedorId
      ? (vendedor_personal_id != null && String(vendedor_personal_id).trim() !== '' ? Number(vendedor_personal_id) : null)
      : (existing.vendedor_personal_id != null ? existing.vendedor_personal_id : null);
    const dctPut = hasDescuento
      ? Math.min(100, Math.max(0, Number(descuento_pct) || 0))
      : (Number(existing.descuento_pct) || 0);
    const vendPut = hasVendedorNombre
      ? (vendedor != null && String(vendedor).trim() !== '' ? String(vendedor).trim() : null)
      : existing.vendedor;
    await db.runQuery(
      `UPDATE cotizaciones
       SET folio=?, cliente_id=?, tipo=?, fecha=?, tipo_cambio=?, moneda=?, maquinas_ids=?, estado=?, notas=?,
           vendedor_personal_id=?, descuento_pct=?, vendedor=?
       WHERE id=?`,
      [
        (folio != null && String(folio).trim() !== '') ? String(folio).trim() : (existing.folio || null),
        (cliente_id != null && Number(cliente_id) > 0) ? Number(cliente_id) : (existing.cliente_id || null),
        (tipo != null && String(tipo).trim() !== '') ? String(tipo).trim() : (existing.tipo || 'refacciones'),
        fechaSql,
        (tipo_cambio != null && String(tipo_cambio).trim() !== '') ? (Number(tipo_cambio) || 17.0) : (Number(existing.tipo_cambio) || 17.0),
        (moneda != null && String(moneda).trim() !== '') ? String(moneda).trim().toUpperCase() : (existing.moneda || 'MXN'),
        maqIds,
        hasEstado ? ((estado != null && String(estado).trim() !== '') ? String(estado).trim() : 'borrador') : (existing.estado || 'borrador'),
        hasNotas ? (notas || null) : (existing.notas || null),
        Number.isFinite(vidPut) && vidPut > 0 ? vidPut : null,
        dctPut,
        vendPut || null,
        req.params.id,
      ]
    );
    // Totales siempre se calculan desde líneas (evita que un PUT del header los pise a 0).
    await recalcCotizacionTotals(req.params.id);
    const r = await db.getOne(
      `SELECT co.*, c.nombre as cliente_nombre, vp.puesto as vendedor_puesto
       FROM cotizaciones co JOIN clientes c ON c.id = co.cliente_id
       LEFT JOIN tecnicos vp ON vp.id = co.vendedor_personal_id
       WHERE co.id = ?`,
      [req.params.id]
    );
    res.json(r || {});
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Aplicar cotización: validar stock total por refacción y solo entonces descontar
app.post('/api/cotizaciones/:id/aplicar', async (req, res) => {
  try {
    const cot = await db.getOne('SELECT * FROM cotizaciones WHERE id = ?', [req.params.id]);
    if (!cot) return res.status(404).json({ error: 'No encontrada' });
    if (cot.estado === 'aplicada' || cot.estado === 'venta') {
      return res.status(400).json({ error: 'Cotización ya aplicada o registrada como venta' });
    }
    const lineas = await db.getAll('SELECT * FROM cotizacion_lineas WHERE cotizacion_id = ? ORDER BY orden, id', [req.params.id]);
    const demandByRef = new Map();
    for (const l of lineas) {
      if (!l.refaccion_id || String(l.tipo_linea || 'refaccion') !== 'refaccion') continue;
      const cant = Number(l.cantidad) || 0;
      if (cant <= 0) continue;
      const idR = Number(l.refaccion_id);
      demandByRef.set(idR, (demandByRef.get(idR) || 0) + cant);
    }
    const errores = [];
    for (const [refId, need] of demandByRef) {
      const ref = await db.getOne('SELECT * FROM refacciones WHERE id = ?', [refId]);
      if (!ref) {
        errores.push(`Refacción id ${refId} no encontrada en catálogo`);
        continue;
      }
      if (Number(ref.stock) < need) {
        errores.push(`Sin stock suficiente: ${ref.codigo} (disponible: ${ref.stock}, requerido: ${need})`);
      }
    }
    if (errores.length) {
      return res.status(400).json({ error: 'No se puede aplicar la cotización por inventario.', errores });
    }

    for (const l of lineas) {
      if (!l.refaccion_id || String(l.tipo_linea || 'refaccion') !== 'refaccion') continue;
      const cant = Number(l.cantidad) || 0;
      if (cant <= 0) continue;
      const ref = await db.getOne('SELECT * FROM refacciones WHERE id = ?', [l.refaccion_id]);
      if (!ref) continue;
      const nuevoStock = Number(ref.stock) - cant;
      await db.runQuery('UPDATE refacciones SET stock=? WHERE id=?', [nuevoStock, ref.id]);
      await db.runQuery(
        `INSERT INTO movimientos_stock (refaccion_id, tipo, cantidad, costo_unitario, cotizacion_id, referencia, fecha)
         VALUES (?, 'salida', ?, ?, ?, ?, date('now','localtime'))`,
        [ref.id, cant, Number(l.precio_unitario) || 0, cot.id, `Cot: ${cot.folio}`]
      );
    }
    let vendedorNombre = req.body && req.body.vendedor ? String(req.body.vendedor).trim() : null;
    if (!vendedorNombre && cot.vendedor_personal_id) {
      const p = await db.getOne('SELECT nombre FROM tecnicos WHERE id=?', [cot.vendedor_personal_id]);
      if (p && p.nombre) vendedorNombre = p.nombre;
    }
    if (!vendedorNombre && cot.vendedor) vendedorNombre = String(cot.vendedor).trim();
    await db.runQuery(
      `UPDATE cotizaciones SET estado='aplicada', fecha_aprobacion=date('now','localtime'), vendedor=? WHERE id=?`,
      [vendedorNombre || null, req.params.id]
    );

    try {
      const cliente = await db.getOne('SELECT * FROM clientes WHERE id=?', [cot.cliente_id]);
      const cotUp = await db.getOne('SELECT * FROM cotizaciones WHERE id=?', [req.params.id]);
      await enviarCorreoAprobacion(cotUp || cot, cliente);
    } catch (_) { /* correo opcional */ }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Catálogos (rol, puesto, departamento, cotizacion_tipo, etc.)
app.get('/api/catalogos', async (req, res) => {
  try {
    const clave = String(req.query.clave || '').trim();
    if (clave && clave !== 'all') {
      const rows = await db.getAll(
        `SELECT id, clave, valor, orden FROM catalogos WHERE activo=1 AND clave=? ORDER BY orden ASC, valor ASC`,
        [clave]
      );
      return res.json(rows);
    }
    const rows = await db.getAll(
      `SELECT id, clave, valor, orden FROM catalogos WHERE activo=1 ORDER BY clave ASC, orden ASC, valor ASC`
    );
    const grouped = {};
    for (const r of rows) {
      if (!grouped[r.clave]) grouped[r.clave] = [];
      grouped[r.clave].push(r);
    }
    res.json(grouped);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post('/api/catalogos', async (req, res) => {
  try {
    const { clave, valor } = req.body || {};
    const c = String(clave || '').trim();
    const v = String(valor || '').trim();
    if (!c || !v) return res.status(400).json({ error: 'clave y valor requeridos' });
    await db.runQuery('INSERT OR IGNORE INTO catalogos (clave, valor) VALUES (?, ?)', [c, v]);
    await db.runQuery('UPDATE catalogos SET activo=1 WHERE clave=? AND valor=?', [c, v]);
    const row = await db.getOne(
      `SELECT id, clave, valor, orden FROM catalogos WHERE clave=? AND valor=? AND activo=1`,
      [c, v]
    );
    if (!row) return res.status(500).json({ error: 'No se pudo leer el catálogo' });
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.delete('/api/catalogos/:id', async (req, res) => {
  try {
    await db.runQuery('UPDATE catalogos SET activo=0 WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Tecnicos
app.get('/api/tecnicos', async (req, res) => {
  try {
    const rows = await db.getAll('SELECT * FROM tecnicos WHERE activo=1 ORDER BY nombre');
    // Enrich with ocupado status: técnico tiene reporte abierto o en_proceso
    const reportesActivos = await db.getAll("SELECT tecnico FROM reportes WHERE estatus IN ('abierto','en_proceso') AND tecnico IS NOT NULL AND tecnico != ''");
    const ocupados = new Set(reportesActivos.map(r => r.tecnico));
    const strip = shouldStripCommissions(req);
    const enriched = rows.map(t => {
      const base = { ...t, ocupado: ocupados.has(t.nombre) ? 1 : 0 };
      if (strip) {
        delete base.comision_maquinas_pct;
        delete base.comision_refacciones_pct;
      }
      return base;
    });
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});
app.post('/api/tecnicos', async (req, res) => {
  try {
    const {
      nombre,
      habilidades,
      ocupado,
      disponible_desde,
      rol,
      puesto,
      departamento,
      profesion,
      es_vendedor,
      comision_maquinas_pct,
      comision_refacciones_pct,
    } = req.body || {};
    if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
    const isAdmin = auth.AUTH_ENABLED && req.authUser && req.authUser.role === 'admin';
    let cMaq = Number(comision_maquinas_pct) || 0;
    let cRef = Number(comision_refacciones_pct) || 0;
    if (!isAdmin) {
      cMaq = 0;
      cRef = 10;
    }
    await db.runQuery(
      `INSERT OR IGNORE INTO tecnicos (nombre, habilidades, ocupado, disponible_desde, rol, puesto, departamento, profesion, es_vendedor, comision_maquinas_pct, comision_refacciones_pct)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nombre,
        habilidades || null,
        ocupado ? 1 : 0,
        disponible_desde || null,
        rol || null,
        puesto || null,
        departamento || null,
        profesion || null,
        es_vendedor ? 1 : 0,
        cMaq,
        cRef,
      ]
    );
    await db.runQuery(
      `UPDATE tecnicos SET habilidades=?, ocupado=?, disponible_desde=?, rol=?, puesto=?, departamento=?, profesion=?, es_vendedor=?, comision_maquinas_pct=?, comision_refacciones_pct=? WHERE nombre=?`,
      [
        habilidades || null,
        ocupado ? 1 : 0,
        disponible_desde || null,
        rol || null,
        puesto || null,
        departamento || null,
        profesion || null,
        es_vendedor ? 1 : 0,
        cMaq,
        cRef,
        nombre,
      ]
    );
    const r = await db.getOne('SELECT * FROM tecnicos WHERE nombre=?', [nombre]);
    res.status(201).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});
app.put('/api/tecnicos/:id', async (req, res) => {
  try {
    const {
      nombre,
      habilidades,
      activo,
      ocupado,
      disponible_desde,
      rol,
      puesto,
      departamento,
      profesion,
      es_vendedor,
      comision_maquinas_pct,
      comision_refacciones_pct,
    } = req.body || {};
    if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
    await db.runQuery(
      `UPDATE tecnicos SET nombre=?, habilidades=?, activo=?, ocupado=?, disponible_desde=?,
       rol=?, puesto=?, departamento=?, profesion=?, es_vendedor=?, comision_maquinas_pct=?, comision_refacciones_pct=?
       WHERE id=?`,
      [
        nombre,
        habilidades || null,
        activo !== undefined ? activo : 1,
        ocupado ? 1 : 0,
        disponible_desde || null,
        rol || null,
        puesto || null,
        departamento || null,
        profesion || null,
        es_vendedor ? 1 : 0,
        Number(comision_maquinas_pct) || 0,
        Number(comision_refacciones_pct) || 0,
        req.params.id,
      ]
    );
    const r = await db.getOne('SELECT * FROM tecnicos WHERE id=?', [req.params.id]);
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});
app.delete('/api/tecnicos/:id', async (req, res) => {
  try {
    await db.runQuery('UPDATE tecnicos SET activo=0 WHERE id=?', [req.params.id]);
    res.json({ ok: true });
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
      `SELECT b.*, i.folio as incidente_folio, co.folio as cotizacion_folio, rep.folio as reporte_folio
       FROM bitacoras b
       LEFT JOIN incidentes i ON i.id = b.incidente_id
       LEFT JOIN cotizaciones co ON co.id = b.cotizacion_id
       LEFT JOIN reportes rep ON rep.id = b.reporte_id
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
      `SELECT b.*, i.folio as incidente_folio, co.folio as cotizacion_folio, rep.folio as reporte_folio FROM bitacoras b
       LEFT JOIN incidentes i ON i.id = b.incidente_id LEFT JOIN cotizaciones co ON co.id = b.cotizacion_id
       LEFT JOIN reportes rep ON rep.id = b.reporte_id WHERE b.id = ?`,
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

/** Evita SQLITE_CONSTRAINT UNIQUE al repetir seed (mismo folio base). */
async function folioUnicoEnTabla(tabla, base) {
  let f = String(base);
  for (let n = 0; n < 9999; n++) {
    const ex = await db.getOne(`SELECT id FROM ${tabla} WHERE folio = ? LIMIT 1`, [f]);
    if (!ex) return f;
    f = `${base}-x${n + 1}`;
  }
  return `${base}-${Date.now()}`;
}

const SEED_CAL_NOTA = 'seed_demo_cal';
const SEED_SIN_SERIE = 'SN-SINCOV-';
const SEED_BONO_NOTA = 'seed_demo_bono';

/**
 * Personal (20), calendario de mantenimientos (30 fechas en el mes actual), garantías sin cobertura (30), bonos (30).
 * Idempotente: solo rellena hasta los objetivos si faltan filas marcadas.
 */
async function runSeedDemoEnrichment() {
  const out = {
    tecnicos_demo: 0,
    mantenimientos_calendario: 0,
    garantias_sin_cobertura: 0,
    bonos_demo: 0,
    prospectos_demo: 0,
    mantenimientos_correctivos: 0,
  };

  const personalDemo = [
    { nombre: 'David Cantu', rol: 'Coordinación', puesto: 'Jefe de área', departamento: 'Servicio técnico', habilidades: 'Planeación de cuadrillas, ISO 9001, KPIs de campo', es_vendedor: 0 },
    { nombre: 'María Elena Vázquez', rol: 'Técnico senior', puesto: 'Especialista CNC', departamento: 'Servicio', habilidades: 'Fanuc, Siemens, calibración', es_vendedor: 0 },
    { nombre: 'Carlos Mendoza Ruiz', rol: 'Técnico', puesto: 'Campo eléctrico', departamento: 'Servicio', habilidades: 'Variadores, PLC básico', es_vendedor: 0 },
    { nombre: 'Ana López Herrera', rol: 'Técnico', puesto: 'Hidráulica industrial', departamento: 'Servicio', habilidades: 'Bombas, válvulas proporcionales', es_vendedor: 0 },
    { nombre: 'Luis Fernando Ortiz', rol: 'Supervisor', puesto: 'Supervisor de zona Norte', departamento: 'Servicio', habilidades: 'Gestión de incidentes, seguridad', es_vendedor: 0 },
    { nombre: 'Patricia Ruiz Soto', rol: 'Ingeniería', puesto: 'Soporte técnico aplicaciones', departamento: 'Ingeniería', habilidades: 'Robótica, visión artificial', es_vendedor: 0 },
    { nombre: 'Jorge Alberto Núñez', rol: 'Técnico', puesto: 'Neumática y vacío', departamento: 'Servicio', habilidades: 'Cilindros, vacío, fugas', es_vendedor: 0 },
    { nombre: 'Rosa María Fuentes', rol: 'Administración', puesto: 'Coordinadora de refacciones', departamento: 'Logística', habilidades: 'Inventario, compras urgentes', es_vendedor: 0 },
    { nombre: 'Miguel Ángel Torres', rol: 'Ventas', puesto: 'Ejecutivo de cuenta', departamento: 'Ventas', habilidades: 'Cotización máquinas, negociación', es_vendedor: 1 },
    { nombre: 'Laura Daniela Campos', rol: 'Ventas', puesto: 'Ejecutiva refacciones', departamento: 'Ventas', habilidades: 'Catálogo OEM, seguimiento', es_vendedor: 1 },
    { nombre: 'Fernando Castillo', rol: 'Técnico', puesto: 'Soldadura y metrología', departamento: 'Servicio', habilidades: 'ARCO, MIG, brazos', es_vendedor: 0 },
    { nombre: 'Gabriela Morales', rol: 'Calidad', puesto: 'Auditora de servicio', departamento: 'Calidad', habilidades: 'Checklists, reportes cliente', es_vendedor: 0 },
    { nombre: 'Héctor Javier Salinas', rol: 'Técnico', puesto: 'Compresores y aire', departamento: 'Servicio', habilidades: 'Tornillos, pistones, SEC', es_vendedor: 0 },
    { nombre: 'Daniela Espínola', rol: 'Ingeniería', puesto: 'Puesta en marcha', departamento: 'Ingeniería', habilidades: 'Arranque, capacitación operadores', es_vendedor: 0 },
    { nombre: 'Ricardo Sámano', rol: 'Logística', puesto: 'Coordinador de traslados', departamento: 'Logística', habilidades: 'Rutas, permisos', es_vendedor: 0 },
    { nombre: 'Verónica Pineda', rol: 'Administración', puesto: 'Facturación y garantías', departamento: 'Administración', habilidades: 'Garantías, cobranza', es_vendedor: 0 },
    { nombre: 'Oscar Iván Delgado', rol: 'Técnico', puesto: 'Láser y corte', departamento: 'Servicio', habilidades: 'Óptica, alineación', es_vendedor: 0 },
    { nombre: 'Natalia Bermejo', rol: 'Capacitación', puesto: 'Instructora interna', departamento: 'RH', habilidades: 'Inducción, seguridad industrial', es_vendedor: 0 },
    { nombre: 'Arturo Villarreal', rol: 'Técnico', puesto: 'Instrumentación', departamento: 'Servicio', habilidades: 'Sensores, 4–20 mA', es_vendedor: 0 },
    { nombre: 'Silvia Rentería', rol: 'Soporte', puesto: 'Mesa de ayuda', departamento: 'Soporte', habilidades: 'Tickets, diagnóstico remoto', es_vendedor: 0 },
  ];

  for (const p of personalDemo) {
    await db.runQuery('INSERT OR IGNORE INTO tecnicos (nombre, activo) VALUES (?, 1)', [p.nombre]);
    await db.runQuery(
      `UPDATE tecnicos SET rol=?, puesto=?, departamento=?, habilidades=?, es_vendedor=? WHERE nombre=?`,
      [p.rol, p.puesto, p.departamento, p.habilidades, p.es_vendedor ? 1 : 0, p.nombre]
    );
    out.tecnicos_demo++;
  }

  const garActivas = await db.getAll('SELECT id FROM garantias WHERE activa = 1 ORDER BY id');
  const garIds = (garActivas || []).map((r) => r.id);
  const calRow = await db.getOne(
    `SELECT COUNT(*) as n FROM mantenimientos_garantia WHERE COALESCE(notas,'') LIKE ?`,
    [`${SEED_CAL_NOTA}%`]
  );
  const nCal = Number(calRow && calRow.n) || 0;
  const targetCal = 30;
  const toAddCal = Math.max(0, targetCal - nCal);

  if (garIds.length > 0 && toAddCal > 0) {
    const now = new Date();
    const y = now.getFullYear();
    const mo = now.getMonth();
    const dim = new Date(y, mo + 1, 0).getDate();
    const temas = [
      'Preventivo lubricación', 'Revisión eléctrica', 'Calibración ejes', 'Cambio de sellos',
      'Ajuste de presiones', 'Inspección de bandas', 'Limpieza de intercooler', 'Diagnóstico vibración',
      'Actualización parámetros', 'Cambio de filtros', 'Nivelación de bancada', 'Prueba de carga',
      'Revisión neumática', 'Torque de pernos', 'Control de alineación', 'Verificación CE',
      'Puesta a tierra', 'Lubricación centralizada', 'Cambio de aceite hidráulico', 'Purga de condensados',
      'Inspección de rodamientos', 'Chequeo de sensores', 'Revisión de software', 'Backup de programa',
      'Limpieza de chiller', 'Calibración láser', 'Test de emergencia', 'Inspección de mangueras',
      'Medición de desgaste', 'Informe fotográfico', 'Checklist final cliente',
    ];
    for (let k = 0; k < toAddCal; k++) {
      const day = 1 + Math.min(dim - 1, Math.floor((k * Math.max(1, dim - 1)) / Math.max(1, targetCal - 1)));
      const fechaStr = `${y}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const gid = garIds[k % garIds.length];
      const num = 80 + nCal + k;
      const anio = y;
      const nota = `${SEED_CAL_NOTA}:${temas[k % temas.length]}`;
      await db.runQuery(
        `INSERT INTO mantenimientos_garantia (garantia_id, numero, anio, fecha_programada, confirmado, pagado, notas)
         VALUES (?, ?, ?, ?, 0, 0, ?)`,
        [gid, num, anio, fechaStr, nota]
      );
      out.mantenimientos_calendario++;
    }
  }

  const sinRow = await db.getOne(
    `SELECT COUNT(*) as n FROM garantias WHERE COALESCE(numero_serie,'') LIKE ?`,
    [`${SEED_SIN_SERIE}%`]
  );
  const nSin = Number(sinRow && sinRow.n) || 0;
  const toAddSin = Math.max(0, 30 - nSin);
  const clientesDb = await db.getAll('SELECT id, nombre FROM clientes ORDER BY id LIMIT 50');
  const modelosSin = [
    'Torno CNC TX-400', 'Prensa H-320', 'Robot palletizer RP-9', 'Compresor GA-55', 'Láser fiber FL-3015',
    'Centro mecanizado VM-1100', 'Rectificadora RG-200', 'Dobladora hidráulica BH-250', 'Extrusora EX-88',
    'Enfriador industrial EC-40', 'Elevador de carga EC-2T', 'Mezcladora MX-500', 'Granalladora GR-120',
    'Sierra cinta SB-450', 'Taladro radial RD-160', 'Pulidora PL-90', 'Cepillo CP-300', 'Mortajadora MJ-18',
    'Limadora LM-220', 'Fresadora universal FU-410', 'Troqueladora TD-600', 'Inyectora IN-250', 'Sopladora SB-80',
    'Estación soldadura SW-4', 'Automata lineal AL-12', 'Transportador TR-24', 'Célula robot CR-7',
    'Prensa briqueteadora PB-30', 'Desbobinador DB-15', 'Enderezadora EN-400',
  ];
  const tiposSin = ['Industrial', 'CNC', 'Hidráulica', 'Eléctrica', 'Neumática'];
  for (let i = 0; i < toAddSin && clientesDb.length > 0; i++) {
    const cli = clientesDb[i % clientesDb.length];
    const diasAtras = 400 + i * 19;
    const fEnt = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await db.runQuery(
      `INSERT INTO garantias (cliente_id, razon_social, modelo_maquina, numero_serie, tipo_maquina, fecha_entrega, activa)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [
        cli.id,
        cli.nombre,
        modelosSin[i % modelosSin.length],
        `${SEED_SIN_SERIE}${String(3000 + i)}`,
        tiposSin[i % tiposSin.length],
        fEnt,
      ]
    );
    out.garantias_sin_cobertura++;
  }

  const bRow = await db.getOne(`SELECT COUNT(*) as n FROM bonos WHERE COALESCE(notas,'') LIKE ?`, [`${SEED_BONO_NOTA}%`]);
  const nBon = Number(bRow && bRow.n) || 0;
  const toAddBon = Math.max(0, 30 - nBon);
  const repRows = await db.getAll('SELECT id, folio FROM reportes ORDER BY id DESC LIMIT 40');
  const tiposCap = [
    'Operación básica', 'Mantenimiento preventivo', 'Programación CNC', 'Seguridad industrial',
    'Actualización firmware', 'Soldadura avanzada', 'Neumática aplicada', 'Visión artificial',
    'Arranque de línea', 'Lean manufacturing', 'Scrum en planta', 'Comunicación técnica',
  ];
  const tecNames = personalDemo.map((p) => p.nombre);
  for (let i = 0; i < toAddBon; i++) {
    const rep = repRows[i % repRows.length];
    const repId = rep && rep.id ? rep.id : null;
    const tecnico = tecNames[i % tecNames.length];
    const monto = 450 + (i % 12) * 175;
    const diasB = i % 11;
    const fechaB = new Date(Date.now() - diasB * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const nota = `${SEED_BONO_NOTA} #${nBon + i + 1}`;
    await db.runQuery(
      `INSERT INTO bonos (reporte_id, tecnico, tipo_capacitacion, monto_bono, fecha, pagado, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [repId, tecnico, tiposCap[i % tiposCap.length], monto, fechaB, i % 4 === 0 ? 1 : 0, nota]
    );
    out.bonos_demo++;
  }

  /* Prospectos demo (NL, Coahuila, Tamaulipas, etc.) */
  const SEED_PROSPECTO = 'demo:prospecto';
  const prCount = await db.getOne(`SELECT COUNT(*) as n FROM prospectos WHERE COALESCE(notas,'') LIKE ?`, [`${SEED_PROSPECTO}%`]);
  const nPr = Number(prCount && prCount.n) || 0;
  const prospectosSeed = [
    { empresa: 'Aceros del Norte S.A.', zona: 'Nuevo León', lat: 25.6866, lng: -100.3161, tipo: 'Torno CNC CTX', ind: 'Automotriz', usd: 185000, est: 'calificado' },
    { empresa: 'Fundidora Santa Catarina', zona: 'Nuevo León', lat: 25.6751, lng: -100.4614, tipo: 'Electroerosión hilo', ind: 'Metal-mecánica', usd: 92000, est: 'negociación' },
    { empresa: 'Manufacturas Regiomontanas', zona: 'Nuevo León', lat: 25.6488, lng: -100.2891, tipo: 'Refacciones Fanuc', ind: 'Plástico', usd: 45000, est: 'nuevo' },
    { empresa: 'Industrias García', zona: 'Coahuila', lat: 25.4232, lng: -101.0053, tipo: 'Centro mecanizado 5 ejes', ind: 'Aeroespacial', usd: 240000, est: 'calificado' },
    { empresa: 'Torreón Precision Parts', zona: 'Coahuila', lat: 25.5428, lng: -103.4068, tipo: 'Robot soldadura ARC Mate', ind: 'Agroindustria', usd: 78000, est: 'propuesta' },
    { empresa: 'Láser del Norte', zona: 'Chihuahua', lat: 28.6329, lng: -106.0691, tipo: 'Láser fiber + chiller', ind: 'Electrónica', usd: 112000, est: 'negociación' },
    { empresa: 'Reynosa Tooling', zona: 'Tamaulipas', lat: 26.0508, lng: -98.2978, tipo: 'Máquina BT-1000', ind: 'Automotriz', usd: 198000, est: 'nuevo' },
    { empresa: 'Matamoros Industrial', zona: 'Tamaulipas', lat: 25.8697, lng: -97.5028, tipo: 'Rectificadora + variadores', ind: 'Energía', usd: 56000, est: 'calificado' },
    { empresa: 'Querétaro Aerospace Hub', zona: 'Querétaro', lat: 20.5888, lng: -100.3899, tipo: 'Célula robot Fanuc', ind: 'Aeroespacial', usd: 310000, est: 'propuesta' },
    { empresa: 'Silao Manufacturing', zona: 'Guanajuato', lat: 20.9174, lng: -101.2923, tipo: 'Torno CNC + refacciones', ind: 'Automotriz', usd: 87000, est: 'nuevo' },
    { empresa: 'Pesquería Industrial Park', zona: 'Nuevo León', lat: 25.7856, lng: -100.1884, tipo: 'Compresor + mantenimiento', ind: 'Alimentos', usd: 34000, est: 'calificado' },
    { empresa: 'Monclova Heavy', zona: 'Coahuila', lat: 26.9063, lng: -101.4206, tipo: 'Prensa hidráulica', ind: 'Minería', usd: 125000, est: 'negociación' },
    { empresa: 'Piedras Negras Maquila', zona: 'Coahuila', lat: 28.7006, lng: -100.5236, tipo: 'Variadores + contactores', ind: 'Textil', usd: 28000, est: 'nuevo' },
    { empresa: 'Saltillo Automoción', zona: 'Coahuila', lat: 25.4216, lng: -101.0003, tipo: 'Línea transfer + robot', ind: 'Automotriz', usd: 420000, est: 'calificado' },
    { empresa: 'Nuevo Laredo Logistics', zona: 'Tamaulipas', lat: 27.4763, lng: -99.5164, tipo: 'Montacargas + rectificado', ind: 'Logística', usd: 51000, est: 'propuesta' },
    { empresa: 'San Luis Potosí Tech', zona: 'San Luis Potosí', lat: 22.1565, lng: -100.9755, tipo: 'Electroerosión + hilo', ind: 'Médico', usd: 143000, est: 'negociación' },
    { empresa: 'Apodaca Industrial', zona: 'Nuevo León', lat: 25.7786, lng: -100.1889, tipo: 'Centro VM-1100', ind: 'Plástico', usd: 96000, est: 'nuevo' },
    { empresa: 'Escobedo Metal', zona: 'Nuevo León', lat: 25.7935, lng: -100.3139, tipo: 'Bandas + correas', ind: 'Metal-mecánica', usd: 22000, est: 'calificado' },
    { empresa: 'Ramos Arizpe Cluster', zona: 'Coahuila', lat: 25.5469, lng: -100.9603, tipo: 'Instalación + capacitación', ind: 'Automotriz', usd: 67000, est: 'propuesta' },
    { empresa: 'Ciudad Victoria OEM', zona: 'Tamaulipas', lat: 23.7417, lng: -99.1459, tipo: 'Guardamotores + arranques', ind: 'Agro', usd: 19000, est: 'nuevo' },
    { empresa: 'Monterrey Sur Plastics', zona: 'Nuevo León', lat: 25.5552, lng: -100.2201, tipo: 'Temperatura + chillers', ind: 'Plástico', usd: 74000, est: 'negociación' },
    { empresa: 'Durango Minería', zona: 'Durango', lat: 24.0277, lng: -104.6576, tipo: 'Bombas + válvulas', ind: 'Minería', usd: 88000, est: 'calificado' },
    { empresa: 'Zacatecas Precision', zona: 'Zacatecas', lat: 22.7709, lng: -102.5833, tipo: 'Metrología + brazo', ind: 'Aero', usd: 54000, est: 'nuevo' },
    { empresa: 'Aguascalientes Auto', zona: 'Aguascalientes', lat: 21.8853, lng: -102.2916, tipo: 'Soldadura + robot', ind: 'Automotriz', usd: 176000, est: 'propuesta' },
    { empresa: 'Tampico Port Services', zona: 'Tamaulipas', lat: 22.2553, lng: -97.8686, tipo: 'Compresores marinos', ind: 'Energía', usd: 99000, est: 'calificado' },
    { empresa: 'León Footwear Tech', zona: 'Guanajuato', lat: 21.125, lng: -101.686, tipo: 'Corte láser textil', ind: 'Calzado', usd: 41000, est: 'nuevo' },
    { empresa: 'Hermosillo Solar', zona: 'Sonora', lat: 29.0729, lng: -110.9559, tipo: 'Variadores VFD', ind: 'Energía', usd: 62000, est: 'negociación' },
    { empresa: 'Mexicali Border Mfg', zona: 'Baja California', lat: 32.6245, lng: -115.4523, tipo: 'PLC + sensores', ind: 'Electrónica', usd: 71000, est: 'calificado' },
  ];
  const toAddPr = Math.max(0, 28 - nPr);
  for (let i = 0; i < toAddPr && i < prospectosSeed.length; i++) {
    const p = prospectosSeed[i];
    const dias = 3 + (i % 20);
    const uc = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
    const score = 55 + (i % 40) + (p.usd > 100000 ? 10 : 0);
    await db.runQuery(
      `INSERT INTO prospectos (empresa, zona, lat, lng, tipo_interes, industria, potencial_usd, ultimo_contacto, score_ia, estado, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.empresa, p.zona, p.lat, p.lng, p.tipo, p.ind, p.usd, uc, score, p.est, `${SEED_PROSPECTO}:${i + 1}`]
    );
    out.prospectos_demo++;
  }

  /* Mantenimientos correctivos/preventivos en taller (tabla mantenimientos) */
  const mgRow = await db.getOne(`SELECT COUNT(*) as n FROM mantenimientos WHERE COALESCE(descripcion_falla,'') LIKE ?`, [`${SEED_CAL_NOTA}%`]);
  const nMg = Number(mgRow && mgRow.n) || 0;
  const targetMg = 18;
  const maqs = await db.getAll('SELECT id FROM maquinas ORDER BY id LIMIT 80');
  const tiposMg = ['preventivo', 'correctivo', 'preventivo', 'correctivo'];
  const fallas = [
    'Fuga hidráulica en válvula proporcional', 'Desgaste de rodamiento husillo', 'Fallo encoder eje Z',
    'Calentamiento variador', 'Pérdida presión neumática', 'Desalineación láser', 'Error servo eje C',
    'Ruido anómalo bomba', 'Cableado dañado canal', 'Software congelado HMI', 'Filtro obstruido chiller',
    'Correa dentada fatigada', 'Sensor proximidad intermitente', 'Torque bajo pernos bancada',
    'Lubricación insuficiente', 'Vibración estructural', 'Falla contactor principal', 'Desbalance motor',
  ];
  const tecs = personalDemo.map((x) => x.nombre);
  for (let k = 0; k < Math.max(0, targetMg - nMg) && maqs.length > 0; k++) {
    const mid = maqs[k % maqs.length].id;
    const tipo = tiposMg[k % tiposMg.length];
    const diasA = 5 + k * 3;
    const fi = new Date(Date.now() - diasA * 86400000).toISOString().slice(0, 10);
    const ff = tipo === 'correctivo' ? new Date(Date.now() - (diasA - 2) * 86400000).toISOString().slice(0, 10) : null;
    const costo = tipo === 'correctivo' ? 8500 + (k % 8) * 1200 : 3200 + (k % 5) * 400;
    await db.runQuery(
      `INSERT INTO mantenimientos (maquina_id, tipo, fecha_inicio, fecha_fin, descripcion_falla, tecnico, horas_invertidas, costo_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [mid, tipo, fi, ff, `${SEED_CAL_NOTA} ${fallas[k % fallas.length]}`, tecs[k % tecs.length], tipo === 'correctivo' ? 4 + (k % 3) : 2, costo]
    );
    out.mantenimientos_correctivos++;
  }

  /* Placeholders visuales en refacciones sin imagen (demo) */
  try {
    await db.runQuery(
      `UPDATE refacciones SET imagen_url = ? WHERE (imagen_url IS NULL OR imagen_url = '') LIMIT 40`,
      ['https://picsum.photos/seed/refdiag/640/400']
    );
    await db.runQuery(
      `UPDATE refacciones SET manual_url = ? WHERE (manual_url IS NULL OR manual_url = '') LIMIT 40`,
      ['https://picsum.photos/seed/refman/640/400']
    );
  } catch (_) {}

  return out;
}

async function runSeedDemoCore(_forceIgnored) {
    /* Nunca borrar datos reales: el parámetro force quedó deshabilitado.
       El demo completo solo debe ejecutarse con base vacía (sin clientes). */
    const seedPath = path.join(__dirname, 'seed-demo.json');
    if (!fs.existsSync(seedPath)) throw new Error('No existe seed-demo.json. Ejecuta: python exportar_demo.py');
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
    for (let ii = 0; ii < incidentes.length; ii++) {
      const inc = incidentes[ii];
      const clienteId = clienteByNombre[norm(inc && inc.cliente_nombre)];
      if (!clienteId) continue;
      let maquinaId = null;
      const maqNom = inc && inc.maquina_nombre;
      if (maqNom) {
        maquinaId = maquinaByClienteYNombre[clienteId + '|' + norm(maqNom)];
      }
      const baseIncFolio = safeStr(inc.folio) || `INC-JSON-${ii}`;
      const folioIncIns = await folioUnicoEnTabla('incidentes', baseIncFolio);
      await db.runQuery(
        `INSERT INTO incidentes (folio, cliente_id, maquina_id, descripcion, prioridad, fecha_reporte, fecha_cerrado, fecha_vencimiento, tecnico_responsable, estatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [folioIncIns, clienteId, maquinaId, safeStrReq(inc.descripcion) || '-', safeStr(inc.prioridad) || 'media', (inc.fecha_reporte && String(inc.fecha_reporte).slice(0, 10)) || new Date().toISOString().slice(0, 10), inc.estatus === 'cerrado' ? (safeStr(inc.fecha_cerrado) || new Date().toISOString().slice(0, 10)) : null, safeStr(inc.fecha_vencimiento), safeStr(inc.tecnico_responsable), (inc.estatus && String(inc.estatus).trim()) || 'abierto']
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
        const folioBaseDemo = 'INC-DEMO-' + String(1000 + i);
        const folio = await folioUnicoEnTabla('incidentes', folioBaseDemo);
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
      const folioBase =
        (tipo === 'mano_obra' ? 'COT-MO' : 'COT-REF') + '-' + fecha.replace(/-/g, '') + '-' + String(1001 + i);
      const folio = await folioUnicoEnTabla('cotizaciones', folioBase);
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
        const tipoGar = ['Industrial', 'CNC', 'Hidráulica', 'Eléctrica'][i % 4];
        const [f1, f2] = fechasMantenimientoPar(fEnt, tipoGar, 0);
        const anio1 = new Date(f1 + 'T12:00:00').getFullYear();
        const anio2 = new Date(f2 + 'T12:00:00').getFullYear();
        const confirmado1 = mesesAtras >= 6 ? 1 : 0;
        await db.runQuery(
          `INSERT INTO mantenimientos_garantia (garantia_id, numero, anio, fecha_programada, fecha_realizada, confirmado, costo, pagado)
           VALUES (?, 1, ?, ?, ?, ?, ?, ?)`,
          [rg.id, anio1, f1, confirmado1 ? f1 : null, confirmado1, confirmado1 ? 1500 : 0, confirmado1 ? 1500 : 0]
        );
        await db.runQuery(
          `INSERT INTO mantenimientos_garantia (garantia_id, numero, anio, fecha_programada, fecha_realizada, confirmado, costo, pagado)
           VALUES (?, 2, ?, ?, ?, ?, ?, ?)`,
          [rg.id, anio2, f2, null, 0, 0, 0]
        );
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

    const enrichment = await runSeedDemoEnrichment();

    return {
      ok: true,
      force: false,
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
      enrichment,
    };
}

app.post('/api/seed-demo', async (req, res) => {
  try {
    const [cCount] = await db.getAll('SELECT COUNT(*) as n FROM clientes');
    const n = cCount && cCount.n != null ? Number(cCount.n) : 0;
    if (n > 0) {
      return res.status(400).json({
        error:
          'Ya hay clientes en la base: no se carga el demo completo para no mezclar ni borrar datos reales. ' +
          'Usa «Cargar solo incidentes, bitácoras y cotizaciones demo», «Asegurar equipos por cliente», o SQL en Turso (scripts/).',
      });
    }
    const result = await runSeedDemoCore(false);
    res.json(result);
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
    for (let ei = 0; ei < incidentes.length; ei++) {
      const inc = incidentes[ei];
      const clienteId = clienteByNombre[norm(inc && inc.cliente_nombre)];
      if (!clienteId) continue;
      let maquinaId = null;
      const maqNom = inc && inc.maquina_nombre;
      if (maqNom) maquinaId = maquinaByClienteYNombre[clienteId + '|' + norm(maqNom)];
      const baseIncFolio = safeStr(inc.folio) || `INC-JSON-${ei}`;
      const folioIncExtra = await folioUnicoEnTabla('incidentes', baseIncFolio);
      await db.runQuery(
        `INSERT INTO incidentes (folio, cliente_id, maquina_id, descripcion, prioridad, fecha_reporte, fecha_cerrado, fecha_vencimiento, tecnico_responsable, estatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [folioIncExtra, clienteId, maquinaId, safeStrReq(inc.descripcion) || '-', safeStr(inc.prioridad) || 'media', (inc.fecha_reporte && String(inc.fecha_reporte).slice(0, 10)) || new Date().toISOString().slice(0, 10), inc.estatus === 'cerrado' ? (safeStr(inc.fecha_cerrado) || new Date().toISOString().slice(0, 10)) : null, safeStr(inc.fecha_vencimiento), safeStr(inc.tecnico_responsable), (inc.estatus && String(inc.estatus).trim()) || 'abierto']
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
        const folio = await folioUnicoEnTabla('incidentes', 'INC-EXTRA-' + String(2000 + i));
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
      const folioBase =
        (tipo === 'mano_obra' ? 'COT-MO' : 'COT-REF') + '-' + fecha.replace(/-/g, '') + '-' + String(2000 + i);
      const folio = await folioUnicoEnTabla('cotizaciones', folioBase);
      await db.runQuery(
        `INSERT INTO cotizaciones (folio, cliente_id, tipo, fecha, subtotal, iva, total) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [folio, clienteId, tipo, fecha, subtotal, iva, total]
      );
      cotizacionesCount++;
    }
    const enrichment = await runSeedDemoEnrichment();
    res.json({
      ok: true,
      incidentes: incidentesCount,
      bitacoras: bitacorasCount,
      cotizaciones: cotizacionesCount,
      enrichment,
    });
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

function stripFechaProgramadaReporte(row, isAdmin) {
  if (isAdmin || !row) return row;
  const { fecha_programada, ...rest } = row;
  return rest;
}

app.get('/api/reportes', async (req, res) => {
  try {
    const rows = await db.getAll(
      `SELECT r.*, c.nombre as cliente_nombre, m.nombre as maquina_nombre
       FROM reportes r
       LEFT JOIN clientes c ON c.id = r.cliente_id
       LEFT JOIN maquinas m ON m.id = r.maquina_id
       ORDER BY
         CASE
           WHEN LOWER(COALESCE(r.subtipo, '')) = 'garantia' THEN 1
           WHEN LOWER(COALESCE(r.subtipo, '')) = 'instalacion' THEN 2
           WHEN r.tipo_reporte = 'venta' THEN 9
           ELSE 3
         END,
         r.fecha DESC, r.id DESC
       LIMIT 500`
    );
    const isAdmin = !auth.AUTH_ENABLED || (req.authUser && req.authUser.role === 'admin');
    res.json(rows.map((r) => stripFechaProgramadaReporte(r, isAdmin)));
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
    const isAdmin = !auth.AUTH_ENABLED || (req.authUser && req.authUser.role === 'admin');
    res.json(stripFechaProgramadaReporte(row, isAdmin));
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.post('/api/reportes', async (req, res) => {
  try {
    const body = req.body || {};
    const { cliente_id, razon_social, maquina_id, numero_maquina, tipo_reporte, subtipo, descripcion, tecnico, fecha, fecha_programada, estatus, notas, finalizado, archivo_firmado, archivo_firmado_b64, archivo_firmado_nombre } = body;
    const repAdmin = !auth.AUTH_ENABLED || (req.authUser && req.authUser.role === 'admin');
    const fechaProgIns = repAdmin ? (fecha_programada || null) : null;
    const archivo =
      archivo_firmado ||
      (typeof archivo_firmado_b64 === 'string' && archivo_firmado_b64.trim() ? archivo_firmado_b64.trim() : null);
    const folio = generarFolioReporte(tipo_reporte);
    const isFinalizado = finalizado ? 1 : 0;
    const finalEstatus = isFinalizado ? 'finalizado' : (estatus || 'abierto');
    await db.runQuery(
      `INSERT INTO reportes (folio, cliente_id, razon_social, maquina_id, numero_maquina, tipo_reporte, subtipo, descripcion, tecnico, fecha, fecha_programada, estatus, notas, finalizado, archivo_firmado, archivo_firmado_nombre)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [folio, cliente_id || null, razon_social || null, maquina_id || null, numero_maquina || null,
       tipo_reporte || 'servicio', subtipo || null, descripcion || null, tecnico || null,
       fecha || new Date().toISOString().slice(0,10), fechaProgIns, finalEstatus, notas || null,
       isFinalizado, archivo || null, archivo_firmado_nombre || null]
    );
    const r = await db.getOne('SELECT r.*, c.nombre as cliente_nombre FROM reportes r LEFT JOIN clientes c ON c.id=r.cliente_id ORDER BY r.id DESC LIMIT 1');
    if (r && r.id && isFinalizado) {
      try {
        await syncBitacoraFromReporte(r.id);
      } catch (e) {
        console.warn('[bitacora-sync]', e && e.message);
      }
    }
    res.status(201).json(r);
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.put('/api/reportes/:id', async (req, res) => {
  try {
    const existing = await db.getOne('SELECT * FROM reportes WHERE id=?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'No encontrado' });
    const b = req.body || {};
    const pick = (k, def = null) => (b[k] !== undefined ? b[k] : (existing[k] !== undefined ? existing[k] : def));
    const repAdmin = !auth.AUTH_ENABLED || (req.authUser && req.authUser.role === 'admin');
    const archivo =
      b.archivo_firmado !== undefined ? b.archivo_firmado
        : (typeof b.archivo_firmado_b64 === 'string' && b.archivo_firmado_b64.trim()
          ? b.archivo_firmado_b64.trim()
          : existing.archivo_firmado);
    const archivoNombre = b.archivo_firmado_nombre !== undefined ? b.archivo_firmado_nombre : existing.archivo_firmado_nombre;
    const isFinalizado = b.finalizado !== undefined ? (b.finalizado ? 1 : 0) : (Number(existing.finalizado) ? 1 : 0);
    let finalEstatus = pick('estatus', existing.estatus || 'abierto');
    if (isFinalizado) finalEstatus = 'finalizado';
    await db.runQuery(
      `UPDATE reportes SET cliente_id=?, razon_social=?, maquina_id=?, numero_maquina=?, tipo_reporte=?, subtipo=?, descripcion=?, tecnico=?, fecha=?, fecha_programada=?, estatus=?, notas=?, finalizado=?, archivo_firmado=?, archivo_firmado_nombre=? WHERE id=?`,
      [
        pick('cliente_id'), pick('razon_social'), pick('maquina_id'), pick('numero_maquina'),
        pick('tipo_reporte', 'servicio'), pick('subtipo'), pick('descripcion'), pick('tecnico'),
        pick('fecha'), repAdmin ? pick('fecha_programada', existing.fecha_programada) : existing.fecha_programada,
        finalEstatus, pick('notas'),
        isFinalizado, archivo || null, archivoNombre || null,
        req.params.id,
      ]
    );
    const r = await db.getOne('SELECT r.*, c.nombre as cliente_nombre FROM reportes r LEFT JOIN clientes c ON c.id=r.cliente_id WHERE r.id=?', [req.params.id]);
    if (r && r.id && isFinalizado) {
      try {
        await syncBitacoraFromReporte(r.id);
      } catch (e) {
        console.warn('[bitacora-sync]', e && e.message);
      }
    }
    res.json(r || {});
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.delete('/api/reportes/:id', async (req, res) => {
  try {
    await db.runQuery('DELETE FROM reportes WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

/** Al finalizar un reporte, deja registro enlazado en bitácoras (mismo archivo firmado si existe). */
async function syncBitacoraFromReporte(reporteId) {
  const r = await db.getOne('SELECT * FROM reportes WHERE id=?', [reporteId]);
  if (!r || !Number(r.finalizado)) return;
  const folio = r.folio || '#' + reporteId;
  const desc = (r.descripcion || '').trim();
  const actividades =
    ('Reporte de servicio finalizado: ' + folio + (desc ? '. ' + desc.slice(0, 1200) : '')).trim();
  const fecha = (r.fecha || new Date().toISOString().slice(0, 10)).toString().slice(0, 10);
  const tech = r.tecnico || null;
  const arch = r.archivo_firmado || null;
  const archN = r.archivo_firmado_nombre || null;
  const mat = 'Origen: reporte id ' + reporteId + (arch ? ' · servicio firmado adjunto' : '');
  const existing = await db.getOne('SELECT id FROM bitacoras WHERE reporte_id=?', [reporteId]);
  if (existing && existing.id) {
    await db.runQuery(
      `UPDATE bitacoras SET fecha=?, tecnico=?, actividades=?, materiales_usados=?, tiempo_horas=COALESCE(tiempo_horas,0), archivo_firmado=?, archivo_firmado_nombre=? WHERE reporte_id=?`,
      [fecha, tech, actividades, mat, arch, archN, reporteId]
    );
  } else {
    await db.runQuery(
      `INSERT INTO bitacoras (incidente_id, cotizacion_id, reporte_id, fecha, tecnico, actividades, tiempo_horas, materiales_usados, archivo_firmado, archivo_firmado_nombre)
       VALUES (NULL, NULL, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [reporteId, fecha, tech, actividades, mat, arch, archN]
    );
  }
}

/** Prueba o reenvío manual del correo mensual (admin). Body opcional: { "periodo": "YYYY-MM" } */
app.post('/api/admin/monthly-reports/run', async (req, res) => {
  try {
    if (!auth.AUTH_ENABLED) {
      return res.status(400).json({ error: 'Activa AUTH_ENABLED y entra como admin para usar esta ruta.' });
    }
    if (!req.authUser || req.authUser.role !== 'admin') {
      return res.status(403).json({ error: 'Solo el administrador puede ejecutar el envío mensual.' });
    }
    const body = req.body || {};
    let periodo = (body.periodo || '').trim();
    if (!periodo) {
      const d = new Date();
      const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      periodo = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    }
    const r = await sendMonthlyAdminEmail(periodo);
    if (!r.sent) {
      return res.status(503).json({
        error: 'No se pudo enviar (revisa SMTP_* en el servidor y destinatarios).',
        detail: r.reason || 'unknown',
        periodo,
      });
    }
    res.json({ ok: true, periodo: r.periodo || periodo });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// =================== GARANTÍAS ===================
let nodemailer;
try { nodemailer = require('nodemailer'); } catch (_) { nodemailer = null; }

/** Meses desde entrega para el 1.er y 2.o mantenimiento del “año” (se repite cada 12 meses). */
function intervalosMesesPorTipo(tipoMaquina) {
  const raw = (tipoMaquina || '').toLowerCase();
  const t = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (t.includes('cnc') || t.includes('torno')) return [4, 10];
  if (t.includes('robot') || t.includes('laser')) return [3, 9];
  if (t.includes('hidraul') || t.includes('compresor')) return [5, 11];
  if (t.includes('electr')) return [5, 11];
  if (t.includes('industrial') || t.includes('pesad')) return [6, 12];
  return [6, 12];
}

/** Par de fechas (ISO) para el año de garantía `offset` (0 = primer año desde entrega, 1 = segundo año, …). */
function fechasMantenimientoPar(fechaEntrega, tipoMaquina, offsetAnios) {
  const base = new Date(fechaEntrega + 'T12:00:00');
  const off = Math.max(0, Number(offsetAnios) || 0);
  const [a, b] = intervalosMesesPorTipo(tipoMaquina);
  const m1 = new Date(base); m1.setMonth(m1.getMonth() + off * 12 + a);
  const m2 = new Date(base); m2.setMonth(m2.getMonth() + off * 12 + b);
  return [m1.toISOString().slice(0, 10), m2.toISOString().slice(0, 10)];
}

function createMailTransport() {
  if (!nodemailer) return null;
  const host = (process.env.SMTP_HOST || '').trim();
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').trim();
  if (!host || !user) return null;
  const port = Number(process.env.SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: pass ? { user, pass } : undefined,
  });
}

/** Genera HTML profesional para correos del sistema */
function buildEmailHtml({ title, subtitle, rows, tableHeader, tableRows, footer, accentColor }) {
  const accent = accentColor || '#0d9488';
  const tableSection = tableHeader && tableRows ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;font-size:13px;">
      <thead>
        <tr style="background:${accent};color:#fff;">
          ${tableHeader.map(h => `<th style="padding:10px 12px;text-align:left;font-weight:600;">${h}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${tableRows.map((row, i) => `
          <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#fff'};border-bottom:1px solid #e5e7eb;">
            ${row.map(c => `<td style="padding:9px 12px;color:#374151;">${c}</td>`).join('')}
          </tr>`).join('')}
      </tbody>
    </table>` : '';
  const detailRows = rows ? rows.map(r => `
    <tr>
      <td style="padding:8px 0;color:#6b7280;font-size:13px;width:160px;vertical-align:top;">${r.label}</td>
      <td style="padding:8px 0;color:#111827;font-size:13px;font-weight:${r.bold ? '700' : '400'};">${r.value}</td>
    </tr>`).join('') : '';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px;">
      <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:${accent};padding:28px 36px;">
              <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.75);font-weight:600;">Universal Machine Tools</p>
              <h1 style="margin:8px 0 4px;font-size:22px;color:#fff;font-weight:700;">${title}</h1>
              ${subtitle ? `<p style="margin:0;font-size:13px;color:rgba(255,255,255,0.85);">${subtitle}</p>` : ''}
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 36px;">
              ${rows ? `<table width="100%" cellpadding="0" cellspacing="0">${detailRows}</table>` : ''}
              ${tableSection}
              ${footer ? `<div style="margin-top:24px;padding:16px 20px;background:#f9fafb;border-radius:8px;border-left:4px solid ${accent};font-size:13px;color:#374151;line-height:1.6;">${footer}</div>` : ''}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 36px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} Universal Machine Tools &nbsp;|&nbsp; Sistema de Gestión ERP</p>
              <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">Este es un correo automático, por favor no responda directamente a este mensaje.</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;
}

/** Envía correo al aprobar una cotización: info cliente + líneas con código y moneda */
async function enviarCorreoAprobacion(cot, cliente) {
  const t = createMailTransport();
  const from = (process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();
  const adminEmails = getAdminNotifyEmails();
  if (!t || !from) return;

  const clienteEmail = cliente && cliente.email ? cliente.email.trim() : '';
  const allRecipients = [...new Set([...adminEmails, clienteEmail].filter(Boolean))];
  if (!allRecipients.length) return;

  const lineas = await db.getAll(
    `SELECT l.*, r.codigo AS ref_codigo, r.descripcion AS ref_desc
     FROM cotizacion_lineas l
     LEFT JOIN refacciones r ON r.id = l.refaccion_id
     WHERE l.cotizacion_id = ?
     ORDER BY l.orden, l.id`,
    [cot.id]
  );

  let vp = null;
  if (cot.vendedor_personal_id) {
    vp = await db.getOne(
      `SELECT nombre, puesto, comision_maquinas_pct, comision_refacciones_pct FROM tecnicos WHERE id = ?`,
      [cot.vendedor_personal_id]
    );
  }
  if (!vp && cot.vendedor) {
    vp = await db.getOne(
      `SELECT nombre, puesto, comision_maquinas_pct, comision_refacciones_pct FROM tecnicos WHERE TRIM(nombre) = TRIM(?) AND activo = 1`,
      [String(cot.vendedor)]
    );
  }
  let comSvc = 15;
  try {
    const trSvc = await db.getOne(`SELECT valor FROM tarifas WHERE clave = 'comision_svc'`);
    if (trSvc && trSvc.valor != null) comSvc = Number(trSvc.valor) || 15;
  } catch (_) {}

  const tipoCot = String(cot.tipo || '').toLowerCase();
  const cr = Number(vp && vp.comision_refacciones_pct);
  const cm = Number(vp && vp.comision_maquinas_pct);
  let comPct = 0;
  let comRegla = '';
  if (tipoCot === 'refacciones') {
    comPct = Number.isFinite(cr) ? cr : 10;
    comRegla = 'Personal · % refacciones';
  } else if (tipoCot === 'servicio' || tipoCot === 'mano_obra') {
    comPct = comSvc;
    comRegla = 'Tarifa comision_svc';
  } else if (tipoCot === 'maquina') {
    comPct = Number.isFinite(cm) ? cm : 0;
    comRegla = 'Personal · % equipo/máquina';
  }
  const totalNum = Number(cot.total) || 0;
  const comMonto = comPct > 0 ? totalNum * (comPct / 100) : 0;

  const monedaLabel = (cot.moneda || 'MXN').toUpperCase();
  const tc = Number(cot.tipo_cambio) > 0 ? Number(cot.tipo_cambio) : 17.0;
  const totalFmt = `$${Number(cot.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${monedaLabel}`;
  const subtotalFmt = `$${Number(cot.subtotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${monedaLabel}`;
  const ivaFmt = `$${Number(cot.iva || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${monedaLabel}`;
  const fechaFmt = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

  const rows = [
    { label: 'Folio', value: `<strong>${cot.folio}</strong>`, bold: false },
    { label: 'Fecha de aprobación', value: fechaFmt },
    { label: 'Cliente', value: cliente ? cliente.nombre : 'N/A' },
    { label: 'RFC', value: cliente ? (cliente.rfc || '—') : '—' },
    { label: 'Tipo', value: cot.tipo || '—' },
    { label: 'Vendedor', value: (vp && vp.nombre) || cot.vendedor || '—' },
    { label: 'Puesto (vendedor)', value: (vp && vp.puesto) || '—' },
    {
      label: '% Comisión aplicable',
      value:
        comPct > 0
          ? `${comPct}% <span style="font-size:12px;color:#6b7280;">(${comRegla})</span>`
          : '— (sin comisión para este tipo)',
    },
    {
      label: 'Monto comisión estimado',
      value:
        comPct > 0
          ? `$${comMonto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${monedaLabel}`
          : '—',
    },
    { label: 'Tipo de cambio (ref.)', value: `$${tc.toFixed(4)} MXN/USD` },
    { label: 'Subtotal', value: subtotalFmt },
    { label: 'IVA (16%)', value: ivaFmt },
    { label: 'Total', value: `<strong style="font-size:15px;">${totalFmt}</strong>`, bold: true },
  ];

  const tableHeader = ['#', 'Código', 'Descripción', 'Cant.', `Unit. (${monedaLabel})`, 'USD ref.', 'Subtotal'];
  const tableRows = (lineas || []).map((l, i) => {
    const codigo = (l.ref_codigo && String(l.ref_codigo).trim()) ? l.ref_codigo : '—';
    const desc = (l.descripcion && String(l.descripcion).trim()) ? l.descripcion : (l.ref_desc || '—');
    const pu = Number(l.precio_unitario) || 0;
    const puUsd = l.precio_usd != null && String(l.precio_usd) !== '' ? Number(l.precio_usd) : (monedaLabel === 'USD' ? pu : pu / tc);
    return [
      i + 1,
      codigo || '—',
      desc,
      Number(l.cantidad || 0).toLocaleString('es-MX'),
      `$${pu.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
      `$${(Number.isFinite(puUsd) ? puUsd : 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
      `$${Number(l.subtotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
    ];
  });

  const footer = `Tipo de cambio de referencia: <strong>${tc.toFixed(4)} MXN/USD</strong> (Banxico / tabla cotización).<br><br>
    <strong>Reporte de venta (comisiones):</strong> el % mostrado corresponde al tipo de cotización (refacciones, equipo/máquina o servicio/mano de obra) y a la tabla <strong>Personal</strong> o tarifas; el monto es estimado sobre el total de la venta.<br><br>
    Para proceder con la facturación, favor de proporcionar la <strong>Constancia de Situación Fiscal</strong> actualizada y los datos de facturación correspondientes.<br><br>
    <strong>Universal Machine Tools</strong> agradece su preferencia. Ante cualquier duda, comuníquese con nosotros a la brevedad.`;

  const html = buildEmailHtml({
    title: `Venta aprobada · Reporte de comisión`,
    subtitle: `Folio: ${cot.folio} &nbsp;|&nbsp; ${fechaFmt}${comPct > 0 ? ` &nbsp;|&nbsp; ${comPct}% comisión` : ''}`,
    rows,
    tableHeader,
    tableRows,
    footer,
  });

  const subject = `✅ Venta / cotización aprobada – Folio ${cot.folio} · Comisión ${comPct > 0 ? comPct + '%' : 'N/A'} | Universal Machine Tools`;
  const text = `Cotización aprobada (reporte de venta) – Folio ${cot.folio}\n\nCliente: ${cliente ? cliente.nombre : 'N/A'}\nRFC: ${cliente ? (cliente.rfc || '—') : '—'}\nFecha: ${fechaFmt}\nVendedor: ${(vp && vp.nombre) || cot.vendedor || '—'}\nPuesto: ${(vp && vp.puesto) || '—'}\nTipo: ${cot.tipo || '—'}\nComisión: ${comPct > 0 ? comPct + '% (' + comRegla + ') — estimado ~' + comMonto.toFixed(2) + ' ' + monedaLabel : '—'}\nTC ref.: ${tc}\nTotal: ${totalFmt}\n\nConceptos:\n${(lineas || []).map((l, i) => {
    const c = l.ref_codigo || '—';
    const d = l.descripcion || l.ref_desc || '';
    return `  ${i + 1}. [${c}] ${d} — cant: ${l.cantidad}, subtotal: ${l.subtotal}`;
  }).join('\n')}\n\nPara facturar: adjuntar Constancia de Situación Fiscal.\n\nUniversal Machine Tools`;
  try {
    await t.sendMail({ from, to: allRecipients.join(', '), subject, text, html });
  } catch (_) { /* correo no bloquea la operación */ }
}

function ymBounds(ym) {
  const parts = String(ym || '').trim().split('-');
  if (parts.length !== 2) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (!y || !m || m < 1 || m > 12) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const start = `${y}-${pad(m)}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${pad(m)}-${String(lastDay).padStart(2, '0')}`;
  return { start, end, label: `${y}-${pad(m)}` };
}

function normTipoTxt(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function vendedorEsDavidCantu(name) {
  const n = normTipoTxt(name);
  return n.includes('david') && n.includes('cantu');
}

function escMail(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function getTarifaValor(clave, fallback) {
  try {
    const row = await db.getOne('SELECT valor FROM tarifas WHERE clave=?', [clave]);
    if (row && row.valor != null && String(row.valor).trim() !== '') {
      const x = Number(row.valor);
      return Number.isFinite(x) ? x : fallback;
    }
  } catch (_) {}
  return fallback;
}

/** Resumen de ventas aplicadas del mes + inventario de refacciones → correo a admin(s). */
async function sendMonthlyAdminEmail(periodoYm) {
  const bounds = ymBounds(periodoYm);
  if (!bounds) throw new Error('periodo inválido (use YYYY-MM)');
  const pctRef = await getTarifaValor('comision_ref', 15);
  const pctSvc = await getTarifaValor('comision_svc', 15);
  const pctMaqDavid = await getTarifaValor('comision_maq_david', 10);

  const rows = await db.getAll(
    `SELECT co.*, c.nombre as cliente_nombre,
            COALESCE(vp.nombre, vn.nombre, co.vendedor) as vendedor_resuelto
     FROM cotizaciones co
     JOIN clientes c ON c.id = co.cliente_id
     LEFT JOIN tecnicos vp ON vp.id = co.vendedor_personal_id
     LEFT JOIN tecnicos vn ON co.vendedor_personal_id IS NULL AND vn.nombre = co.vendedor
     WHERE co.estado IN ('aplicada','venta')
       AND date(COALESCE(co.fecha_aprobacion, co.fecha)) >= date(?)
       AND date(COALESCE(co.fecha_aprobacion, co.fecha)) <= date(?)`,
    [bounds.start, bounds.end]
  );

  let totalRef = 0;
  let totalSvc = 0;
  let totalMaqDavid = 0;
  const detalle = [];
  for (const cot of rows || []) {
    const tipo = normTipoTxt(cot.tipo);
    const tot = Number(cot.total) || 0;
    const vend = cot.vendedor_resuelto || cot.vendedor || '';
    if (tipo === 'refacciones') {
      totalRef += tot;
      detalle.push({ folio: cot.folio, tipo: 'Refacciones', total: tot, com: tot * (pctRef / 100) });
    } else if (tipo === 'servicio' || tipo === 'mano_obra') {
      totalSvc += tot;
      detalle.push({ folio: cot.folio, tipo: 'Servicio / M.O.', total: tot, com: tot * (pctSvc / 100) });
    } else if (tipo === 'maquina' && vendedorEsDavidCantu(vend)) {
      totalMaqDavid += tot;
      detalle.push({ folio: cot.folio, tipo: 'Equipo (David Cantú)', total: tot, com: tot * (pctMaqDavid / 100) });
    }
  }

  const comRef = totalRef * (pctRef / 100);
  const comSvc = totalSvc * (pctSvc / 100);
  const comMaq = totalMaqDavid * (pctMaqDavid / 100);
  const comTotal = comRef + comSvc + comMaq;

  const inv = await db.getAll(
    `SELECT codigo, descripcion, zona, stock, stock_minimo FROM refacciones WHERE COALESCE(activo,1)=1 ORDER BY codigo LIMIT 2000`
  );
  const invRows = (inv || []).map((r) => [
    escMail(r.codigo),
    escMail((r.descripcion || '').slice(0, 100)),
    escMail(r.zona || '—'),
    String(Number(r.stock) || 0),
    String(Number(r.stock_minimo) || 0),
  ]);

  const tableVentas = detalle.slice(0, 100).map((d) => [
    escMail(d.folio),
    escMail(d.tipo),
    `$${d.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
    `$${d.com.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
  ]);

  const summaryRows = [
    { label: 'Suma ventas refacciones', value: `$${totalRef.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` },
    { label: `Comisión ${pctRef}% (refacciones)`, value: `$${comRef.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, bold: true },
    { label: 'Suma servicio / mano de obra', value: `$${totalSvc.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` },
    { label: `Comisión ${pctSvc}% (servicios)`, value: `$${comSvc.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, bold: true },
    { label: 'Suma equipo vendido por David Cantú', value: `$${totalMaqDavid.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` },
    { label: `Comisión ${pctMaqDavid}% (equipo David)`, value: `$${comMaq.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, bold: true },
    { label: 'Total comisiones estimadas', value: `$${comTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, bold: true },
    { label: 'Cotizaciones aplicadas en el mes', value: String((rows || []).length) },
  ];

  const footer =
    'Porcentajes desde tabla <strong>Tarifas</strong> (comision_ref, comision_svc, comision_maq_david). ' +
    'Montos según total de cotización (moneda registrada). Equipo: solo filas con vendedor que incluya «David» y «Cantú».';

  const htmlVentas = buildEmailHtml({
    title: 'Cierre de mes · Comisiones por ventas aplicadas',
    subtitle: `${bounds.label} (${bounds.start} al ${bounds.end})`,
    rows: summaryRows,
    tableHeader: ['Folio', 'Tipo', 'Total venta', 'Comisión est.'],
    tableRows: tableVentas.length ? tableVentas : [['—', 'Sin ventas aplicadas en el periodo', '—', '—']],
    footer,
  });

  const maxInv = 400;
  const invSlice = invRows.slice(0, maxInv);
  const footerInv =
    invRows.length > maxInv
      ? `Mostrando ${maxInv} de ${invRows.length} filas. Exporta inventario completo desde el sistema.`
      : `${invRows.length} artículos activos.`;

  const htmlInv = buildEmailHtml({
    title: 'Inventario de refacciones (corte)',
    subtitle: `Periodo ${bounds.label}`,
    rows: null,
    tableHeader: ['Código', 'Descripción', 'Zona', 'Stock', 'Mín.'],
    tableRows: invSlice.length ? invSlice : [['—', 'Sin refacciones', '—', '0', '0']],
    footer: footerInv,
  });

  const t = createMailTransport();
  const from = (process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();
  const recipients = getAdminNotifyEmails();
  const to = recipients.join(', ');
  if (!t || !from || !to) {
    return { sent: false, reason: 'smtp_or_recipients_missing' };
  }

  const text =
    `Resumen ${bounds.label}\n` +
    `Refacciones: $${totalRef.toFixed(2)} → comisión ${pctRef}% = $${comRef.toFixed(2)}\n` +
    `Servicios: $${totalSvc.toFixed(2)} → ${pctSvc}% = $${comSvc.toFixed(2)}\n` +
    `Equipo (David): $${totalMaqDavid.toFixed(2)} → ${pctMaqDavid}% = $${comMaq.toFixed(2)}\n` +
    `Total comisiones est.: $${comTotal.toFixed(2)}\n`;
  await t.sendMail({
    from,
    to,
    subject: `📊 Cierre ${bounds.label} · Comisiones e inventario | Universal Machine Tools`,
    text,
    html: `${htmlVentas}<div style="height:32px"></div>${htmlInv}`,
  });
  return { sent: true, periodo: bounds.label };
}

async function trySendMonthlyBundleForPreviousMonth() {
  const tz = process.env.TZ || 'America/Mexico_City';
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const dd = Number(map.day);
  const hour = parseInt(String(map.hour != null ? map.hour : '0'), 10) || 0;
  if (dd !== 1 || hour < 6 || hour > 10) return;

  const y = parseInt(map.year, 10);
  const mo = parseInt(map.month, 10);
  const prev = new Date(y, mo - 2, 1);
  const pYm = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;

  const ex = await db.getOne('SELECT job FROM cron_jobs_log WHERE job=? AND periodo=?', ['monthly_admin_bundle', pYm]);
  if (ex) return;

  try {
    const r = await sendMonthlyAdminEmail(pYm);
    if (r.sent) {
      await db.runQuery(
        `INSERT INTO cron_jobs_log (job, periodo, ejecutado_en) VALUES ('monthly_admin_bundle', ?, datetime('now','localtime'))`,
        [pYm]
      );
      console.log('[monthly-email] Enviado resumen', pYm, '→', getAdminNotifyEmails().join(', '));
    } else {
      console.warn('[monthly-email] No enviado', pYm, r.reason || '');
    }
  } catch (e) {
    console.error('[monthly-email]', e && e.message ? e.message : e);
  }
}

let monthlyReportsTimer = null;
function startMonthlyAdminReportsScheduler() {
  if (process.env.VERCEL) {
    console.log('[monthly-email] Omitido en Vercel. Usa POST /api/admin/monthly-reports/run o un Cron que pegue a tu API.');
    return;
  }
  if (process.env.MONTHLY_ADMIN_EMAILS_ENABLED === '0' || process.env.MONTHLY_ADMIN_EMAILS_ENABLED === 'false') {
    console.log('[monthly-email] Desactivado (MONTHLY_ADMIN_EMAILS_ENABLED=0)');
    return;
  }
  if (monthlyReportsTimer) clearInterval(monthlyReportsTimer);
  const tick = () => {
    trySendMonthlyBundleForPreviousMonth().catch((e) => console.error('[monthly-email]', e));
  };
  monthlyReportsTimer = setInterval(tick, 60 * 60 * 1000);
  tick();
}

async function sendMailGarantia({ to, subject, text, html, garantia, mantenimiento }) {
  const t = createMailTransport();
  const from = (process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();
  // Siempre incluye correos de admin / operaciones
  const adminEmails = getAdminNotifyEmails();
  const allTo = [...new Set([...(Array.isArray(to) ? to : [to]), ...adminEmails].filter(Boolean))].join(', ');
  if (!t || !from || !allTo) return { sent: false, reason: 'smtp_not_configured_or_no_recipient' };
  let finalHtml = html;
  if (!finalHtml && garantia) {
    const fechaProg = mantenimiento && mantenimiento.fecha_programada ? new Date(mantenimiento.fecha_programada).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
    finalHtml = buildEmailHtml({
      title: 'Mantenimiento de Garantía Programado',
      subtitle: `Máquina: ${garantia.modelo_maquina || '—'} | N° Serie: ${garantia.numero_serie || '—'}`,
      rows: [
        { label: 'Cliente', value: garantia.razon_social || '—' },
        { label: 'Modelo', value: garantia.modelo_maquina || '—' },
        { label: 'Número de serie', value: garantia.numero_serie || '—' },
        { label: 'Mantenimiento N°', value: mantenimiento ? `${mantenimiento.numero} (Año ${mantenimiento.anio})` : '—' },
        { label: 'Fecha programada', value: fechaProg, bold: true },
        { label: 'Estado', value: 'Pendiente de confirmar' },
      ],
      footer: `Este mantenimiento forma parte de la garantía incluida con su equipo.<br>Por favor confirme disponibilidad para la fecha programada o contáctenos para reagendar.<br><br><strong>Universal Machine Tools</strong> — Su socio en maquinaria industrial.`,
    });
  }
  try {
    await t.sendMail({ from, to: allTo, subject, text, html: finalHtml || `<pre style="font-family:inherit">${text}</pre>` });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: String(err.message || err) };
  }
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

/** Garantías dadas de baja (sin cobertura). */
app.get('/api/garantias/sin-cobertura', async (req, res) => {
  try {
    const rows = await db.getAll(
      `SELECT g.*, c.nombre as cliente_nombre FROM garantias g LEFT JOIN clientes c ON c.id=g.cliente_id WHERE g.activa=0 ORDER BY g.fecha_entrega DESC LIMIT 500`
    );
    for (const g of rows) {
      g.mantenimientos = await db.getAll('SELECT * FROM mantenimientos_garantia WHERE garantia_id=? ORDER BY anio, numero', [g.id]);
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.get('/api/garantias/:id/mantenimientos', async (req, res) => {
  try {
    const rows = await db.getAll('SELECT * FROM mantenimientos_garantia WHERE garantia_id=? ORDER BY anio, numero, fecha_programada', [req.params.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

/** Lista plana de mantenimientos (calendario / prioridades). Solo garantías activas. */
app.get('/api/mantenimientos-garantia', async (req, res) => {
  try {
    const rows = await db.getAll(
      `SELECT mg.*, g.razon_social, g.modelo_maquina, g.numero_serie, g.tipo_maquina, g.activa, g.fecha_entrega,
              g.cliente_id, c.nombre as cliente_nombre, c.email as cliente_email
       FROM mantenimientos_garantia mg
       JOIN garantias g ON g.id = mg.garantia_id
       LEFT JOIN clientes c ON c.id = g.cliente_id
       WHERE g.activa = 1
       ORDER BY
         CASE WHEN mg.confirmado = 0 AND date(mg.fecha_programada) < date('now') THEN 0 ELSE 1 END,
         CASE WHEN mg.confirmado = 0 AND date(mg.fecha_programada) >= date('now') AND date(mg.fecha_programada) <= date('now', '+30 days') THEN 0 ELSE 1 END,
         date(mg.fecha_programada) ASC`
    );
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
    const modeloHint = [modelo_maquina, tipo_maquina].map((x) => (x && String(x).trim()) || '').find(Boolean) || '';
    const [f1, f2] = fechasMantenimientoPar(fecha_entrega, modeloHint, 0);
    const anio1 = new Date(f1 + 'T12:00:00').getFullYear();
    const anio2 = new Date(f2 + 'T12:00:00').getFullYear();
    await db.runQuery(
      `INSERT INTO mantenimientos_garantia (garantia_id, numero, anio, fecha_programada) VALUES (?, 1, ?, ?)`,
      [g.id, anio1, f1]
    );
    await db.runQuery(
      `INSERT INTO mantenimientos_garantia (garantia_id, numero, anio, fecha_programada) VALUES (?, 2, ?, ?)`,
      [g.id, anio2, f2]
    );
    g.mantenimientos = await db.getAll('SELECT * FROM mantenimientos_garantia WHERE garantia_id=? ORDER BY anio, numero', [g.id]);
    res.status(201).json(g);
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

/** Añade el par de mantenimientos del siguiente año fiscal (offset +1 respecto al último bloque). */
app.post('/api/garantias/:id/generar-siguiente-anio', async (req, res) => {
  try {
    const g = await db.getOne('SELECT * FROM garantias WHERE id=?', [req.params.id]);
    if (!g) return res.status(404).json({ error: 'No encontrado' });
    const rows = await db.getAll('SELECT * FROM mantenimientos_garantia WHERE garantia_id=? ORDER BY fecha_programada DESC', [g.id]);
    let maxOff = 0;
    const modeloHintG = (g.modelo_maquina && String(g.modelo_maquina).trim()) || (g.tipo_maquina && String(g.tipo_maquina).trim()) || '';
    if (rows.length) {
      const base = new Date(g.fecha_entrega + 'T12:00:00');
      const [a] = intervalosMesesPorTipo(modeloHintG);
      const last = new Date(rows[0].fecha_programada + 'T12:00:00');
      const monthsFromBase = Math.round((last - base) / (30.44 * 24 * 60 * 60 * 1000));
      maxOff = Math.max(0, Math.floor((monthsFromBase - a) / 12));
    }
    const nextOff = maxOff + 1;
    const [f1, f2] = fechasMantenimientoPar(g.fecha_entrega, modeloHintG, nextOff);
    const anio1 = new Date(f1 + 'T12:00:00').getFullYear();
    const anio2 = new Date(f2 + 'T12:00:00').getFullYear();
    await db.runQuery(
      `INSERT INTO mantenimientos_garantia (garantia_id, numero, anio, fecha_programada) VALUES (?, 1, ?, ?)`,
      [g.id, anio1, f1]
    );
    await db.runQuery(
      `INSERT INTO mantenimientos_garantia (garantia_id, numero, anio, fecha_programada) VALUES (?, 2, ?, ?)`,
      [g.id, anio2, f2]
    );
    const out = await db.getOne('SELECT * FROM garantias WHERE id=?', [g.id]);
    out.mantenimientos = await db.getAll('SELECT * FROM mantenimientos_garantia WHERE garantia_id=? ORDER BY anio, numero, fecha_programada', [g.id]);
    res.status(201).json(out);
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.put('/api/garantias/:id', async (req, res) => {
  try {
    const { cliente_id, razon_social, modelo_maquina, numero_serie, tipo_maquina, fecha_entrega, activa, recalcular_mantenimientos } = req.body || {};
    await db.runQuery(
      `UPDATE garantias SET cliente_id=?, razon_social=?, modelo_maquina=?, numero_serie=?, tipo_maquina=?, fecha_entrega=?, activa=? WHERE id=?`,
      [cliente_id || null, razon_social || '', modelo_maquina || '', numero_serie || null, tipo_maquina || null, fecha_entrega || null, activa != null ? Number(activa) : 1, req.params.id]
    );
    const g = await db.getOne('SELECT * FROM garantias WHERE id=?', [req.params.id]);
    if (g && recalcular_mantenimientos) {
      const pend = await db.getOne(
        'SELECT COUNT(*) as c FROM mantenimientos_garantia WHERE garantia_id=? AND (confirmado=1 OR fecha_realizada IS NOT NULL OR (IFNULL(pagado,0) > 0))',
        [g.id]
      );
      if (!pend || Number(pend.c) === 0) {
        await db.runQuery('DELETE FROM mantenimientos_garantia WHERE garantia_id=?', [g.id]);
        const mhPut = (g.modelo_maquina && String(g.modelo_maquina).trim()) || (g.tipo_maquina && String(g.tipo_maquina).trim()) || '';
        const [f1, f2] = fechasMantenimientoPar(g.fecha_entrega, mhPut, 0);
        const anio1 = new Date(f1 + 'T12:00:00').getFullYear();
        const anio2 = new Date(f2 + 'T12:00:00').getFullYear();
        await db.runQuery(
          `INSERT INTO mantenimientos_garantia (garantia_id, numero, anio, fecha_programada) VALUES (?, 1, ?, ?)`,
          [g.id, anio1, f1]
        );
        await db.runQuery(
          `INSERT INTO mantenimientos_garantia (garantia_id, numero, anio, fecha_programada) VALUES (?, 2, ?, ?)`,
          [g.id, anio2, f2]
        );
      }
    }
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
    const { fecha_realizada, confirmado, costo, pagado, notas, alerta_enviada, alerta_vencida } = req.body || {};
    const cur = await db.getOne('SELECT * FROM mantenimientos_garantia WHERE id=?', [req.params.id]);
    if (!cur) return res.status(404).json({ error: 'No encontrado' });
    const ae = alerta_enviada !== undefined ? Number(alerta_enviada) : Number(cur.alerta_enviada || 0);
    const av = alerta_vencida !== undefined ? Number(alerta_vencida) : Number(cur.alerta_vencida || 0);
    await db.runQuery(
      `UPDATE mantenimientos_garantia SET fecha_realizada=?, confirmado=?, costo=?, pagado=?, notas=?, alerta_enviada=?, alerta_vencida=? WHERE id=?`,
      [
        fecha_realizada || null,
        confirmado != null ? Number(confirmado) : 0,
        Number(costo) || 0,
        Number(pagado) || 0,
        notas || null,
        ae,
        av,
        req.params.id,
      ]
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
       WHERE g.activa = 1 AND mg.confirmado = 0 AND mg.fecha_programada BETWEEN ? AND ?
       ORDER BY mg.fecha_programada ASC`,
      [hoyStr, en30Str]
    );
    const vencidos = await db.getAll(
      `SELECT mg.*, g.razon_social, g.modelo_maquina, g.numero_serie, g.cliente_id, c.nombre as cliente_nombre, c.email
       FROM mantenimientos_garantia mg
       JOIN garantias g ON g.id = mg.garantia_id
       LEFT JOIN clientes c ON c.id = g.cliente_id
       WHERE g.activa = 1 AND mg.confirmado = 0 AND mg.fecha_programada < ?
       ORDER BY mg.fecha_programada ASC`,
      [hoyStr]
    );
    res.json({ proximos: rows, vencidos });
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

/** Marca alertas y opcionalmente envía correos (SMTP_* en entorno). dryRun: solo simula. */
app.post('/api/garantias-alertas/procesar', async (req, res) => {
  try {
    const dryRun = !!(req.body && req.body.dryRun);
    const hoyStr = new Date().toISOString().slice(0, 10);
    const en30Str = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const proximos = await db.getAll(
      `SELECT mg.*, g.razon_social, g.modelo_maquina, g.numero_serie, g.cliente_id, c.nombre as cliente_nombre, c.email
       FROM mantenimientos_garantia mg
       JOIN garantias g ON g.id = mg.garantia_id
       LEFT JOIN clientes c ON c.id = g.cliente_id
       WHERE g.activa = 1 AND mg.confirmado = 0 AND mg.alerta_enviada = 0
         AND mg.fecha_programada BETWEEN ? AND ?`,
      [hoyStr, en30Str]
    );
    const vencidosSinEscalar = await db.getAll(
      `SELECT mg.*, g.razon_social, g.modelo_maquina, g.numero_serie, g.cliente_id, c.nombre as cliente_nombre, c.email
       FROM mantenimientos_garantia mg
       JOIN garantias g ON g.id = mg.garantia_id
       LEFT JOIN clientes c ON c.id = g.cliente_id
       WHERE g.activa = 1 AND mg.confirmado = 0 AND mg.fecha_programada < ? AND mg.alerta_vencida = 0`,
      [hoyStr]
    );
    const enviados = [];
    const errores = [];
    for (const row of proximos) {
      const to = (row.email || '').trim() || null;
      const subj = `🔧 Mantenimiento Programado – ${row.razon_social} | Universal Machine Tools`;
      const text = `Estimado cliente,\n\nLe recordamos el mantenimiento programado para el ${row.fecha_programada}.\nEquipo: ${row.modelo_maquina} (Serie ${row.numero_serie || '—'}).\n\nSaludos,\nUniversal Machine Tools`;
      if (!dryRun) {
        await db.runQuery('UPDATE mantenimientos_garantia SET alerta_enviada=1 WHERE id=?', [row.id]);
        const r = await sendMailGarantia({ to, subject: subj, text, garantia: row, mantenimiento: row });
        enviados.push({ id: row.id, tipo: 'proximo', email: to, ...r });
        if (!r.sent && to) errores.push({ id: row.id, ...r });
      } else enviados.push({ id: row.id, tipo: 'proximo', dryRun: true });
    }
    for (const row of vencidosSinEscalar) {
      const to = (row.email || '').trim() || null;
      const yaAviso = Number(row.alerta_enviada) === 1;
      const subj = yaAviso
        ? `⚠️ URGENTE: Mantenimiento vencido – ${row.razon_social} | Universal Machine Tools`
        : `⚠️ Mantenimiento vencido – ${row.razon_social} | Universal Machine Tools`;
      const text = yaAviso
        ? `El mantenimiento del ${row.fecha_programada} no fue confirmado y ya venció. Equipo: ${row.modelo_maquina}.`
        : `El mantenimiento programado para el ${row.fecha_programada} ya venció. Equipo: ${row.modelo_maquina}.`;
      if (!dryRun) {
        await db.runQuery('UPDATE mantenimientos_garantia SET alerta_vencida=1, alerta_enviada=1 WHERE id=?', [row.id]);
        const r = await sendMailGarantia({ to, subject: subj, text, garantia: row, mantenimiento: row });
        enviados.push({ id: row.id, tipo: 'vencido', email: to, ...r });
        if (!r.sent && to) errores.push({ id: row.id, ...r });
      } else enviados.push({ id: row.id, tipo: 'vencido', dryRun: true });
    }
    res.json({ ok: true, dryRun, procesados: enviados.length, detalle: enviados, errores });
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
    const { reporte_id, tecnico, tipo_capacitacion, modalidad, monto_bono, dias, fecha, mes, notas } = req.body || {};
    if (!tecnico) return res.status(400).json({ error: 'tecnico requerido' });
    const diasNum = Number(dias) || 1;
    const montoBono = Number(monto_bono) || 0;
    const montoTotal = diasNum * montoBono;
    const mesCalc = mes || (fecha ? fecha.slice(0,7) : new Date().toISOString().slice(0,7));
    await db.runQuery(
      `INSERT INTO bonos (reporte_id, tecnico, tipo_capacitacion, modalidad, monto_bono, dias, monto_total, fecha, mes, notas) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [reporte_id || null, tecnico, tipo_capacitacion || null, modalidad || 'local', montoBono, diasNum, montoTotal, fecha || new Date().toISOString().slice(0,10), mesCalc, notas || null]
    );
    const r = await db.getOne('SELECT * FROM bonos ORDER BY id DESC LIMIT 1');
    res.status(201).json(r);
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.put('/api/bonos/:id', async (req, res) => {
  try {
    const { reporte_id, tecnico, tipo_capacitacion, modalidad, monto_bono, dias, fecha, mes, pagado, notas } = req.body || {};
    const diasNum = Number(dias) || 1;
    const montoBono = Number(monto_bono) || 0;
    const montoTotal = diasNum * montoBono;
    const mesCalc = mes || (fecha ? fecha.slice(0,7) : new Date().toISOString().slice(0,7));
    await db.runQuery(
      `UPDATE bonos SET reporte_id=?, tecnico=?, tipo_capacitacion=?, modalidad=?, monto_bono=?, dias=?, monto_total=?, fecha=?, mes=?, pagado=?, notas=? WHERE id=?`,
      [reporte_id || null, tecnico || '', tipo_capacitacion || null, modalidad || 'local', montoBono, diasNum, montoTotal, fecha || null, mesCalc, Number(pagado) || 0, notas || null, req.params.id]
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
    const { tecnico, cliente_id, razon_social, maquina, numero_serie, actividad, estado, fecha_inicio, fecha_fin, descripcion, actividades, reporte_id, mes, mes_liquidacion } = req.body || {};
    if (!tecnico || !fecha_inicio || !fecha_fin) return res.status(400).json({ error: 'tecnico, fecha_inicio y fecha_fin requeridos' });
    const d1 = new Date(fecha_inicio + 'T00:00:00');
    const d2 = new Date(fecha_fin + 'T00:00:00');
    const dias = Math.max(1, Math.round((d2 - d1) / (86400000)) + 1);
    const monto = dias * VIATICO_DIARIO;
    const mesCalc = mes || mes_liquidacion || fecha_inicio.slice(0,7);
    await db.runQuery(
      `INSERT INTO viajes (tecnico, cliente_id, razon_social, maquina, numero_serie, actividad, estado, fecha_inicio, fecha_fin, dias, monto_viaticos, descripcion, actividades, reporte_id, mes, mes_liquidacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tecnico, cliente_id || null, razon_social || null, maquina || null, numero_serie || null, actividad || null, estado || 'pendiente', fecha_inicio, fecha_fin, dias, monto, descripcion || null, actividades || null, reporte_id || null, mesCalc, mes_liquidacion || mesCalc]
    );
    const r = await db.getOne('SELECT * FROM viajes ORDER BY id DESC LIMIT 1');
    res.status(201).json(r);
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.put('/api/viajes/:id', async (req, res) => {
  try {
    const { tecnico, cliente_id, razon_social, maquina, numero_serie, actividad, estado, fecha_inicio, fecha_fin, descripcion, actividades, reporte_id, mes, mes_liquidacion, liquidado } = req.body || {};
    const d1 = new Date((fecha_inicio || '') + 'T00:00:00');
    const d2 = new Date((fecha_fin || '') + 'T00:00:00');
    const dias = isNaN(d1) || isNaN(d2) ? 1 : Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
    const monto = dias * VIATICO_DIARIO;
    const mesCalc = mes || mes_liquidacion || (fecha_inicio ? fecha_inicio.slice(0,7) : null);
    await db.runQuery(
      `UPDATE viajes SET tecnico=?, cliente_id=?, razon_social=?, maquina=?, numero_serie=?, actividad=?, estado=?, fecha_inicio=?, fecha_fin=?, dias=?, monto_viaticos=?, descripcion=?, actividades=?, reporte_id=?, mes=?, mes_liquidacion=?, liquidado=? WHERE id=?`,
      [tecnico || '', cliente_id || null, razon_social || null, maquina || null, numero_serie || null, actividad || null, estado || 'pendiente', fecha_inicio || null, fecha_fin || null, dias, monto, descripcion || null, actividades || null, reporte_id || null, mesCalc, mes_liquidacion || mesCalc, Number(liquidado) || 0, req.params.id]
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

/** Pipeline comercial — prospectos (mapa + scoring) */
app.get('/api/prospectos', async (req, res) => {
  try {
    const rows = await db.getAll(
      'SELECT * FROM prospectos ORDER BY COALESCE(score_ia,0) DESC, potencial_usd DESC, id DESC LIMIT 500'
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

/** Mantenimientos de taller (preventivo/correctivo), no confundir con mantenimientos_garantia */
app.get('/api/mantenimientos-taller', async (req, res) => {
  try {
    const rows = await db.getAll(
      `SELECT m.*, ma.nombre as maquina_nombre, ma.modelo as maquina_modelo, ma.numero_serie as maquina_serie,
              c.nombre as cliente_nombre
       FROM mantenimientos m
       JOIN maquinas ma ON ma.id = m.maquina_id
       LEFT JOIN clientes c ON c.id = ma.cliente_id
       ORDER BY datetime(COALESCE(m.fecha_inicio, m.creado_en)) DESC
       LIMIT 500`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

/**
 * Insights predictivos (reglas heurísticas sobre datos locales; sustituible por modelo ML).
 */
app.get('/api/insights/panel', async (req, res) => {
  try {
    const stockBajo = await db.getAll(
      `SELECT codigo, descripcion, stock, stock_minimo FROM refacciones
       WHERE activo = 1 AND COALESCE(stock_minimo,0) > 0 AND COALESCE(stock,0) <= COALESCE(stock_minimo,0)
       ORDER BY (stock_minimo - stock) DESC LIMIT 12`
    );
    const mgProx = await db.getAll(
      `SELECT mg.id, mg.fecha_programada, g.modelo_maquina, g.razon_social
       FROM mantenimientos_garantia mg
       JOIN garantias g ON g.id = mg.garantia_id
       WHERE g.activa = 1 AND mg.confirmado = 0
         AND date(mg.fecha_programada) >= date('now')
         AND date(mg.fecha_programada) <= date('now', '+90 days')
       ORDER BY date(mg.fecha_programada) ASC LIMIT 15`
    );
    const prospectosHot = await db.getAll(
      `SELECT empresa, zona, potencial_usd, score_ia, estado FROM prospectos
       WHERE COALESCE(estado,'') IN ('calificado','negociación','propuesta')
       ORDER BY score_ia DESC LIMIT 8`
    );
    const ventasMes = await db.getOne(
      `SELECT COUNT(*) as n, COALESCE(SUM(total),0) as monto FROM cotizaciones
       WHERE estado = 'aplicada' AND strftime('%Y-%m', COALESCE(fecha_aprobacion, fecha)) = strftime('%Y-%m','now')`
    );
    const insights = [];
    if (stockBajo.length) {
      insights.push({
        tipo: 'inventario',
        titulo: 'Stock crítico',
        detalle: `${stockBajo.length} refacción(es) en o bajo mínimo. Prioridad: ${stockBajo[0].codigo}.`,
        severidad: 'alta',
      });
    }
    if (mgProx.length) {
      insights.push({
        tipo: 'garantia',
        titulo: 'Mantenimientos programados (90 días)',
        detalle: `${mgProx.length} citas próximas; primera: ${mgProx[0].modelo_maquina} · ${mgProx[0].fecha_programada}`,
        severidad: 'media',
      });
    }
    if (prospectosHot.length) {
      const top = prospectosHot[0];
      insights.push({
        tipo: 'ventas',
        titulo: 'Pipeline alto valor',
        detalle: `Mejor score: ${top.empresa} (${top.zona}) · ~USD ${Math.round(top.potencial_usd || 0).toLocaleString('es-MX')} · ${Math.round(top.score_ia || 0)}%`,
        severidad: 'baja',
      });
    }
    insights.push({
      tipo: 'forecast',
      titulo: 'Pronóstico refacciones (heurístico)',
      detalle:
        stockBajo.length > 5
          ? 'Consumo elevado: revisar compras OEM en las próximas 2–3 semanas.'
          : 'Rotación estable: mantener política de mínimos actual.',
      severidad: 'baja',
    });
    res.json({
      stock_bajo: stockBajo,
      mantenimientos_garantia_proximos: mgProx,
      prospectos_calientes: prospectosHot,
      ventas_mes_aplicadas: ventasMes || { n: 0, monto: 0 },
      insights,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
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

function resolvePublicIndexHtmlPath() {
  const rel = path.join('public', 'index.html');
  const candidates = [path.join(__dirname, rel), path.join(process.cwd(), rel)];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return null;
}

// SPA: rutas no-API → index.html (rutas alternativas para bundle serverless de Vercel)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return res.status(404).end();
  const indexPath = resolvePublicIndexHtmlPath();
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  if (!indexPath) {
    return res
      .status(500)
      .type('html')
      .send(
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Error</title></head><body><h1>No se encontró public/index.html</h1><p>Revisa el despliegue (includeFiles) o la raíz del proyecto.</p></body></html>'
      );
  }
  res.sendFile(indexPath, (err) => {
    if (err) next(err);
  });
});

/** Errores (p. ej. init BD o sendFile): evita respuesta genérica sin pista. */
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const msg = err && err.message ? String(err.message) : String(err || 'Error');
  console.error('[express]', err && err.stack ? err.stack : msg);
  if (req.path && String(req.path).startsWith('/api')) {
    return res.status(500).json({ error: msg });
  }
  res.status(500).type('html').send(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Error</title></head><body><h1>Error del servidor</h1><pre>${msg.replace(/</g, '&lt;')}</pre></body></html>`
  );
});

/** Seed demo, backfill y respaldos: después de escuchar el puerto para no bloquear el health check de Render. */
async function runPostListenStartup() {
  // Auto-seed demo data si las tablas están vacías
  try {
    const [cRow] = await db.getAll('SELECT COUNT(*) as n FROM clientes');
    if (!cRow || Number(cRow.n) === 0) {
      const seedPath = require('path').join(__dirname, 'seed-demo.json');
      if (require('fs').existsSync(seedPath)) {
        console.log('[auto-seed] Base de datos vacía. Cargando datos demo...');
        const r = await runSeedDemoCore(false);
        console.log('[auto-seed] Datos cargados: clientes=' + r.clientes + ' refacciones=' + r.refacciones + ' incidentes=' + r.incidentes + ' cotizaciones=' + r.cotizaciones);
      }
    }
  } catch (e) {
    console.warn('[auto-seed] No se pudo cargar datos demo:', e && e.message);
  }
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
  await backfillCatalogDefaults();
  if (process.env.VERCEL) {
    console.log('[backup-auto] Omitido en Vercel (serverless). Usa export manual o un Cron si necesitas JSON periódico.');
  } else {
    startAutoBackupScheduler();
    console.log('[backup-auto] Intervalo (h):', Math.round(BACKUP_AUTO_INTERVAL_MS / (60 * 60 * 1000)));
    console.log('[backup-auto] Directorio:', getBackupDir());
    console.log('[backup-auto] Retención: max archivos =', BACKUP_AUTO_MAX_FILES, '| max días =', BACKUP_AUTO_MAX_AGE_DAYS);
    startMonthlyAdminReportsScheduler();
  }
}

let serverInitPromise = null;
function initServer() {
  if (!serverInitPromise) {
    serverInitPromise = (async () => {
      await db.init();
      await ensureTarifasDefaults();
      await auth.ensureSeedUsers();
      if (process.env.VERCEL && String(process.env.AUTH_SECRET || '').trim() === '') {
        console.warn(
          '[vercel] AUTH_SECRET no definido: sesiones con secreto por defecto (inseguro). Ejecuta npm run vercel:env y pega AUTH_SECRET en Vercel.'
        );
      }
    })();
  }
  return serverInitPromise;
}

async function start() {
  await initServer();
  app.listen(PORT, '0.0.0.0', () => {
    console.log('Sistema de Cotización - En línea');
    console.log('Escuchando en http://0.0.0.0:' + PORT + ' (local / Render / Docker: usar PORT del entorno)');
    if (db.useTurso) console.log('Base de datos: Turso (nube)');
    else {
      const storage = db.getStorageInfo && db.getStorageInfo();
      console.log('Base de datos: SQLite local');
      if (storage && storage.path) console.log('Archivo SQLite: ' + storage.path);
    }
  });
  setImmediate(() => {
    runPostListenStartup().catch((err) => console.error('[post-listen]', err));
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

/** Vercel: export default de la app Express (Fluid Compute). Local: node server.js */
module.exports = app;
