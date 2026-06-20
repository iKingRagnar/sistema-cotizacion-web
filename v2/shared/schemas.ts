/**
 * Zod schemas compartidos frontend↔backend.
 * Validación end-to-end con un único source of truth.
 */
import { z } from 'zod';

/* ── Enums ──────────────────────────────────────────────── */
export const roleSchema = z.enum(['admin', 'usuario', 'consulta']);
export type Role = z.infer<typeof roleSchema>;

export const cotizacionEstadoSchema = z.enum(['borrador', 'enviada', 'aprobada', 'rechazada', 'facturada']);
export const monedaSchema = z.enum(['MXN', 'USD']);
export const prospectoEstadoSchema = z.enum(['prospecto', 'contactado', 'calificado', 'propuesta', 'negociacion', 'ganado', 'perdido']);
export const personalRolSchema = z.enum(['mecanico', 'electronico', 'cnc', 'ayudante', 'admin', 'otro']);
export const zonaViajeSchema = z.enum(['A', 'B', 'C']);

/* ── Auth ───────────────────────────────────────────────── */
export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Usuario requerido').max(80),
  password: z.string().min(1, 'Contraseña requerida').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const userPublicSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string().nullable().optional(),
  nombreCompleto: z.string().nullable().optional(),
  role: roleSchema,
  activo: z.boolean(),
  lastLoginAt: z.string().nullable().optional(),
});
export type UserPublic = z.infer<typeof userPublicSchema>;

export const userCreateSchema = z.object({
  username: z.string().trim().min(3).max(80),
  password: z.string().min(6).max(200),
  email: z.string().email().optional().or(z.literal('')),
  nombreCompleto: z.string().max(200).optional(),
  role: roleSchema.default('usuario'),
});

export const userUpdateSchema = userCreateSchema.partial().omit({ password: true }).extend({
  password: z.string().min(6).max(200).optional(),
  activo: z.boolean().optional(),
});

/* ── Helpers ────────────────────────────────────────────── */
const optionalStr = z.string().nullable().optional().transform((s) => (s === '' ? null : s));
const optionalNum = z.coerce.number().nullable().optional();
const boolFlag = z.coerce.boolean().optional();

/* ── CLIENTES ───────────────────────────────────────────── */
export const clienteSchema = z.object({
  razonSocial: z.string().trim().min(1, 'Razón social requerida').max(255),
  rfc: optionalStr,
  contacto: optionalStr,
  email: z.string().email().optional().or(z.literal('')).nullable(),
  telefono: optionalStr,
  direccion: optionalStr,
  ciudad: optionalStr,
  estado: optionalStr,
  pais: z.string().default('México').optional(),
  notas: optionalStr,
  activo: boolFlag,
});
export type ClienteInput = z.infer<typeof clienteSchema>;

/* ── CATEGORÍAS ─────────────────────────────────────────── */
export const categoriaSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  parentId: z.coerce.number().int().positive().nullable().optional(),
  tipo: z.enum(['refaccion', 'maquina']).default('refaccion'),
  orden: z.coerce.number().int().default(0).optional(),
});
export type CategoriaInput = z.infer<typeof categoriaSchema>;

/* ── REFACCIONES ────────────────────────────────────────── */
export const refaccionSchema = z.object({
  numeroParte: z.string().trim().min(1, 'Número de parte requerido').max(120),
  descripcion: z.string().trim().min(1, 'Descripción requerida').max(500),
  categoria: optionalStr,
  subcategoria: optionalStr,
  marca: optionalStr,
  proveedor: optionalStr,
  precioCompraUsd: optionalNum,
  precioVentaUsd: optionalNum,
  precioVentaMxn: optionalNum,
  stock: z.coerce.number().int().default(0).optional(),
  stockMinimo: z.coerce.number().int().default(0).optional(),
  ubicacion: optionalStr,
  notas: optionalStr,
  activo: boolFlag,
});
export type RefaccionInput = z.infer<typeof refaccionSchema>;

