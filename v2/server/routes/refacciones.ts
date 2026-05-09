import { schema } from '../db/client.js';
import { refaccionSchema } from '../../shared/schemas.js';
import { createCrudRouter } from '../lib/crud-factory.js';

export default createCrudRouter({
  entity: 'refaccion',
  table: schema.refacciones,
  schema: refaccionSchema,
  searchableColumns: [schema.refacciones.numeroParte, schema.refacciones.descripcion, schema.refacciones.marca, schema.refacciones.proveedor],
  filterableColumns: { categoria: schema.refacciones.categoria, subcategoria: schema.refacciones.subcategoria, marca: schema.refacciones.marca, activo: schema.refacciones.activo },
  defaultOrderColumn: schema.refacciones.descripcion,
  defaultOrderDir: 'asc',
});
