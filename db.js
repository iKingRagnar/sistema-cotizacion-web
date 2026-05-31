/**
 * Base de datos: Postgres (Supabase) > Turso (nube) > SQLite local.
 * Detección automática por env vars:
 *  - SUPABASE_POSTGRES_URL → usePostgres
 *  - TURSO_DATABASE_URL + TURSO_AUTH_TOKEN → useTurso
 *  - default → SQLite local
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;
const PG_URL = (process.env.SUPABASE_POSTGRES_URL || process.env.DATABASE_URL || '').trim();
const usePostgres = /^postgres(ql)?:\/\//i.test(PG_URL);
const useTurso = !usePostgres && !!(TURSO_URL && TURSO_TOKEN);
const SQLITE_DB_PATH = (process.env.SQLITE_DB_PATH || '').trim();

let db;
let pgPool = null;
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
      constancia_url TEXT,
      constancia_nombre TEXT,
      constancia_thumb_url TEXT,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    /* Refacciones: zona=estante/rack, stock=cantidad actual, stock_minimo=alerta,
       categoria/subcategoria para árbol, imagen_url + manual_url para visor,
       costo_usd para precio en dólares */
    `CREATE TABLE IF NOT EXISTS refacciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE,
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
      tab_permissions TEXT,
      column_permissions TEXT,
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
    /* Catálogo global: categorías y subcategorías (admin) */
    `CREATE TABLE IF NOT EXISTS catalogo_categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      orden INTEGER DEFAULT 0,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS catalogo_subcategorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      categoria_id INTEGER NOT NULL REFERENCES catalogo_categorias(id) ON DELETE CASCADE,
      nombre TEXT NOT NULL,
      orden INTEGER DEFAULT 0,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogo_sub_nombre ON catalogo_subcategorias(categoria_id, nombre)`,
    /* EMBARQUES: máquinas en tránsito al almacén / sucursal.
       Estados: 'en_camino' | 'llegado' | 'cancelado'. Soft delete con activo=0. */
    `CREATE TABLE IF NOT EXISTS embarques (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_maquina TEXT NOT NULL,
      numero_serie TEXT,
      proveedor TEXT,
      origen TEXT,
      destino_sucursal TEXT,
      eta_fecha TEXT,
      estado TEXT DEFAULT 'en_camino',
      notas TEXT,
      activo INTEGER DEFAULT 1,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_embarques_estado ON embarques(estado)`,
    /* BONOS_MOVIMIENTOS: log granular de comisiones y bonos por técnico/vendedor.
       tipo: comision_refacciones|comision_servicios|comision_maquinas|bono_20k|
             bono_capacitacion_local|bono_capacitacion_linea|bono_capacitacion_foranea|
             bono_dia_fuera_ciudad
       mes_clave = 'YYYY-MM' (filtros rápidos por mes). */
    `CREATE TABLE IF NOT EXISTS bonos_movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tecnico TEXT NOT NULL,
      tipo TEXT NOT NULL,
      monto REAL NOT NULL DEFAULT 0,
      referencia_tipo TEXT,
      referencia_id INTEGER,
      descripcion TEXT,
      fecha TEXT DEFAULT (date('now','localtime')),
      mes_clave TEXT,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_bonos_mov_tecnico_mes ON bonos_movimientos(tecnico, mes_clave)`,
    `CREATE INDEX IF NOT EXISTS idx_bonos_mov_tipo ON bonos_movimientos(tipo)`,
    /* CONFIG_CORREOS_REPORTES: destinatarios por tipo de reporte mensual.
       tipo: 'ventas_mensual' | 'bonos_mensual' | 'inventario_mensual'. */
    `CREATE TABLE IF NOT EXISTS config_correos_reportes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      email TEXT NOT NULL,
      activo INTEGER DEFAULT 1,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_config_correos_tipo ON config_correos_reportes(tipo, activo)`,
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
    /* Reportes 2026-05-15: días de actividad + flag fuera de ciudad (bono viaje automático) */
    `ALTER TABLE reportes ADD COLUMN dias INTEGER DEFAULT 1`,
    `ALTER TABLE reportes ADD COLUMN fuera_ciudad INTEGER DEFAULT 0`,
    // garantias: quitar tipo_maquina, usar solo modelo_maquina
    `ALTER TABLE garantias ADD COLUMN maximo_mantenimientos INTEGER DEFAULT 0`,
    `ALTER TABLE garantias ADD COLUMN pagos_log TEXT DEFAULT '[]'`,
    // bitacoras: enlazar a reportes
    `ALTER TABLE bitacoras ADD COLUMN reporte_id INTEGER`,
    `ALTER TABLE bitacoras ADD COLUMN archivo_firmado TEXT`,
    `ALTER TABLE bitacoras ADD COLUMN archivo_firmado_nombre TEXT`,
    // evitar doble envío de correos mensuales (job + periodo YYYY-MM)
    `CREATE TABLE IF NOT EXISTS cron_jobs_log (job TEXT NOT NULL, periodo TEXT NOT NULL, ejecutado_en TEXT NOT NULL, PRIMARY KEY (job, periodo))`,
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
    `ALTER TABLE maquinas ADD COLUMN ficha_tecnica TEXT`,
    `ALTER TABLE clientes ADD COLUMN constancia_url TEXT`,
    `ALTER TABLE clientes ADD COLUMN constancia_nombre TEXT`,
    `ALTER TABLE clientes ADD COLUMN constancia_thumb_url TEXT`,
    `ALTER TABLE maquinas ADD COLUMN subcategoria TEXT`,
    /* Catálogo de máquinas estilo ficha técnica UNIVERSAL (2026-05-15):
       descripcion_corta = 1-2 líneas tipo "Torno Vertical CNC HZ7900L"
       descripcion_larga = párrafo principal de specs
       ficha_tecnica_specs = JSON [{label:"Maximum swing diameter", value:"900"}, ...]
       incluye = JSON ["Envío sin costo", "Instalación", "Capacitación"]
       puesta_en = "Bodega Nuestra Monterrey"; garantia = "1 año"; condiciones_pago = "Contado"
       tiempo_entrega_dias = INTEGER (ej. 65) */
    `ALTER TABLE maquinas ADD COLUMN tiempo_entrega_dias INTEGER`,
    `ALTER TABLE maquinas ADD COLUMN descripcion_corta TEXT`,
    `ALTER TABLE maquinas ADD COLUMN descripcion_larga TEXT`,
    `ALTER TABLE maquinas ADD COLUMN incluye TEXT`,
    `ALTER TABLE maquinas ADD COLUMN ficha_tecnica_specs TEXT`,
    `ALTER TABLE maquinas ADD COLUMN puesta_en TEXT`,
    `ALTER TABLE maquinas ADD COLUMN garantia TEXT`,
    `ALTER TABLE maquinas ADD COLUMN condiciones_pago TEXT`,
    /* Accesorios estándar para flyer catálogo (2026-05-19): JSON ["Plato 3 mordazas", "Luneta fija", ...] */
    `ALTER TABLE maquinas ADD COLUMN accesorios_estandar TEXT`,
    /* Datos de la 2da máquina para flyer PAIR (2026-05-20): permite tener 2 máquinas en un solo registro */
    `ALTER TABLE maquinas ADD COLUMN modelo_2 TEXT`,
    `ALTER TABLE maquinas ADD COLUMN incluye_2 TEXT`,
    `ALTER TABLE maquinas ADD COLUMN accesorios_estandar_2 TEXT`,
    `ALTER TABLE maquinas ADD COLUMN ficha_tecnica_specs_2 TEXT`,
    `ALTER TABLE maquinas ADD COLUMN categoria_2 TEXT`,
    `ALTER TABLE maquinas ADD COLUMN descripcion_corta_2 TEXT`,
    `ALTER TABLE maquinas ADD COLUMN descripcion_larga_2 TEXT`,
    /* Flyer modo + textos personalizables (2026-05-19): 'single' | 'pair'; pareja_id apunta a otra máquina; textos = JSON con overrides */
    `ALTER TABLE maquinas ADD COLUMN flyer_modo TEXT`,
    `ALTER TABLE maquinas ADD COLUMN flyer_pareja_id INTEGER`,
    `ALTER TABLE maquinas ADD COLUMN flyer_textos TEXT`,
    `ALTER TABLE refacciones ADD COLUMN bloque TEXT`,
    `ALTER TABLE refacciones ADD COLUMN tipo_cambio_registro REAL`,
    /* Personal: INE y licencia (data URL + miniatura) */
    `ALTER TABLE tecnicos ADD COLUMN ine_foto_url TEXT`,
    `ALTER TABLE tecnicos ADD COLUMN ine_thumb_url TEXT`,
    `ALTER TABLE tecnicos ADD COLUMN licencia_foto_url TEXT`,
    `ALTER TABLE tecnicos ADD COLUMN licencia_thumb_url TEXT`,
    /* Vincular cuenta de app al registro de Personal (para permiso de cotizar si es_vendedor) */
    `ALTER TABLE app_users ADD COLUMN tecnico_id INTEGER`,
    /* Permisos por pestaña y columnas visibles por ruta (JSON) */
    `ALTER TABLE app_users ADD COLUMN tab_permissions TEXT`,
    `ALTER TABLE app_users ADD COLUMN column_permissions TEXT`,
    /* Historial de cuentas eliminadas (solo admin; auditoría + avisos por correo) */
    `CREATE TABLE IF NOT EXISTS app_users_deleted (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT,
      role TEXT,
      tecnico_id INTEGER,
      usuario_creado_en TEXT,
      eliminado_en TEXT DEFAULT (datetime('now','localtime')),
      eliminado_por_user_id INTEGER,
      eliminado_por_username TEXT
    )`,
    /* Attachments genéricos: cualquier registro puede tener archivos adjuntos.
       Almacenamiento como base64 data URL (consistente con constancia_url y
       sobrevive a reinicios del servidor en plataformas con FS efímero). */
    `CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER DEFAULT 0,
      data_url TEXT NOT NULL,
      uploaded_by INTEGER,
      uploaded_by_name TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id)`,
    /* Webhooks salientes a Slack/Discord/Teams/genérico */
    `CREATE TABLE IF NOT EXISTS webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      url TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'generic',
      eventos TEXT NOT NULL DEFAULT '[]',
      activo INTEGER DEFAULT 1,
      ultimo_envio TEXT,
      ultimo_status INTEGER,
      ultimo_error TEXT,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    /* Audit log enriquecido: diff JSON para cambios trazables */
    `ALTER TABLE audit_log ADD COLUMN entity_type TEXT`,
    `ALTER TABLE audit_log ADD COLUMN entity_id INTEGER`,
    `ALTER TABLE audit_log ADD COLUMN diff_json TEXT`,
    /* Preparación de máquinas tras aprobar cotización con líneas tipo 'maquina'.
       estado_preparacion: 'pendiente' (acabada de pasar a preparación) | 'lista' | 'entregada' */
    `ALTER TABLE maquinas ADD COLUMN estado_preparacion TEXT`,
    `ALTER TABLE maquinas ADD COLUMN preparacion_iniciada_en TEXT`,
    /* Tablas nuevas 2026-05 (idempotentes con IF NOT EXISTS para BDs antiguas) */
    `CREATE TABLE IF NOT EXISTS embarques (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_maquina TEXT NOT NULL,
      numero_serie TEXT,
      proveedor TEXT,
      origen TEXT,
      destino_sucursal TEXT,
      eta_fecha TEXT,
      estado TEXT DEFAULT 'en_camino',
      notas TEXT,
      activo INTEGER DEFAULT 1,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_embarques_estado ON embarques(estado)`,
    `CREATE TABLE IF NOT EXISTS bonos_movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tecnico TEXT NOT NULL,
      tipo TEXT NOT NULL,
      monto REAL NOT NULL DEFAULT 0,
      referencia_tipo TEXT,
      referencia_id INTEGER,
      descripcion TEXT,
      fecha TEXT DEFAULT (date('now','localtime')),
      mes_clave TEXT,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_bonos_mov_tecnico_mes ON bonos_movimientos(tecnico, mes_clave)`,
    `CREATE INDEX IF NOT EXISTS idx_bonos_mov_tipo ON bonos_movimientos(tipo)`,
    `CREATE TABLE IF NOT EXISTS config_correos_reportes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      email TEXT NOT NULL,
      activo INTEGER DEFAULT 1,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_config_correos_tipo ON config_correos_reportes(tipo, activo)`,
    /* Cotización rediseño UNIVERSAL (2026-05-20): imagen máquina, ficha técnica, textos editables, atendido por, bancarios */
    `ALTER TABLE cotizaciones ADD COLUMN imagen_maquina_url TEXT`,
    `ALTER TABLE cotizaciones ADD COLUMN ficha_tecnica_url TEXT`,
    `ALTER TABLE cotizaciones ADD COLUMN alcance_servicio TEXT`,
    `ALTER TABLE cotizaciones ADD COLUMN siguiente_paso TEXT`,
    `ALTER TABLE cotizaciones ADD COLUMN atendido_por_nombre TEXT`,
    `ALTER TABLE cotizaciones ADD COLUMN atendido_por_puesto TEXT`,
    `ALTER TABLE cotizaciones ADD COLUMN bancarios_rfc TEXT`,
    `ALTER TABLE cotizaciones ADD COLUMN bancarios_cuentas TEXT`,
    /* 2026-05-21: ficha técnica manual (JSON array de filas {label,value}) cuando no se sube imagen */
    `ALTER TABLE cotizaciones ADD COLUMN ficha_tecnica_manual TEXT`,
    /* 2026-05-21: fotos adjuntas de ficha técnica (JSON array de dataURLs, máx 4) */
    `ALTER TABLE cotizaciones ADD COLUMN ficha_tecnica_fotos TEXT`,
    /* 2026-05-21: slot horario del reporte (madrugada/manana/tarde/noche) — para Agenda */
    `ALTER TABLE reportes ADD COLUMN slot TEXT`,
    /* 2026-05-21: fecha estimada en que la máquina estará LISTA tras revisión/preparación.
       Permite calcular tiempo de entrega dinámico en cotizaciones. */
    `ALTER TABLE maquinas ADD COLUMN fecha_lista_estimada TEXT`,
    /* 🆕 2026-05-22 — INTERCONEXIÓN EMBARQUES ↔ INVENTARIO:
       - refaccion_id / maquina_id: FK opcional al catálogo (NULL si es texto libre legacy).
       - cantidad: para refacciones (cuántas unidades llegaron en el embarque).
       - aplicado_stock: 0|1 — evita duplicar entrada de stock si el embarque pasa
         a 'llegado' varias veces. */
    `ALTER TABLE embarques ADD COLUMN refaccion_id INTEGER`,
    `ALTER TABLE embarques ADD COLUMN maquina_id INTEGER`,
    `ALTER TABLE embarques ADD COLUMN cantidad REAL DEFAULT 1`,
    `ALTER TABLE embarques ADD COLUMN aplicado_stock INTEGER DEFAULT 0`,
    `CREATE INDEX IF NOT EXISTS idx_embarques_refaccion ON embarques(refaccion_id)`,
    `CREATE INDEX IF NOT EXISTS idx_embarques_maquina ON embarques(maquina_id)`,
  ];
  for (const sql of migrations) {
    try {
      if (useTurso) await db.execute(sql);
      else await new Promise((res) => db.run(sql, () => res()));
    } catch (e) {
      // Logear si NO es "duplicate column" (eso es esperado al re-ejecutar migración)
      const msg = String(e && e.message || '');
      if (!/duplicate column|already exists/i.test(msg)) {
        console.warn('[migration]', sql, '->', msg);
      }
    }
  }
}

