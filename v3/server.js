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

/* ════════════════════════════════════════════════════════════════
   AUTO-SEED — crea admin inicial si no existe ningún usuario.
   Permite arrancar el deploy sin necesidad de SSH/Shell.
   Configura ADMIN_USER y ADMIN_PASS por env vars.
   ════════════════════════════════════════════════════════════════ */
(function autoSeed() {
  try {
    const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    if (count > 0) return; // ya hay usuarios
    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPass = process.env.ADMIN_PASS || 'admin123';
    const hash = bcrypt.hashSync(adminPass, 10);
    db.prepare(`
      INSERT INTO users (username, password_hash, nombre, role, activo)
      VALUES (?, ?, 'Administrador', 'admin', 1)
    `).run(adminUser, hash);
    console.log(`✅ Admin auto-creado: ${adminUser} / ${adminPass} (cambia el password después).`);
  } catch (err) {
    console.error('[auto-seed] Error:', err.message);
  }
})();

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
/* ── MOBILE: siempre fresh, va ANTES de express.static ── */
const _pubDir = path.join(__dirname, 'public');
app.use((req, res, next) => {
  const mobileFiles = ['mobile.html', 'mobile-app.css', 'mobile-app.js'];
  const fname = req.path.replace(/^\//,'').split('?')[0];
  if (mobileFiles.includes(fname)) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    return res.sendFile(path.join(_pubDir, fname));
  }
  next();
});

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

makeCrud({
  table: 'ventas',
  fields: ['cotizacion_id', 'folio_factura', 'cliente_id', 'cliente_nombre',
    'fecha_venta', 'total', 'moneda', 'pagado', 'fecha_pago', 'notas'],
  searchable: ['cliente_nombre', 'folio_factura'],
  orderBy: 'fecha_venta', order: 'DESC',
});

makeCrud({
  table: 'categorias',
  fields: ['nombre', 'parent_id', 'tipo', 'orden'],
  searchable: ['nombre'],
  orderBy: 'orden', order: 'ASC',
});

makeCrud({
  table: 'prospectos',
  fields: ['empresa', 'contacto', 'email', 'telefono', 'industria', 'ciudad',
    'estado', 'potencial_usd', 'score_ia', 'notas',
    'ubicacion_lat', 'ubicacion_lng', 'ultimo_contacto'],
  searchable: ['empresa', 'contacto', 'industria', 'ciudad'],
  orderBy: 'score_ia', order: 'DESC',
});

makeCrud({
  table: 'personal',
  fields: ['nombre', 'rol', 'email', 'telefono', 'fecha_ingreso',
    'tarifa_hora_mxn', 'activo', 'notas'],
  searchable: ['nombre', 'email'],
  orderBy: 'nombre', order: 'ASC',
});

makeCrud({
  table: 'garantias',
  fields: ['cliente_id', 'razon_social', 'maquina_id', 'modelo_maquina',
    'numero_serie', 'fecha_inicio', 'fecha_fin', 'activa', 'notas'],
  searchable: ['razon_social', 'modelo_maquina', 'numero_serie'],
  orderBy: 'fecha_inicio', order: 'DESC',
});

makeCrud({
  table: 'mantenimientos',
  fields: ['garantia_id', 'razon_social', 'modelo_maquina', 'numero_serie',
    'numero', 'fecha_programada', 'fecha_realizado', 'realizado_por',
    'pagado', 'notas'],
  searchable: ['razon_social', 'modelo_maquina'],
  orderBy: 'fecha_programada', order: 'DESC',
});

makeCrud({
  table: 'revision_maquinas',
  fields: ['maquina_id', 'categoria', 'modelo', 'numero_serie',
    'entregado', 'prueba', 'comentarios'],
  searchable: ['modelo', 'numero_serie', 'comentarios'],
  orderBy: 'created_at', order: 'DESC',
});

makeCrud({
  table: 'sin_cobertura',
  fields: ['cliente_id', 'razon_social', 'maquina_modelo', 'motivo',
    'fecha_solicitud', 'estado', 'notas'],
  searchable: ['razon_social', 'maquina_modelo', 'motivo'],
  orderBy: 'fecha_solicitud', order: 'DESC',
});

makeCrud({
  table: 'bonos',
  fields: ['personal_id', 'nombre', 'concepto', 'monto', 'fecha', 'pagado', 'notas'],
  searchable: ['nombre', 'concepto'],
  orderBy: 'fecha', order: 'DESC',
});

makeCrud({
  table: 'viajes',
  fields: ['zona', 'destino', 'personas_count', 'dias_count', 'km',
    'total_viatico', 'total_km', 'total', 'fecha', 'notas'],
  searchable: ['destino'],
  orderBy: 'fecha', order: 'DESC',
});

makeCrud({
  table: 'bitacora_horas',
  fields: ['personal_id', 'fecha', 'hora_inicio', 'hora_fin', 'horas',
    'cliente', 'trabajo', 'notas'],
  searchable: ['cliente', 'trabajo'],
  orderBy: 'fecha', order: 'DESC',
});

