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
    /* Refacciones: zona=estante/rack, stock=cantidad actual, stock_minimo=alerta,
       categoria/subcategoria para árbol, imagen_url + manual_url para visor,
       costo_usd para precio en dólares */
    `CREATE TABLE IF NOT EXISTS refacciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      descripcion TEXT NOT NULL,
      zona TEXT,
      stock REAL NOT NULL DEFAULT 0,
      stock_minimo REAL DEFAULT 1,
      precio_unitario REAL NOT NULL DEFAULT 0,
      precio_usd REAL DEFAULT 0,
      unidad TEXT DEFAULT 'PZA',
      categoria TEXT,
      subcategoria TEXT,
      imagen_url TEXT,
      manual_url TEXT,
      numero_parte_manual TEXT,
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
    /* Cotizaciones: tipo_cambio manual, moneda (MXN/USD), estado (borrador/aplicada/cancelada),
       maquinas_ids = JSON array de ids */
    `CREATE TABLE IF NOT EXISTS cotizaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folio TEXT UNIQUE,
      cliente_id INTEGER NOT NULL REFERENCES clientes(id),
      tipo TEXT NOT NULL,
      fecha TEXT NOT NULL DEFAULT (date('now','localtime')),
      subtotal REAL DEFAULT 0,
      iva REAL DEFAULT 0,
      total REAL DEFAULT 0,
      tipo_cambio REAL DEFAULT 17.0,
      moneda TEXT DEFAULT 'MXN',
      maquinas_ids TEXT DEFAULT '[]',
      estado TEXT DEFAULT 'borrador',
      notas TEXT,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    /* cotizacion_lineas: tipo_linea = refaccion | vuelta | mano_obra | otro
       precio_usd = precio en dólares, precio_unitario = en moneda cotizacion */
    `CREATE TABLE IF NOT EXISTS cotizacion_lineas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cotizacion_id INTEGER NOT NULL REFERENCES cotizaciones(id),
      refaccion_id INTEGER,
      maquina_id INTEGER,
      bitacora_id INTEGER,
      tipo_linea TEXT DEFAULT 'refaccion',
      descripcion TEXT,
      cantidad REAL NOT NULL DEFAULT 1,
      precio_unitario REAL NOT NULL DEFAULT 0,
      precio_usd REAL DEFAULT 0,
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
    /* REPORTES: tipo_reporte = servicio | venta
       subtipo = falla_electrica | falla_mecanica | falla_electronica | instalacion | capacitacion | garantia */
    `CREATE TABLE IF NOT EXISTS reportes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folio TEXT UNIQUE,
      cliente_id INTEGER REFERENCES clientes(id),
      razon_social TEXT,
      maquina_id INTEGER REFERENCES maquinas(id),
      numero_maquina TEXT,
      tipo_reporte TEXT NOT NULL DEFAULT 'servicio',
      subtipo TEXT,
      descripcion TEXT,
      tecnico TEXT,
      fecha TEXT NOT NULL DEFAULT (date('now','localtime')),
      estatus TEXT DEFAULT 'abierto',
      notas TEXT,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    /* GARANTÍAS: cada máquina vendida con garantía, 2 mantenimientos/año automáticos */
    `CREATE TABLE IF NOT EXISTS garantias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER REFERENCES clientes(id),
      razon_social TEXT NOT NULL,
      modelo_maquina TEXT NOT NULL,
      numero_serie TEXT,
      tipo_maquina TEXT,
      fecha_entrega TEXT NOT NULL,
      activa INTEGER DEFAULT 1,
      alertas_log TEXT DEFAULT '[]',
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    /* MANTENIMIENTOS DE GARANTÍA: 2 por año, calculados automáticamente */
    `CREATE TABLE IF NOT EXISTS mantenimientos_garantia (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      garantia_id INTEGER NOT NULL REFERENCES garantias(id),
      numero INTEGER NOT NULL,
      anio INTEGER NOT NULL,
      fecha_programada TEXT,
      fecha_realizada TEXT,
      costo REAL DEFAULT 0,
      confirmado INTEGER DEFAULT 0,
      alerta_enviada INTEGER DEFAULT 0,
      alerta_vencida INTEGER DEFAULT 0,
      pagado REAL DEFAULT 0,
      notas TEXT,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    /* BONOS: vinculados a reportes (capacitaciones principalmente) */
    `CREATE TABLE IF NOT EXISTS bonos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporte_id INTEGER REFERENCES reportes(id),
      tecnico TEXT NOT NULL,
      tipo_capacitacion TEXT,
      monto_bono REAL DEFAULT 0,
      fecha TEXT DEFAULT (date('now','localtime')),
      pagado INTEGER DEFAULT 0,
      notas TEXT,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    /* VIAJES: 1000 MXN diarios de viáticos */
    `CREATE TABLE IF NOT EXISTS viajes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tecnico TEXT NOT NULL,
      cliente_id INTEGER REFERENCES clientes(id),
      razon_social TEXT,
      fecha_inicio TEXT NOT NULL,
      fecha_fin TEXT NOT NULL,
      dias INTEGER DEFAULT 1,
      monto_viaticos REAL DEFAULT 0,
      descripcion TEXT,
      actividades TEXT,
      reporte_id INTEGER REFERENCES reportes(id),
      mes_liquidacion TEXT,
      liquidado INTEGER DEFAULT 0,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    /* MOVIMIENTOS DE STOCK (FIFO): entrada/salida por cotización */
    `CREATE TABLE IF NOT EXISTS movimientos_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      refaccion_id INTEGER NOT NULL REFERENCES refacciones(id),
      tipo TEXT NOT NULL,
      cantidad REAL NOT NULL,
      costo_unitario REAL DEFAULT 0,
      cotizacion_id INTEGER REFERENCES cotizaciones(id),
      referencia TEXT,
      fecha TEXT DEFAULT (date('now','localtime')),
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_audit_creado ON audit_log(creado_en DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(nombre)`,
    `CREATE INDEX IF NOT EXISTS idx_refacciones_codigo ON refacciones(codigo)`,
    `CREATE INDEX IF NOT EXISTS idx_maquinas_cliente ON maquinas(cliente_id)`,
    `CREATE INDEX IF NOT EXISTS idx_reportes_cliente ON reportes(cliente_id)`,
    `CREATE INDEX IF NOT EXISTS idx_garantias_cliente ON garantias(cliente_id)`,
    `CREATE INDEX IF NOT EXISTS idx_movimientos_ref ON movimientos_stock(refaccion_id)`,
  ];
}

