/**
 * Rutas para mantenimientos de garantía: list global, update, delete.
 * Útil para vista de calendario.
 */
import { Router } from 'express';
import { eq, sql, and, gte, lte } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { mantenimientoGarantiaSchema } from '../../shared/schemas.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

/* GET / — lista global con filtros opcionales por mes (?mes=YYYY-MM) */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const mes = req.query.mes as string | undefined; // formato YYYY-MM
    let wheres = [];
    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      wheres.push(sql`substr(${schema.mantenimientosGarantia.fechaProgramada}, 1, 7) = ${mes}`);
    }
    const data = await db.select({
      m: schema.mantenimientosGarantia,
      g: schema.garantias,
    })
      .from(schema.mantenimientosGarantia)
      .leftJoin(schema.garantias, eq(schema.mantenimientosGarantia.garantiaId, schema.garantias.id))
      .where(wheres.length ? and(...wheres) : undefined)
      .orderBy(schema.mantenimientosGarantia.fechaProgramada);
    /* Aplanar para frontend */
    const flat = data.map(({ m, g }) => ({
      ...m,
      razon_social: g?.razonSocial ?? null,
      modelo_maquina: g?.modeloMaquina ?? null,
      numero_serie: g?.numeroSerie ?? null,
    }));
    res.json(flat);
  } catch (err) { next(err); }
});

router.put('/:id', requireAuth, requireRole('admin', 'usuario'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = mantenimientoGarantiaSchema.partial().parse(req.body);
    const updated = await db.update(schema.mantenimientosGarantia).set(data)
      .where(eq(schema.mantenimientosGarantia.id, id)).returning();
    if (!updated[0]) { res.status(404).json({ error: 'Mantenimiento no encontrado' }); return; }
    res.json(updated[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.delete(schema.mantenimientosGarantia).where(eq(schema.mantenimientosGarantia.id, id));
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
