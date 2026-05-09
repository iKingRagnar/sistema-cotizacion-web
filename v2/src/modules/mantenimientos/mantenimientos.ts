/**
 * Mantenimientos — vista calendario mensual.
 * Click en día → modal con eventos de ese día.
 */
import { ensureShell, setPageTitle } from '@/components/app-shell';
import { api } from '@/lib/api';
import { openModal } from '@/lib/modal';
import { fmt, escapeHtml } from '@/lib/data-table';

interface Mant {
  id: number; garantia_id: number; numero: number;
  fechaProgramada: string; fechaRealizado: string | null;
  pagado: number | null; razon_social: string | null;
  modelo_maquina: string | null; numero_serie: string | null; notas: string | null;
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export async function renderMantenimientos(): Promise<void> {
  const { main } = ensureShell();
  setPageTitle('Mantenimientos');

  const today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth();

  async function load(): Promise<void> {
    const ym = `${year}-${String(month + 1).padStart(2, '0')}`;

    main.innerHTML = `
      <div class="card mb-4">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-2">
            <button id="prev-month" class="btn btn-ghost">← Anterior</button>
            <h2 class="font-display font-bold text-lg px-3">${MESES[month]} ${year}</h2>
            <button id="next-month" class="btn btn-ghost">Siguiente →</button>
            <button id="today-btn" class="btn btn-ghost text-xs">Hoy</button>
          </div>
          <div class="text-sm text-text-muted">
            <span id="event-count">—</span> mantenimiento(s) este mes
          </div>
        </div>
      </div>
      <div id="cal-host" class="text-text-muted text-center py-8"><span class="spinner"></span></div>
    `;

    document.getElementById('prev-month')?.addEventListener('click', () => {
      if (--month < 0) { month = 11; year--; } load();
    });
    document.getElementById('next-month')?.addEventListener('click', () => {
      if (++month > 11) { month = 0; year++; } load();
    });
    document.getElementById('today-btn')?.addEventListener('click', () => {
      year = today.getFullYear(); month = today.getMonth(); load();
    });

    let events: Mant[] = [];
    try {
      events = await api.get<Mant[]>('/api/mantenimientos', { query: { mes: ym } });
    } catch (err) {
      document.getElementById('cal-host')!.innerHTML = `<div class="text-red-300">Error: ${(err as Error).message}</div>`;
      return;
    }
    document.getElementById('event-count')!.textContent = String(events.length);

    /* Build calendar grid */
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    const eventsByDay = new Map<number, Mant[]>();
    events.forEach((e) => {
      const d = parseInt(e.fechaProgramada.slice(8, 10), 10);
      if (!eventsByDay.has(d)) eventsByDay.set(d, []);
      eventsByDay.get(d)!.push(e);
    });

    const cells: string[] = [];
    /* Padding pre */
    for (let i = 0; i < firstDay; i++) cells.push('<div></div>');
    /* Días */
    for (let d = 1; d <= lastDate; d++) {
      const evs = eventsByDay.get(d) ?? [];
      const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
      const dotColor = evs.some((e) => !e.fechaRealizado) ? 'bg-warning' : evs.length ? 'bg-success' : '';
      cells.push(`
        <div class="border border-[var(--border)] rounded-md min-h-[80px] p-2 cursor-pointer hover:bg-[var(--bg-hover)] ${isToday ? 'ring-2 ring-accent' : ''}"
             data-day="${d}">
          <div class="flex justify-between items-start">
            <span class="font-mono text-sm font-semibold ${isToday ? 'text-accent' : ''}">${d}</span>
            ${evs.length ? `<span class="text-xs px-1.5 rounded-full ${dotColor || 'bg-bg-elevated'} text-white">${evs.length}</span>` : ''}
          </div>
          ${evs.slice(0, 2).map((e) => `<div class="text-[10px] truncate text-text-muted mt-1">${escapeHtml(e.razon_social ?? '?')}</div>`).join('')}
        </div>
      `);
    }

    document.getElementById('cal-host')!.innerHTML = `
      <div class="card">
        <div class="grid grid-cols-7 gap-2 mb-2">
          ${DIAS.map((d) => `<div class="text-center text-xs font-semibold uppercase tracking-wider text-text-muted py-1">${d}</div>`).join('')}
        </div>
        <div class="grid grid-cols-7 gap-2">
          ${cells.join('')}
        </div>
      </div>
    `;

    /* Click en día → modal */
    document.querySelectorAll<HTMLElement>('[data-day]').forEach((cell) => {
      cell.addEventListener('click', () => {
        const d = parseInt(cell.dataset.day!, 10);
        const evs = eventsByDay.get(d) ?? [];
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        openModal({
          title: `Mantenimientos · ${dateStr}`,
          size: 'md',
          body: evs.length ? `
            <div class="space-y-2">
              ${evs.map((e) => `
                <div class="card">
                  <div class="font-bold">${escapeHtml(e.razon_social ?? '—')}</div>
                  <div class="text-sm text-text-soft">${escapeHtml(e.modelo_maquina ?? '')} · ${escapeHtml(e.numero_serie ?? '')}</div>
                  <div class="text-xs text-text-muted mt-1">
                    Mant. #${e.numero} ·
                    ${e.fechaRealizado ? `✓ Realizado ${fmt.date(e.fechaRealizado)}` : '⏳ Pendiente'}
                    ${e.pagado ? `· Pagado ${fmt.money(e.pagado)}` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          ` : '<p class="text-text-muted text-center py-4">Sin mantenimientos este día.</p>',
        });
      });
    });
  }

  await load();
}
