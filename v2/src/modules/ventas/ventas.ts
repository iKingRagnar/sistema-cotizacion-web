import { createCrudModule } from '@/lib/crud-module';
import { fmt } from '@/lib/data-table';
import type { Venta } from '@shared/types';

export const renderVentas = createCrudModule<Venta>({
  title: 'Ventas',
  endpoint: '/api/ventas',
  searchPlaceholder: 'Buscar cliente, factura...',
  newLabel: 'Nueva venta',
  columns: [
    { key: 'fechaVenta', label: 'Fecha', render: (r) => fmt.date(r.fechaVenta) },
    { key: 'folioFactura', label: 'Factura' },
    { key: 'clienteNombre', label: 'Cliente', render: (r) => `<strong>${r.clienteNombre}</strong>` },
    { key: 'total', label: 'Total', align: 'right', render: (r) => fmt.money(r.total, r.moneda as any) },
    { key: 'pagado', label: 'Pagado', align: 'center', render: (r) => fmt.bool(r.pagado) },
    { key: 'fechaPago', label: 'F. Pago', render: (r) => fmt.date(r.fechaPago) },
  ],
  fields: [
    { name: 'cotizacionId', label: 'ID Cotización', type: 'number' },
    { name: 'folioFactura', label: 'Folio factura' },
    { name: 'clienteId', label: 'ID Cliente', type: 'number' },
    { name: 'clienteNombre', label: 'Cliente', required: true },
    { name: 'fechaVenta', label: 'Fecha venta', type: 'date' },
    { name: 'total', label: 'Total', type: 'number', step: '0.01', required: true },
    { name: 'moneda', label: 'Moneda', type: 'select', options: [
      { value: 'MXN', label: 'MXN' }, { value: 'USD', label: 'USD' },
    ]},
    { name: 'pagado', label: 'Pagado', type: 'checkbox' },
    { name: 'fechaPago', label: 'Fecha pago', type: 'date' },
    { name: 'notas', label: 'Notas', type: 'textarea' },
  ],
});
