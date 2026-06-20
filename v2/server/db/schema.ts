/**
 * Schema completo de la DB con Drizzle ORM (LibSQL/Turso).
 *
 * Para generar migrations: npm run db:generate
 * Para aplicar: npm run db:migrate
 */
import { sqliteTable, integer, text, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const ts = () => text().notNull().default(sql`CURRENT_TIMESTAMP`);

/* ─────────────────────────────────────────────────────────────
   USERS / SESSIONS / AUDIT
   ───────────────────────────────────────────────────────────── */
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  email: text('email'),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'usuario', 'consulta'] }).notNull().default('usuario'),
  nombreCompleto: text('nombre_completo'),
  activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
  createdAt: ts(),
  updatedAt: ts(),
  lastLoginAt: text('last_login_at'),
}, (t) => ({ usernameIdx: index('users_username_idx').on(t.username) }));

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  userAgent: text('user_agent'),
  createdAt: ts(),
}, (t) => ({ userIdx: index('sessions_user_idx').on(t.userId) }));

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  details: text('details'),
  ip: text('ip'),
  timestamp: ts(),
}, (t) => ({
  entityIdx: index('audit_entity_idx').on(t.entity, t.entityId),
  userIdx: index('audit_user_idx').on(t.userId),
}));

/* ─────────────────────────────────────────────────────────────
   CLIENTES
   ───────────────────────────────────────────────────────────── */
export const clientes = sqliteTable('clientes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  razonSocial: text('razon_social').notNull(),
  rfc: text('rfc'),
  contacto: text('contacto'),
  email: text('email'),
  telefono: text('telefono'),
  direccion: text('direccion'),
  ciudad: text('ciudad'),
  estado: text('estado'),
  pais: text('pais').default('México'),
  notas: text('notas'),
  activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
  createdAt: ts(),
  updatedAt: ts(),
}, (t) => ({
  razonIdx: index('clientes_razon_idx').on(t.razonSocial),
  rfcIdx: index('clientes_rfc_idx').on(t.rfc),
}));

/* ─────────────────────────────────────────────────────────────
   CATEGORÍAS (refacciones / máquinas)
   ───────────────────────────────────────────────────────────── */
export const categorias = sqliteTable('categorias', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  parentId: integer('parent_id'),
  tipo: text('tipo', { enum: ['refaccion', 'maquina'] }).notNull().default('refaccion'),
  orden: integer('orden').default(0),
  createdAt: ts(),
}, (t) => ({
  uniqueNombreTipo: uniqueIndex('categorias_nombre_tipo_idx').on(t.nombre, t.tipo, t.parentId),
}));

/* ─────────────────────────────────────────────────────────────
   REFACCIONES
   ───────────────────────────────────────────────────────────── */
export const refacciones = sqliteTable('refacciones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  numeroParte: text('numero_parte').notNull(),
  descripcion: text('descripcion').notNull(),
  categoria: text('categoria'),
  subcategoria: text('subcategoria'),
  marca: text('marca'),
  proveedor: text('proveedor'),
  precioCompraUsd: real('precio_compra_usd'),
  precioVentaUsd: real('precio_venta_usd'),
  precioVentaMxn: real('precio_venta_mxn'),
  stock: integer('stock').default(0),
  stockMinimo: integer('stock_minimo').default(0),
  ubicacion: text('ubicacion'),
  notas: text('notas'),
  activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
  createdAt: ts(),
  updatedAt: ts(),
}, (t) => ({
  numeroIdx: index('refacciones_numero_idx').on(t.numeroParte),
  descIdx: index('refacciones_desc_idx').on(t.descripcion),
  catIdx: index('refacciones_cat_idx').on(t.categoria),
}));

/* ─────────────────────────────────────────────────────────────
   MÁQUINAS (catálogo de equipos)
   ───────────────────────────────────────────────────────────── */
