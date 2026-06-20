/**
 * Reportes — placeholder con exportes CSV de cada entidad.
 */
import { ensureShell, setPageTitle } from '@/components/app-shell';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

const ENTITIES = [
  { label: 'Clientes', endpoint: '/api/clientes', filename: 'clientes.csv' },
  { label: 'Refacciones', endpoint: '/api/refacciones', filename: 'refacciones.csv' },
  { label: 'Máquinas', endpoint: '/api/maquinas', filename: 'maquinas.csv' },
  { label: 'Cotizaciones', endpoint: '/api/cotizaciones', filename: 'cotizaciones.csv' },
  { label: 'Ventas', endpoint: '/api/ventas', filename: 'ventas.csv' },
  { label: 'Prospectos', endpoint: '/api/prospectos', filename: 'prospectos.csv' },
  { label: 'Personal', endpoint: '/api/personal', filename: 'personal.csv' },
  { label: 'Bonos', endpoint: '/api/bonos', filename: 'bonos.csv' },
  { label: 'Viajes', endpoint: '/api/viajes', filename: 'viajes.csv' },
];

export async function renderReportes(): Promise<void> {
  const { main } = ensureShell();
  setPageTitle('Reportes');

  main.innerHTML = `
    <p class="text-text-muted text-sm mb-4">Exporta cualquier tabla a CSV para análisis en Excel o Google Sheets.</p>
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      ${ENTITIES.map((e) => `
        <button class="card text-left hover:border-accent transition-colors" data-endpoint="${e.endpoint}" data-filename="${e.filename}">
          <div class="font-display font-bold text-base">${e.label}</div>
          <div class="text-xs text-text-muted mt-1">Click para descargar CSV</div>
        </button>
      `).join('')}
    </div>
  `;

  main.querySelectorAll<HTMLButtonElement>('[data-endpoint]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const endpoint = btn.dataset.endpoint!;
      const filename = btn.dataset.filename!;
      btn.disabled = true;
      try {
        const resp = await api.get<{ data?: any[] } | any[]>(endpoint, { query: { pageSize: 5000 } });
        const rows = Array.isArray(resp) ? resp : resp.data ?? [];
        if (!rows.length) { toast('Sin datos', 'warning'); return; }
        downloadCSV(rows, filename);
        toast(`✓ ${rows.length} filas exportadas`, 'success');
      } catch (err) {
        toast((err as Error).message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function downloadCSV(rows: any[], filename: string): void {
  const headers = Object.keys(rows[0]);
  const escape = (v: any): string => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ].join('\n');

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
