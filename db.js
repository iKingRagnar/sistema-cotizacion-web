/**
 * Base de datos: Turso (nube) o SQLite local. 100% gratuito, sin Supabase.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;
const useTurso = !!(TURSO_URL && TURSO_TOKEN);
const SQLITE_DB_PATH = (process.env.SQLITE_DB_PATH || '').trim();

let db;
let sqliteResolvedPath = '';

function getSchema() {
  return [
    `CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE,
      nombre TEXT NOT NULL,
      rfc TEXT,
      contacto TEXT,
      direccion TEXT,
      telefono TEXT,
      email TEXT,
      ciudad TEXT,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS refacciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      descripcion TEXT NOT NULL,
      marca TEXT,
      origen TEXT,
      precio_unitario REAL NOT NULL DEFAULT 0,
      unidad TEXT DEFAULT 'PZA',
      activo INTEGER DEFAULT 1,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS maquinas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL REFERENCES clientes(id),
      codigo TEXT,
      nombre TEXT NOT NULL,
      marca TEXT,
      modelo TEXT,
      numero_serie TEXT,
      ubicacion TEXT,
      activo INTEGER DEFAULT 1,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS cotizaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folio TEXT UNIQUE,
      cliente_id INTEGER NOT NULL REFERENCES clientes(id),
      tipo TEXT NOT NULL,
      fecha TEXT NOT NULL DEFAULT (date('now','localtime')),
      subtotal REAL DEFAULT 0,
      iva REAL DEFAULT 0,
      total REAL DEFAULT 0,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS cotizacion_lineas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cotizacion_id INTEGER NOT NULL REFERENCES cotizaciones(id),
      refaccion_id INTEGER,
      descripcion TEXT,
      cantidad REAL NOT NULL DEFAULT 1,
      precio_unitario REAL NOT NULL DEFAULT 0,
      subtotal REAL DEFAULT 0,
      iva REAL DEFAULT 0,
      total REAL DEFAULT 0,
      orden INTEGER DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS incidentes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folio TEXT,
      cliente_id INTEGER NOT NULL REFERENCES clientes(id),
      maquina_id INTEGER,
      descripcion TEXT NOT NULL,
      prioridad TEXT,
      fecha_reporte TEXT NOT NULL DEFAULT (date('now','localtime')),
      fecha_cerrado TEXT,
      fecha_vencimiento TEXT,
      tecnico_responsable TEXT,
      estatus TEXT DEFAULT 'abierto',
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS bitacoras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incidente_id INTEGER,
      cotizacion_id INTEGER,
      fecha TEXT NOT NULL,
      tecnico TEXT,
      actividades TEXT,
      tiempo_horas REAL DEFAULT 0,
      materiales_usados TEXT,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS mantenimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      maquina_id INTEGER NOT NULL REFERENCES maquinas(id),
      tipo TEXT NOT NULL,
      fecha_inicio TEXT,
      fecha_fin TEXT,
      descripcion_falla TEXT,
      tecnico TEXT,
      horas_invertidas REAL DEFAULT 0,
      costo_total REAL DEFAULT 0,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS tecnicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT UNIQUE NOT NULL,
      activo INTEGER DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS app_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operador',
      display_name TEXT,
      activo INTEGER DEFAULT 1,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      role TEXT,
      action TEXT NOT NULL,
      method TEXT,
      path TEXT,
      detail TEXT,
      ip TEXT,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_audit_creado ON audit_log(creado_en DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(nombre)`,
    `CREATE INDEX IF NOT EXISTS idx_refacciones_codigo ON refacciones(codigo)`,
    `CREATE INDEX IF NOT EXISTS idx_maquinas_cliente ON maquinas(cliente_id)`,
  ];
}

async function init() {
  if (useTurso) {
    const { createClient } = require('@libsql/client');
    db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
    for (const sql of getSchema()) await db.execute(sql);
    try { await db.execute('ALTER TABLE incidentes ADD COLUMN fecha_cerrado TEXT'); } catch (_) { /* columna ya existe */ }
    try { await db.execute('ALTER TABLE incidentes ADD COLUMN fecha_vencimiento TEXT'); } catch (_) { /* columna ya existe */ }
    return;
  }
  const sqlite3 = require('sqlite3').verbose();
  // Ruta por defecto fuera del proyecto para evitar reinicios por reemplazar carpetas o redeploy local.
  const defaultDbPath = path.join(os.homedir(), '.microsip-api', 'cotizacion.db');
  const legacyDbPath = path.join(__dirname, 'data', 'cotizacion.db');
  const resolvedDbPath = SQLITE_DB_PATH
    ? (path.isAbsolute(SQLITE_DB_PATH) ? SQLITE_DB_PATH : path.join(__dirname, SQLITE_DB_PATH))
    : defaultDbPath;
  const dir = path.dirname(resolvedDbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // Migración automática: si la nueva ruta aún no existe y hay BD en la ruta antigua, copiarla.
  if (!fs.existsSync(resolvedDbPath) && fs.existsSync(legacyDbPath) && resolvedDbPath !== legacyDbPath) {
    try {
      fs.copyFileSync(legacyDbPath, resolvedDbPath);
      if (fs.existsSync(legacyDbPath + '-wal')) fs.copyFileSync(legacyDbPath + '-wal', resolvedDbPath + '-wal');
      if (fs.existsSync(legacyDbPath + '-shm')) fs.copyFileSync(legacyDbPath + '-shm', resolvedDbPath + '-shm');
    } catch (_) { /* si falla la copia, continúa y crea nueva BD */ }
  }
  db = new sqlite3.Database(resolvedDbPath);
  sqliteResolvedPath = resolvedDbPath;
  // Modo recomendado para reducir bloqueos y mejorar durabilidad entre cierres/reinicios.
  await new Promise((res, rej) => db.run('PRAGMA journal_mode = WAL', err => (err ? rej(err) : res())));
  await new Promise((res, rej) => db.run('PRAGMA synchronous = NORMAL', err => (err ? rej(err) : res())));
  for (const sql of getSchema()) {
    await new Promise((res, rej) => db.run(sql, err => (err ? rej(err) : res())));
  }
  try {
    await new Promise((res, rej) => db.run('ALTER TABLE incidentes ADD COLUMN fecha_cerrado TEXT', err => (err ? rej(err) : res())));
  } catch (_) { /* columna ya existe */ }
  try {
    await new Promise((res, rej) => db.run('ALTER TABLE incidentes ADD COLUMN fecha_vencimiento TEXT', err => (err ? rej(err) : res())));
  } catch (_) { /* columna ya existe */ }
  const rows = await getAll("SELECT COUNT(*) as c FROM tecnicos");
  if (rows[0] && rows[0].c === 0) {
    await runQuery("INSERT INTO tecnicos (nombre) VALUES ('Juan Pérez'), ('María García'), ('Carlos López')");
  }
}

function runQuery(sql, params = []) {
  if (useTurso) {
    return db.execute({ sql, args: params }).then(r => ({ lastInsertRowid: r.meta?.last_insert_row_id }));
  }
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastInsertRowid: this.lastID });
    });
  });
}

function getAll(sql, params = []) {
  if (useTurso) {
    return db.execute({ sql, args: params }).then(r => {
      const cols = r.columns || [];
      return (r.rows || []).map(row => {
        const o = {};
        cols.forEach((c, i) => (o[c] = row[i]));
        return o;
      });
    });
  }
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function getOne(sql, params = []) {
  return getAll(sql, params).then(rows => (rows && rows[0]) || null);
}

function getStorageInfo() {
  if (useTurso) return { mode: 'turso', path: null };
  return { mode: 'sqlite', path: sqliteResolvedPath || null };
}

module.exports = { init, runQuery, getAll, getOne, useTurso, getStorageInfo };