function isVercelServerless() {
  const v = process.env.VERCEL;
  return v === '1' || v === 'true';
}

async function init() {
  if (isVercelServerless() && !useTurso && !usePostgres) {
    throw new Error(
      'Vercel requiere TURSO_DATABASE_URL+TURSO_AUTH_TOKEN o SUPABASE_POSTGRES_URL. SQLite en disco no funciona en serverless.'
    );
  }
  /* Render filesystem es efímero — SQLite local se borra en CADA redeploy. */
  const isRender = !!(process.env.RENDER || process.env.RENDER_SERVICE_NAME);
  if (isRender && !useTurso && !usePostgres) {
    console.warn('');
    console.warn('================================================================');
    console.warn('⚠  ADVERTENCIA CRÍTICA: Render + SQLite local = pérdida de datos');
    console.warn('   Configura SUPABASE_POSTGRES_URL o TURSO_DATABASE_URL+TURSO_AUTH_TOKEN');
    console.warn('================================================================');
    console.warn('');
  }
  /* 🆕 POSTGRES (Supabase): el schema ya se creó en Supabase (migrations/01-schema-postgres.sql).
     Aquí solo conectamos y opcionalmente sembramos catálogos default si la tabla está vacía. */
  if (usePostgres) {
    const { Pool, types } = require('pg');
    // 🔧 CRITICAL: parsear BIGINT (OID 20) como Number, no como String.
    //   Por default pg devuelve BIGINT como '25' (string) para preservar precisión > 2^53.
    //   Nuestros IDs nunca llegarán a 2^53. El frontend está hecho para IDs numéricos
    //   (igual que Turso/SQLite). Sin esto, todas las comparaciones id==X fallan.
    types.setTypeParser(20, (val) => val === null ? null : parseInt(val, 10));
    // También NUMERIC (OID 1700) → Number cuando es entero, por consistencia.
    types.setTypeParser(1700, (val) => val === null ? null : parseFloat(val));
    pgPool = new Pool({
      connectionString: PG_URL,
      ssl: { rejectUnauthorized: false }, // Supabase requiere SSL
      max: 10,
      // Evitar que conexiones colgadas agoten el pool sin recuperación.
      connectionTimeoutMillis: 10000,  // abortar si no se puede conectar en 10s
      idleTimeoutMillis: 30000,        // liberar conexiones ociosas tras 30s
      statement_timeout: 30000,        // matar queries que excedan 30s
    });
    // Un error en una conexión ociosa del pool emite 'error'; sin listener, crashea el proceso.
    pgPool.on('error', (err) => {
      console.error('[db] Error inesperado en cliente ocioso del pool pg:', err.message);
    });
    // Test de conexión (falla rápido si la URL es incorrecta)
    await pgPool.query('SELECT 1');
    console.log('[db] Conectado a Postgres (Supabase). Schema ya cargado desde migrations/01-schema-postgres.sql');
    // Seeds idempotentes (usan INSERT OR IGNORE que se traduce a ON CONFLICT DO NOTHING)
    try { await seedCatalogosDefaults(); } catch (e) { console.warn('[seed catalogos]', e.message); }
    try { await seedCatalogoCategoriasFromLegacy(); } catch (e) { console.warn('[seed cat-legacy]', e.message); }
    try { await migrateDavidCantuRefacciones15(); } catch (e) { console.warn('[seed david15]', e.message); }
    return;
  }
  if (useTurso) {
    const { createClient } = require('@libsql/client');
    db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
    for (const sql of getSchema()) await db.execute(sql);
    await runMigrations();
    await migrateRefaccionesCodigoNullable();
    await migrateDavidCantuRefacciones15();
    await seedCatalogosDefaults();
    await seedCatalogoCategoriasFromLegacy();
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
  await migrateRefaccionesCodigoNullable();
  await migrateDavidCantuRefacciones15();
  await seedCatalogosDefaults();
  await seedCatalogoCategoriasFromLegacy();
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
    // 🆕 2026-05-23: tarifas defaults para cálculo de entrega dinámica.
    //   Si ya existen no se sobrescriben (INSERT OR IGNORE / ON CONFLICT DO NOTHING).
    await runQuery("INSERT OR IGNORE INTO tarifas (clave, valor) VALUES (?, ?)", ['entrega_margen_dias_min', '3']);
    await runQuery("INSERT OR IGNORE INTO tarifas (clave, valor) VALUES (?, ?)", ['entrega_margen_dias_max', '5']);
    // 🆕 2026-05-23: categoría 'PENDIENTE CLASIFICAR' para máquinas auto-creadas
    //   desde Embarques. Aparece en el dropdown de edición para que David la cambie
    //   manualmente al tipo correcto cuando sepa qué tipo de máquina es.
    await runQuery("INSERT OR IGNORE INTO catalogo_categorias (nombre, orden) VALUES (?, ?)", ['PENDIENTE CLASIFICAR', 9999]);
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

/** Migra textos sueltos de refacciones/máquinas al catálogo normalizado (idempotente). */
async function seedCatalogoCategoriasFromLegacy() {
  try {
    const cats = await getAll(
      `SELECT DISTINCT TRIM(categoria) AS n FROM refacciones WHERE categoria IS NOT NULL AND TRIM(categoria) != ''
       UNION SELECT DISTINCT TRIM(categoria) FROM maquinas WHERE categoria IS NOT NULL AND TRIM(categoria) != ''`
    );
    for (const row of cats) {
      const n = String(row.n || '').trim();
      if (!n) continue;
      await runQuery('INSERT OR IGNORE INTO catalogo_categorias (nombre) VALUES (?)', [n]);
    }
    const subs = await getAll(
      `SELECT DISTINCT TRIM(categoria) AS c, TRIM(subcategoria) AS s FROM refacciones
       WHERE subcategoria IS NOT NULL AND TRIM(subcategoria) != '' AND categoria IS NOT NULL AND TRIM(categoria) != ''`
    );
    for (const row of subs) {
      const c = String(row.c || '').trim();
      const s = String(row.s || '').trim();
      if (!c || !s) continue;
      const cat = await getOne('SELECT id FROM catalogo_categorias WHERE nombre = ?', [c]);
      if (!cat || cat.id == null) continue;
      await runQuery('INSERT OR IGNORE INTO catalogo_subcategorias (categoria_id, nombre) VALUES (?, ?)', [cat.id, s]);
    }
  } catch (_) {
    /* tabla nueva o vacía */
  }
}

/**
 * Tras vaciar todas las tablas de negocio: catálogos por defecto, técnicos mínimos si hace falta, pricing demo.
 * No crea usuarios de app (eso hace auth.ensureSeedUsers en server.js).
 */
async function reseedAfterFullWipe() {
  await seedCatalogosDefaults();
  const rows = await getAll('SELECT COUNT(*) as c FROM tecnicos');
  if (rows[0] && Number(rows[0].c) === 0) {
    await runQuery("INSERT INTO tecnicos (nombre) VALUES ('Juan Pérez'), ('María García'), ('Carlos López')");
  }
  await seedPersonalAndPricing();
  await migrateRefaccionesCodigoNullable();
  await migrateDavidCantuRefacciones15();
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
      comision_refacciones_pct: 15,
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
      `UPDATE maquinas SET precio_lista_usd = 18500 + (ABS(CAST(id AS INTEGER)) * 97 % 120000)
       WHERE COALESCE(precio_lista_usd, 0) = 0`
    );
  } catch (_) { /* ignore */ }
}

