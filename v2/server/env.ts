/**
 * Validación de variables de entorno con Zod.
 * Si falta alguna requerida, el servidor NO arranca y muestra exactamente cuál.
 */
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  TURSO_DATABASE_URL: z.string().min(1, 'TURSO_DATABASE_URL es requerido (usa file:./local.db para desarrollo)'),
  TURSO_AUTH_TOKEN: z.string().optional(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres. Genera con: openssl rand -hex 32'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3000'),

  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:\n');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('\n💡 Copia .env.example a .env y configura los valores.');
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
