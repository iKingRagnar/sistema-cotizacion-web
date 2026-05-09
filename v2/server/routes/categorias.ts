import { schema } from '../db/client.js';
import { categoriaSchema } from '../../shared/schemas.js';
import { createCrudRouter } from '../lib/crud-factory.js';

export default createCrudRouter({
  entity: 'categoria',
  table: schema.categorias,
  schema: categoriaSchema,
  searchableColumns: [schema.categorias.nombre],
  filterableColumns: { tipo: schema.categorias.tipo, parentId: schema.categorias.parentId },
  defaultOrderColumn: schema.categorias.orden,
  defaultOrderDir: 'asc',
});
