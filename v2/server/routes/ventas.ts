import { schema } from '../db/client.js';
import { ventaSchema } from '../../shared/schemas.js';
import { createCrudRouter } from '../lib/crud-factory.js';

export default createCrudRouter({
  entity: 'venta',
  table: schema.ventas,
  schema: ventaSchema,
  searchableColumns: [schema.ventas.clienteNombre, schema.ventas.folioFactura],
  filterableColumns: { pagado: schema.ventas.pagado, clienteId: schema.ventas.clienteId },
  defaultOrderColumn: schema.ventas.fechaVenta,
  defaultOrderDir: 'desc',
});
