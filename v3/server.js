/**
 * Servidor Express simple.
 * Todas las rutas en un archivo. Sin TypeScript, sin frameworks complejos.
 *
 * Variables de entorno:
 *   PORT=3000 (default)
 *   JWT_SECRET=xxx (genera con: openssl rand -hex 32)
 */
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production-please-use-openssl-rand-hex-32';
const NODE_ENV = process.env.NODE_ENV || 'development';

if (JWT_SECRET === 'change-me-in-production-please-use-openssl-rand-hex-32' && NODE_ENV === 'production') {
  console.error('❌ JWT_SECRET no configurado en producción. Genera uno con: openssl rand -hex 32');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
  },
}));

/* ════════════════════════════════════════════════════════════════
   AUTH MIDDLEWARE
   ════════════════════════════════════════════════════════════════ */
function getToken(req) {
  if (req.cookies?.auth_token) return req.cookies.auth_token;
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Solo admin' });
  next();
}

/* ════════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════════ */
function tryRun(fn) {
  return (req, res) => {
    try { fn(req, res); }
    catch (err) {
      console.error('[error]', err);
      res.status(500).json({ error: err.message || 'Error interno' });
    }
  };
}

function asyncRun(fn) {
  return async (req, res) => {
    try { await fn(req, res); }
    catch (err) {
      console.error('[error]', err);
      res.status(500).json({ error: err.message || 'Error interno' });
    }
  };
}

/* ════════════════════════════════════════════════════════════════
   HEALTH
   ════════════════════════════════════════════════════════════════ */
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: '3.0.0', uptime: process.uptime() });
});

/* ════════════════════════════════════════════════════════════════
   AUTH
   ════════════════════════════════════════════════════════════════ */
app.post('/api/auth/login', tryRun((req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND activo = 1').get(username);
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

  res.json({
    ok: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      nombre: user.nombre,
      role: user.role,
    },
  });
}));

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('auth_token');
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, tryRun((req, res) => {
  const user = db.prepare(`
    SELECT id, username, nombre, role, activo, last_login_at FROM users WHERE id = ?
  `).get(req.user.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ user });
}));

/* ════════════════════════════════════════════════════════════════
   CRUD GENÉRICO — generador para tablas simples
   ════════════════════════════════════════════════════════════════ */
function makeCrud({ table, fields, searchable = [], orderBy = 'id', order = 'DESC' }) {
  /* GET / — list con búsqueda */
  app.get(`/api/${table}`, requireAuth, tryRun((req, res) => {
    const q = (req.query.q || '').trim();
    let sql = `SELECT * FROM ${table}`;
    const params = [];
    if (q && searchable.length) {
      const where = searchable.map((c) => `${c} LIKE ?`).join(' OR ');
      sql += ` WHERE ${where}`;
      searchable.forEach(() => params.push(`%${q}%`));
    }
    sql += ` ORDER BY ${orderBy} ${order} LIMIT 1000`;
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  }));

  /* GET /:id */
  app.get(`/api/${table}/:id`, requireAuth, tryRun((req, res) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  }));

  /* POST / */
  app.post(`/api/${table}`, requireAuth, tryRun((req, res) => {
    const data = pickFields(req.body, fields);
    const cols = Object.keys(data);
    if (!cols.length) return res.status(400).json({ error: 'Sin datos' });
    const placeholders = cols.map(() => '?').join(',');
    const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`;
    const result = db.prepare(sql).run(...Object.values(data));
    const inserted = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(result.lastInsertRowid);
    res.status(201).json(inserted);
  }));

  /* PUT /:id */
  app.put(`/api/${table}/:id`, requireAuth, tryRun((req, res) => {
    const data = pickFields(req.body, fields);
    const cols = Object.keys(data);
    if (!cols.length) return res.status(400).json({ error: 'Sin datos' });
    const sets = cols.map((c) => `${c} = ?`).join(',');
    const sql = `UPDATE ${table} SET ${sets} WHERE id = ?`;
    const result = db.prepare(sql).run(...Object.values(data), req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'No encontrado' });
    const updated = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    res.json(updated);
  }));

  /* DELETE /:id (admin only) */
  app.delete(`/api/${table}/:id`, requireAuth, requireAdmin, tryRun((req, res) => {
    const result = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'No encontrado' });
    res.status(204).end();
  }));
}

function pickFields(body, fields) {
  const out = {};
  for (const f of fields) {
    if (f in body) {
      let v = body[f];
      if (typeof v === 'string') v = v.trim();
      if (v === '') v = null;
      if (typeof v === 'boolean') v = v ? 1 : 0;
      out[f] = v;
    }
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════
   ENTIDADES SIMPLES
   ════════════════════════════════════════════════════════════════ */
makeCrud({
  table: 'clientes',
  fields: ['razon_social', 'rfc', 'contacto', 'email', 'telefono', 'ciudad', 'estado', 'notas', 'activo'],
  searchable: ['razon_social', 'rfc', 'contacto', 'ciudad'],
  orderBy: 'razon_social', order: 'ASC',
});

makeCrud({
  table: 'refacciones',
  fields: ['numero_parte', 'descripcion', 'categoria', 'marca', 'proveedor',
    'precio_compra_usd', 'precio_venta_usd', 'precio_venta_mxn',
    'stock', 'stock_minimo', 'ubicacion', 'notas', 'activo'],
  searchable: ['numero_parte', 'descripcion', 'marca', 'proveedor'],
  orderBy: 'descripcion', order: 'ASC',
});

makeCrud({
  table: 'maquinas',
  fields: ['modelo', 'numero_serie', 'categoria', 'cliente_id', 'cliente_nombre',
    'ubicacion', 'fecha_instalacion', 'notas', 'activo'],
  searchable: ['modelo', 'numero_serie', 'cliente_nombre'],
  orderBy: 'modelo', order: 'ASC',
});

/* ════════════════════════════════════════════════════════════════
   COTIZACIONES (custom — con items + cálculo + folio auto)
   ════════════════════════════════════════════════════════════════ */
function generarFolio() {
  const year = new Date().getFullYear();
  const last = db.prepare(`
    SELECT folio FROM cotizaciones WHERE folio LIKE ? ORDER BY id DESC LIMIT 1
  `).get(`COT-${year}-%`);
  const lastNum = last?.folio?.match(/-(\d+)$/)?.[1];
  const next = lastNum ? parseInt(lastNum, 10) + 1 : 1;
  return `COT-${year}-${String(next).padStart(4, '0')}`;
}

function calcTotales(items) {
  const subtotal = items.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0), 0);
  const iva = +(subtotal * 0.16).toFixed(2);
  const total = +(subtotal + iva).toFixed(2);
  return { subtotal: +subtotal.toFixed(2), iva, total };
}

app.get('/api/cotizaciones', requireAuth, tryRun((req, res) => {
  const q = (req.query.q || '').trim();
  let sql = 'SELECT * FROM cotizaciones';
  const params = [];
  if (q) {
    sql += ' WHERE folio LIKE ? OR cliente_nombre LIKE ?';
    params.push(`%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY id DESC LIMIT 1000';
  res.json(db.prepare(sql).all(...params));
}));

