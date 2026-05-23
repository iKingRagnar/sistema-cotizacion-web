-- ============================================================================
-- SCHEMA POSTGRES — sistema-cotizacion-web (migración desde Turso/SQLite)
-- Generado: 2026-05-23
-- Ejecutar en Supabase → SQL Editor → New query → pegar todo → Run
-- ============================================================================
-- Diferencias clave SQLite → Postgres aplicadas:
--   INTEGER PRIMARY KEY AUTOINCREMENT  →  BIGSERIAL PRIMARY KEY
--   REAL                                →  DOUBLE PRECISION
--   datetime('now','localtime')         →  to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
--   date('now','localtime')             →  to_char(now(), 'YYYY-MM-DD')
--   Tipos TEXT y INTEGER (no-pk) quedan igual (Postgres soporta TEXT nativo).
-- ============================================================================

-- ---------- 1) clientes (sin FK) ----------
CREATE TABLE IF NOT EXISTS clientes (
  id BIGSERIAL PRIMARY KEY,
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
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(nombre);

-- ---------- 2) refacciones ----------
CREATE TABLE IF NOT EXISTS refacciones (
  id BIGSERIAL PRIMARY KEY,
  codigo TEXT UNIQUE,
  descripcion TEXT NOT NULL,
  zona TEXT,
  bloque TEXT,
  stock DOUBLE PRECISION NOT NULL DEFAULT 0,
  stock_minimo DOUBLE PRECISION DEFAULT 1,
  precio_unitario DOUBLE PRECISION NOT NULL DEFAULT 0,
  precio_usd DOUBLE PRECISION DEFAULT 0,
  tipo_cambio_registro DOUBLE PRECISION,
  unidad TEXT DEFAULT 'PZA',
  categoria TEXT,
  subcategoria TEXT,
  imagen_url TEXT,
  manual_url TEXT,
  numero_parte_manual TEXT,
  activo INTEGER DEFAULT 1,
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_refacciones_codigo ON refacciones(codigo);

-- ---------- 3) tecnicos (sin FK; antes de app_users) ----------
CREATE TABLE IF NOT EXISTS tecnicos (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT UNIQUE NOT NULL,
  activo INTEGER DEFAULT 1,
  habilidades TEXT,
  ocupado INTEGER DEFAULT 0,
  disponible_desde TEXT,
  rol TEXT,
  puesto TEXT,
  departamento TEXT,
  profesion TEXT,
  es_vendedor INTEGER DEFAULT 0,
  comision_maquinas_pct DOUBLE PRECISION DEFAULT 0,
  comision_refacciones_pct DOUBLE PRECISION DEFAULT 10,
  ine_foto_url TEXT,
  ine_thumb_url TEXT,
  licencia_foto_url TEXT,
  licencia_thumb_url TEXT
);

