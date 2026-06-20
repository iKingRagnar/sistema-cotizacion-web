import { schema } from '../db/client.js';
import { bonoSchema } from '../../shared/schemas.js';
import { createCrudRouter } from '../lib/crud-factory.js';

export default createCrudRouter({
  entity: 'bono',
  table: schema.bonos,
  schema: bonoSchema,
  searchableColumns: [schema.bonos.nombre, schema.bonos.concepto],
  filterableColumns: { pagado: schema.bonos.pagado, personalId: schema.bonos.personalId },
  defaultOrderColumn: schema.bonos.fecha,
  defaultOrderDir: 'desc',
});
