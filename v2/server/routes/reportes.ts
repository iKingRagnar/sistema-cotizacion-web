/**
 * Reportes — endpoints agregados que el frontend pinta como charts/cards.
 */
import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/dashboard', requireAuth, async (_req, res, next) => {
  try {
    const [
      totalClientes,
      totalRefacciones,
      totalMaquinas,
      totalProspectos,
      cotizacionesPorEstado,
      ventasUltimoMes,
      prospectosPorEstado,
    ] = await Promise.all([
      db.select({ c: sql<number>`count(*)` }).from(schema.clientes),
      db.select({ c: sql<number>`count(*)` }).from(schema.refacciones),
      db.select({ c: sql<number>`count(*)` }).from(schema.maquinas),
      db.select({ c: sql<number>`count(*)` }).from(schema.prospectos),
      db.select({
        estado: schema.cotizaciones.estado,
        count: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(${schema.cotizaciones.total}), 0)`,
      }).from(schema.cotizaciones).groupBy(schema.cotizaciones.estado),
      db.select({
        total: sql<number>`coalesce(sum(${schema.ventas.total}), 0)`,
        count: sql<number>`count(*)`,
      }).from(schema.ventas)
        .where(sql`${schema.ventas.fechaVenta} >= date('now', '-30 days')`),
      db.select({
        estado: schema.prospectos.estado,
        count: sql<number>`count(*)`,
        potencial: sql<number>`coalesce(sum(${schema.prospectos.potencialUsd}), 0)`,
      }).from(schema.prospectos).groupBy(schema.prospectos.estado),
    ]);

    res.json({
      counters: {
        clientes: totalClientes[0]?.c ?? 0,
        refacciones: totalRefacciones[0]?.c ?? 0,
        maquinas: totalMaquinas[0]?.c ?? 0,
        prospectos: totalProspectos[0]?.c ?? 0,
      },
      cotizaciones: cotizacionesPorEstado,
      ventasUltimoMes: ventasUltimoMes[0] ?? { total: 0, count: 0 },
      prospectos: prospectosPorEstado,
    });
  } catch (err) { next(err); }
});

export default router;
