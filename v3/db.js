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

  CREATE TABLE IF NOT EXISTS ventas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cotizacion_id INTEGER REFERENCES cotizaciones(id) ON DELETE SET NULL,
    folio_factura TEXT,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    cliente_nombre TEXT NOT NULL,
    fecha_venta TEXT NOT NULL DEFAULT CURRENT_DATE,
    total REAL NOT NULL DEFAULT 0,
    moneda TEXT DEFAULT 'MXN',
    pagado INTEGER NOT NULL DEFAULT 0,
    fecha_pago TEXT,
    notas TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha_venta);

  CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    parent_id INTEGER,
    tipo TEXT NOT NULL DEFAULT 'refaccion' CHECK (tipo IN ('refaccion','maquina')),
    orden INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS prospectos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa TEXT NOT NULL,
    contacto TEXT,
    email TEXT,
    telefono TEXT,
    industria TEXT,
    ciudad TEXT,
    estado TEXT NOT NULL DEFAULT 'prospecto'
      CHECK (estado IN ('prospecto','contactado','calificado','propuesta','negociacion','ganado','perdido')),
    potencial_usd REAL DEFAULT 0,
    score_ia INTEGER DEFAULT 50,
    notas TEXT,
    ubicacion_lat REAL,
    ubicacion_lng REAL,
    ultimo_contacto TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_prospectos_estado ON prospectos(estado);

  CREATE TABLE IF NOT EXISTS personal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'mecanico'
      CHECK (rol IN ('mecanico','electronico','cnc','ayudante','admin','otro')),
    email TEXT,
    telefono TEXT,
    fecha_ingreso TEXT,
    tarifa_hora_mxn REAL,
    activo INTEGER NOT NULL DEFAULT 1,
    notas TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS garantias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    razon_social TEXT NOT NULL,
    maquina_id INTEGER REFERENCES maquinas(id) ON DELETE SET NULL,
    modelo_maquina TEXT NOT NULL,
    numero_serie TEXT,
    fecha_inicio TEXT NOT NULL,
    fecha_fin TEXT,
    activa INTEGER NOT NULL DEFAULT 1,
    notas TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS mantenimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    garantia_id INTEGER REFERENCES garantias(id) ON DELETE CASCADE,
    razon_social TEXT,
    modelo_maquina TEXT,
    numero_serie TEXT,
    numero INTEGER NOT NULL DEFAULT 1,
    fecha_programada TEXT NOT NULL,
    fecha_realizado TEXT,
    realizado_por TEXT,
    pagado REAL DEFAULT 0,
    notas TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_mant_fecha ON mantenimientos(fecha_programada);

  CREATE TABLE IF NOT EXISTS revision_maquinas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    maquina_id INTEGER REFERENCES maquinas(id) ON DELETE SET NULL,
    categoria TEXT,
    modelo TEXT,
    numero_serie TEXT,
    entregado TEXT NOT NULL DEFAULT 'No' CHECK (entregado IN ('Si','No')),
    prueba TEXT NOT NULL DEFAULT 'En Proceso' CHECK (prueba IN ('En Proceso','Finalizada')),
    comentarios TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sin_cobertura (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    razon_social TEXT NOT NULL,
    maquina_modelo TEXT,
    motivo TEXT,
    fecha_solicitud TEXT NOT NULL DEFAULT CURRENT_DATE,
    estado TEXT NOT NULL DEFAULT 'pendiente'
      CHECK (estado IN ('pendiente','cotizado','aprobado','rechazado')),
    notas TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bonos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id INTEGER REFERENCES personal(id) ON DELETE SET NULL,
    nombre TEXT NOT NULL,
    concepto TEXT NOT NULL,
    monto REAL NOT NULL DEFAULT 0,
    fecha TEXT NOT NULL DEFAULT CURRENT_DATE,
    pagado INTEGER NOT NULL DEFAULT 0,
    notas TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS viajes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zona TEXT NOT NULL CHECK (zona IN ('A','B','C')),
    destino TEXT NOT NULL,
    personas_count INTEGER DEFAULT 1,
    dias_count INTEGER DEFAULT 1,
    km REAL,
    total_viatico REAL DEFAULT 0,
    total_km REAL DEFAULT 0,
    total REAL DEFAULT 0,
    fecha TEXT NOT NULL DEFAULT CURRENT_DATE,
    notas TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bitacora_horas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id INTEGER REFERENCES personal(id) ON DELETE CASCADE,
    fecha TEXT NOT NULL,
    hora_inicio TEXT,
    hora_fin TEXT,
    horas REAL DEFAULT 0,
    cliente TEXT,
    trabajo TEXT,
    notas TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_bit_fecha ON bitacora_horas(fecha);

  CREATE TABLE IF NOT EXISTS tarifas (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    categoria TEXT DEFAULT 'general',
    notas TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username TEXT,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    details TEXT,
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);
  CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(timestamp);
`);

module.exports = db;
