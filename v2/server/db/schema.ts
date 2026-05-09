/**
 * Schema de la DB con Drizzle ORM (LibSQL/Turso).
 * Tablas iniciales: users, sessions. Más se agregan por módulo.
 *
 * Para generar migrations: npm run db:generate
 * Para aplicar: npm run db:migrate
 */
import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/* ─────────────────────────────────────────────────────────────
   USERS — autenticación + roles
   ───────────────────────────────────────────────────────────── */
export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    username: text('username').notNull().unique(),
    email: text('email'),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ['admin', 'usuario', 'consulta'] }).notNull().default('usuario'),
    nombreCompleto: text('nombre_completo'),
    activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    lastLoginAt: text('last_login_at'),
  },
  (t) => ({
    usernameIdx: index('users_username_idx').on(t.username),
  })
);

/* ─────────────────────────────────────────────────────────────
   SESSIONS — refresh tokens (opcional, para logout server-side)
   ───────────────────────────────────────────────────────────── */
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    userAgent: text('user_agent'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    userIdx: index('sessions_user_idx').on(t.userId),
  })
);

/* ─────────────────────────────────────────────────────────────
   AUDIT LOG — registro de cambios
   ───────────────────────────────────────────────────────────── */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),     // 'create' | 'update' | 'delete' | 'login' | etc.
    entity: text('entity').notNull(),      // 'cliente' | 'cotizacion' | etc.
    entityId: text('entity_id'),
    details: text('details'),              // JSON serializado
    ip: text('ip'),
    timestamp: text('timestamp').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    entityIdx: index('audit_entity_idx').on(t.entity, t.entityId),
    userIdx: index('audit_user_idx').on(t.userId),
    timestampIdx: index('audit_timestamp_idx').on(t.timestamp),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
