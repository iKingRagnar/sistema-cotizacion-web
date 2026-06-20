import { createCrudModule } from '@/lib/crud-module';
import { fmt } from '@/lib/data-table';
import type { Garantia } from '@shared/types';

export const renderGarantias = createCrudModule<Garantia>({
  title: 'Garantías',
  endpoint: '/api/garantias',
  searchPlaceholder: 'Buscar cliente, modelo, serie...',
  newLabel: 'Nueva garantía',
  columns: [
    { key: 'razonSocial', label: 'Cliente', render: (r) => `<strong>${r.razonSocial}</strong>` },
    { key: 'modeloMaquina', label: 'Modelo' },
    { key: 'numeroSerie', label: 'Serie' },
    { key: 'fechaInicio', label: 'Inicio', render: (r) => fmt.date(r.fechaInicio) },
    { key: 'fechaFin', label: 'Fin', render: (r) => fmt.date(r.fechaFin) },
    { key: 'activa', label: 'Activa', align: 'center', render: (r) => fmt.bool(r.activa) },
  ],
  fields: [
    { name: 'razonSocial', label: 'Razón Social', required: true },
    { name: 'clienteId', label: 'ID Cliente', type: 'number' },
    { name: 'modeloMaquina', label: 'Modelo de máquina', required: true },
    { name: 'numeroSerie', label: 'Número de serie' },
    { name: 'maquinaId', label: 'ID Máquina (catálogo)', type: 'number' },
    { name: 'tipoMaquina', label: 'Tipo' },
    { name: 'fechaInicio', label: 'Fecha inicio', type: 'date', required: true },
    { name: 'fechaFin', label: 'Fecha fin', type: 'date' },
    { name: 'notas', label: 'Notas', type: 'textarea' },
    { name: 'activa', label: 'Activa', type: 'checkbox' },
  ],
});
