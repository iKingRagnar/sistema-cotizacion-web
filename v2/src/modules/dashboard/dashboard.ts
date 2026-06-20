/**
 * Dashboard — KPIs y charts del estado del negocio.
 */
import { ensureShell, setPageTitle } from '@/components/app-shell';
import { api } from '@/lib/api';
import { fmt } from '@/lib/data-table';

interface DashData {
  counters: { clientes: number; refacciones: number; maquinas: number; prospectos: number };
  cotizaciones: Array<{ estado: string; count: number; total: number }>;
  ventasUltimoMes: { total: number; count: number };
  prospectos: Array<{ estado: string; count: number; potencial: number }>;
}

export async function renderDashboard(): Promise<void> {
  const { main } = ensureShell();
  setPageTitle('Dashboard');

  main.innerHTML = `<div class="text-text-muted py-8 text-center"><span class="spinner"></span> Cargando dashboard...</div>`;

  try {
    const data = await api.get<DashData>('/api/reportes/dashboard');

    const totalCotizaciones = data.cotizaciones.reduce((s, c) => s + c.count, 0);
    const totalCotMonto = data.cotizaciones.reduce((s, c) => s + c.total, 0);
    const totalProspectos = data.prospectos.reduce((s, p) => s + p.count, 0);
    const totalPotencial = data.prospectos.reduce((s, p) => s + p.potencial, 0);

    main.innerHTML = `
      <!-- Counters -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        ${[
          { label: 'Clientes', val: data.counters.clientes, icon: '👥', color: 'accent' },
          { label: 'Refacciones', val: data.counters.refacciones, icon: '🔧', color: 'accent-3' },
          { label: 'Máquinas', val: data.counters.maquinas, icon: '⚙️', color: 'accent-2' },
          { label: 'Prospectos', val: data.counters.prospectos, icon: '🎯', color: 'success' },
        ].map((c) => `
          <div class="card">
            <div class="flex items-start justify-between">
              <div>
                <div class="text-xs text-text-muted uppercase tracking-wider">${c.label}</div>
                <div class="text-3xl font-display font-bold mt-1">${fmt.number(c.val)}</div>
              </div>
              <div class="text-3xl opacity-50">${c.icon}</div>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Highlights -->
      <div class="grid md:grid-cols-3 gap-3 mb-6">
        <div class="card">
          <div class="text-xs text-text-muted uppercase tracking-wider mb-2">Ventas (último mes)</div>
          <div class="text-2xl font-display font-bold text-emerald-300">${fmt.money(data.ventasUltimoMes.total)}</div>
          <div class="text-xs text-text-muted mt-1">${data.ventasUltimoMes.count} venta(s)</div>
        </div>
        <div class="card">
          <div class="text-xs text-text-muted uppercase tracking-wider mb-2">Cotizaciones</div>
          <div class="text-2xl font-display font-bold">${totalCotizaciones}</div>
          <div class="text-xs text-text-muted mt-1">${fmt.money(totalCotMonto)} en pipeline</div>
        </div>
        <div class="card">
          <div class="text-xs text-text-muted uppercase tracking-wider mb-2">Pipeline Prospección</div>
          <div class="text-2xl font-display font-bold text-blue-300">${fmt.money(totalPotencial, 'USD')}</div>
          <div class="text-xs text-text-muted mt-1">${totalProspectos} prospectos</div>
        </div>
      </div>

      <!-- Por estado -->
      <div class="grid md:grid-cols-2 gap-3">
        <div class="card">
          <h3 class="font-display font-bold text-base mb-3">Cotizaciones por estado</h3>
          ${data.cotizaciones.length ? data.cotizaciones.map((c) => `
            <div class="flex justify-between items-center py-1.5 border-b border-[var(--border)] last:border-0">
              <span class="text-sm text-text-soft capitalize">${c.estado}</span>
              <span class="text-sm font-mono"><strong>${c.count}</strong> · ${fmt.money(c.total)}</span>
            </div>
          `).join('') : '<div class="text-text-muted text-sm">Sin datos</div>'}
        </div>
        <div class="card">
          <h3 class="font-display font-bold text-base mb-3">Prospectos por estado</h3>
          ${data.prospectos.length ? data.prospectos.map((p) => `
            <div class="flex justify-between items-center py-1.5 border-b border-[var(--border)] last:border-0">
              <span class="text-sm text-text-soft capitalize">${p.estado}</span>
              <span class="text-sm font-mono"><strong>${p.count}</strong> · ${fmt.money(p.potencial, 'USD')}</span>
            </div>
          `).join('') : '<div class="text-text-muted text-sm">Sin datos</div>'}
        </div>
      </div>
    `;
  } catch (err) {
    main.innerHTML = `<div class="card text-red-300">Error cargando dashboard: ${(err as Error).message}</div>`;
  }
}
