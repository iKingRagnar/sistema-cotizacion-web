/**
 * Data table helper. Sin Lit, vanilla — render eficiente, sort + filter + actions.
 *
 * Uso:
 *   renderDataTable(container, {
 *     rows: data,
 *     columns: [
 *       { key: 'razonSocial', label: 'Razón Social', sortable: true },
 *       { key: 'rfc', label: 'RFC' },
 *     ],
 *     actions: (row) => `<button data-act="edit" data-id="${row.id}">Editar</button>`,
 *     onRowClick: (row) => openEdit(row),
 *   });
 */
export interface ColumnDef<T> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  width?: string;
  render?: (row: T) => string;
  className?: string;
}

export interface DataTableOpts<T extends { id: number | string }> {
  rows: T[];
  columns: ColumnDef<T>[];
  actions?: (row: T) => string;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  rowClass?: (row: T) => string;
}

export function renderDataTable<T extends { id: number | string }>(
  container: HTMLElement,
  opts: DataTableOpts<T>,
): void {
  const { rows, columns, actions, emptyMessage = 'Sin resultados.' } = opts;

  if (!rows.length) {
    container.innerHTML = `
      <div class="text-center py-12 text-text-muted">
        <div class="text-4xl mb-2">📭</div>
        <p>${emptyMessage}</p>
      </div>
    `;
    return;
  }

  const headerCells = columns.map((c) => `
    <th class="px-3 py-2 text-${c.align ?? 'left'} text-xs font-semibold uppercase tracking-wider text-text-soft border-b border-[var(--border)] sticky top-0 bg-bg-surface" ${c.width ? `style="width:${c.width}"` : ''}>
      ${c.label}
    </th>
  `).join('');

  const actionCell = actions ? '<th class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-text-soft border-b border-[var(--border)] sticky top-0 bg-bg-surface">Acciones</th>' : '';

  const bodyRows = rows.map((row) => {
    const cells = columns.map((c) => {
      const val = c.render ? c.render(row) : String((row as any)[c.key] ?? '—');
      return `<td class="px-3 py-2 text-sm text-text border-b border-[var(--border)]/50 ${c.className ?? ''}" align="${c.align ?? 'left'}">${val}</td>`;
    }).join('');
    const acts = actions ? `<td class="px-3 py-2 text-right border-b border-[var(--border)]/50">${actions(row)}</td>` : '';
    const rowCls = opts.rowClass?.(row) ?? '';
    return `<tr class="hover:bg-[var(--bg-hover)] ${opts.onRowClick ? 'cursor-pointer' : ''} ${rowCls}" data-row-id="${row.id}">${cells}${acts}</tr>`;
  }).join('');

  container.innerHTML = `
    <div class="overflow-auto rounded-lg border border-[var(--border)] bg-bg-surface">
      <table class="w-full">
        <thead><tr>${headerCells}${actionCell}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;

  if (opts.onRowClick) {
    container.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((tr) => {
      tr.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('button, a')) return;
        const id = tr.dataset.rowId;
        const row = rows.find((r) => String(r.id) === id);
        if (row) opts.onRowClick!(row);
      });
    });
  }
}

/* Helpers de formato comunes */
export const fmt = {
  money: (n: number | null | undefined, currency: 'MXN' | 'USD' = 'MXN'): string => {
    if (n == null || isNaN(n)) return '—';
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n);
  },
  number: (n: number | null | undefined, decimals = 0): string => {
    if (n == null || isNaN(n)) return '—';
    return n.toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  },
  date: (d: string | null | undefined): string => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('es-MX'); } catch { return d; }
  },
  dateTime: (d: string | null | undefined): string => {
    if (!d) return '—';
    try { return new Date(d).toLocaleString('es-MX'); } catch { return d; }
  },
  bool: (b: boolean | null | undefined): string => b ? '<span class="badge badge-success">Sí</span>' : '<span class="badge badge-danger">No</span>',
  badge: (text: string, kind: 'success' | 'warning' | 'danger' | 'info' = 'info'): string =>
    `<span class="badge badge-${kind}">${text}</span>`,
};

export function escapeHtml(s: unknown): string {
  const div = document.createElement('div');
  div.textContent = String(s ?? '');
  return div.innerHTML;
}
