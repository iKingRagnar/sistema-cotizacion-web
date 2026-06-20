/**
 * Cotizaciones — list + form complejo con items dinámicos.
 */
import { ensureShell, setPageTitle } from '@/components/app-shell';
import { api, ApiException } from '@/lib/api';
import { renderDataTable, fmt, escapeHtml } from '@/lib/data-table';
import { openModal, confirmDialog } from '@/lib/modal';
import { toast } from '@/lib/toast';
import type { Cotizacion } from '@shared/types';

interface CotConItems extends Cotizacion {
  items: Array<{ id?: number; numeroParte?: string | null; descripcion: string; cantidad: number; precioUnitario: number; importe?: number }>;
}

export async function renderCotizaciones(): Promise<void> {
  const { main } = ensureShell();
  setPageTitle('Cotizaciones');

  main.innerHTML = `
    <div class="flex justify-between items-center mb-4 gap-3 flex-wrap">
      <input id="search" type="search" placeholder="Buscar folio, cliente..." class="input max-w-sm" />
      <button id="new-btn" class="btn btn-primary">+ Nueva cotización</button>
    </div>
    <div id="table-host"></div>
  `;

  const search = main.querySelector<HTMLInputElement>('#search')!;
  const tableHost = main.querySelector<HTMLElement>('#table-host')!;
  let lastQ = '';
  let timer: number;

  async function load(): Promise<void> {
    tableHost.innerHTML = '<div class="text-center py-8 text-text-muted"><span class="spinner"></span></div>';
    try {
      const resp = await api.get<{ data: Cotizacion[] }>('/api/cotizaciones', { query: { q: lastQ, pageSize: 200 } });
      renderDataTable(tableHost, {
        rows: resp.data,
        columns: [
          { key: 'folio', label: 'Folio', render: (r) => `<strong>${r.folio}</strong>` },
          { key: 'fecha', label: 'Fecha', render: (r) => fmt.date(r.fecha) },
          { key: 'clienteNombre', label: 'Cliente' },
          { key: 'estado', label: 'Estado', align: 'center', render: (r) => fmt.badge(r.estado, r.estado === 'aprobada' || r.estado === 'facturada' ? 'success' : r.estado === 'rechazada' ? 'danger' : 'info') },
          { key: 'total', label: 'Total', align: 'right', render: (r) => fmt.money(r.total, r.moneda as any) },
        ],
        actions: (r) => `
          <button class="btn btn-ghost btn-icon" data-act="edit" data-id="${r.id}" title="Editar">✎</button>
          <button class="btn btn-ghost btn-icon text-red-300" data-act="del" data-id="${r.id}" title="Eliminar">🗑</button>
        `,
      });
      tableHost.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => {
        b.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = parseInt(b.dataset.id!, 10);
          if (b.dataset.act === 'edit') {
            const cot = await api.get<CotConItems>(`/api/cotizaciones/${id}`);
            openCotForm(cot, load);
          }
          if (b.dataset.act === 'del') {
            const ok = await confirmDialog('¿Eliminar esta cotización?', { danger: true });
            if (ok) {
              try { await api.delete(`/api/cotizaciones/${id}`); toast('Eliminada', 'success'); load(); }
              catch (err) { toast((err as Error).message, 'error'); }
            }
          }
        });
      });
    } catch (err) {
      tableHost.innerHTML = `<div class="text-red-300 py-8 text-center">Error: ${escapeHtml((err as Error).message)}</div>`;
    }
  }

  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => { lastQ = search.value; load(); }, 250);
  });

  document.getElementById('new-btn')?.addEventListener('click', () => openCotForm(null, load));

  await load();
}