/* Migraciones seguras (ALTER TABLE) para columnas que pueden no existir en BD antiguas */
async function runMigrations() {
  const migrations = [
    // refacciones: nuevas columnas
    `ALTER TABLE refacciones ADD COLUMN zona TEXT`,
    `ALTER TABLE refacciones ADD COLUMN stock REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE refacciones ADD COLUMN stock_minimo REAL DEFAULT 1`,
    `ALTER TABLE refacciones ADD COLUMN precio_usd REAL DEFAULT 0`,
    `ALTER TABLE refacciones ADD COLUMN categoria TEXT`,
    `ALTER TABLE refacciones ADD COLUMN subcategoria TEXT`,
    `ALTER TABLE refacciones ADD COLUMN imagen_url TEXT`,
    `ALTER TABLE refacciones ADD COLUMN manual_url TEXT`,
    `ALTER TABLE refacciones ADD COLUMN numero_parte_manual TEXT`,
    // cotizaciones: nuevas columnas
    `ALTER TABLE cotizaciones ADD COLUMN tipo_cambio REAL DEFAULT 17.0`,
    `ALTER TABLE cotizaciones ADD COLUMN moneda TEXT DEFAULT 'MXN'`,
    `ALTER TABLE cotizaciones ADD COLUMN maquinas_ids TEXT DEFAULT '[]'`,
    `ALTER TABLE cotizaciones ADD COLUMN estado TEXT DEFAULT 'borrador'`,
    `ALTER TABLE cotizaciones ADD COLUMN notas TEXT`,
    // cotizacion_lineas: nuevas columnas
    `ALTER TABLE cotizacion_lineas ADD COLUMN maquina_id INTEGER`,
    `ALTER TABLE cotizacion_lineas ADD COLUMN bitacora_id INTEGER`,
    `ALTER TABLE cotizacion_lineas ADD COLUMN tipo_linea TEXT DEFAULT 'refaccion'`,
    `ALTER TABLE cotizacion_lineas ADD COLUMN precio_usd REAL DEFAULT 0`,
    // incidentes: columnas que ya tenía
    `ALTER TABLE incidentes ADD COLUMN fecha_cerrado TEXT`,
    `ALTER TABLE incidentes ADD COLUMN fecha_vencimiento TEXT`,
  ];
  for (const sql of migrations) {
    try {
      if (useTurso) await db.execute(sql);
      else await new Promise((res) => db.run(sql, () => res()));
    } catch (_) { /* columna ya existe */ }
  }
}

async function init() {
  if (useTurso) {
    const { createClient } = require('@libsql/client');
    db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
    for (const sql of getSchema()) await db.execute(sql);
    await runMigrations();
    return;
  }
  const sqlite3 = require('sqlite3').verbose();
  const defaultDbPath = path.join(os.homedir(), '.microsip-api', 'cotizacion.db');
  const legacyDbPath = path.join(__dirname, 'data', 'cotizacion.db');
  const resolvedDbPath = SQLITE_DB_PATH
    ? (path.isAbsolute(SQLITE_DB_PATH) ? SQLITE_DB_PATH : path.join(__dirname, SQLITE_DB_PATH))
    : defaultDbPath;
  const dir = path.dirname(resolvedDbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(resolvedDbPath) && fs.existsSync(legacyDbPath) && resolvedDbPath !== legacyDbPath) {
    try {
      fs.copyFileSync(legacyDbPath, resolvedDbPath);
      if (fs.existsSync(legacyDbPath + '-wal')) fs.copyFileSync(legacyDbPath + '-wal', resolvedDbPath + '-wal');
      if (fs.existsSync(legacyDbPath + '-shm')) fs.copyFileSync(legacyDbPath + '-shm', resolvedDbPath + '-shm');
    } catch (_) {}
  }
  db = new sqlite3.Database(resolvedDbPath);
  sqliteResolvedPath = resolvedDbPath;
  await new Promise((res, rej) => db.run('PRAGMA journal_mode = WAL', err => (err ? rej(err) : res())));
  await new Promise((res, rej) => db.run('PRAGMA synchronous = NORMAL', err => (err ? rej(err) : res())));
  for (const sql of getSchema()) {
    await new Promise((res, rej) => db.run(sql, err => (err ? rej(err) : res())));
  }
  await runMigrations();
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
