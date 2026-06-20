import { createCrudModule } from '@/lib/crud-module';
import { fmt } from '@/lib/data-table';
import type { BitacoraHora } from '@shared/types';

export const renderBitacora = createCrudModule<BitacoraHora>({
  title: 'Bitácora de horas',
  endpoint: '/api/bitacora-horas',
  searchPlaceholder: 'Buscar cliente, trabajo...',
  newLabel: 'Nueva entrada',
  columns: [
    { key: 'fecha', label: 'Fecha', render: (r) => fmt.date(r.fecha) },
    { key: 'horas', label: 'Horas', align: 'right' },
    { key: 'horaInicio', label: 'Inicio' },
    { key: 'horaFin', label: 'Fin' },
    { key: 'cliente', label: 'Cliente' },
    { key: 'trabajo', label: 'Trabajo' },
  ],
  fields: [
    { name: 'personalId', label: 'ID Personal', type: 'number', required: true },
    { name: 'fecha', label: 'Fecha', type: 'date', required: true },
    { name: 'horaInicio', label: 'Hora inicio (HH:MM)' },
    { name: 'horaFin', label: 'Hora fin (HH:MM)' },
    { name: 'horas', label: 'Total horas', type: 'number', step: '0.25' },
    { name: 'cliente', label: 'Cliente' },
    { name: 'trabajo', label: 'Trabajo realizado', type: 'textarea' },
    { name: 'notas', label: 'Notas', type: 'textarea' },
  ],
});
