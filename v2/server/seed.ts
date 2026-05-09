/**
 * Script de seed inicial: crea usuario admin si no existe.
 * Ejecutar con: tsx server/seed.ts
 *
 * Variables de entorno:
 *   ADMIN_USERNAME (default: admin)
 *   ADMIN_PASSWORD (default: admin123 — CAMBIAR EN PRODUCCIÓN)
 */
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, schema } from './db/client.js';
import { logger } from './logger.js';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

async function seed(): Promise<void> {
  logger.info('🌱 Iniciando seed...');

  /* Verificar si admin ya existe */
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.username, ADMIN_USERNAME),
  });

  if (existing) {
    logger.info(`✓ Usuario "${ADMIN_USERNAME}" ya existe (id=${existing.id}). Skip.`);
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  await db.insert(schema.users).values({
    username: ADMIN_USERNAME,
    nombreCompleto: 'Administrador',
    role: 'admin',
    passwordHash,
    activo: true,
  });

  logger.info(`✅ Usuario admin creado:`);
  logger.info(`   username: ${ADMIN_USERNAME}`);
  logger.info(`   password: ${ADMIN_PASSWORD}`);
  logger.info(`   ⚠️  CAMBIA esta contraseña inmediatamente en producción.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'Seed falló');
    process.exit(1);
  });
