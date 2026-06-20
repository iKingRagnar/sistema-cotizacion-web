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
import clientesRoutes from './routes/clientes.js';
import categoriasRoutes from './routes/categorias.js';
import refaccionesRoutes from './routes/refacciones.js';
import maquinasRoutes from './routes/maquinas.js';
import cotizacionesRoutes from './routes/cotizaciones.js';
import ventasRoutes from './routes/ventas.js';
import tarifasRoutes from './routes/tarifas.js';
import prospectosRoutes from './routes/prospectos.js';
import personalRoutes from './routes/personal.js';
import garantiasRoutes from './routes/garantias.js';
import mantenimientosRoutes from './routes/mantenimientos.js';
import revisionMaquinasRoutes from './routes/revision-maquinas.js';
import bonosRoutes from './routes/bonos.js';
import viajesRoutes from './routes/viajes.js';
import sinCoberturaRoutes from './routes/sin-cobertura.js';
import bitacoraRoutes from './routes/bitacora.js';
import usersRoutes from './routes/users.js';
import davaiRoutes from './routes/davai.js';
import reportesRoutes from './routes/reportes.js';
import auditRoutes from './routes/audit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

/* ── Middlewares globales ────────────────────────── */
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
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
app.use('/api/clientes', clientesRoutes);
app.use('/api/categorias', categoriasRoutes);
app.use('/api/refacciones', refaccionesRoutes);
app.use('/api/maquinas', maquinasRoutes);
app.use('/api/cotizaciones', cotizacionesRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/tarifas', tarifasRoutes);
app.use('/api/prospectos', prospectosRoutes);
app.use('/api/personal', personalRoutes);
app.use('/api/garantias', garantiasRoutes);
app.use('/api/mantenimientos', mantenimientosRoutes);
app.use('/api/revision-maquinas', revisionMaquinasRoutes);
app.use('/api/bonos', bonosRoutes);
app.use('/api/viajes', viajesRoutes);
app.use('/api/sin-cobertura', sinCoberturaRoutes);
app.use('/api/bitacora-horas', bitacoraRoutes);
app.use('/api/usuarios', usersRoutes);
app.use('/api/davai', davaiRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/audit', auditRoutes);

/* ── Servir frontend en producción ───────────────── */
if (env.NODE_ENV === 'production') {
  const publicDir = resolve(__dirname, '../public');
  app.use(express.static(publicDir, {
    maxAge: '1h',
    etag: true,
    setHeaders: (res, path) => {
      if (path.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-store, must-revalidate');
      }
    },
  }));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(resolve(publicDir, 'index.html'));
  });
}

/* ── 404 + error handler ─────────────────────────── */
app.use('/api/*', notFound);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 Servidor escuchando en puerto ${env.PORT} (${env.NODE_ENV})`);
});

process.on('SIGTERM', () => { logger.info('SIGTERM'); server.close(() => process.exit(0)); });
process.on('SIGINT', () => { logger.info('SIGINT'); server.close(() => process.exit(0)); });
