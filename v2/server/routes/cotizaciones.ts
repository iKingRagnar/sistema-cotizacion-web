/**
 * Rutas custom para cotizaciones — incluyen items en cabecera + items aparte.
 */
import { Router } from 'express';
import { eq, sql, like, and, desc, type SQL } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { cotizacionSchema } from '../../shared/schemas.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logger } from '../logger.js';

const router = Router();

function calcularTotales(items: Array<{ cantidad: number; precioUnitario: number }>) {
  const subtotal = items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0);
  const iva = +(subtotal * 0.16).toFixed(2);
  const total = +(subtotal + iva).toFixed(2);
  return { subtotal: +subtotal.toFixed(2), iva, total };
}

async function generarFolio(): Promise<string> {
  const year = new Date().getFullYear();
  const last = await db.select({ folio: schema.cotizaciones.folio })
    .from(schema.cotizaciones)
    .where(like(schema.cotizaciones.folio, `COT-${year}-%`))
    .orderBy(desc(schema.cotizaciones.id))
    .limit(1);
  const lastNum = last[0]?.folio?.match(/-(\d+)$/)?.[1];
  const next = lastNum ? parseInt(lastNum) + 1 : 1;
  return `COT-${year}-${String(next).padStart(4, '0')}`;
}

/* GET / — lista con filtros */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(500, parseInt(req.query.pageSize as string) || 100);
    const q = (req.query.q as string || '').trim();
    const estado = req.query.estado as string;

    const wheres: SQL[] = [];
    if (q) wheres.push(sql`(${schema.cotizaciones.folio} LIKE ${'%' + q + '%'} OR ${schema.cotizaciones.clienteNombre} LIKE ${'%' + q + '%'})`);
    if (estado) wheres.push(eq(schema.cotizaciones.estado, estado as any));

    const data = await db.select().from(schema.cotizaciones)
      .where(wheres.length ? and(...wheres) : undefined)
      .orderBy(desc(schema.cotizaciones.createdAt))
      .limit(pageSize).offset((page - 1) * pageSize);
    const totalRows = await db.select({ count: sql<number>`count(*)` }).from(schema.cotizaciones)
      .where(wheres.length ? and(...wheres) : undefined);
    res.json({ data, total: totalRows[0]?.count ?? 0, page, pageSize });
  } catch (err) { next(err); }
});

/* GET /:id — cabecera + items */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const cot = await db.query.cotizaciones.findFirst({ where: eq(schema.cotizaciones.id, id) });
    if (!cot) { res.status(404).json({ error: 'Cotización no encontrada' }); return; }
    const items = await db.select().from(schema.cotizacionItems)
      .where(eq(schema.cotizacionItems.cotizacionId, id))
      .orderBy(schema.cotizacionItems.orden);
    res.json({ ...cot, items });
  } catch (err) { next(err); }
});

/* POST / — crear cotización + items */
router.post('/', requireAuth, requireRole('admin', 'usuario'), async (req, res, next) => {
  try {
    const parsed = cotizacionSchema.parse(req.body);
    const folio = parsed.folio || await generarFolio();
    const totales = calcularTotales(parsed.items);

    const cotInserted = await db.insert(schema.cotizaciones).values({
      folio,
      clienteId: parsed.clienteId ?? null,
      clienteNombre: parsed.clienteNombre,
      fecha: parsed.fecha ?? new Date().toISOString().slice(0, 10),
      vigenciaDias: parsed.vigenciaDias ?? 15,
      moneda: parsed.moneda,
      tipoCambio: parsed.tipoCambio,
      estado: parsed.estado,
      notas: parsed.notas ?? null,
      ...totales,
      creadoPorId: req.user?.userId ?? null,
    }).returning();
    const cot = cotInserted[0];

    if (parsed.items.length) {
      await db.insert(schema.cotizacionItems).values(parsed.items.map((it, idx) => ({
        cotizacionId: cot.id,
        refaccionId: it.refaccionId ?? null,
        numeroParte: it.numeroParte ?? null,
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        precioUnitario: it.precioUnitario,
        importe: +(it.cantidad * it.precioUnitario).toFixed(2),
        orden: idx,
      })));
    }

    logger.info({ cotId: cot.id, folio: cot.folio }, 'cotización creada');
    res.status(201).json(cot);
  } catch (err) { next(err); }
});

/* PUT /:id — actualizar (reemplaza items) */
router.put('/:id', requireAuth, requireRole('admin', 'usuario'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const parsed = cotizacionSchema.parse(req.body);
    const totales = calcularTotales(parsed.items);

    const updated = await db.update(schema.cotizaciones).set({
      clienteId: parsed.clienteId ?? null,
      clienteNombre: parsed.clienteNombre,
      moneda: parsed.moneda,
      tipoCambio: parsed.tipoCambio,
      estado: parsed.estado,
      notas: parsed.notas ?? null,
      ...totales,
      updatedAt: new Date().toISOString(),
    }).where(eq(schema.cotizaciones.id, id)).returning();

    if (!updated[0]) { res.status(404).json({ error: 'No encontrada' }); return; }

    /* Reemplazar items */
    await db.delete(schema.cotizacionItems).where(eq(schema.cotizacionItems.cotizacionId, id));
    if (parsed.items.length) {
      await db.insert(schema.cotizacionItems).values(parsed.items.map((it, idx) => ({
        cotizacionId: id,
        refaccionId: it.refaccionId ?? null,
        numeroParte: it.numeroParte ?? null,
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        precioUnitario: it.precioUnitario,
        importe: +(it.cantidad * it.precioUnitario).toFixed(2),
        orden: idx,
      })));
    }

    res.json(updated[0]);
  } catch (err) { next(err); }
});

/* DELETE /:id */
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = await db.delete(schema.cotizaciones).where(eq(schema.cotizaciones.id, id)).returning();
    if (!deleted[0]) { res.status(404).json({ error: 'No encontrada' }); return; }
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