app.get('/api/cotizaciones/:id', requireAuth, tryRun((req, res) => {
  const cot = db.prepare('SELECT * FROM cotizaciones WHERE id = ?').get(req.params.id);
  if (!cot) return res.status(404).json({ error: 'No encontrada' });
  cot.items = db.prepare('SELECT * FROM cotizacion_items WHERE cotizacion_id = ? ORDER BY orden').all(req.params.id);
  res.json(cot);
}));

function withTransaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

app.post('/api/cotizaciones', requireAuth, tryRun((req, res) => {
  const b = req.body || {};
  const items = Array.isArray(b.items) ? b.items : [];
  const totales = calcTotales(items);
  const folio = b.folio || generarFolio();

  const id = withTransaction(() => {
    const result = db.prepare(`
      INSERT INTO cotizaciones
        (folio, cliente_id, cliente_nombre, fecha, moneda, tipo_cambio, subtotal, iva, total, estado, notas, creado_por_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      folio,
      b.cliente_id || null,
      b.cliente_nombre || '—',
      b.fecha || new Date().toISOString().slice(0, 10),
      b.moneda || 'MXN',
      Number(b.tipo_cambio) || 17,
      totales.subtotal, totales.iva, totales.total,
      b.estado || 'borrador',
      b.notas || null,
      req.user.userId,
    );
    const newId = Number(result.lastInsertRowid);
    const insertItem = db.prepare(`
      INSERT INTO cotizacion_items
        (cotizacion_id, descripcion, numero_parte, cantidad, precio_unitario, importe, orden)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    items.forEach((it, idx) => {
      const cant = Number(it.cantidad) || 0;
      const pu = Number(it.precio_unitario) || 0;
      insertItem.run(newId, it.descripcion || '—', it.numero_parte || null, cant, pu, +(cant * pu).toFixed(2), idx);
    });
    return newId;
  });

  const cot = db.prepare('SELECT * FROM cotizaciones WHERE id = ?').get(id);
  cot.items = db.prepare('SELECT * FROM cotizacion_items WHERE cotizacion_id = ?').all(id);
  res.status(201).json(cot);
}));

app.put('/api/cotizaciones/:id', requireAuth, tryRun((req, res) => {
  const id = req.params.id;
  const b = req.body || {};
  const items = Array.isArray(b.items) ? b.items : [];
  const totales = calcTotales(items);

  withTransaction(() => {
    const result = db.prepare(`
      UPDATE cotizaciones SET
        cliente_id = ?, cliente_nombre = ?, moneda = ?, tipo_cambio = ?,
        subtotal = ?, iva = ?, total = ?, estado = ?, notas = ?
      WHERE id = ?
    `).run(
      b.cliente_id || null, b.cliente_nombre || '—',
      b.moneda || 'MXN', Number(b.tipo_cambio) || 17,
      totales.subtotal, totales.iva, totales.total,
      b.estado || 'borrador', b.notas || null,
      id,
    );
    if (result.changes === 0) throw new Error('Cotización no encontrada');

    db.prepare('DELETE FROM cotizacion_items WHERE cotizacion_id = ?').run(id);
    const insert = db.prepare(`
      INSERT INTO cotizacion_items (cotizacion_id, descripcion, numero_parte, cantidad, precio_unitario, importe, orden)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    items.forEach((it, idx) => {
      const cant = Number(it.cantidad) || 0;
      const pu = Number(it.precio_unitario) || 0;
      insert.run(id, it.descripcion || '—', it.numero_parte || null, cant, pu, +(cant * pu).toFixed(2), idx);
    });
  });

  const cot = db.prepare('SELECT * FROM cotizaciones WHERE id = ?').get(id);
  cot.items = db.prepare('SELECT * FROM cotizacion_items WHERE cotizacion_id = ?').all(id);
  res.json(cot);
}));

app.delete('/api/cotizaciones/:id', requireAuth, requireAdmin, tryRun((req, res) => {
  const result = db.prepare('DELETE FROM cotizaciones WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'No encontrada' });
  res.status(204).end();
}));

/* ════════════════════════════════════════════════════════════════
   USUARIOS (admin only)
   ════════════════════════════════════════════════════════════════ */
app.get('/api/usuarios', requireAuth, requireAdmin, tryRun((_req, res) => {
  const rows = db.prepare(`
    SELECT id, username, nombre, role, activo, last_login_at, created_at
    FROM users ORDER BY username
  `).all();
  res.json(rows);
}));

app.post('/api/usuarios', requireAuth, requireAdmin, tryRun((req, res) => {
  const { username, password, nombre, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  if (password.length < 6) return res.status(400).json({ error: 'Contraseña mínimo 6 caracteres' });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare(`
      INSERT INTO users (username, password_hash, nombre, role, activo)
      VALUES (?, ?, ?, ?, 1)
    `).run(username, hash, nombre || null, role || 'usuario');
    const user = db.prepare('SELECT id, username, nombre, role, activo FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(user);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Usuario ya existe' });
    throw err;
  }
}));

app.put('/api/usuarios/:id', requireAuth, requireAdmin, tryRun((req, res) => {
  const { username, password, nombre, role, activo } = req.body || {};
  const sets = [];
  const params = [];
  if (username !== undefined) { sets.push('username = ?'); params.push(username); }
  if (nombre !== undefined) { sets.push('nombre = ?'); params.push(nombre || null); }
  if (role !== undefined) { sets.push('role = ?'); params.push(role); }
  if (activo !== undefined) { sets.push('activo = ?'); params.push(activo ? 1 : 0); }
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Contraseña mínimo 6 caracteres' });
    sets.push('password_hash = ?');
    params.push(bcrypt.hashSync(password, 10));
  }
  if (!sets.length) return res.status(400).json({ error: 'Sin cambios' });
  params.push(req.params.id);
  const result = db.prepare(`UPDATE users SET ${sets.join(',')} WHERE id = ?`).run(...params);
  if (result.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  const user = db.prepare('SELECT id, username, nombre, role, activo FROM users WHERE id = ?').get(req.params.id);
  res.json(user);
}));

app.delete('/api/usuarios/:id', requireAuth, requireAdmin, tryRun((req, res) => {
  if (Number(req.params.id) === req.user.userId) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.status(204).end();
}));

/* ════════════════════════════════════════════════════════════════
   DASHBOARD COUNTERS
   ════════════════════════════════════════════════════════════════ */
app.get('/api/dashboard', requireAuth, tryRun((_req, res) => {
  const counts = {
    clientes: db.prepare('SELECT COUNT(*) AS c FROM clientes').get().c,
    refacciones: db.prepare('SELECT COUNT(*) AS c FROM refacciones').get().c,
    maquinas: db.prepare('SELECT COUNT(*) AS c FROM maquinas').get().c,
    cotizaciones: db.prepare('SELECT COUNT(*) AS c FROM cotizaciones').get().c,
  };
  const cotPorEstado = db.prepare(`
    SELECT estado, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
    FROM cotizaciones GROUP BY estado
  `).all();
  const stockBajo = db.prepare(`
    SELECT id, numero_parte, descripcion, stock, stock_minimo
    FROM refacciones WHERE stock < stock_minimo AND activo = 1
    ORDER BY (stock_minimo - stock) DESC LIMIT 10
  `).all();
  res.json({ counts, cotPorEstado, stockBajo });
}));

/* ════════════════════════════════════════════════════════════════
   FALLBACK SPA (sirve index.html para cualquier ruta no /api)
   ════════════════════════════════════════════════════════════════ */
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: err.message || 'Error interno' });
});

app.listen(PORT, () => {
  console.log(`✅ Sistema Cotización v3 corriendo en http://localhost:${PORT}`);
  console.log(`   Login: http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
});
