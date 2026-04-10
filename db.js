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
      modalidad TEXT DEFAULT 'local',
      monto_bono REAL DEFAULT 0,
      dias INTEGER DEFAULT 1,
      monto_total REAL DEFAULT 0,
      fecha TEXT DEFAULT (date('now','localtime')),
      mes TEXT,
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
      maquina TEXT,
      numero_serie TEXT,
      actividad TEXT,
      estado TEXT,
      fecha_inicio TEXT NOT NULL,
      fecha_fin TEXT NOT NULL,
      dias INTEGER DEFAULT 1,
      monto_viaticos REAL DEFAULT 0,
      descripcion TEXT,
      actividades TEXT,
      reporte_id INTEGER REFERENCES reportes(id),
      mes TEXT,
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
    /* REVISIÓN DE MÁQUINAS: preparación y entrega */
    `CREATE TABLE IF NOT EXISTS revision_maquinas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      maquina_id INTEGER REFERENCES maquinas(id),
      tipo_maquina TEXT,
      categoria TEXT,
      modelo TEXT,
      numero_serie TEXT,
      entregado TEXT DEFAULT 'No',
      prueba TEXT DEFAULT 'En Proceso',
      comentarios TEXT,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    /* TARIFAS: almacén de pares clave-valor para tarifas editables */
    `CREATE TABLE IF NOT EXISTS tarifas (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      actualizado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    /* PROSPECTOS: pipeline comercial (mapa + scoring) */
    `CREATE TABLE IF NOT EXISTS prospectos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa TEXT NOT NULL,
      zona TEXT,
      lat REAL,
      lng REAL,
      tipo_interes TEXT,
      industria TEXT,
      potencial_usd REAL DEFAULT 0,
      ultimo_contacto TEXT,
      score_ia REAL DEFAULT 0,
      estado TEXT DEFAULT 'nuevo',
      notas TEXT,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_prospectos_estado ON prospectos(estado)`,
    /* CATÁLOGOS: valores controlados por clave (rol, puesto, cotizacion_tipo, …) */
    `CREATE TABLE IF NOT EXISTS catalogos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clave TEXT NOT NULL,
      valor TEXT NOT NULL,
      activo INTEGER DEFAULT 1,
      orden INTEGER DEFAULT 0,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogos_clave_valor ON catalogos(clave, valor)`,
    `CREATE INDEX IF NOT EXISTS idx_catalogos_clave_activo ON catalogos(clave, activo)`,
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
    // maquinas: agregar categoria
    `ALTER TABLE maquinas ADD COLUMN categoria TEXT`,
    // reportes: nuevas columnas
    `ALTER TABLE reportes ADD COLUMN fecha_programada TEXT`,
    `ALTER TABLE reportes ADD COLUMN finalizado INTEGER DEFAULT 0`,
    `ALTER TABLE reportes ADD COLUMN archivo_firmado TEXT`,
    `ALTER TABLE reportes ADD COLUMN archivo_firmado_nombre TEXT`,
    // cotizaciones: vendedor para cotizaciones de máquina
    `ALTER TABLE cotizaciones ADD COLUMN vendedor TEXT`,
    `ALTER TABLE cotizaciones ADD COLUMN fecha_aprobacion TEXT`,
    // tecnicos: habilidades, disponibilidad
    `ALTER TABLE tecnicos ADD COLUMN habilidades TEXT`,
    `ALTER TABLE tecnicos ADD COLUMN ocupado INTEGER DEFAULT 0`,
    `ALTER TABLE tecnicos ADD COLUMN disponible_desde TEXT`,
    // cotizaciones_lineas: campos para vueltas y mano de obra
    `ALTER TABLE cotizacion_lineas ADD COLUMN es_ida INTEGER DEFAULT 0`,
    `ALTER TABLE cotizacion_lineas ADD COLUMN horas_trabajo REAL DEFAULT 0`,
    `ALTER TABLE cotizacion_lineas ADD COLUMN horas_traslado REAL DEFAULT 0`,
    `ALTER TABLE cotizacion_lineas ADD COLUMN zona TEXT`,
    `ALTER TABLE cotizacion_lineas ADD COLUMN ayudantes INTEGER DEFAULT 0`,
    `ALTER TABLE cotizacion_lineas ADD COLUMN tarifa_aplicada TEXT`,
    // reportes: eliminar tipo_maquina (ya no se usa)
    `ALTER TABLE reportes ADD COLUMN subtipo TEXT`,
    // garantias: quitar tipo_maquina, usar solo modelo_maquina
    `ALTER TABLE garantias ADD COLUMN maximo_mantenimientos INTEGER DEFAULT 0`,
    `ALTER TABLE garantias ADD COLUMN pagos_log TEXT DEFAULT '[]'`,
    // bitacoras: enlazar a reportes
    `ALTER TABLE bitacoras ADD COLUMN reporte_id INTEGER`,
    `ALTER TABLE bitacoras ADD COLUMN archivo_firmado TEXT`,
    `ALTER TABLE bitacoras ADD COLUMN archivo_firmado_nombre TEXT`,
    // maquinas: agregar categoria_principal para jerarquía
    `ALTER TABLE maquinas ADD COLUMN categoria_principal TEXT`,
    // refacciones: agregar numero_parte_manual si no existe
    `ALTER TABLE refacciones ADD COLUMN numero_parte_manual TEXT`,
    // máquinas: imágenes manual de partes / diagrama ensamble (PDF Universal) + stock almacén demo
    `ALTER TABLE maquinas ADD COLUMN imagen_pieza_url TEXT`,
    `ALTER TABLE maquinas ADD COLUMN imagen_ensamble_url TEXT`,
    `ALTER TABLE maquinas ADD COLUMN stock REAL DEFAULT 0`,
    /* Personal extendido + cotización vendedor/descuento + lista máquinas USD */
    `ALTER TABLE tecnicos ADD COLUMN rol TEXT`,
    `ALTER TABLE tecnicos ADD COLUMN puesto TEXT`,
    `ALTER TABLE tecnicos ADD COLUMN departamento TEXT`,
    `ALTER TABLE tecnicos ADD COLUMN profesion TEXT`,
    `ALTER TABLE tecnicos ADD COLUMN es_vendedor INTEGER DEFAULT 0`,
    `ALTER TABLE tecnicos ADD COLUMN comision_maquinas_pct REAL DEFAULT 0`,
    `ALTER TABLE tecnicos ADD COLUMN comision_refacciones_pct REAL DEFAULT 10`,
    `ALTER TABLE cotizaciones ADD COLUMN vendedor_personal_id INTEGER`,
    `ALTER TABLE cotizaciones ADD COLUMN descuento_pct REAL DEFAULT 0`,
    `ALTER TABLE maquinas ADD COLUMN precio_lista_usd REAL DEFAULT 0`,
  ];
  for (const sql of migrations) {
    try {
      if (useTurso) await db.execute(sql);
      else await new Promise((res) => db.run(sql, () => res()));
    } catch (_) { /* columna ya existe */ }
  }
}