export const maquinas = sqliteTable('maquinas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  modelo: text('modelo').notNull(),
  numeroSerie: text('numero_serie'),
  categoria: text('categoria'),
  clienteId: integer('cliente_id').references(() => clientes.id, { onDelete: 'set null' }),
  clienteNombre: text('cliente_nombre'),
  ubicacion: text('ubicacion'),
  fechaFabricacion: text('fecha_fabricacion'),
  fechaInstalacion: text('fecha_instalacion'),
  notas: text('notas'),
  imagen: text('imagen'),
  activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
  createdAt: ts(),
  updatedAt: ts(),
}, (t) => ({
  modeloIdx: index('maquinas_modelo_idx').on(t.modelo),
  serieIdx: index('maquinas_serie_idx').on(t.numeroSerie),
}));

/* ─────────────────────────────────────────────────────────────
   COTIZACIONES (cabecera + items)
   ───────────────────────────────────────────────────────────── */
export const cotizaciones = sqliteTable('cotizaciones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  folio: text('folio').notNull().unique(),
  clienteId: integer('cliente_id').references(() => clientes.id, { onDelete: 'set null' }),
  clienteNombre: text('cliente_nombre').notNull(),
  fecha: text('fecha').notNull().default(sql`CURRENT_DATE`),
  vigenciaDias: integer('vigencia_dias').default(15),
  moneda: text('moneda', { enum: ['MXN', 'USD'] }).notNull().default('MXN'),
  tipoCambio: real('tipo_cambio').default(17),
  subtotal: real('subtotal').default(0),
  iva: real('iva').default(0),
  total: real('total').default(0),
  estado: text('estado', { enum: ['borrador', 'enviada', 'aprobada', 'rechazada', 'facturada'] })
    .notNull().default('borrador'),
  notas: text('notas'),
  pdfPath: text('pdf_path'),
  creadoPorId: integer('creado_por_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: ts(),
  updatedAt: ts(),
}, (t) => ({
  folioIdx: index('cotizaciones_folio_idx').on(t.folio),
  clienteIdx: index('cotizaciones_cliente_idx').on(t.clienteId),
  fechaIdx: index('cotizaciones_fecha_idx').on(t.fecha),
}));

export const cotizacionItems = sqliteTable('cotizacion_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cotizacionId: integer('cotizacion_id').notNull()
    .references(() => cotizaciones.id, { onDelete: 'cascade' }),
  refaccionId: integer('refaccion_id').references(() => refacciones.id, { onDelete: 'set null' }),
  numeroParte: text('numero_parte'),
  descripcion: text('descripcion').notNull(),
  cantidad: real('cantidad').notNull().default(1),
  precioUnitario: real('precio_unitario').notNull().default(0),
  importe: real('importe').notNull().default(0),
  orden: integer('orden').default(0),
}, (t) => ({ cotIdx: index('cotitems_cot_idx').on(t.cotizacionId) }));

/* ─────────────────────────────────────────────────────────────
   VENTAS (cotización aprobada → venta)
   ───────────────────────────────────────────────────────────── */
export const ventas = sqliteTable('ventas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cotizacionId: integer('cotizacion_id').references(() => cotizaciones.id, { onDelete: 'set null' }),
  folioFactura: text('folio_factura'),
  clienteId: integer('cliente_id').references(() => clientes.id, { onDelete: 'set null' }),
  clienteNombre: text('cliente_nombre').notNull(),
  fechaVenta: text('fecha_venta').notNull().default(sql`CURRENT_DATE`),
  total: real('total').notNull().default(0),
  moneda: text('moneda', { enum: ['MXN', 'USD'] }).notNull().default('MXN'),
  pagado: integer('pagado', { mode: 'boolean' }).notNull().default(false),
  fechaPago: text('fecha_pago'),
  notas: text('notas'),
  createdAt: ts(),
}, (t) => ({
  fechaIdx: index('ventas_fecha_idx').on(t.fechaVenta),
  clienteIdx: index('ventas_cliente_idx').on(t.clienteId),
}));

/* ─────────────────────────────────────────────────────────────
   TARIFAS (key-value para configuración)
   ───────────────────────────────────────────────────────────── */