/* ── MÁQUINAS ───────────────────────────────────────────── */
export const maquinaSchema = z.object({
  modelo: z.string().trim().min(1, 'Modelo requerido').max(200),
  numeroSerie: optionalStr,
  categoria: optionalStr,
  clienteId: z.coerce.number().int().positive().nullable().optional(),
  clienteNombre: optionalStr,
  ubicacion: optionalStr,
  fechaFabricacion: optionalStr,
  fechaInstalacion: optionalStr,
  notas: optionalStr,
  imagen: optionalStr,
  activo: boolFlag,
});
export type MaquinaInput = z.infer<typeof maquinaSchema>;

/* ── COTIZACIONES ───────────────────────────────────────── */
export const cotizacionItemSchema = z.object({
  refaccionId: z.coerce.number().int().positive().nullable().optional(),
  numeroParte: optionalStr,
  descripcion: z.string().trim().min(1).max(500),
  cantidad: z.coerce.number().positive().default(1),
  precioUnitario: z.coerce.number().nonnegative().default(0),
});
export type CotizacionItemInput = z.infer<typeof cotizacionItemSchema>;

export const cotizacionSchema = z.object({
  folio: optionalStr,
  clienteId: z.coerce.number().int().positive().nullable().optional(),
  clienteNombre: z.string().trim().min(1).max(255),
  fecha: z.string().optional(),
  vigenciaDias: z.coerce.number().int().default(15).optional(),
  moneda: monedaSchema.default('MXN'),
  tipoCambio: z.coerce.number().positive().default(17),
  estado: cotizacionEstadoSchema.default('borrador'),
  notas: optionalStr,
  items: z.array(cotizacionItemSchema).default([]),
});
export type CotizacionInput = z.infer<typeof cotizacionSchema>;

/* ── VENTAS ─────────────────────────────────────────────── */
export const ventaSchema = z.object({
  cotizacionId: z.coerce.number().int().positive().nullable().optional(),
  folioFactura: optionalStr,
  clienteId: z.coerce.number().int().positive().nullable().optional(),
  clienteNombre: z.string().trim().min(1).max(255),
  fechaVenta: z.string().optional(),
  total: z.coerce.number().nonnegative(),
  moneda: monedaSchema.default('MXN'),
  pagado: boolFlag,
  fechaPago: optionalStr,
  notas: optionalStr,
});
export type VentaInput = z.infer<typeof ventaSchema>;

/* ── TARIFAS (key-value) ────────────────────────────────── */
export const tarifaSchema = z.object({
  key: z.string().trim().min(1).max(120),
  value: z.string().max(500),
  categoria: z.string().default('general').optional(),
  notas: optionalStr,
});

export const tarifasBulkSchema = z.array(tarifaSchema);

/* ── PROSPECTOS ─────────────────────────────────────────── */
export const prospectoSchema = z.object({
  empresa: z.string().trim().min(1).max(255),
  contacto: optionalStr,
  email: z.string().email().optional().or(z.literal('')).nullable(),
  telefono: optionalStr,
  industria: optionalStr,
  ciudad: optionalStr,
  estado: prospectoEstadoSchema.default('prospecto'),
  potencialUsd: z.coerce.number().nonnegative().default(0),
  scoreIa: z.coerce.number().int().min(0).max(100).default(50),
  notas: optionalStr,
  ubicacionLat: z.coerce.number().nullable().optional(),
  ubicacionLng: z.coerce.number().nullable().optional(),
  asignadoA: z.coerce.number().int().positive().nullable().optional(),
  ultimoContacto: optionalStr,
});
export type ProspectoInput = z.infer<typeof prospectoSchema>;

/* ── PERSONAL ───────────────────────────────────────────── */
export const personalSchema = z.object({
  nombre: z.string().trim().min(1).max(200),
  rol: personalRolSchema.default('mecanico'),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  telefono: optionalStr,
  fechaIngreso: optionalStr,
  tarifaHoraMxn: optionalNum,
  activo: boolFlag,
  notas: optionalStr,
});
export type PersonalInput = z.infer<typeof personalSchema>;