/**
 * David Cantú: 15% comisión en refacciones (regla vigente; semillas antiguas usaban 10%).
 * Solo actualiza filas que siguen en 10 o NULL para no pisar ajustes manuales del admin.
 */
/** Migración: convertir refacciones.codigo de NOT NULL a NULLABLE.
 *  Permite importar refacciones sin código (caso XLSX con columna CODIGO vacía). */
async function migrateRefaccionesCodigoNullable() {
  try {
    let createSql = '';
    if (useTurso) {
      const r = await db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='refacciones'");
      if (r.rows && r.rows[0]) createSql = String(r.rows[0][0] || r.rows[0].sql || '');
    } else {
      const row = await getOne("SELECT sql FROM sqlite_master WHERE type='table' AND name='refacciones'");
      createSql = row ? String(row.sql || '') : '';
    }
    if (!createSql || !/codigo\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i.test(createSql)) return; // ya migrado
    console.log('[Migration] refacciones.codigo → nullable (rebuild)');
    const exec = (sql) => runQuery(sql, []);
    // Lista de columnas a copiar (las que existían antes de esta migración)
    const cols = 'id, codigo, descripcion, zona, bloque, stock, stock_minimo, precio_unitario, precio_usd, tipo_cambio_registro, unidad, categoria, subcategoria, imagen_url, manual_url, numero_parte_manual, activo, creado_en';
    await exec(`CREATE TABLE IF NOT EXISTS refacciones_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE,
      descripcion TEXT NOT NULL,
      zona TEXT,
      bloque TEXT,
      stock REAL NOT NULL DEFAULT 0,
      stock_minimo REAL DEFAULT 1,
      precio_unitario REAL NOT NULL DEFAULT 0,
      precio_usd REAL DEFAULT 0,
      tipo_cambio_registro REAL,
      unidad TEXT DEFAULT 'PZA',
      categoria TEXT,
      subcategoria TEXT,
      imagen_url TEXT,
      manual_url TEXT,
      numero_parte_manual TEXT,
      activo INTEGER DEFAULT 1,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    )`);
    await exec(`INSERT INTO refacciones_new (${cols}) SELECT ${cols} FROM refacciones`);
    await exec(`DROP TABLE refacciones`);
    await exec(`ALTER TABLE refacciones_new RENAME TO refacciones`);
    console.log('[Migration] refacciones.codigo nullable OK');
  } catch (e) {
    console.error('[Migration] refacciones.codigo nullable falló:', e.message);
  }
}

