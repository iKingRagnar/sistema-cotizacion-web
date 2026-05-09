/**
 * Error handler centralizado. NUNCA leak de stack traces a producción.
 */
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { env } from '../env.js';
import { logger } from '../logger.js';

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Endpoint no encontrado' });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validación fallida',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }

  const isProd = env.NODE_ENV === 'production';
  const message = err instanceof Error ? err.message : 'Error desconocido';

  logger.error({ err }, 'unhandled error');

  res.status(500).json({
    error: 'Error interno del servidor',
    ...(isProd ? {} : { detail: message }),
  });
}
