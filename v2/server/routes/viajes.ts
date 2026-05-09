import { schema } from '../db/client.js';
import { viajeSchema } from '../../shared/schemas.js';
import { createCrudRouter } from '../lib/crud-factory.js';

export default createCrudRouter({
  entity: 'viaje',
  table: schema.viajes,
  schema: viajeSchema,
  searchableColumns: [schema.viajes.destino],
  filterableColumns: { zona: schema.viajes.zona },
  defaultOrderColumn: schema.viajes.fecha,
  defaultOrderDir: 'desc',
});
