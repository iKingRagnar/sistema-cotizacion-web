import { schema } from '../db/client.js';
import { clienteSchema } from '../../shared/schemas.js';
import { createCrudRouter } from '../lib/crud-factory.js';

export default createCrudRouter({
  entity: 'cliente',
  table: schema.clientes,
  schema: clienteSchema,
  searchableColumns: [schema.clientes.razonSocial, schema.clientes.rfc, schema.clientes.contacto, schema.clientes.email, schema.clientes.ciudad],
  filterableColumns: { ciudad: schema.clientes.ciudad, estado: schema.clientes.estado, activo: schema.clientes.activo },
  defaultOrderColumn: schema.clientes.razonSocial,
  defaultOrderDir: 'asc',
});
