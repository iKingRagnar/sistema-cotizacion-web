/**
 * Base de datos: Turso (nube) o SQLite local. 100% gratuito, sin Supabase.
 */
const path = require('path');
const fs = require('fs');

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;
const useTurso = !!(TURSO_URL && TURSO_TOKEN);

let db;

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
    return;
  }
  const sqlite3 = require('sqlite3').verbose();
  const dir = path.join(__dirname, 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new sqlite3.Database(path.join(dir, 'cotizacion.db'));
  for (const sql of getSchema()) {
    await new Promise((res, rej) => db.run(sql, err => (err ? rej(err) : res())));
  }
  try {
    await new Promise((res, rej) => db.run('ALTER TABLE incidentes ADD COLUMN fecha_cerrado TEXT', err => (err ? rej(err) : res())));
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

module.exports = { init, runQuery, getAll, getOne, useTurso };