function openCotForm(cot: CotConItems | null, refresh: () => void): void {
  const items = cot?.items?.length ? cot.items : [{ descripcion: '', cantidad: 1, precioUnitario: 0 }];

  const close = openModal({
    title: cot ? `Editar ${cot.folio}` : 'Nueva cotización',
    size: 'lg',
    body: `
      <form id="cot-form" class="space-y-4">
        <div class="grid md:grid-cols-2 gap-3">
          <div>
            <label class="text-xs uppercase tracking-wider text-text-soft">Cliente *</label>
            <input name="clienteNombre" required value="${escapeHtml(cot?.clienteNombre ?? '')}" class="input" />
          </div>
          <div>
            <label class="text-xs uppercase tracking-wider text-text-soft">Estado</label>
            <select name="estado" class="select">
              ${['borrador','enviada','aprobada','rechazada','facturada'].map((s) =>
                `<option value="${s}" ${cot?.estado === s ? 'selected' : ''}>${s}</option>`
              ).join('')}
            </select>
          </div>
          <div>
            <label class="text-xs uppercase tracking-wider text-text-soft">Moneda</label>
            <select name="moneda" class="select">
              <option value="MXN" ${cot?.moneda !== 'USD' ? 'selected' : ''}>MXN</option>
              <option value="USD" ${cot?.moneda === 'USD' ? 'selected' : ''}>USD</option>
            </select>
          </div>
          <div>
            <label class="text-xs uppercase tracking-wider text-text-soft">Tipo de cambio</label>
            <input name="tipoCambio" type="number" step="0.0001" value="${cot?.tipoCambio ?? 17}" class="input" />
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="text-xs uppercase tracking-wider text-text-soft">Items</label>
            <button type="button" id="add-item" class="btn btn-ghost text-xs">+ Agregar item</button>
          </div>
          <div id="items-list" class="space-y-2"></div>
          <div class="text-right text-sm text-text-soft mt-3">
            Subtotal: <span id="subtotal" class="font-mono">$0.00</span> ·
            IVA (16%): <span id="iva" class="font-mono">$0.00</span> ·
            <strong>Total: <span id="total" class="font-mono text-lg">$0.00</span></strong>
          </div>
        </div>

        <div>
          <label class="text-xs uppercase tracking-wider text-text-soft">Notas</label>
          <textarea name="notas" rows="2" class="textarea">${escapeHtml(cot?.notas ?? '')}</textarea>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
          <button type="button" data-act="cancel" class="btn">Cancelar</button>
          <button type="submit" class="btn btn-primary">${cot ? 'Guardar' : 'Crear'}</button>
        </div>
      </form>
    `,
    onMount: (root) => {
      const form = root.querySelector<HTMLFormElement>('#cot-form')!;
      const itemsList = root.querySelector<HTMLElement>('#items-list')!;

      function renderItems(): void {
        itemsList.innerHTML = items.map((it, idx) => `
          <div class="grid grid-cols-[2fr_60px_100px_80px_30px] gap-2 items-center" data-item="${idx}">
            <input data-field="descripcion" value="${escapeHtml(it.descripcion)}" placeholder="Descripción" class="input" />
            <input data-field="cantidad" type="number" step="0.01" value="${it.cantidad}" class="input text-right" />
            <input data-field="precioUnitario" type="number" step="0.01" value="${it.precioUnitario}" class="input text-right" />
            <div class="text-right font-mono text-sm" data-importe>${fmt.money(it.cantidad * it.precioUnitario)}</div>
            <button type="button" data-remove class="btn btn-ghost btn-icon text-red-300">×</button>
          </div>
        `).join('');
        itemsList.querySelectorAll<HTMLInputElement>('input[data-field]').forEach((inp) => {
          inp.addEventListener('input', () => {
            const row = inp.closest('[data-item]') as HTMLElement;
            const idx = parseInt(row.dataset.item!, 10);
            const f = inp.dataset.field as keyof typeof items[0];
            (items[idx] as any)[f] = inp.type === 'number' ? parseFloat(inp.value) || 0 : inp.value;
            updateTotals();
          });
        });
        itemsList.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const row = btn.closest('[data-item]') as HTMLElement;
            const idx = parseInt(row.dataset.item!, 10);
            items.splice(idx, 1);
            if (!items.length) items.push({ descripcion: '', cantidad: 1, precioUnitario: 0 });
            renderItems();
            updateTotals();
          });
        });
      }

      function updateTotals(): void {
        const subtotal = items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0);
        const iva = subtotal * 0.16;
        const total = subtotal + iva;
        root.querySelector('#subtotal')!.textContent = fmt.money(subtotal);
        root.querySelector('#iva')!.textContent = fmt.money(iva);
        root.querySelector('#total')!.textContent = fmt.money(total);
        itemsList.querySelectorAll<HTMLElement>('[data-importe]').forEach((el, idx) => {
          el.textContent = fmt.money(items[idx].cantidad * items[idx].precioUnitario);
        });
      }

      root.querySelector('#add-item')?.addEventListener('click', () => {
        items.push({ descripcion: '', cantidad: 1, precioUnitario: 0 });
        renderItems();
      });
      root.querySelector('[data-act="cancel"]')?.addEventListener('click', () => close());

      renderItems();
      updateTotals();

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const payload = {
          clienteNombre: fd.get('clienteNombre') as string,
          estado: fd.get('estado') as any,
          moneda: fd.get('moneda') as 'MXN' | 'USD',
          tipoCambio: parseFloat(fd.get('tipoCambio') as string) || 17,
          notas: fd.get('notas') as string,
          items: items.filter((i) => i.descripcion.trim()),
        };
        try {
          if (cot) await api.put(`/api/cotizaciones/${cot.id}`, payload);
          else await api.post('/api/cotizaciones', payload);
          toast(cot ? 'Actualizada' : 'Creada', 'success');
          close();
          refresh();
        } catch (err) {
          toast(err instanceof ApiException ? err.message : 'Error', 'error');
        }
      });
    },
  });
}
