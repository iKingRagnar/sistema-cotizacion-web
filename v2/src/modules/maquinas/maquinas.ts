import { createCrudModule } from '@/lib/crud-module';
import { fmt } from '@/lib/data-table';
import type { Maquina } from '@shared/types';

export const renderMaquinas = createCrudModule<Maquina>({
  title: 'Máquinas',
  endpoint: '/api/maquinas',
  searchPlaceholder: 'Buscar modelo, serie, cliente...',
  newLabel: 'Nueva máquina',
  columns: [
    { key: 'modelo', label: 'Modelo', render: (r) => `<strong>${r.modelo}</strong>` },
    { key: 'numeroSerie', label: 'No. Serie' },
    { key: 'categoria', label: 'Categoría' },
    { key: 'clienteNombre', label: 'Cliente' },
    { key: 'ubicacion', label: 'Ubicación' },
    { key: 'fechaInstalacion', label: 'Instalación', render: (r) => fmt.date(r.fechaInstalacion) },
    { key: 'activo', label: 'Activo', align: 'center', render: (r) => fmt.bool(r.activo) },
  ],
  fields: [
    { name: 'modelo', label: 'Modelo', required: true },
    { name: 'numeroSerie', label: 'Número de serie' },
    { name: 'categoria', label: 'Categoría' },
    { name: 'clienteNombre', label: 'Cliente (nombre)' },
    { name: 'clienteId', label: 'ID Cliente', type: 'number' },
    { name: 'ubicacion', label: 'Ubicación' },
    { name: 'fechaFabricacion', label: 'Fecha fabricación', type: 'date' },
    { name: 'fechaInstalacion', label: 'Fecha instalación', type: 'date' },
    { name: 'imagen', label: 'URL imagen' },
    { name: 'notas', label: 'Notas', type: 'textarea' },
    { name: 'activo', label: 'Activo', type: 'checkbox' },
  ],
});