-- ---------- 4) maquinas (referencia clientes) ----------
CREATE TABLE IF NOT EXISTS maquinas (
  id BIGSERIAL PRIMARY KEY,
  cliente_id BIGINT NOT NULL REFERENCES clientes(id),
  codigo TEXT,
  nombre TEXT NOT NULL,
  marca TEXT,
  modelo TEXT,
  numero_serie TEXT,
  ubicacion TEXT,
  activo INTEGER DEFAULT 1,
  categoria TEXT,
  categoria_principal TEXT,
  subcategoria TEXT,
  imagen_pieza_url TEXT,
  imagen_ensamble_url TEXT,
  stock DOUBLE PRECISION DEFAULT 0,
  precio_lista_usd DOUBLE PRECISION DEFAULT 0,
  ficha_tecnica TEXT,
  tiempo_entrega_dias INTEGER,
  descripcion_corta TEXT,
  descripcion_larga TEXT,
  incluye TEXT,
  ficha_tecnica_specs TEXT,
  puesta_en TEXT,
  garantia TEXT,
  condiciones_pago TEXT,
  accesorios_estandar TEXT,
  modelo_2 TEXT,
  incluye_2 TEXT,
  accesorios_estandar_2 TEXT,
  ficha_tecnica_specs_2 TEXT,
  categoria_2 TEXT,
  descripcion_corta_2 TEXT,
  descripcion_larga_2 TEXT,
  flyer_modo TEXT,
  flyer_pareja_id BIGINT,
  flyer_textos TEXT,
  estado_preparacion TEXT,
  preparacion_iniciada_en TEXT,
  fecha_lista_estimada TEXT,
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_maquinas_cliente ON maquinas(cliente_id);

-- ---------- 5) app_users (después de tecnicos) ----------
CREATE TABLE IF NOT EXISTS app_users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operador',
  display_name TEXT,
  activo INTEGER DEFAULT 1,
  tab_permissions TEXT,
  column_permissions TEXT,
  tecnico_id BIGINT,
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ---------- 6) cotizaciones (referencia clientes) ----------
CREATE TABLE IF NOT EXISTS cotizaciones (
  id BIGSERIAL PRIMARY KEY,
  folio TEXT UNIQUE,
  cliente_id BIGINT NOT NULL REFERENCES clientes(id),
  tipo TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD'),
  subtotal DOUBLE PRECISION DEFAULT 0,
  iva DOUBLE PRECISION DEFAULT 0,
  total DOUBLE PRECISION DEFAULT 0,
  tipo_cambio DOUBLE PRECISION DEFAULT 17.0,
  moneda TEXT DEFAULT 'MXN',
  maquinas_ids TEXT DEFAULT '[]',
  estado TEXT DEFAULT 'borrador',
  notas TEXT,
  vendedor TEXT,
  vendedor_personal_id BIGINT,
  descuento_pct DOUBLE PRECISION DEFAULT 0,
  fecha_aprobacion TEXT,
  imagen_maquina_url TEXT,
  ficha_tecnica_url TEXT,
  alcance_servicio TEXT,
  siguiente_paso TEXT,
  atendido_por_nombre TEXT,
  atendido_por_puesto TEXT,
  bancarios_rfc TEXT,
  bancarios_cuentas TEXT,
  ficha_tecnica_manual TEXT,
  ficha_tecnica_fotos TEXT,
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ---------- 7) cotizacion_lineas (referencia cotizaciones) ----------
CREATE TABLE IF NOT EXISTS cotizacion_lineas (
  id BIGSERIAL PRIMARY KEY,
  cotizacion_id BIGINT NOT NULL REFERENCES cotizaciones(id),
  refaccion_id BIGINT,
  maquina_id BIGINT,
  bitacora_id BIGINT,
  tipo_linea TEXT DEFAULT 'refaccion',
  descripcion TEXT,
  cantidad DOUBLE PRECISION NOT NULL DEFAULT 1,
  precio_unitario DOUBLE PRECISION NOT NULL DEFAULT 0,
  precio_usd DOUBLE PRECISION DEFAULT 0,
  subtotal DOUBLE PRECISION DEFAULT 0,
  iva DOUBLE PRECISION DEFAULT 0,
  total DOUBLE PRECISION DEFAULT 0,
  orden INTEGER DEFAULT 0,
  es_ida INTEGER DEFAULT 0,
  horas_trabajo DOUBLE PRECISION DEFAULT 0,
  horas_traslado DOUBLE PRECISION DEFAULT 0,
  zona TEXT,
  ayudantes INTEGER DEFAULT 0,
  tarifa_aplicada TEXT
);

