import { createCrudModule } from '@/lib/crud-module';
import { fmt } from '@/lib/data-table';
import type { Cliente } from '@shared/types';

export const renderClientes = createCrudModule<Cliente>({
  title: 'Clientes',
  endpoint: '/api/clientes',
  searchPlaceholder: 'Buscar razón social, RFC, contacto...',
  newLabel: 'Nuevo cliente',
  columns: [
    { key: 'razonSocial', label: 'Razón Social', render: (r) => `<strong>${r.razonSocial}</strong>` },
    { key: 'rfc', label: 'RFC' },
    { key: 'contacto', label: 'Contacto' },
    { key: 'telefono', label: 'Teléfono' },
    { key: 'ciudad', label: 'Ciudad' },
    { key: 'activo', label: 'Activo', align: 'center', render: (r) => fmt.bool(r.activo) },
  ],
  fields: [
    { name: 'razonSocial', label: 'Razón Social', required: true },
    { name: 'rfc', label: 'RFC' },
    { name: 'contacto', label: 'Contacto' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'telefono', label: 'Teléfono', type: 'tel' },
    { name: 'direccion', label: 'Dirección' },
    { name: 'ciudad', label: 'Ciudad' },
    { name: 'estado', label: 'Estado' },
    { name: 'pais', label: 'País', placeholder: 'México' },
    { name: 'notas', label: 'Notas', type: 'textarea' },
    { name: 'activo', label: 'Activo', type: 'checkbox', helpText: 'Cliente activo' },
  ],
});
