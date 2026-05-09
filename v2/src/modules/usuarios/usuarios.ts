import { createCrudModule } from '@/lib/crud-module';
import { fmt } from '@/lib/data-table';
import type { UserPublic } from '@shared/types';

export const renderUsuarios = createCrudModule<UserPublic>({
  title: 'Usuarios',
  endpoint: '/api/usuarios',
  searchPlaceholder: 'Buscar usuario...',
  newLabel: 'Nuevo usuario',
  columns: [
    { key: 'username', label: 'Usuario', render: (r) => `<strong>${r.username}</strong>` },
    { key: 'nombreCompleto', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Rol', align: 'center', render: (r) => fmt.badge(r.role, r.role === 'admin' ? 'danger' : r.role === 'usuario' ? 'info' : 'warning') },
    { key: 'activo', label: 'Activo', align: 'center', render: (r) => fmt.bool(r.activo) },
    { key: 'lastLoginAt', label: 'Último login', render: (r) => fmt.dateTime(r.lastLoginAt) },
  ],
  fields: [
    { name: 'username', label: 'Usuario', required: true },
    { name: 'password', label: 'Contraseña', type: 'text', helpText: 'Mínimo 6 caracteres. Dejar vacío para no cambiar.' },
    { name: 'nombreCompleto', label: 'Nombre completo' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'role', label: 'Rol', type: 'select', required: true, options: [
      { value: 'admin', label: 'Administrador' },
      { value: 'usuario', label: 'Usuario' },
      { value: 'consulta', label: 'Solo consulta' },
    ]},
    { name: 'activo', label: 'Activo', type: 'checkbox' },
  ],
});
