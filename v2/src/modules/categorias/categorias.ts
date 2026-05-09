import { createCrudModule } from '@/lib/crud-module';
import type { Categoria } from '@shared/types';

export const renderCategorias = createCrudModule<Categoria>({
  title: 'Categorías',
  endpoint: '/api/categorias',
  searchPlaceholder: 'Buscar categoría...',
  newLabel: 'Nueva categoría',
  columns: [
    { key: 'nombre', label: 'Nombre', render: (r) => `<strong>${r.nombre}</strong>` },
    { key: 'tipo', label: 'Tipo', align: 'center' },
    { key: 'parentId', label: 'Parent ID', align: 'right' },
    { key: 'orden', label: 'Orden', align: 'right' },
  ],
  fields: [
    { name: 'nombre', label: 'Nombre', required: true },
    { name: 'tipo', label: 'Tipo', type: 'select', required: true, options: [
      { value: 'refaccion', label: 'Refacción' },
      { value: 'maquina', label: 'Máquina' },
    ]},
    { name: 'parentId', label: 'ID Padre (opcional)', type: 'number' },
    { name: 'orden', label: 'Orden', type: 'number' },
  ],
});
