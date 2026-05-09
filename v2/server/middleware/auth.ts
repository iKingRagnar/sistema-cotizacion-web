/**
 * Middleware de autenticación JWT.
 * Lee el token de la cookie httpOnly `auth_token` o del header Authorization Bearer.
 */
import type { Request, Response, NextFunction } from 'express';
import { jwtVerify } from 'jose';
import { env } from '../env.js';

const JWT_SECRET_BYTES = new TextEncoder().encode(env.JWT_SECRET);

export interface AuthPayload {
  userId: number;
  username: string;
  role: 'admin' | 'usuario' | 'consulta';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

function extractToken(req: Request): string | null {
  if (req.cookies?.auth_token) return req.cookies.auth_token;
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET_BYTES);
    req.user = payload as unknown as AuthPayload;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

export function requireRole(...roles: AuthPayload['role'][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({ error: 'No autenticado' }); return; }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Permiso insuficiente para esta acción' });
      return;
    }
    next();
  };
}

/* Optional auth — adjunta user si existe token, pero no falla si no hay */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) { next(); return; }
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET_BYTES);
    req.user = payload as unknown as AuthPayload;
  } catch { /* ignorar errores en optional */ }
  next();
}
