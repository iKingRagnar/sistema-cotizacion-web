/**
 * Rutas de autenticación: login, me, logout.
 * Token = JWT firmado con jose, vive en cookie httpOnly.
 */
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import rateLimit from 'express-rate-limit';
import { db, schema } from '../db/client.js';
import { env } from '../env.js';
import { requireAuth } from '../middleware/auth.js';
import { loginSchema } from '../../shared/schemas.js';
import { logger } from '../logger.js';

const router = Router();
const JWT_SECRET_BYTES = new TextEncoder().encode(env.JWT_SECRET);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos, espera 15 minutos.' },
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await db.query.users.findFirst({
      where: eq(schema.users.username, body.username),
    });

    if (!user || !user.activo) {
      res.status(401).json({ error: 'Credenciales incorrectas' });
      return;
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Credenciales incorrectas' });
      return;
    }

    const token = await new SignJWT({
      userId: user.id,
      username: user.username,
      role: user.role,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(env.JWT_EXPIRES_IN)
      .sign(JWT_SECRET_BYTES);

    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
      path: '/',
    });

    /* Update lastLoginAt */
    await db.update(schema.users)
      .set({ lastLoginAt: new Date().toISOString() })
      .where(eq(schema.users.id, user.id));

    logger.info({ userId: user.id, username: user.username }, 'login exitoso');

    res.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        nombreCompleto: user.nombreCompleto,
        role: user.role,
      },
      token, // también lo devolvemos por si el cliente quiere usar localStorage (PWA)
    });
  } catch (err) { next(err); }
});

router.post('/logout', (_req, res) => {
  res.clearCookie('auth_token', { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, req.user!.userId),
      columns: { passwordHash: false },
    });
    if (!user) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }
    res.json({ user });
  } catch (err) { next(err); }
});

export default router;