async function migrateDavidCantuRefacciones15() {
  try {
    await runQuery(
      `UPDATE tecnicos SET comision_refacciones_pct = 15
       WHERE TRIM(nombre) IN ('David Cantú', 'David Cantu')
         AND (comision_refacciones_pct IS NULL OR comision_refacciones_pct = 10)`
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

/** 🆕 TRADUCTOR SQLite → Postgres
 *  Aplica las conversiones necesarias para que un SQL escrito para SQLite
 *  funcione en Postgres SIN cambiar el código de server.js. */
function translateSqlForPg(sql) {
  let s = String(sql);

  // 0) PRAGMA SQLite → equivalente Postgres o no-op
  //    PRAGMA table_info(X) → query equivalente con information_schema
  //    Otros PRAGMA (foreign_keys, wal_checkpoint, journal_mode, etc.) → SELECT 1 (no-op)
  {
    const m = s.match(/^\s*PRAGMA\s+table_info\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)\s*;?\s*$/i);
    if (m) {
      const tableName = m[1];
      return `SELECT ordinal_position::int AS cid,
        column_name AS name,
        UPPER(data_type) AS type,
        (CASE WHEN is_nullable='NO' THEN 1 ELSE 0 END)::int AS notnull,
        column_default AS dflt_value,
        (CASE WHEN column_name = 'id' THEN 1 ELSE 0 END)::int AS pk
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='${tableName}'
      ORDER BY ordinal_position`;
    }
    if (/^\s*PRAGMA\s+/i.test(s)) {
      // PRAGMA no soportado en Postgres: convertir a no-op
      return 'SELECT 1 AS pragma_noop';
    }
  }
  // 1) Funciones de fecha SQLite → Postgres
  //    SQLite: datetime('now','localtime'), date('now','+7 days'), date(columna), etc.
  //    Postgres no tiene esos modificadores nativos. Convertimos a equivalentes.

  // datetime('now','localtime') / datetime('now') — timestamp completo
  s = s.replace(/datetime\s*\(\s*'now'\s*,\s*'localtime'\s*\)/gi, "to_char(now(),'YYYY-MM-DD HH24:MI:SS')");
  s = s.replace(/datetime\s*\(\s*'now'\s*\)/gi, "to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')");

  // date('now','localtime','+N days') o date('now','+N days') — fecha con offset
  s = s.replace(
    /date\s*\(\s*'now'\s*,\s*'localtime'\s*,\s*'([+-]?\d+)\s+(days?|months?|years?|hours?|minutes?)'\s*\)/gi,
    (_, n, u) => `to_char((now() + interval '${n} ${u}'),'YYYY-MM-DD')`
  );
  s = s.replace(
    /date\s*\(\s*'now'\s*,\s*'([+-]?\d+)\s+(days?|months?|years?|hours?|minutes?)'\s*\)/gi,
    (_, n, u) => `to_char((now() + interval '${n} ${u}'),'YYYY-MM-DD')`
  );

  // date('now','localtime') / date('now') — fecha del día
  s = s.replace(/date\s*\(\s*'now'\s*,\s*'localtime'\s*\)/gi, "to_char(now(),'YYYY-MM-DD')");
  s = s.replace(/date\s*\(\s*'now'\s*\)/gi, "to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD')");

  // date(columna) o date(EXPR) — en SQLite extrae la fecha de un string; en Postgres convierte
  //   a tipo 'date' lo que rompe comparaciones con strings. Como nuestras columnas son TEXT
  //   en formato 'YYYY-MM-DD', solo quitamos el wrapping y dejamos la expresión.
  //   IMPORTANTE: respetar paréntesis anidados.
  s = s.replace(/\bdate\s*\(/gi, function () { return '__DATE_PG__('; });
  {
    let out = '';
    let i = 0;
    while (i < s.length) {
      const idx = s.indexOf('__DATE_PG__(', i);
      if (idx === -1) { out += s.slice(i); break; }
      out += s.slice(i, idx) + '(';
      i = idx + '__DATE_PG__('.length;
      let depth = 1;
      let inStr = false;
      const start = i;
      while (i < s.length && depth > 0) {
        const c = s[i];
        if (c === "'") {
          if (inStr && s[i + 1] === "'") { i += 2; continue; }
          inStr = !inStr;
        } else if (!inStr) {
          if (c === '(') depth++;
          else if (c === ')') { depth--; if (depth === 0) break; }
        }
        i++;
      }
      out += s.slice(start, i) + ')';
      if (i < s.length) i++; // consumir el ')'
    }
    s = out;
  }
  // 2) IFNULL → COALESCE
  s = s.replace(/\bIFNULL\s*\(/gi, 'COALESCE(');

  // 2.1) strftime('%Y-%m', x) → to_char(x::timestamp, 'YYYY-MM')
  //      strftime('%Y-%m','now') → to_char(now(),'YYYY-MM')
  //      Parser respetando paréntesis anidados (el 2do arg puede tener COALESCE(...) etc.)
  function sqliteFormatToPg(fmt) {
    return fmt
      .replace(/%Y/g, 'YYYY')
      .replace(/%m/g, 'MM')
      .replace(/%d/g, 'DD')
      .replace(/%H/g, 'HH24')
      .replace(/%M/g, 'MI')
      .replace(/%S/g, 'SS');
  }
  s = s.replace(/\bstrftime\s*\(/gi, function () { return '__STRFTIME_PG__('; });
  {
    let out = '';
    let i = 0;
    while (i < s.length) {
      const idx = s.indexOf('__STRFTIME_PG__(', i);
      if (idx === -1) { out += s.slice(i); break; }
      out += s.slice(i, idx);
      i = idx + '__STRFTIME_PG__('.length;
      // Saltar espacios y leer el formato string entre comillas simples
      while (i < s.length && /\s/.test(s[i])) i++;
      if (s[i] !== "'") { out += s.slice(idx, i); continue; }
      i++; // saltar '
      let fmtStart = i;
      while (i < s.length && !(s[i] === "'" && s[i + 1] !== "'")) {
        if (s[i] === "'" && s[i + 1] === "'") i += 2;
        else i++;
      }
      const fmt = s.slice(fmtStart, i);
      i++; // saltar ' de cierre
      // Saltar espacios y coma
      while (i < s.length && /\s/.test(s[i])) i++;
      if (s[i] !== ',') { out += `strftime('${fmt}')`; continue; }
      i++; // saltar ,
      while (i < s.length && /\s/.test(s[i])) i++;
      // Leer expr respetando paréntesis y strings
      let depth = 1;
      let inStr = false;
      const exprStart = i;
      while (i < s.length && depth > 0) {
        const c = s[i];
        if (c === "'") {
          if (inStr && s[i + 1] === "'") { i += 2; continue; }
          inStr = !inStr;
        } else if (!inStr) {
          if (c === '(') depth++;
          else if (c === ')') { depth--; if (depth === 0) break; }
        }
        i++;
      }
      const expr = s.slice(exprStart, i).trim();
      i++; // saltar ) final
      const pgFmt = sqliteFormatToPg(fmt);
      // Caso especial: strftime(..., 'now') → to_char(now(),...)
      if (expr === "'now'" || expr === '"now"') {
        out += `to_char(now(),'${pgFmt}')`;
      } else {
        // Para expresiones de columna o COALESCE, no hace falta cast a timestamp
        // porque to_char acepta text directamente y nuestras columnas son TEXT YYYY-MM-DD.
        // Pero to_char(text, ...) NO funciona en Postgres. Hay que castear a timestamp/date.
        out += `to_char((${expr})::timestamp,'${pgFmt}')`;
      }
    }
    s = out;
  }

  // 2.2) CAST(x AS REAL) → CAST(x AS DOUBLE PRECISION)
  //      Postgres acepta REAL en columnas pero CAST AS REAL puede fallar en algunas versiones.
  s = s.replace(/\bCAST\s*\(\s*([^)]+)\s+AS\s+REAL\s*\)/gi, 'CAST($1 AS DOUBLE PRECISION)');
  // 2.5) ROUND(expr, N) → ROUND((expr)::numeric, N)
  //      Postgres no acepta ROUND(double precision, integer); requiere numeric.
  //      Cuidado: cuenta paréntesis para extraer la expresión completa.
  s = s.replace(/\bROUND\s*\(/gi, function () { return '__ROUND_PG__('; });
  // Re-procesar todos los __ROUND_PG__ para añadir cast numeric a la expresión del primer argumento
  {
    let out = '';
    let i = 0;
    while (i < s.length) {
      const idx = s.indexOf('__ROUND_PG__(', i);
      if (idx === -1) { out += s.slice(i); break; }
      out += s.slice(i, idx) + 'ROUND((';
      i = idx + '__ROUND_PG__('.length;
      // Buscar la coma del PRIMER argumento (respetando paréntesis y strings)
      let depth = 1;
      let inStr = false;
      let handled = false; // flag para saber si ya cerramos la expresión adentro
      const start = i;
      while (i < s.length && depth > 0) {
        const c = s[i];
        if (c === "'") {
          if (inStr && s[i + 1] === "'") { i += 2; continue; }
          inStr = !inStr;
        } else if (!inStr) {
          if (c === '(') depth++;
          else if (c === ')') {
            depth--;
            if (depth === 0) {
              // ROUND con UN SOLO argumento: cerrar como ROUND((expr)::numeric)
              out += s.slice(start, i) + ')::numeric)';
              i++; // consumir el ')'
              handled = true;
              break;
            }
          } else if (c === ',' && depth === 1) {
            // ROUND con DOS argumentos: cerrar primer arg con cast numeric
            out += s.slice(start, i) + ')::numeric';
            out += ',';
            i++;
            const restoStart = i;
            while (i < s.length && depth > 0) {
              const c2 = s[i];
              if (c2 === "'") {
                if (inStr && s[i + 1] === "'") { i += 2; continue; }
                inStr = !inStr;
              } else if (!inStr) {
                if (c2 === '(') depth++;
                else if (c2 === ')') { depth--; if (depth === 0) break; }
              }
              i++;
            }
            out += s.slice(restoStart, i) + ')';
            i++; // consumir el ')' final
            handled = true;
            break;
          }
        }
        i++;
      }
      // Safety: si no se manejó (SQL malformado), agregar el resto literal sin romper
      if (!handled) {
        out += s.slice(start, i) + ')::numeric)';
      }
    }
    s = out;
  }
  // 3) INSERT OR IGNORE INTO X → INSERT INTO X ... ON CONFLICT DO NOTHING
  let wasInsertOrIgnore = false;
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(s)) {
    wasInsertOrIgnore = true;
    s = s.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
  }
  // 4) INSERT OR REPLACE → INSERT (sin upsert auto; el código maneja explícito si necesita)
  s = s.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, 'INSERT INTO');
  // 5) Convertir placeholders `?` a `$1, $2, ...` respetando strings literales 'foo?bar'.
  let translated = '';
  let inString = false;
  let paramIdx = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'") {
      // Manejar escape de comilla simple ('')
      if (inString && s[i + 1] === "'") {
        translated += "''";
        i++;
        continue;
      }
      inString = !inString;
      translated += c;
    } else if (c === '?' && !inString) {
      translated += '$' + (++paramIdx);
    } else {
      translated += c;
    }
  }
  // 6) Si era INSERT OR IGNORE, agregar ON CONFLICT DO NOTHING al final (antes de RETURNING si existe)
  if (wasInsertOrIgnore && !/\bON\s+CONFLICT\b/i.test(translated)) {
    if (/\bRETURNING\b/i.test(translated)) {
      translated = translated.replace(/\bRETURNING\b/i, 'ON CONFLICT DO NOTHING RETURNING');
    } else {
      translated = translated.trimEnd().replace(/;\s*$/, '') + ' ON CONFLICT DO NOTHING';
    }
  }
  return translated;
}

/** Postgres no acepta undefined; convertir a null. */
function normalizePgArgs(params) {
  if (!Array.isArray(params) || params.length === 0) return params;
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'number' && (Number.isNaN(p) || !Number.isFinite(p))) return null;
    return p;
  });
}

