import { schema } from '../db/client.js';
import { personalSchema } from '../../shared/schemas.js';
import { createCrudRouter } from '../lib/crud-factory.js';

export default createCrudRouter({
  entity: 'personal',
  table: schema.personal,
  schema: personalSchema,
  searchableColumns: [schema.personal.nombre, schema.personal.email],
  filterableColumns: { rol: schema.personal.rol, activo: schema.personal.activo },
  defaultOrderColumn: schema.personal.nombre,
  defaultOrderDir: 'asc',
});
