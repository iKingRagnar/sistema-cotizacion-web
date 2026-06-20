import { schema } from '../db/client.js';
import { revisionMaquinaSchema } from '../../shared/schemas.js';
import { createCrudRouter } from '../lib/crud-factory.js';

export default createCrudRouter({
  entity: 'revision-maquina',
  table: schema.revisionMaquinas,
  schema: revisionMaquinaSchema,
  searchableColumns: [schema.revisionMaquinas.modelo, schema.revisionMaquinas.numeroSerie, schema.revisionMaquinas.comentarios],
  filterableColumns: { entregado: schema.revisionMaquinas.entregado, prueba: schema.revisionMaquinas.prueba },
  defaultOrderColumn: schema.revisionMaquinas.updatedAt,
  defaultOrderDir: 'desc',
});