// Ejecuta un INSERT (o cualquier sentencia) en Postgres usando `queryFn` —
// que puede ser pgPool.query (autocommit) o client.query (dentro de transacción).
async function pgInsertReturningWith(queryFn, sqlOriginal, args) {
  const translated = translateSqlForPg(sqlOriginal);
  // Si es INSERT que NO trae RETURNING, lo añadimos para obtener lastInsertRowid (id).
  // Si la tabla no tiene columna `id` (tarifas, cron_jobs_log), Postgres dará error y reintentamos sin RETURNING.
  const isInsert = /^\s*INSERT\s+INTO/i.test(translated);
  const hasReturning = /\bRETURNING\b/i.test(translated);
  if (isInsert && !hasReturning) {
    try {
      const r = await queryFn(translated + ' RETURNING id', args);
      const lastInsertRowid = (r.rows && r.rows[0] && r.rows[0].id !== undefined) ? r.rows[0].id : null;
      return { lastInsertRowid, rowCount: r.rowCount };
    } catch (e) {
      // Si falló por "column id does not exist" o similar, reintentar sin RETURNING
      const msg = String(e && e.message || '');
      if (/does not exist|column "id"|returning/i.test(msg)) {
        const r2 = await queryFn(translated, args);
        return { lastInsertRowid: null, rowCount: r2.rowCount };
      }
      throw e;
    }
  }
  const r = await queryFn(translated, args);
  // Si la query ya traía RETURNING (caller explícito), extraer el id si está en rows[0].id
  let lastInsertRowid = null;
  if (r.rows && r.rows[0] && r.rows[0].id !== undefined) {
    lastInsertRowid = r.rows[0].id;
  }
  return { lastInsertRowid, rowCount: r.rowCount };
}

