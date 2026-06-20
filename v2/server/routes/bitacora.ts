import { schema } from '../db/client.js';
import { bitacoraHoraSchema } from '../../shared/schemas.js';
import { createCrudRouter } from '../lib/crud-factory.js';

export default createCrudRouter({
  entity: 'bitacora-hora',
  table: schema.bitacoraHoras,
  schema: bitacoraHoraSchema,
  searchableColumns: [schema.bitacoraHoras.cliente, schema.bitacoraHoras.trabajo],
  filterableColumns: { personalId: schema.bitacoraHoras.personalId },
  defaultOrderColumn: schema.bitacoraHoras.fecha,
  defaultOrderDir: 'desc',
});