-- ---------- 8) incidentes (referencia clientes) ----------
CREATE TABLE IF NOT EXISTS incidentes (
  id BIGSERIAL PRIMARY KEY,
  folio TEXT,
  cliente_id BIGINT NOT NULL REFERENCES clientes(id),
  maquina_id BIGINT,
  descripcion TEXT NOT NULL,
  prioridad TEXT,
  fecha_reporte TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD'),
  fecha_cerrado TEXT,
  fecha_vencimiento TEXT,
  tecnico_responsable TEXT,
  estatus TEXT DEFAULT 'abierto',
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ---------- 9) bitacoras (referencia incidentes, cotizaciones) ----------
CREATE TABLE IF NOT EXISTS bitacoras (
  id BIGSERIAL PRIMARY KEY,
  incidente_id BIGINT,
  cotizacion_id BIGINT,
  reporte_id BIGINT,
  fecha TEXT NOT NULL,
  tecnico TEXT,
  actividades TEXT,
  tiempo_horas DOUBLE PRECISION DEFAULT 0,
  materiales_usados TEXT,
  archivo_firmado TEXT,
  archivo_firmado_nombre TEXT,
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ---------- 10) mantenimientos (referencia maquinas) ----------
CREATE TABLE IF NOT EXISTS mantenimientos (
  id BIGSERIAL PRIMARY KEY,
  maquina_id BIGINT NOT NULL REFERENCES maquinas(id),
  tipo TEXT NOT NULL,
  fecha_inicio TEXT,
  fecha_fin TEXT,
  descripcion_falla TEXT,
  tecnico TEXT,
  horas_invertidas DOUBLE PRECISION DEFAULT 0,
  costo_total DOUBLE PRECISION DEFAULT 0,
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ---------- 11) reportes (referencia clientes, maquinas) ----------
CREATE TABLE IF NOT EXISTS reportes (
  id BIGSERIAL PRIMARY KEY,
  folio TEXT UNIQUE,
  cliente_id BIGINT REFERENCES clientes(id),
  razon_social TEXT,
  maquina_id BIGINT REFERENCES maquinas(id),
  numero_maquina TEXT,
  tipo_reporte TEXT NOT NULL DEFAULT 'servicio',
  subtipo TEXT,
  descripcion TEXT,
  tecnico TEXT,
  fecha TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD'),
  estatus TEXT DEFAULT 'abierto',
  notas TEXT,
  fecha_programada TEXT,
  finalizado INTEGER DEFAULT 0,
  archivo_firmado TEXT,
  archivo_firmado_nombre TEXT,
  dias INTEGER DEFAULT 1,
  fuera_ciudad INTEGER DEFAULT 0,
  slot TEXT,
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_reportes_cliente ON reportes(cliente_id);

-- ---------- 12) garantias (referencia clientes) ----------
CREATE TABLE IF NOT EXISTS garantias (
  id BIGSERIAL PRIMARY KEY,
  cliente_id BIGINT REFERENCES clientes(id),
  razon_social TEXT NOT NULL,
  modelo_maquina TEXT NOT NULL,
  numero_serie TEXT,
  tipo_maquina TEXT,
  fecha_entrega TEXT NOT NULL,
  activa INTEGER DEFAULT 1,
  alertas_log TEXT DEFAULT '[]',
  maximo_mantenimientos INTEGER DEFAULT 0,
  pagos_log TEXT DEFAULT '[]',
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_garantias_cliente ON garantias(cliente_id);

-- ---------- 13) mantenimientos_garantia (referencia garantias) ----------
CREATE TABLE IF NOT EXISTS mantenimientos_garantia (
  id BIGSERIAL PRIMARY KEY,
  garantia_id BIGINT NOT NULL REFERENCES garantias(id),
  numero INTEGER NOT NULL,
  anio INTEGER NOT NULL,
  fecha_programada TEXT,
  fecha_realizada TEXT,
  costo DOUBLE PRECISION DEFAULT 0,
  confirmado INTEGER DEFAULT 0,
  alerta_enviada INTEGER DEFAULT 0,
  alerta_vencida INTEGER DEFAULT 0,
  pagado DOUBLE PRECISION DEFAULT 0,
  notas TEXT,
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ---------- 14) bonos (referencia reportes) ----------
CREATE TABLE IF NOT EXISTS bonos (
  id BIGSERIAL PRIMARY KEY,
  reporte_id BIGINT REFERENCES reportes(id),
  tecnico TEXT NOT NULL,
  tipo_capacitacion TEXT,
  modalidad TEXT DEFAULT 'local',
  monto_bono DOUBLE PRECISION DEFAULT 0,
  dias INTEGER DEFAULT 1,
  monto_total DOUBLE PRECISION DEFAULT 0,
  fecha TEXT DEFAULT to_char(now(), 'YYYY-MM-DD'),
  mes TEXT,
  pagado INTEGER DEFAULT 0,
  notas TEXT,
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ---------- 15) viajes (referencia clientes, reportes) ----------
CREATE TABLE IF NOT EXISTS viajes (
  id BIGSERIAL PRIMARY KEY,
  tecnico TEXT NOT NULL,
  cliente_id BIGINT REFERENCES clientes(id),
  razon_social TEXT,
  maquina TEXT,
  numero_serie TEXT,
  actividad TEXT,
  estado TEXT,
  fecha_inicio TEXT NOT NULL,
  fecha_fin TEXT NOT NULL,
  dias INTEGER DEFAULT 1,
  monto_viaticos DOUBLE PRECISION DEFAULT 0,
  descripcion TEXT,
  actividades TEXT,
  reporte_id BIGINT REFERENCES reportes(id),
  mes TEXT,
  mes_liquidacion TEXT,
  liquidado INTEGER DEFAULT 0,
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ---------- 16) movimientos_stock (referencia refacciones, cotizaciones) ----------
CREATE TABLE IF NOT EXISTS movimientos_stock (
  id BIGSERIAL PRIMARY KEY,
  refaccion_id BIGINT NOT NULL REFERENCES refacciones(id),
  tipo TEXT NOT NULL,
  cantidad DOUBLE PRECISION NOT NULL,
  costo_unitario DOUBLE PRECISION DEFAULT 0,
  cotizacion_id BIGINT REFERENCES cotizaciones(id),
  referencia TEXT,
  fecha TEXT DEFAULT to_char(now(), 'YYYY-MM-DD'),
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_movimientos_ref ON movimientos_stock(refaccion_id);

-- ---------- 17) revision_maquinas (referencia maquinas) ----------
CREATE TABLE IF NOT EXISTS revision_maquinas (
  id BIGSERIAL PRIMARY KEY,
  maquina_id BIGINT REFERENCES maquinas(id),
  tipo_maquina TEXT,
  categoria TEXT,
  modelo TEXT,
  numero_serie TEXT,
  entregado TEXT DEFAULT 'No',
  prueba TEXT DEFAULT 'En Proceso',
  comentarios TEXT,
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ---------- 18) tarifas (PK = clave TEXT) ----------
CREATE TABLE IF NOT EXISTS tarifas (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  actualizado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ---------- 19) prospectos ----------
CREATE TABLE IF NOT EXISTS prospectos (
  id BIGSERIAL PRIMARY KEY,
  empresa TEXT NOT NULL,
  zona TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  tipo_interes TEXT,
  industria TEXT,
  potencial_usd DOUBLE PRECISION DEFAULT 0,
  ultimo_contacto TEXT,
  score_ia DOUBLE PRECISION DEFAULT 0,
  estado TEXT DEFAULT 'nuevo',
  notas TEXT,
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_prospectos_estado ON prospectos(estado);

-- ---------- 20) catalogos ----------
CREATE TABLE IF NOT EXISTS catalogos (
  id BIGSERIAL PRIMARY KEY,
  clave TEXT NOT NULL,
  valor TEXT NOT NULL,
  activo INTEGER DEFAULT 1,
  orden INTEGER DEFAULT 0,
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogos_clave_valor ON catalogos(clave, valor);
CREATE INDEX IF NOT EXISTS idx_catalogos_clave_activo ON catalogos(clave, activo);

-- ---------- 21) catalogo_categorias ----------
CREATE TABLE IF NOT EXISTS catalogo_categorias (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  orden INTEGER DEFAULT 0,
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ---------- 22) catalogo_subcategorias (referencia catalogo_categorias) ----------
CREATE TABLE IF NOT EXISTS catalogo_subcategorias (
  id BIGSERIAL PRIMARY KEY,
  categoria_id BIGINT NOT NULL REFERENCES catalogo_categorias(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  orden INTEGER DEFAULT 0,
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogo_sub_nombre ON catalogo_subcategorias(categoria_id, nombre);

-- ---------- 23) embarques (referencia refacciones, maquinas) ----------
CREATE TABLE IF NOT EXISTS embarques (
  id BIGSERIAL PRIMARY KEY,
  nombre_maquina TEXT NOT NULL,
  numero_serie TEXT,
  proveedor TEXT,
  origen TEXT,
  destino_sucursal TEXT,
  eta_fecha TEXT,
  estado TEXT DEFAULT 'en_camino',
  notas TEXT,
  activo INTEGER DEFAULT 1,
  refaccion_id BIGINT,
  maquina_id BIGINT,
  cantidad DOUBLE PRECISION DEFAULT 1,
  aplicado_stock INTEGER DEFAULT 0,
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_embarques_estado ON embarques(estado);
CREATE INDEX IF NOT EXISTS idx_embarques_refaccion ON embarques(refaccion_id);
CREATE INDEX IF NOT EXISTS idx_embarques_maquina ON embarques(maquina_id);

-- ---------- 24) bonos_movimientos ----------
CREATE TABLE IF NOT EXISTS bonos_movimientos (
  id BIGSERIAL PRIMARY KEY,
  tecnico TEXT NOT NULL,
  tipo TEXT NOT NULL,
  monto DOUBLE PRECISION NOT NULL DEFAULT 0,
  referencia_tipo TEXT,
  referencia_id BIGINT,
  descripcion TEXT,
  fecha TEXT DEFAULT to_char(now(), 'YYYY-MM-DD'),
  mes_clave TEXT,
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_bonos_mov_tecnico_mes ON bonos_movimientos(tecnico, mes_clave);
CREATE INDEX IF NOT EXISTS idx_bonos_mov_tipo ON bonos_movimientos(tipo);

-- ---------- 25) config_correos_reportes ----------
CREATE TABLE IF NOT EXISTS config_correos_reportes (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT NOT NULL,
  email TEXT NOT NULL,
  activo INTEGER DEFAULT 1,
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_config_correos_tipo ON config_correos_reportes(tipo, activo);

-- ---------- 26) cron_jobs_log (PK compuesta) ----------
CREATE TABLE IF NOT EXISTS cron_jobs_log (
  job TEXT NOT NULL,
  periodo TEXT NOT NULL,
  ejecutado_en TEXT NOT NULL,
  PRIMARY KEY (job, periodo)
);

-- ---------- 27) audit_log ----------
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  username TEXT,
  role TEXT,
  action TEXT NOT NULL,
  method TEXT,
  path TEXT,
  detail TEXT,
  ip TEXT,
  entity_type TEXT,
  entity_id BIGINT,
  diff_json TEXT,
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_audit_creado ON audit_log(creado_en DESC);

-- ---------- 28) app_users_deleted (auditoría) ----------
CREATE TABLE IF NOT EXISTS app_users_deleted (
  id BIGSERIAL PRIMARY KEY,
  original_user_id BIGINT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT,
  role TEXT,
  tecnico_id BIGINT,
  usuario_creado_en TEXT,
  eliminado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
  eliminado_por_user_id BIGINT,
  eliminado_por_username TEXT
);

-- ---------- 29) attachments ----------
CREATE TABLE IF NOT EXISTS attachments (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id BIGINT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT DEFAULT 0,
  data_url TEXT NOT NULL,
  uploaded_by BIGINT,
  uploaded_by_name TEXT,
  created_at TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);

-- ---------- 30) webhooks ----------
CREATE TABLE IF NOT EXISTS webhooks (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  url TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'generic',
  eventos TEXT NOT NULL DEFAULT '[]',
  activo INTEGER DEFAULT 1,
  ultimo_envio TEXT,
  ultimo_status INTEGER,
  ultimo_error TEXT,
  creado_en TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ============================================================================
-- FIN. 30 tablas creadas con sus índices.
-- ============================================================================