function pgRunInsertWithReturning(sqlOriginal, args) {
  return pgInsertReturningWith((s, a) => pgPool.query(s, a), sqlOriginal, args);
}

/**
 * Columnas reales de una tabla — portable entre engines.
 * Reemplaza el `PRAGMA table_info(...)` (solo SQLite) que fallaba en Postgres.
 */
async function getTableColumns(table) {
  const t = String(table || '');
  if (usePostgres) {
    const r = await pgPool.query(
      'SELECT column_name FROM information_schema.columns WHERE table_name = $1',
      [t.toLowerCase()]
    );
    return (r.rows || []).map(row => row.column_name);
  }
  const rows = await getAll(`PRAGMA table_info(${t})`);
  return (rows || []).map(c => c.name);
}

/**
 * Ejecuta `fn(tx)` dentro de una transacción real.
 * - Postgres: usa UN client dedicado del pool (BEGIN/COMMIT/ROLLBACK sobre el
 *   mismo client) — antes BEGIN/COMMIT iban a connections distintas del pool y
 *   la transacción NO tenía efecto (ROLLBACK no revertía nada).
 * - Turso remoto: cada execute es autocommit y no hay transacción interactiva
 *   sobre HTTP — se ejecuta `fn` sin envolver (idéntico al comportamiento previo).
 * - SQLite local: BEGIN/COMMIT sobre la única conexión (idéntico al previo).
 * `tx` expone runQuery/getAll/getOne/runMutationCount con la MISMA semántica que
 * los métodos globales del módulo.
 */
