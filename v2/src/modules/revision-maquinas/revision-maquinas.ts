import { createCrudModule } from '@/lib/crud-module';
import { fmt } from '@/lib/data-table';
import type { RevisionMaquina } from '@shared/types';

export const renderRevisionMaquinas = createCrudModule<RevisionMaquina>({
  title: 'Revisión Máquinas',
  endpoint: '/api/revision-maquinas',
  searchPlaceholder: 'Buscar modelo, serie, comentarios...',
  newLabel: 'Nueva revisión',
  columns: [
    { key: 'modelo', label: 'Modelo', render: (r) => `<strong>${r.modelo ?? '—'}</strong>` },
    { key: 'numeroSerie', label: 'Serie' },
    { key: 'categoria', label: 'Categoría' },
    { key: 'entregado', label: 'Entregado', align: 'center',
      render: (r) => fmt.badge(r.entregado || 'No', r.entregado === 'Si' ? 'success' : 'warning') },
    { key: 'prueba', label: 'Prueba', align: 'center',
      render: (r) => fmt.badge(r.prueba || 'En Proceso', r.prueba === 'Finalizada' ? 'success' : 'info') },
    { key: 'comentarios', label: 'Comentarios' },
  ],
  fields: [
    { name: 'maquinaId', label: 'ID Máquina (catálogo)', type: 'number' },
    { name: 'categoria', label: 'Categoría' },
    { name: 'modelo', label: 'Modelo' },
    { name: 'numeroSerie', label: 'Número de serie' },
    { name: 'entregado', label: 'Entregado', type: 'select', options: [
      { value: 'No', label: 'No' }, { value: 'Si', label: 'Sí' },
    ]},
    { name: 'prueba', label: 'Prueba', type: 'select', options: [
      { value: 'En Proceso', label: 'En Proceso' }, { value: 'Finalizada', label: 'Finalizada' },
    ]},
    { name: 'comentarios', label: 'Comentarios', type: 'textarea' },
  ],
});