export const tarifas = sqliteTable('tarifas', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  categoria: text('categoria').default('general'),
  notas: text('notas'),
  updatedAt: ts(),
});

/* ─────────────────────────────────────────────────────────────
   PROSPECTOS (CRM/sales pipeline)
   ───────────────────────────────────────────────────────────── */
export const prospectos = sqliteTable('prospectos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  empresa: text('empresa').notNull(),
  contacto: text('contacto'),
  email: text('email'),
  telefono: text('telefono'),
  industria: text('industria'),
  ciudad: text('ciudad'),
  estado: text('estado', {
    enum: ['prospecto', 'contactado', 'calificado', 'propuesta', 'negociacion', 'ganado', 'perdido']
  }).notNull().default('prospecto'),
  potencialUsd: real('potencial_usd').default(0),
  scoreIa: integer('score_ia').default(50),
  notas: text('notas'),
  ubicacionLat: real('ubicacion_lat'),
  ubicacionLng: real('ubicacion_lng'),
  asignadoA: integer('asignado_a').references(() => users.id, { onDelete: 'set null' }),
  ultimoContacto: text('ultimo_contacto'),
  createdAt: ts(),
  updatedAt: ts(),
}, (t) => ({
  estadoIdx: index('prospectos_estado_idx').on(t.estado),
  industriaIdx: index('prospectos_industria_idx').on(t.industria),
}));

/* ─────────────────────────────────────────────────────────────
   PERSONAL / TÉCNICOS
   ───────────────────────────────────────────────────────────── */
export const personal = sqliteTable('personal', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  rol: text('rol', { enum: ['mecanico', 'electronico', 'cnc', 'ayudante', 'admin', 'otro'] })
    .notNull().default('mecanico'),
  email: text('email'),
  telefono: text('telefono'),
  fechaIngreso: text('fecha_ingreso'),
  tarifaHoraMxn: real('tarifa_hora_mxn'),
  activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
  notas: text('notas'),
  createdAt: ts(),
});

/* ─────────────────────────────────────────────────────────────
   GARANTÍAS + MANTENIMIENTOS PROGRAMADOS
   ───────────────────────────────────────────────────────────── */
export const garantias = sqliteTable('garantias', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clienteId: integer('cliente_id').references(() => clientes.id, { onDelete: 'set null' }),
  razonSocial: text('razon_social').notNull(),
  maquinaId: integer('maquina_id').references(() => maquinas.id, { onDelete: 'set null' }),
  modeloMaquina: text('modelo_maquina').notNull(),
  numeroSerie: text('numero_serie'),
  fechaInicio: text('fecha_inicio').notNull(),
  fechaFin: text('fecha_fin'),
  tipoMaquina: text('tipo_maquina'),
  activa: integer('activa', { mode: 'boolean' }).notNull().default(true),
  notas: text('notas'),
  createdAt: ts(),
}, (t) => ({ clienteIdx: index('garantias_cliente_idx').on(t.clienteId) }));

export const mantenimientosGarantia = sqliteTable('mantenimientos_garantia', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  garantiaId: integer('garantia_id').notNull().references(() => garantias.id, { onDelete: 'cascade' }),
  numero: integer('numero').notNull(), // 1ro, 2do, etc.
  fechaProgramada: text('fecha_programada').notNull(),
  fechaRealizado: text('fecha_realizado'),
  realizadoPor: text('realizado_por'),
  pagado: real('pagado').default(0),
  notas: text('notas'),
}, (t) => ({
  garantiaIdx: index('mant_garantia_idx').on(t.garantiaId),
  fechaIdx: index('mant_fecha_idx').on(t.fechaProgramada),
}));

/* ─────────────────────────────────────────────────────────────
   REVISIÓN MÁQUINAS (catálogo + estado)
   ───────────────────────────────────────────────────────────── */
