import { createCrudModule } from '@/lib/crud-module';
import { fmt } from '@/lib/data-table';
import type { Viaje } from '@shared/types';

export const renderViajes = createCrudModule<Viaje>({
  title: 'Viajes',
  endpoint: '/api/viajes',
  searchPlaceholder: 'Buscar destino...',
  newLabel: 'Nuevo viaje',
  columns: [
    { key: 'destino', label: 'Destino', render: (r) => `<strong>${r.destino}</strong>` },
    { key: 'zona', label: 'Zona', align: 'center' },
    { key: 'personasCount', label: 'Personas', align: 'right' },
    { key: 'diasCount', label: 'Días', align: 'right' },
    { key: 'km', label: 'Km', align: 'right' },
    { key: 'total', label: 'Total', align: 'right', render: (r) => fmt.money(r.total) },
    { key: 'fecha', label: 'Fecha', render: (r) => fmt.date(r.fecha) },
  ],
  fields: [
    { name: 'destino', label: 'Destino', required: true },
    { name: 'zona', label: 'Zona', type: 'select', required: true, options: [
      { value: 'A', label: 'A — Local' },
      { value: 'B', label: 'B — Regional' },
      { value: 'C', label: 'C — Nacional' },
    ]},
    { name: 'personasCount', label: 'Personas', type: 'number' },
    { name: 'diasCount', label: 'Días', type: 'number' },
    { name: 'km', label: 'Km', type: 'number', step: '0.1' },
    { name: 'totalViatico', label: 'Total viático', type: 'number', step: '0.01' },
    { name: 'totalKm', label: 'Total km', type: 'number', step: '0.01' },
    { name: 'total', label: 'Total', type: 'number', step: '0.01' },
    { name: 'fecha', label: 'Fecha', type: 'date' },
    { name: 'notas', label: 'Notas', type: 'textarea' },
  ],
});
