/**
 * Helper para construir módulos CRUD rápidos.
 * Devuelve una función render() que monta tabla + filtro + botón "Nuevo" + modal de edición.
 *
 * Para casos especiales (joins, modal complejo), implementar manualmente.
 */
import { api, ApiException } from './api.js';
import { renderDataTable, type ColumnDef } from './data-table.js';
import { openModal, confirmDialog } from './modal.js';
import { toast } from './toast.js';
import { ensureShell, setPageTitle } from '@/components/app-shell';
import { escapeHtml } from './data-table.js';

export interface FormFieldDef {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'email' | 'tel' | 'textarea' | 'select' | 'checkbox' | 'date';
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  rows?: number;
  step?: string;
  helpText?: string;
}

export interface CrudModuleOpts<T extends { id: number }> {
  title: string;
  endpoint: string;        // ej: '/api/clientes'
  idKey?: keyof T;          // default 'id'
  columns: ColumnDef<T>[];
  fields: FormFieldDef[];
  searchPlaceholder?: string;
  newLabel?: string;
  emptyMessage?: string;
}

interface PaginatedResp<T> { data: T[]; total: number; page: number; pageSize: number }

export function createCrudModule<T extends { id: number }>(opts: CrudModuleOpts<T>) {
  return async function render(): Promise<void> {
    const { main } = ensureShell();
    setPageTitle(opts.title);

    main.innerHTML = `
      <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <input id="search" type="search" placeholder="${opts.searchPlaceholder ?? 'Buscar...'}" class="input max-w-sm" autocomplete="off" />
        <button id="new-btn" class="btn btn-primary">+ ${opts.newLabel ?? 'Nuevo'}</button>
      </div>
      <div id="table-host"></div>
    `;

    const search = main.querySelector<HTMLInputElement>('#search')!;
    const tableHost = main.querySelector<HTMLElement>('#table-host')!;
    const newBtn = main.querySelector<HTMLButtonElement>('#new-btn')!;

    let lastQ = '';
    let debounceId: number | undefined;

    async function load(): Promise<void> {
      tableHost.innerHTML = '<div class="text-center py-8 text-text-muted"><span class="spinner"></span> Cargando...</div>';
      try {
        const resp = await api.get<PaginatedResp<T> | T[]>(opts.endpoint, { query: { q: lastQ, pageSize: 200 } });
        const rows = Array.isArray(resp) ? resp : resp.data;
        renderDataTable(tableHost, {
          rows,
          columns: opts.columns,
          actions: (row) => `
            <button class="btn btn-ghost btn-icon" data-act="edit" data-id="${row.id}" title="Editar">✎</button>
            <button class="btn btn-ghost btn-icon text-red-300" data-act="del" data-id="${row.id}" title="Eliminar">🗑</button>
          `,
          emptyMessage: opts.emptyMessage,
        });

        tableHost.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => {
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = parseInt(b.dataset.id!, 10);
            const row = rows.find((r: any) => r.id === id);
            if (!row) return;
            if (b.dataset.act === 'edit') openEditModal(row, load);
            if (b.dataset.act === 'del') deleteRow(row, load);
          });
        });
      } catch (err) {
        tableHost.innerHTML = `<div class="text-center py-8 text-red-300">Error: ${escapeHtml((err as Error).message)}</div>`;
      }
    }

    search.addEventListener('input', () => {
      window.clearTimeout(debounceId);
      debounceId = window.setTimeout(() => {
        lastQ = search.value;
        load();
      }, 250);
    });

    newBtn.addEventListener('click', () => openEditModal(null, load));

    function openEditModal(row: T | null, refresh: () => void): void {
      const formHtml = renderForm(opts.fields, row);
      const close = openModal({
        title: row ? `Editar ${opts.title}` : `Nuevo ${opts.title}`,
        size: 'md',
        body: `
          <form id="crud-form" class="space-y-3">
            ${formHtml}
            <div class="flex justify-end gap-2 pt-4 border-t border-[var(--border)]">
              <button type="button" class="btn" data-act="cancel">Cancelar</button>
              <button type="submit" class="btn btn-primary">${row ? 'Guardar' : 'Crear'}</button>
            </div>
          </form>
        `,
        onMount: (root) => {
          const form = root.querySelector<HTMLFormElement>('#crud-form')!;
          root.querySelector('[data-act="cancel"]')?.addEventListener('click', () => close());
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const data = formToObject(form);
            try {
              if (row) await api.put(`${opts.endpoint}/${row.id}`, data);
              else await api.post(opts.endpoint, data);
              toast(row ? 'Actualizado' : 'Creado', 'success');
              close();
              refresh();
            } catch (err) {
              const msg = err instanceof ApiException ? err.message : 'Error';
              toast(msg, 'error');
            }
          });
        },
      });
    }

    async function deleteRow(row: T, refresh: () => void): Promise<void> {
      const ok = await confirmDialog(`¿Eliminar este ${opts.title.toLowerCase()}?`, { danger: true, title: 'Eliminar' });
      if (!ok) return;
      try {
        await api.delete(`${opts.endpoint}/${row.id}`);
        toast('Eliminado', 'success');
        refresh();
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Error', 'error');
      }
    }

    await load();
  };
}

/* ── Helpers de formulario ────────────────────── */
function renderForm(fields: FormFieldDef[], row: any): string {
  return fields.map((f) => {
    const val = row?.[f.name] ?? '';
    const required = f.required ? 'required' : '';
    let input = '';
    switch (f.type) {
      case 'textarea':
        input = `<textarea name="${f.name}" rows="${f.rows ?? 3}" class="textarea" placeholder="${f.placeholder ?? ''}" ${required}>${escapeHtml(val)}</textarea>`;
        break;
      case 'select':
        input = `<select name="${f.name}" class="select" ${required}>
          <option value="">— Seleccionar —</option>
          ${(f.options ?? []).map((o) => `<option value="${escapeHtml(o.value)}" ${String(val) === String(o.value) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
        </select>`;
        break;
      case 'checkbox':
        input = `<label class="flex items-center gap-2"><input type="checkbox" name="${f.name}" ${val ? 'checked' : ''} class="w-4 h-4" /><span class="text-sm text-text-soft">${f.helpText ?? f.label}</span></label>`;
        break;
      default:
        input = `<input type="${f.type ?? 'text'}" name="${f.name}" value="${escapeHtml(val)}" class="input" placeholder="${f.placeholder ?? ''}" ${f.step ? `step="${f.step}"` : ''} ${required} />`;
    }
    return `
      <div>
        <label class="text-xs font-semibold uppercase tracking-wider text-text-soft block mb-1">
          ${f.label}${f.required ? ' <span class="text-red-300">*</span>' : ''}
        </label>
        ${input}
        ${f.helpText && f.type !== 'checkbox' ? `<div class="text-xs text-text-dim mt-1">${f.helpText}</div>` : ''}
      </div>
    `;
  }).join('');
}

function formToObject(form: HTMLFormElement): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  const fd = new FormData(form);
  for (const [k, v] of fd.entries()) {
    obj[k] = v === '' ? null : v;
  }
  /* Checkboxes que NO están marcados no aparecen en FormData → false */
  form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
    obj[cb.name] = cb.checked;
  });
  return obj;
}
