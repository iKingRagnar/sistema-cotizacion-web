/**
 * Bootstrap del servidor Express.
 * En producción sirve también el frontend buildeado desde dist/public.
 */
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { env } from './env.js';
import { logger } from './logger.js';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler, notFound } from './middleware/error.js';
import authRoutes from './routes/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

/* ── Middlewares globales ────────────────────────── */
app.use(helmet({
  contentSecurityPolicy: false, // Lo manejamos a nivel de meta tag (Vite assets)
  crossOriginEmbedderPolicy: false,
}));
app.use(corsMiddleware);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());

/* ── Health check ────────────────────────────────── */
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    version: '2.0.0',
    env: env.NODE_ENV,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/* ── Rutas API ───────────────────────────────────── */
app.use('/api/auth', authRoutes);
// app.use('/api/clientes', clientesRoutes);  // TODO: Sesión 2
// app.use('/api/refacciones', refaccionesRoutes);  // TODO: Sesión 2
// ... etc

/* ── Servir frontend en producción ───────────────── */
if (env.NODE_ENV === 'production') {
  const publicDir = resolve(__dirname, '../public');
  app.use(express.static(publicDir, {
    maxAge: '1h',
    etag: true,
    setHeaders: (res, path) => {
      // index.html SIEMPRE no-cache para que actualizaciones se reflejen
      if (path.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-store, must-revalidate');
      }
    },
  }));

  // SPA fallback: cualquier ruta no /api/* sirve index.html
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(resolve(publicDir, 'index.html'));
  });
}

/* ── 404 + error handler ─────────────────────────── */
app.use('/api/*', notFound);
app.use(errorHandler);

/* ── Listen ──────────────────────────────────────── */
const server = app.listen(env.PORT, () => {
  logger.info(`🚀 Servidor escuchando en puerto ${env.PORT} (${env.NODE_ENV})`);
});

/* ── Graceful shutdown ───────────────────────────── */
process.on('SIGTERM', () => {
  logger.info('SIGTERM recibido, cerrando servidor...');
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  logger.info('SIGINT recibido, cerrando servidor...');
  server.close(() => process.exit(0));
});
