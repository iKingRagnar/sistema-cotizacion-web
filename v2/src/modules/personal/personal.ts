import { createCrudModule } from '@/lib/crud-module';
import { fmt } from '@/lib/data-table';
import type { Personal } from '@shared/types';

export const renderPersonal = createCrudModule<Personal>({
  title: 'Personal',
  endpoint: '/api/personal',
  searchPlaceholder: 'Buscar nombre, email...',
  newLabel: 'Nuevo técnico',
  columns: [
    { key: 'nombre', label: 'Nombre', render: (r) => `<strong>${r.nombre}</strong>` },
    { key: 'rol', label: 'Rol' },
    { key: 'email', label: 'Email' },
    { key: 'telefono', label: 'Teléfono' },
    { key: 'tarifaHoraMxn', label: 'Tarifa/h', align: 'right', render: (r) => fmt.money(r.tarifaHoraMxn) },
    { key: 'activo', label: 'Activo', align: 'center', render: (r) => fmt.bool(r.activo) },
  ],
  fields: [
    { name: 'nombre', label: 'Nombre completo', required: true },
    { name: 'rol', label: 'Rol', type: 'select', required: true, options: [
      { value: 'mecanico', label: 'Mecánico' },
      { value: 'electronico', label: 'Electrónico' },
      { value: 'cnc', label: 'CNC / Programación' },
      { value: 'ayudante', label: 'Ayudante' },
      { value: 'admin', label: 'Admin' },
      { value: 'otro', label: 'Otro' },
    ]},
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'telefono', label: 'Teléfono', type: 'tel' },
    { name: 'fechaIngreso', label: 'Fecha ingreso', type: 'date' },
    { name: 'tarifaHoraMxn', label: 'Tarifa MXN/hr', type: 'number', step: '0.01' },
    { name: 'notas', label: 'Notas', type: 'textarea' },
    { name: 'activo', label: 'Activo', type: 'checkbox' },
  ],
});
