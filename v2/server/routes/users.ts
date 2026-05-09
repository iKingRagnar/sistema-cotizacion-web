/**
 * Usuarios — admin only para crear/editar.
 * GET sin password, POST con bcrypt.
 */
import { Router } from 'express';
import { eq, sql, like, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db, schema } from '../db/client.js';
import { userCreateSchema, userUpdateSchema } from '../../shared/schemas.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const q = (req.query.q as string || '').trim();
    const where = q ? like(schema.users.username, `%${q}%`) : undefined;
    const data = await db.select({
      id: schema.users.id,
      username: schema.users.username,
      email: schema.users.email,
      nombreCompleto: schema.users.nombreCompleto,
      role: schema.users.role,
      activo: schema.users.activo,
      lastLoginAt: schema.users.lastLoginAt,
      createdAt: schema.users.createdAt,
    }).from(schema.users).where(where).orderBy(schema.users.username);
    res.json({ data, total: data.length });
  } catch (err) { next(err); }
});

router.post('/', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const data = userCreateSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(data.password, 12);
    const inserted = await db.insert(schema.users).values({
      username: data.username,
      email: data.email || null,
      nombreCompleto: data.nombreCompleto || null,
      role: data.role,
      passwordHash,
      activo: true,
    }).returning();
    const user = inserted[0];
    res.status(201).json({
      id: user.id, username: user.username, role: user.role,
      email: user.email, nombreCompleto: user.nombreCompleto, activo: user.activo,
    });
  } catch (err) { next(err); }
});

router.put('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = userUpdateSchema.parse(req.body);
    const updateData: any = {
      updatedAt: new Date().toISOString(),
    };
    if (data.username) updateData.username = data.username;
    if (data.email !== undefined) updateData.email = data.email || null;
    if (data.nombreCompleto !== undefined) updateData.nombreCompleto = data.nombreCompleto || null;
    if (data.role) updateData.role = data.role;
    if (data.activo !== undefined) updateData.activo = data.activo;
    if (data.password) updateData.passwordHash = await bcrypt.hash(data.password, 12);

    const updated = await db.update(schema.users).set(updateData).where(eq(schema.users.id, id)).returning();
    if (!updated[0]) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }
    const u = updated[0];
    res.json({
      id: u.id, username: u.username, role: u.role,
      email: u.email, nombreCompleto: u.nombreCompleto, activo: u.activo,
    });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (id === req.user?.userId) {
      res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
      return;
    }
    await db.delete(schema.users).where(eq(schema.users.id, id));
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