async function withTransaction(fn) {
  if (usePostgres) {
    const client = await pgPool.connect();
    const q = (s, a) => client.query(s, a);
    const tx = {
      runQuery: (sql, params = []) => pgInsertReturningWith(q, sql, normalizePgArgs(params)),
      getAll: (sql, params = []) => client.query(translateSqlForPg(sql), normalizePgArgs(params)).then(r => r.rows || []),
      getOne: (sql, params = []) => tx.getAll(sql, params).then(rows => (rows && rows[0]) || null),
      runMutationCount: (sql, params = []) => client.query(translateSqlForPg(sql), normalizePgArgs(params)).then(r => r.rowCount || 0),
    };
    try {
      await client.query('BEGIN');
      const out = await fn(tx);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw e;
    } finally {
      client.release();
    }
  }
  // Turso: sin transacción interactiva — ejecutar directo (comportamiento previo).
  const txGlobal = { runQuery, getAll, getOne, runMutationCount };
  if (useTurso) {
    return fn(txGlobal);
  }
  // SQLite local: transacción real sobre la única conexión.
  await runQuery('BEGIN');
  try {
    const out = await fn(txGlobal);
    await runQuery('COMMIT');
    return out;
  } catch (e) {
    try { await runQuery('ROLLBACK'); } catch (_) {}
    throw e;
  }
}

