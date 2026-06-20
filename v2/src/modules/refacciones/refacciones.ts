import { createCrudModule } from '@/lib/crud-module';
import { fmt } from '@/lib/data-table';
import type { Refaccion } from '@shared/types';

export const renderRefacciones = createCrudModule<Refaccion>({
  title: 'Refacciones',
  endpoint: '/api/refacciones',
  searchPlaceholder: 'Buscar número de parte, descripción, marca...',
  newLabel: 'Nueva refacción',
  columns: [
    { key: 'numeroParte', label: 'No. Parte', render: (r) => `<strong>${r.numeroParte}</strong>` },
    { key: 'descripcion', label: 'Descripción' },
    { key: 'categoria', label: 'Categoría' },
    { key: 'marca', label: 'Marca' },
    { key: 'stock', label: 'Stock', align: 'right', render: (r) => fmt.number(r.stock) },
    { key: 'precioVentaUsd', label: '$ USD', align: 'right', render: (r) => fmt.money(r.precioVentaUsd, 'USD') },
    { key: 'precioVentaMxn', label: '$ MXN', align: 'right', render: (r) => fmt.money(r.precioVentaMxn, 'MXN') },
  ],
  fields: [
    { name: 'numeroParte', label: 'Número de parte', required: true },
    { name: 'descripcion', label: 'Descripción', required: true, type: 'textarea', rows: 2 },
    { name: 'categoria', label: 'Categoría' },
    { name: 'subcategoria', label: 'Subcategoría' },
    { name: 'marca', label: 'Marca' },
    { name: 'proveedor', label: 'Proveedor' },
    { name: 'precioCompraUsd', label: 'Precio compra (USD)', type: 'number', step: '0.01' },
    { name: 'precioVentaUsd', label: 'Precio venta (USD)', type: 'number', step: '0.01' },
    { name: 'precioVentaMxn', label: 'Precio venta (MXN)', type: 'number', step: '0.01' },
    { name: 'stock', label: 'Stock actual', type: 'number' },
    { name: 'stockMinimo', label: 'Stock mínimo', type: 'number' },
    { name: 'ubicacion', label: 'Ubicación' },
    { name: 'notas', label: 'Notas', type: 'textarea' },
    { name: 'activo', label: 'Activo', type: 'checkbox' },
  ],
});