export const revisionMaquinas = sqliteTable('revision_maquinas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  maquinaId: integer('maquina_id').references(() => maquinas.id, { onDelete: 'set null' }),
  categoria: text('categoria'),
  modelo: text('modelo'),
  numeroSerie: text('numero_serie'),
  entregado: text('entregado', { enum: ['Si', 'No'] }).default('No'),
  prueba: text('prueba', { enum: ['En Proceso', 'Finalizada'] }).default('En Proceso'),
  comentarios: text('comentarios'),
  createdAt: ts(),
  updatedAt: ts(),
});

/* ─────────────────────────────────────────────────────────────
   BONOS, VIAJES, BITÁCORA HORAS, SIN COBERTURA
   ───────────────────────────────────────────────────────────── */
export const bonos = sqliteTable('bonos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  personalId: integer('personal_id').references(() => personal.id, { onDelete: 'set null' }),
  nombre: text('nombre').notNull(),
  concepto: text('concepto').notNull(),
  monto: real('monto').notNull().default(0),
  fecha: text('fecha').notNull().default(sql`CURRENT_DATE`),
  pagado: integer('pagado', { mode: 'boolean' }).notNull().default(false),
  notas: text('notas'),
  createdAt: ts(),
});

export const viajes = sqliteTable('viajes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  zona: text('zona', { enum: ['A', 'B', 'C'] }).notNull(),
  destino: text('destino').notNull(),
  personasCount: integer('personas_count').default(1),
  diasCount: integer('dias_count').default(1),
  km: real('km'),
  totalViatico: real('total_viatico').default(0),
  totalKm: real('total_km').default(0),
  total: real('total').default(0),
  fecha: text('fecha').notNull().default(sql`CURRENT_DATE`),
  notas: text('notas'),
  createdAt: ts(),
});

export const bitacoraHoras = sqliteTable('bitacora_horas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  personalId: integer('personal_id').references(() => personal.id, { onDelete: 'cascade' }),
  fecha: text('fecha').notNull(),
  horaInicio: text('hora_inicio'),
  horaFin: text('hora_fin'),
  horas: real('horas').default(0),
  cliente: text('cliente'),
  trabajo: text('trabajo'),
  notas: text('notas'),
  createdAt: ts(),
}, (t) => ({ fechaIdx: index('bit_fecha_idx').on(t.fecha) }));

export const sinCobertura = sqliteTable('sin_cobertura', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clienteId: integer('cliente_id').references(() => clientes.id, { onDelete: 'set null' }),
  razonSocial: text('razon_social').notNull(),
  maquinaModelo: text('maquina_modelo'),
  motivo: text('motivo'),
  fechaSolicitud: text('fecha_solicitud').notNull().default(sql`CURRENT_DATE`),
  estado: text('estado', { enum: ['pendiente', 'cotizado', 'rechazado', 'aprobado'] })
    .notNull().default('pendiente'),
  notas: text('notas'),
  createdAt: ts(),
});

/* ─────────────────────────────────────────────────────────────
   TYPES INFERIDOS
   ───────────────────────────────────────────────────────────── */
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Cliente = typeof clientes.$inferSelect;
export type NewCliente = typeof clientes.$inferInsert;
export type Categoria = typeof categorias.$inferSelect;
export type Refaccion = typeof refacciones.$inferSelect;
export type NewRefaccion = typeof refacciones.$inferInsert;
export type Maquina = typeof maquinas.$inferSelect;
export type Cotizacion = typeof cotizaciones.$inferSelect;
export type CotizacionItem = typeof cotizacionItems.$inferSelect;
export type Venta = typeof ventas.$inferSelect;
export type Tarifa = typeof tarifas.$inferSelect;
export type Prospecto = typeof prospectos.$inferSelect;
export type Personal = typeof personal.$inferSelect;
export type Garantia = typeof garantias.$inferSelect;
export type MantenimientoGarantia = typeof mantenimientosGarantia.$inferSelect;
export type RevisionMaquina = typeof revisionMaquinas.$inferSelect;
export type Bono = typeof bonos.$inferSelect;
export type Viaje = typeof viajes.$inferSelect;
export type BitacoraHora = typeof bitacoraHoras.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