function runQuery(sql, params = []) {
  if (usePostgres) {
    return pgRunInsertWithReturning(sql, normalizePgArgs(params));
  }
  if (useTurso) {
    const args = normalizeLibsqlArgs(params);
    // libSQL/Turso devuelve last_insert_row_id como BigInt. Normalizar a Number para
    // que coincida con SQLite (this.lastID) y Postgres, y no rompa JSON.stringify.
    return db.execute({ sql, args }).then(r => {
      const rid = r.meta?.last_insert_row_id;
      return { lastInsertRowid: rid != null ? Number(rid) : null };
    });
  }
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastInsertRowid: this.lastID });
    });
  });
}

function getAll(sql, params = []) {
  if (usePostgres) {
    const translated = translateSqlForPg(sql);
    return pgPool.query(translated, normalizePgArgs(params)).then(r => r.rows || []);
  }
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

/** DELETE/UPDATE: filas afectadas. */
async function runMutationCount(sql, params = []) {
  if (usePostgres) {
    const translated = translateSqlForPg(sql);
    const r = await pgPool.query(translated, normalizePgArgs(params));
    return r.rowCount || 0;
  }
  if (useTurso) {
    const args = normalizeLibsqlArgs(params);
    const r = await db.execute({ sql, args });
    return Number(r.rowsAffected ?? 0);
  }
  await runQuery(sql, params);
  const row = await getOne('SELECT changes() AS n');
  return Number(row && row.n) || 0;
}

function getStorageInfo() {
  if (usePostgres) return { mode: 'postgres', path: null };
  if (useTurso) return { mode: 'turso', path: null };
  return { mode: 'sqlite', path: sqliteResolvedPath || null };
}

module.exports = { init, runQuery, getAll, getOne, useTurso, usePostgres, getStorageInfo, runMutationCount, reseedAfterFullWipe, withTransaction, getTableColumns };
