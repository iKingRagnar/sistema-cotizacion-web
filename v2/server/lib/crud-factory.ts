/**
 * Factory genérico para CRUDs simples.
 * Genera Router Express con GET list, GET :id, POST, PUT :id, DELETE :id
 * Maneja paginación, filtros básicos, validación con Zod.
 *
 * Para casos especiales (joins, lógica compleja), usa rutas custom.
 */
import { Router } from 'express';
import { eq, sql, and, like, desc, asc, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import type { SQLiteTable, AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { db } from '../db/client.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logger } from '../logger.js';

export interface CrudOptions<TInsert> {
  /** Nombre de la entidad para audit log y errors */
  entity: string;
  /** Tabla Drizzle */
  table: SQLiteTable;
  /** Schema Zod para validar inserts/updates */
  schema: z.ZodSchema<TInsert>;
  /** Columnas en las que se puede buscar con ?q= */
  searchableColumns?: AnySQLiteColumn[];
  /** Columnas por las que se puede filtrar exactamente con ?campo=valor */
  filterableColumns?: Record<string, AnySQLiteColumn>;
  /** Columna para ordenar por defecto (default: id) */
  defaultOrderColumn?: AnySQLiteColumn;
  /** Dirección por defecto */
  defaultOrderDir?: 'asc' | 'desc';
  /** Roles que pueden crear/editar/eliminar (default: admin + usuario) */
  writeRoles?: Array<'admin' | 'usuario' | 'consulta'>;
  /** Hooks opcionales */
  beforeCreate?: (data: TInsert, req: import('express').Request) => Promise<TInsert> | TInsert;
  beforeUpdate?: (data: Partial<TInsert>, id: number, req: import('express').Request) => Promise<Partial<TInsert>> | Partial<TInsert>;
  afterCreate?: (record: any, req: import('express').Request) => Promise<void> | void;
}

export function createCrudRouter<TInsert>(opts: CrudOptions<TInsert>): Router {
  const router = Router();
  const writeRoles = opts.writeRoles ?? ['admin', 'usuario'];
  const orderCol = opts.defaultOrderColumn ?? (opts.table as any).id;
  const orderDir = opts.defaultOrderDir ?? 'desc';

  /* GET / — list con paginación + búsqueda + filtros */
  router.get('/', requireAuth, async (req, res, next) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize as string) || 100));
      const q = ((req.query.q as string) || '').trim();
      const sortBy = req.query.sortBy as string;
      const sortDir = (req.query.sortDir as string) === 'asc' ? 'asc' : 'desc';

      const wheres: SQL[] = [];

      /* Búsqueda */
      if (q && opts.searchableColumns?.length) {
        const ors = opts.searchableColumns.map((col) => like(col, `%${q}%`));
        if (ors.length > 1) {
          wheres.push(sql`(${sql.join(ors, sql` OR `)})`);
        } else if (ors[0]) wheres.push(ors[0]);
      }

      /* Filtros exactos */
      if (opts.filterableColumns) {
        for (const [k, col] of Object.entries(opts.filterableColumns)) {
          const v = req.query[k];
          if (v !== undefined && v !== '') wheres.push(eq(col, v as any));
        }
      }

      const whereClause = wheres.length > 0 ? and(...wheres) : undefined;

      /* Order */
      const orderColumn = sortBy && opts.filterableColumns?.[sortBy]
        ? opts.filterableColumns[sortBy]
        : orderCol;
      const order = sortDir === 'asc' ? asc(orderColumn) : desc(orderColumn);

      const data = await db.select().from(opts.table)
        .where(whereClause as any)
        .orderBy(order as any)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const totalRows = await db.select({ count: sql<number>`count(*)` }).from(opts.table)
        .where(whereClause as any);
      const total = totalRows[0]?.count ?? 0;

      res.json({ data, total, page, pageSize });
    } catch (err) { next(err); }
  });

  /* GET /:id */
  router.get('/:id', requireAuth, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) { res.status(400).json({ error: 'ID inválido' }); return; }
      const result = await db.select().from(opts.table)
        .where(eq((opts.table as any).id, id))
        .limit(1);
      if (!result[0]) { res.status(404).json({ error: `${opts.entity} no encontrado` }); return; }
      res.json(result[0]);
    } catch (err) { next(err); }
  });

  /* POST / */
  router.post('/', requireAuth, requireRole(...writeRoles), async (req, res, next) => {
    try {
      let data = opts.schema.parse(req.body);
      if (opts.beforeCreate) data = await opts.beforeCreate(data, req);
      const inserted = await db.insert(opts.table).values(data as any).returning();
      const record = inserted[0];
      if (opts.afterCreate) await opts.afterCreate(record, req);
      logger.info({ entity: opts.entity, id: (record as any).id, userId: req.user?.userId }, 'created');
      res.status(201).json(record);
    } catch (err) { next(err); }
  });

  /* PUT /:id */
  router.put('/:id', requireAuth, requireRole(...writeRoles), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) { res.status(400).json({ error: 'ID inválido' }); return; }
      let data = opts.schema.partial().parse(req.body);
      if (opts.beforeUpdate) data = await opts.beforeUpdate(data, id, req);
      const updated = await db.update(opts.table).set(data as any)
        .where(eq((opts.table as any).id, id))
        .returning();
      if (!updated[0]) { res.status(404).json({ error: `${opts.entity} no encontrado` }); return; }
      logger.info({ entity: opts.entity, id, userId: req.user?.userId }, 'updated');
      res.json(updated[0]);
    } catch (err) { next(err); }
  });

  /* PATCH /:id (alias de PUT con partial) */
  router.patch('/:id', requireAuth, requireRole(...writeRoles), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) { res.status(400).json({ error: 'ID inválido' }); return; }
      const data = opts.schema.partial().parse(req.body);
      const updated = await db.update(opts.table).set(data as any)
        .where(eq((opts.table as any).id, id))
        .returning();
      if (!updated[0]) { res.status(404).json({ error: `${opts.entity} no encontrado` }); return; }
      res.json(updated[0]);
    } catch (err) { next(err); }
  });

  /* DELETE /:id */
  router.delete('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) { res.status(400).json({ error: 'ID inválido' }); return; }
      const deleted = await db.delete(opts.table)
        .where(eq((opts.table as any).id, id))
        .returning();
      if (!deleted[0]) { res.status(404).json({ error: `${opts.entity} no encontrado` }); return; }
      logger.info({ entity: opts.entity, id, userId: req.user?.userId }, 'deleted');
      res.status(204).send();
    } catch (err) { next(err); }
  });

  return router;
}
