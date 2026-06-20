/**
 * Tarifas — key/value store. GET all, PUT bulk para guardar varios al vez.
 */
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { tarifaSchema, tarifasBulkSchema } from '../../shared/schemas.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const data = await db.select().from(schema.tarifas);
    res.json(data);
  } catch (err) { next(err); }
});

router.put('/', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const items = tarifasBulkSchema.parse(req.body);
    /* Upsert uno por uno */
    for (const item of items) {
      await db.insert(schema.tarifas).values({
        key: item.key,
        value: item.value,
        categoria: item.categoria ?? 'general',
        notas: item.notas ?? null,
        updatedAt: new Date().toISOString(),
      }).onConflictDoUpdate({
        target: schema.tarifas.key,
        set: { value: item.value, categoria: item.categoria ?? 'general', notas: item.notas ?? null, updatedAt: new Date().toISOString() },
      });
    }
    const data = await db.select().from(schema.tarifas);
    res.json({ ok: true, count: items.length, data });
  } catch (err) { next(err); }
});

router.put('/:key', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const key = req.params.key;
    const data = tarifaSchema.partial().parse({ ...req.body, key });
    await db.insert(schema.tarifas).values({
      key,
      value: data.value ?? '',
      categoria: data.categoria ?? 'general',
      notas: data.notas ?? null,
      updatedAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: schema.tarifas.key,
      set: { value: data.value ?? '', updatedAt: new Date().toISOString() },
    });
    res.json({ ok: true, key });
  } catch (err) { next(err); }
});

export default router;
