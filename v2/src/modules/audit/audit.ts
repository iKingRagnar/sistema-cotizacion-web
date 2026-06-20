import { ensureShell, setPageTitle } from '@/components/app-shell';
import { api } from '@/lib/api';
import { renderDataTable, fmt, escapeHtml } from '@/lib/data-table';

interface AuditEntry { id: number; userId: number | null; action: string; entity: string; entityId: string | null; details: string | null; ip: string | null; timestamp: string }

export async function renderAudit(): Promise<void> {
  const { main } = ensureShell();
  setPageTitle('Auditoría');

  main.innerHTML = `
    <p class="text-text-muted text-sm mb-3">Registro de cambios del sistema. Solo administradores.</p>
    <div id="table-host"></div>
  `;

  const tableHost = main.querySelector<HTMLElement>('#table-host')!;
  tableHost.innerHTML = '<div class="text-center py-8 text-text-muted"><span class="spinner"></span></div>';

  try {
    const resp = await api.get<{ data: AuditEntry[] }>('/api/audit', { query: { pageSize: 500 } });
    renderDataTable(tableHost, {
      rows: resp.data,
      columns: [
        { key: 'timestamp', label: 'Fecha', render: (r) => fmt.dateTime(r.timestamp) },
        { key: 'userId', label: 'Usuario ID', align: 'center' },
        { key: 'action', label: 'Acción', render: (r) => fmt.badge(r.action, r.action === 'create' ? 'success' : r.action === 'delete' ? 'danger' : 'info') },
        { key: 'entity', label: 'Entidad' },
        { key: 'entityId', label: 'ID' },
        { key: 'details', label: 'Detalles', render: (r) => `<code class="text-xs">${escapeHtml(r.details ?? '')}</code>` },
      ],
      emptyMessage: 'Sin entradas de auditoría.',
    });
  } catch (err) {
    tableHost.innerHTML = `<div class="text-red-300 py-4 text-center">${(err as Error).message}</div>`;
  }
}