/* Mantenimientos del mes (para vista calendario) */
app.get('/api/mantenimientos-mes/:ym', requireAuth, tryRun((req, res) => {
  const ym = req.params.ym; // YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(ym)) return res.status(400).json({ error: 'Formato YYYY-MM' });
  const rows = db.prepare(`
    SELECT * FROM mantenimientos
    WHERE substr(fecha_programada, 1, 7) = ?
    ORDER BY fecha_programada
  `).all(ym);
  res.json(rows);
}));

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
    prospectos: db.prepare('SELECT COUNT(*) AS c FROM prospectos').get().c,
    ventas: db.prepare('SELECT COUNT(*) AS c FROM ventas').get().c,
  };
  const cotPorEstado = db.prepare(`
    SELECT estado, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
    FROM cotizaciones GROUP BY estado
  `).all();
  const prospectosPorEstado = db.prepare(`
    SELECT estado, COUNT(*) AS count, COALESCE(SUM(potencial_usd), 0) AS potencial
    FROM prospectos GROUP BY estado
  `).all();
  const ventasMes = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
    FROM ventas WHERE fecha_venta >= date('now', '-30 days')
  `).get();
  const stockBajo = db.prepare(`
    SELECT id, numero_parte, descripcion, stock, stock_minimo
    FROM refacciones WHERE stock < stock_minimo AND activo = 1
    ORDER BY (stock_minimo - stock) DESC LIMIT 10
  `).all();
  res.json({ counts, cotPorEstado, prospectosPorEstado, ventasMes, stockBajo });
}));

/* ════════════════════════════════════════════════════════════════
   TARIFAS (key/value) — get all + bulk save
   ════════════════════════════════════════════════════════════════ */
app.get('/api/tarifas', requireAuth, tryRun((_req, res) => {
  res.json(db.prepare('SELECT * FROM tarifas ORDER BY categoria, key').all());
}));

app.put('/api/tarifas', requireAuth, requireAdmin, tryRun((req, res) => {
  const items = Array.isArray(req.body) ? req.body : [];
  const upsert = db.prepare(`
    INSERT INTO tarifas (key, value, categoria, notas, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      categoria = excluded.categoria,
      notas = excluded.notas,
      updated_at = CURRENT_TIMESTAMP
  `);
  withTransaction(() => {
    for (const it of items) {
      if (!it.key) continue;
      upsert.run(it.key, String(it.value ?? ''), it.categoria || 'general', it.notas || null);
    }
  });
  res.json({ ok: true, count: items.length });
}));

/* ════════════════════════════════════════════════════════════════
   AUDIT LOG (admin only, read)
   ════════════════════════════════════════════════════════════════ */
app.get('/api/audit', requireAuth, requireAdmin, tryRun((req, res) => {
  const limit = Math.min(500, parseInt(req.query.limit) || 200);
  const entity = req.query.entity;
  let sql = 'SELECT * FROM audit_log';
  const params = [];
  if (entity) { sql += ' WHERE entity = ?'; params.push(entity); }
  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);
  res.json(db.prepare(sql).all(...params));
}));

/* ════════════════════════════════════════════════════════════════
   REPORTES — export CSV de cualquier tabla
   ════════════════════════════════════════════════════════════════ */
const EXPORTABLE_TABLES = ['clientes', 'refacciones', 'maquinas', 'cotizaciones', 'ventas',
  'prospectos', 'personal', 'garantias', 'mantenimientos', 'bonos', 'viajes', 'bitacora_horas',
  'sin_cobertura', 'revision_maquinas'];

app.get('/api/export/:table', requireAuth, tryRun((req, res) => {
  const table = req.params.table;
  if (!EXPORTABLE_TABLES.includes(table)) return res.status(400).json({ error: 'Tabla no exportable' });
  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY id DESC LIMIT 5000`).all();
  if (!rows.length) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${table}.csv"`);
    return res.send('﻿');
  }
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${table}.csv"`);
  res.send('﻿' + csv);
}));

/* ════════════════════════════════════════════════════════════════
   DAVAI — chat con SSE streaming (Anthropic + OpenAI fallback)
   ════════════════════════════════════════════════════════════════ */
const SYSTEM_PROMPT = `Eres DavAI, asistente del Sistema de Servicio Técnico Industrial.
Ayuda al equipo con: prospección B2B en México, generación de mensajes comerciales
(email/WhatsApp/LinkedIn), análisis de pipeline, cotizaciones. Responde en español,
conciso y orientado a la acción.`;

app.post('/api/davai/chat', requireAuth, async (req, res) => {
  try {
    const { message, history } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message requerido' });
    }
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!ANTHROPIC_KEY && !OPENAI_KEY) {
      return res.status(503).json({
        error: 'DavAI no configurado',
        detail: 'Configura ANTHROPIC_API_KEY u OPENAI_API_KEY en variables de entorno.',
      });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    const hist = Array.isArray(history) ? history : [];

    if (ANTHROPIC_KEY) {
      const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': ANTHROPIC_KEY,
          'Anthropic-Version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          stream: true,
          messages: [...hist.filter((m) => m.role !== 'system'), { role: 'user', content: message }],
        }),
      });
      if (!apiRes.ok || !apiRes.body) {
        send({ error: `Anthropic ${apiRes.status}` });
        res.write('data: [DONE]\n\n');
        return res.end();
      }
      const reader = apiRes.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;
          try {
            const p = JSON.parse(raw);
            if (p.delta?.text) send({ text: p.delta.text });
          } catch {}
        }
      }
    } else {
      const apiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          stream: true,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...hist,
            { role: 'user', content: message },
          ],
        }),
      });
      if (!apiRes.ok || !apiRes.body) {
        send({ error: `OpenAI ${apiRes.status}` });
        res.write('data: [DONE]\n\n');
        return res.end();
      }
      const reader = apiRes.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;
          try {
            const p = JSON.parse(raw);
            const t = p.choices?.[0]?.delta?.content;
            if (t) send({ text: t });
          } catch {}
        }
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('[davai]', err);
    try { res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`); res.end(); } catch {}
  }
});

/* ── MOBILE: rutas con no-cache (antes del fallback SPA) ── */
const _pub = path.join(__dirname, 'public');
[
  ['/mobile.html',       'mobile.html'],
  ['/mobile-app.css',    'mobile-app.css'],
  ['/mobile-app.js',     'mobile-app.js'],
].forEach(([route, file]) => {
  app.get(route, (_req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(_pub, file));
  });
});

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
