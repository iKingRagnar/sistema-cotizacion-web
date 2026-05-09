/**
 * DB SQLite usando node:sqlite (built-in en Node 22+).
 * NO requiere compilación nativa, NO requiere Visual Studio en Windows.
 * Archivo: ./data/app.db
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

/* ──────────────── SCHEMA ──────────────── */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    nombre TEXT,
    role TEXT NOT NULL DEFAULT 'usuario' CHECK (role IN ('admin','usuario','consulta')),
    activo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    razon_social TEXT NOT NULL,
    rfc TEXT,
    contacto TEXT,
    email TEXT,
    telefono TEXT,
    ciudad TEXT,
    estado TEXT,
    notas TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_clientes_razon ON clientes(razon_social);

  CREATE TABLE IF NOT EXISTS refacciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_parte TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    categoria TEXT,
    marca TEXT,
    proveedor TEXT,
    precio_compra_usd REAL DEFAULT 0,
    precio_venta_usd REAL DEFAULT 0,
    precio_venta_mxn REAL DEFAULT 0,
    stock INTEGER DEFAULT 0,
    stock_minimo INTEGER DEFAULT 0,
    ubicacion TEXT,
    notas TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_refacciones_numero ON refacciones(numero_parte);
  CREATE INDEX IF NOT EXISTS idx_refacciones_desc ON refacciones(descripcion);

  CREATE TABLE IF NOT EXISTS maquinas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    modelo TEXT NOT NULL,
    numero_serie TEXT,
    categoria TEXT,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    cliente_nombre TEXT,
    ubicacion TEXT,
    fecha_instalacion TEXT,
    notas TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_maquinas_modelo ON maquinas(modelo);

  CREATE TABLE IF NOT EXISTS cotizaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    folio TEXT NOT NULL UNIQUE,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    cliente_nombre TEXT NOT NULL,
    fecha TEXT NOT NULL DEFAULT CURRENT_DATE,
    moneda TEXT NOT NULL DEFAULT 'MXN' CHECK (moneda IN ('MXN','USD')),
    tipo_cambio REAL DEFAULT 17,
    subtotal REAL DEFAULT 0,
    iva REAL DEFAULT 0,
    total REAL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'borrador'
      CHECK (estado IN ('borrador','enviada','aprobada','rechazada','facturada')),
    notas TEXT,
    creado_por_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_cot_fecha ON cotizaciones(fecha);

  CREATE TABLE IF NOT EXISTS cotizacion_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cotizacion_id INTEGER NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
    descripcion TEXT NOT NULL,
    numero_parte TEXT,
    cantidad REAL NOT NULL DEFAULT 1,
    precio_unitario REAL NOT NULL DEFAULT 0,
    importe REAL NOT NULL DEFAULT 0,
    orden INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_cotitems_cot ON cotizacion_items(cotizacion_id);
`);

module.exports = db;
