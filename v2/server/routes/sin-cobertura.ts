import { schema } from '../db/client.js';
import { sinCoberturaSchema } from '../../shared/schemas.js';
import { createCrudRouter } from '../lib/crud-factory.js';

export default createCrudRouter({
  entity: 'sin-cobertura',
  table: schema.sinCobertura,
  schema: sinCoberturaSchema,
  searchableColumns: [schema.sinCobertura.razonSocial, schema.sinCobertura.maquinaModelo, schema.sinCobertura.motivo],
  filterableColumns: { estado: schema.sinCobertura.estado },
  defaultOrderColumn: schema.sinCobertura.fechaSolicitud,
  defaultOrderDir: 'desc',
});
