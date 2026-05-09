import { createCrudModule } from '@/lib/crud-module';
import { fmt } from '@/lib/data-table';
import type { Bono } from '@shared/types';

export const renderBonos = createCrudModule<Bono>({
  title: 'Bonos',
  endpoint: '/api/bonos',
  searchPlaceholder: 'Buscar nombre, concepto...',
  newLabel: 'Nuevo bono',
  columns: [
    { key: 'nombre', label: 'Persona', render: (r) => `<strong>${r.nombre}</strong>` },
    { key: 'concepto', label: 'Concepto' },
    { key: 'monto', label: 'Monto', align: 'right', render: (r) => fmt.money(r.monto) },
    { key: 'fecha', label: 'Fecha', render: (r) => fmt.date(r.fecha) },
    { key: 'pagado', label: 'Pagado', align: 'center', render: (r) => fmt.bool(r.pagado) },
  ],
  fields: [
    { name: 'nombre', label: 'Nombre', required: true },
    { name: 'personalId', label: 'ID Personal', type: 'number' },
    { name: 'concepto', label: 'Concepto', required: true },
    { name: 'monto', label: 'Monto MXN', type: 'number', step: '0.01', required: true },
    { name: 'fecha', label: 'Fecha', type: 'date' },
    { name: 'pagado', label: 'Pagado', type: 'checkbox' },
    { name: 'notas', label: 'Notas', type: 'textarea' },
  ],
});
