import { schema } from '../db/client.js';
import { maquinaSchema } from '../../shared/schemas.js';
import { createCrudRouter } from '../lib/crud-factory.js';

export default createCrudRouter({
  entity: 'maquina',
  table: schema.maquinas,
  schema: maquinaSchema,
  searchableColumns: [schema.maquinas.modelo, schema.maquinas.numeroSerie, schema.maquinas.clienteNombre],
  filterableColumns: { categoria: schema.maquinas.categoria, clienteId: schema.maquinas.clienteId, activo: schema.maquinas.activo },
  defaultOrderColumn: schema.maquinas.modelo,
  defaultOrderDir: 'asc',
});
