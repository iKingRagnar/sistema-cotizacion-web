import { createCrudModule } from '@/lib/crud-module';
import { fmt } from '@/lib/data-table';
import type { Prospecto } from '@shared/types';

const ESTADOS = [
  { value: 'prospecto', label: 'Prospecto' },
  { value: 'contactado', label: 'Contactado' },
  { value: 'calificado', label: 'Calificado' },
  { value: 'propuesta', label: 'Propuesta' },
  { value: 'negociacion', label: 'Negociación' },
  { value: 'ganado', label: 'Ganado' },
  { value: 'perdido', label: 'Perdido' },
];

const ESTADO_KIND: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
  prospecto: 'info', contactado: 'info', calificado: 'info',
  propuesta: 'warning', negociacion: 'warning',
  ganado: 'success', perdido: 'danger',
};

export const renderProspeccion = createCrudModule<Prospecto>({
  title: 'Prospección',
  endpoint: '/api/prospectos',
  searchPlaceholder: 'Buscar empresa, contacto, industria...',
  newLabel: 'Nuevo prospecto',
  columns: [
    { key: 'empresa', label: 'Empresa', render: (r) => `<strong>${r.empresa}</strong>` },
    { key: 'contacto', label: 'Contacto' },
    { key: 'industria', label: 'Industria' },
    { key: 'ciudad', label: 'Ciudad' },
    { key: 'estado', label: 'Estado', align: 'center', render: (r) => fmt.badge(r.estado || '—', ESTADO_KIND[r.estado] || 'info') },
    { key: 'scoreIa', label: 'Score', align: 'right', render: (r) => `<strong>${r.scoreIa ?? 0}</strong>` },
    { key: 'potencialUsd', label: 'Potencial', align: 'right', render: (r) => fmt.money(r.potencialUsd, 'USD') },
  ],
  fields: [
    { name: 'empresa', label: 'Empresa', required: true },
    { name: 'contacto', label: 'Contacto' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'telefono', label: 'Teléfono', type: 'tel' },
    { name: 'industria', label: 'Industria' },
    { name: 'ciudad', label: 'Ciudad' },
    { name: 'estado', label: 'Estado', type: 'select', options: ESTADOS },
    { name: 'potencialUsd', label: 'Potencial USD', type: 'number', step: '0.01' },
    { name: 'scoreIa', label: 'Score (0-100)', type: 'number' },
    { name: 'ubicacionLat', label: 'Latitud', type: 'number', step: '0.000001' },
    { name: 'ubicacionLng', label: 'Longitud', type: 'number', step: '0.000001' },
    { name: 'ultimoContacto', label: 'Último contacto', type: 'date' },
    { name: 'notas', label: 'Notas', type: 'textarea' },
  ],
});
