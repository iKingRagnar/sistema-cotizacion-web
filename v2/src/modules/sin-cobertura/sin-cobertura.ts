import { createCrudModule } from '@/lib/crud-module';
import { fmt } from '@/lib/data-table';

interface SinCob { id: number; razonSocial: string; maquinaModelo: string | null; motivo: string | null; fechaSolicitud: string; estado: string; }

export const renderSinCobertura = createCrudModule<SinCob>({
  title: 'Sin Cobertura',
  endpoint: '/api/sin-cobertura',
  searchPlaceholder: 'Buscar cliente, máquina, motivo...',
  newLabel: 'Nueva solicitud',
  columns: [
    { key: 'razonSocial', label: 'Cliente', render: (r) => `<strong>${r.razonSocial}</strong>` },
    { key: 'maquinaModelo', label: 'Máquina' },
    { key: 'motivo', label: 'Motivo' },
    { key: 'fechaSolicitud', label: 'Fecha', render: (r) => fmt.date(r.fechaSolicitud) },
    { key: 'estado', label: 'Estado', align: 'center',
      render: (r) => fmt.badge(r.estado, r.estado === 'aprobado' ? 'success' : r.estado === 'rechazado' ? 'danger' : 'warning') },
  ],
  fields: [
    { name: 'razonSocial', label: 'Razón Social', required: true },
    { name: 'clienteId', label: 'ID Cliente', type: 'number' },
    { name: 'maquinaModelo', label: 'Modelo de máquina' },
    { name: 'motivo', label: 'Motivo', type: 'textarea' },
    { name: 'estado', label: 'Estado', type: 'select', options: [
      { value: 'pendiente', label: 'Pendiente' },
      { value: 'cotizado', label: 'Cotizado' },
      { value: 'aprobado', label: 'Aprobado' },
      { value: 'rechazado', label: 'Rechazado' },
    ]},
    { name: 'notas', label: 'Notas', type: 'textarea' },
  ],
});
