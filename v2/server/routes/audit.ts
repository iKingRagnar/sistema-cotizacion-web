/**
 * Audit log — solo lectura para admin.
 */
import { Router } from 'express';
import { desc, eq, sql, and, type SQL } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(500, parseInt(req.query.pageSize as string) || 100);
    const entity = req.query.entity as string;
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;

    const wheres: SQL[] = [];
    if (entity) wheres.push(eq(schema.auditLog.entity, entity));
    if (userId) wheres.push(eq(schema.auditLog.userId, userId));

    const data = await db.select().from(schema.auditLog)
      .where(wheres.length ? and(...wheres) : undefined)
      .orderBy(desc(schema.auditLog.timestamp))
      .limit(pageSize).offset((page - 1) * pageSize);
    const totalRows = await db.select({ c: sql<number>`count(*)` }).from(schema.auditLog)
      .where(wheres.length ? and(...wheres) : undefined);

    res.json({ data, total: totalRows[0]?.c ?? 0, page, pageSize });
  } catch (err) { next(err); }
});

export default router;
