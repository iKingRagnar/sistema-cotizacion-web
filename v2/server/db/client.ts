/**
 * Cliente Drizzle conectado a Turso (LibSQL).
 * En desarrollo puede usar file:./local.db.
 */
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { env } from '../env.js';
import * as schema from './schema.js';

const client = createClient({
  url: env.TURSO_DATABASE_URL,
  authToken: env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema, logger: env.NODE_ENV === 'development' });
export { schema };