/* ── GARANTÍAS + MANTENIMIENTOS ─────────────────────────── */
export const garantiaSchema = z.object({
  clienteId: z.coerce.number().int().positive().nullable().optional(),
  razonSocial: z.string().trim().min(1).max(255),
  maquinaId: z.coerce.number().int().positive().nullable().optional(),
  modeloMaquina: z.string().trim().min(1).max(200),
  numeroSerie: optionalStr,
  fechaInicio: z.string().min(1),
  fechaFin: optionalStr,
  tipoMaquina: optionalStr,
  activa: boolFlag,
  notas: optionalStr,
});
export type GarantiaInput = z.infer<typeof garantiaSchema>;

export const mantenimientoGarantiaSchema = z.object({
  garantiaId: z.coerce.number().int().positive(),
  numero: z.coerce.number().int().min(1).default(1),
  fechaProgramada: z.string().min(1),
  fechaRealizado: optionalStr,
  realizadoPor: optionalStr,
  pagado: z.coerce.number().nonnegative().default(0).optional(),
  notas: optionalStr,
});
export type MantenimientoGarantiaInput = z.infer<typeof mantenimientoGarantiaSchema>;

/* ── REVISIÓN MÁQUINAS ──────────────────────────────────── */
export const revisionMaquinaSchema = z.object({
  maquinaId: z.coerce.number().int().positive().nullable().optional(),
  categoria: optionalStr,
  modelo: optionalStr,
  numeroSerie: optionalStr,
  entregado: z.enum(['Si', 'No']).default('No'),
  prueba: z.enum(['En Proceso', 'Finalizada']).default('En Proceso'),
  comentarios: optionalStr,
});
export type RevisionMaquinaInput = z.infer<typeof revisionMaquinaSchema>;

/* ── BONOS / VIAJES / BITÁCORA / SIN COBERTURA ──────────── */
export const bonoSchema = z.object({
  personalId: z.coerce.number().int().positive().nullable().optional(),
  nombre: z.string().trim().min(1).max(200),
  concepto: z.string().trim().min(1).max(500),
  monto: z.coerce.number().nonnegative().default(0),
  fecha: z.string().optional(),
  pagado: boolFlag,
  notas: optionalStr,
});
export type BonoInput = z.infer<typeof bonoSchema>;

export const viajeSchema = z.object({
  zona: zonaViajeSchema,
  destino: z.string().trim().min(1).max(255),
  personasCount: z.coerce.number().int().min(1).default(1),
  diasCount: z.coerce.number().int().min(1).default(1),
  km: optionalNum,
  totalViatico: z.coerce.number().nonnegative().default(0),
  totalKm: z.coerce.number().nonnegative().default(0),
  total: z.coerce.number().nonnegative().default(0),
  fecha: z.string().optional(),
  notas: optionalStr,
});
export type ViajeInput = z.infer<typeof viajeSchema>;

export const bitacoraHoraSchema = z.object({
  personalId: z.coerce.number().int().positive(),
  fecha: z.string().min(1),
  horaInicio: optionalStr,
  horaFin: optionalStr,
  horas: z.coerce.number().nonnegative().default(0),
  cliente: optionalStr,
  trabajo: optionalStr,
  notas: optionalStr,
});
export type BitacoraHoraInput = z.infer<typeof bitacoraHoraSchema>;

export const sinCoberturaSchema = z.object({
  clienteId: z.coerce.number().int().positive().nullable().optional(),
  razonSocial: z.string().trim().min(1).max(255),
  maquinaModelo: optionalStr,
  motivo: optionalStr,
  fechaSolicitud: z.string().optional(),
  estado: z.enum(['pendiente', 'cotizado', 'rechazado', 'aprobado']).default('pendiente'),
  notas: optionalStr,
});
export type SinCoberturaInput = z.infer<typeof sinCoberturaSchema>;

/* ── DAVAI ──────────────────────────────────────────────── */
export const davaiChatSchema = z.object({
  message: z.string().min(1).max(8000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })).optional(),
});
export type DavaiChatInput = z.infer<typeof davaiChatSchema>;
