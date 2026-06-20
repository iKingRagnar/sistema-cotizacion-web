import { schema } from '../db/client.js';
import { prospectoSchema } from '../../shared/schemas.js';
import { createCrudRouter } from '../lib/crud-factory.js';

export default createCrudRouter({
  entity: 'prospecto',
  table: schema.prospectos,
  schema: prospectoSchema,
  searchableColumns: [schema.prospectos.empresa, schema.prospectos.contacto, schema.prospectos.industria, schema.prospectos.ciudad],
  filterableColumns: { estado: schema.prospectos.estado, industria: schema.prospectos.industria, ciudad: schema.prospectos.ciudad },
  defaultOrderColumn: schema.prospectos.scoreIa,
  defaultOrderDir: 'desc',
});
