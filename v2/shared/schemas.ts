/**
 * Zod schemas compartidos entre frontend y backend.
 * Validación end-to-end con un único source of truth.
 */
import { z } from 'zod';

export const roleSchema = z.enum(['admin', 'usuario', 'consulta']);
export type Role = z.infer<typeof roleSchema>;

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