function isVercelServerless() {
  const v = process.env.VERCEL;
  return v === '1' || v === 'true';
}

async function init() {
  if (isVercelServerless() && !useTurso) {
    throw new Error(
      'Vercel requiere TURSO_DATABASE_URL y TURSO_AUTH_TOKEN (Project → Settings → Environment Variables). SQLite en disco no funciona en serverless.'
    );
  }
  if (useTurso) {
    const { createClient } = require('@libsql/client');
    db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
    for (const sql of getSchema()) await db.execute(sql);
    await runMigrations();
    await seedCatalogosDefaults();
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
  await seedPersonalAndPricing();
  await seedCatalogosDefaults();
}

/** Valores iniciales y sincronía desde técnicos (evita escribir a mano fuera del catálogo). */
async function seedCatalogosDefaults() {
  try {
    const defaults = [
      ['rol', 'Vendedor'],
      ['rol', 'Técnico'],
      ['rol', 'Técnico senior'],
      ['rol', 'Coordinador'],
      ['rol', 'Líder comercial'],
      ['rol', 'Administración'],
      ['rol', 'Gerencia'],
      ['rol', 'Soporte técnico'],
      ['rol', 'Taller'],
      ['rol', 'Ejecutiva de ventas'],
      ['rol', 'Vendedor de campo'],
      ['puesto', 'Instrumentación'],
      ['puesto', 'Ejecutivo de cuenta'],
      ['puesto', 'Ejecutivo zona norte'],
      ['puesto', 'Coordinadora de servicio'],
      ['puesto', 'Técnico senior'],
      ['puesto', 'Jefe de Área'],
      ['puesto', 'Ejecutiva de refacciones'],
      ['departamento', 'Servicio'],
      ['departamento', 'Ventas'],
      ['departamento', 'Taller'],
      ['departamento', 'Administración'],
      ['departamento', 'Logística'],
      ['departamento', 'Calidad'],
      ['profesion', 'Ingeniero industrial'],
      ['profesion', 'Ingeniero mecatrónico'],
      ['profesion', 'Ingeniera mecatrónica'],
      ['profesion', 'Técnico mecánico'],
      ['profesion', 'Técnico electricista'],
      ['profesion', 'Mercadotecnia'],
      ['profesion', 'Licenciado'],
      ['profesion', 'Instrumentista'],
      ['cotizacion_tipo', 'refacciones'],
      ['cotizacion_tipo', 'mano_obra'],
      ['cotizacion_tipo', 'maquina'],
      ['cotizacion_tipo', 'mixta'],
      ['cotizacion_estado', 'borrador'],
      ['cotizacion_estado', 'pendiente_aprobacion'],
      ['cotizacion_estado', 'aplicada'],
      ['cotizacion_estado', 'cancelada'],
    ];
    for (const [clave, valor] of defaults) {
      await runQuery('INSERT OR IGNORE INTO catalogos (clave, valor) VALUES (?, ?)', [clave, valor]);
    }
    const cols = ['rol', 'puesto', 'departamento', 'profesion'];
    for (const col of cols) {
      const found = await getAll(
        `SELECT DISTINCT ${col} as v FROM tecnicos WHERE ${col} IS NOT NULL AND TRIM(${col}) != ''`
      );
      for (const row of found) {
        const v = String(row.v || '').trim();
        if (!v) continue;
        await runQuery('INSERT OR IGNORE INTO catalogos (clave, valor) VALUES (?, ?)', [col, v]);
      }
    }
  } catch (_) {
    /* tabla nueva o permisos */
  }
}

/** Datos demo: personal (vendedores + comisiones), precios USD en refacciones y lista en máquinas. */
async function seedPersonalAndPricing() {
  const david = await getOne("SELECT id, puesto FROM tecnicos WHERE nombre = 'David Cantú' LIMIT 1");
  const needsTeamSeed = !david || !String(david.puesto || '').trim();

  const team = [
    {
      nombre: 'David Cantú',
      rol: 'Líder comercial',
      puesto: 'Jefe de Área',
      departamento: 'Ventas',
      profesion: 'Ingeniero industrial',
      habilidades: 'Negociación B2B, equipos CNC, cuentas clave, postventa',
      es_vendedor: 1,
      comision_maquinas_pct: 10,
      comision_refacciones_pct: 10,
    },
    {
      nombre: 'Ana López Méndez',
      rol: 'Ejecutiva de ventas',
      puesto: 'Ejecutiva de cuenta',
      departamento: 'Ventas',
      profesion: 'Mercadotecnia',
      habilidades: 'Cotizaciones, refacciones, seguimiento CRM',
      es_vendedor: 1,
      comision_maquinas_pct: 0,
      comision_refacciones_pct: 10,
    },
    {
      nombre: 'Carlos Ruiz',
      rol: 'Vendedor de campo',
      puesto: 'Ejecutivo zona norte',
      departamento: 'Ventas',
      profesion: 'Técnico mecánico',
      habilidades: 'Diagnóstico, visitas, refacciones urgentes',
      es_vendedor: 1,
      comision_maquinas_pct: 0,
      comision_refacciones_pct: 10,
    },
    {
      nombre: 'María Fernández',
      rol: 'Soporte técnico',
      puesto: 'Coordinadora de servicio',
      departamento: 'Servicio',
      profesion: 'Ingeniera mecatrónica',
      habilidades: 'PLC, Fanuc, puesta en marcha',
      es_vendedor: 0,
      comision_maquinas_pct: 0,
      comision_refacciones_pct: 0,
    },
    {
      nombre: 'Luis Martínez',
      rol: 'Taller',
      puesto: 'Técnico senior',
      departamento: 'Taller',
      profesion: 'Técnico electricista',
      habilidades: 'Variadores, sensores, cableado',
      es_vendedor: 0,
      comision_maquinas_pct: 0,
      comision_refacciones_pct: 0,
    },
  ];
  if (needsTeamSeed) {
    for (const p of team) {
      try {
        await runQuery('INSERT OR IGNORE INTO tecnicos (nombre, activo) VALUES (?, 1)', [p.nombre]);
        await runQuery(
          `UPDATE tecnicos SET rol=?, puesto=?, departamento=?, profesion=?, habilidades=?, es_vendedor=?,
         comision_maquinas_pct=?, comision_refacciones_pct=? WHERE nombre=?`,
          [
            p.rol,
            p.puesto,
            p.departamento,
            p.profesion,
            p.habilidades,
            p.es_vendedor,
            p.comision_maquinas_pct,
            p.comision_refacciones_pct,
            p.nombre,
          ]
        );
      } catch (_) { /* ignore */ }
    }
  }
  try {
    await runQuery(
      `UPDATE refacciones SET precio_usd = ROUND(15.0 + (ABS(CAST(id AS INTEGER)) * 13 % 450) / 10.0, 2)
       WHERE COALESCE(precio_usd, 0) = 0`
    );
    await runQuery(
      `UPDATE refacciones SET precio_unitario = ROUND(precio_usd * 17.0, 2)
       WHERE COALESCE(precio_unitario, 0) = 0 AND COALESCE(precio_usd, 0) > 0`
    );
    await runQuery(
      `UPDATE maquinas SET precio_lista_usd = 18500 + (ABS(CAST(id AS INTEGER)) * 97 % 120000)
       WHERE COALESCE(precio_lista_usd, 0) = 0`
    );
  } catch (_) { /* ignore */ }
}

/** libSQL (@libsql/client) no acepta undefined ni NaN en args — solo null, number, string, bigint, boolean, Uint8Array */
function normalizeLibsqlArgs(params) {
  if (!Array.isArray(params) || params.length === 0) return params;
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'number' && (Number.isNaN(p) || !Number.isFinite(p))) return null;
    return p;
  });
}

function runQuery(sql, params = []) {
  if (useTurso) {
    const args = normalizeLibsqlArgs(params);
    return db.execute({ sql, args }).then(r => ({ lastInsertRowid: r.meta?.last_insert_row_id }));
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
    const args = normalizeLibsqlArgs(params);
    return db.execute({ sql, args }).then(r => {
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
