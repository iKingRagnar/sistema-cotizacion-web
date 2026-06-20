import { Router } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { garantiaSchema, mantenimientoGarantiaSchema } from '../../shared/schemas.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createCrudRouter } from '../lib/crud-factory.js';

const router = Router();

/* CRUD básico de garantías */
const crud = createCrudRouter({
  entity: 'garantia',
  table: schema.garantias,
  schema: garantiaSchema,
  searchableColumns: [schema.garantias.razonSocial, schema.garantias.modeloMaquina, schema.garantias.numeroSerie],
  filterableColumns: { activa: schema.garantias.activa, clienteId: schema.garantias.clienteId },
  defaultOrderColumn: schema.garantias.fechaInicio,
  defaultOrderDir: 'desc',
});
router.use('/', crud);

/* GET /:id/mantenimientos — lista de mantenimientos de una garantía */
router.get('/:id/mantenimientos', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = await db.select().from(schema.mantenimientosGarantia)
      .where(eq(schema.mantenimientosGarantia.garantiaId, id))
      .orderBy(desc(schema.mantenimientosGarantia.fechaProgramada));
    res.json(data);
  } catch (err) { next(err); }
});

/* POST /:id/mantenimientos — agregar mantenimiento */
router.post('/:id/mantenimientos', requireAuth, requireRole('admin', 'usuario'), async (req, res, next) => {
  try {
    const garantiaId = parseInt(req.params.id, 10);
    const data = mantenimientoGarantiaSchema.parse({ ...req.body, garantiaId });
    const inserted = await db.insert(schema.mantenimientosGarantia).values(data).returning();
    res.status(201).json(inserted[0]);
  } catch (err) { next(err); }
});

export default router;
