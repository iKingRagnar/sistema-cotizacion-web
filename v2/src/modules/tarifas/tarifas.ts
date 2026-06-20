/**
 * Tarifas — key/value editor con secciones por categoría.
 */
import { ensureShell, setPageTitle } from '@/components/app-shell';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { escapeHtml } from '@/lib/data-table';

interface Tarifa { key: string; value: string; categoria: string | null; notas: string | null }

const DEFAULTS: Tarifa[] = [
  { key: 'tipo_cambio_banxico', value: '17', categoria: 'tipo_cambio', notas: 'MXN por 1 USD (referencia Banxico)' },
  { key: 'mecanico_mxn', value: '450', categoria: 'mano_obra', notas: 'Tarifa hora mecánico (MXN)' },
  { key: 'mecanico_usd', value: '25', categoria: 'mano_obra', notas: 'Tarifa hora mecánico (USD)' },
  { key: 'electronico_mxn', value: '520', categoria: 'mano_obra', notas: 'Tarifa hora electrónico (MXN)' },
  { key: 'electronico_usd', value: '30', categoria: 'mano_obra', notas: 'Tarifa hora electrónico (USD)' },
  { key: 'cnc_mxn', value: '650', categoria: 'mano_obra', notas: 'Tarifa hora CNC (MXN)' },
  { key: 'cnc_usd', value: '38', categoria: 'mano_obra', notas: 'Tarifa hora CNC (USD)' },
  { key: 'ayudante_mxn', value: '280', categoria: 'mano_obra', notas: 'Tarifa hora ayudante (MXN)' },
  { key: 'ayudante_usd', value: '15', categoria: 'mano_obra', notas: 'Tarifa hora ayudante (USD)' },
  { key: 'comision_refacciones', value: '15', categoria: 'comisiones', notas: '% sobre refacciones' },
  { key: 'comision_servicios', value: '15', categoria: 'comisiones', notas: '% sobre servicios' },
  { key: 'bono_20k', value: '1000', categoria: 'comisiones', notas: 'MXN por cada $20k facturados' },
];

export async function renderTarifas(): Promise<void> {
  const { main } = ensureShell();
  setPageTitle('Tarifas');

  main.innerHTML = `<div class="text-text-muted text-center py-8"><span class="spinner"></span> Cargando...</div>`;

  let tarifas: Tarifa[];
  try {
    tarifas = await api.get<Tarifa[]>('/api/tarifas');
  } catch (err) {
    main.innerHTML = `<div class="card text-red-300">Error: ${(err as Error).message}</div>`;
    return;
  }

  /* Merge con defaults */
  const map = new Map(tarifas.map((t) => [t.key, t]));
  for (const def of DEFAULTS) if (!map.has(def.key)) map.set(def.key, def);
  const items = Array.from(map.values());

  /* Agrupar por categoría */
  const groups = new Map<string, Tarifa[]>();
  for (const t of items) {
    const c = t.categoria || 'general';
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c)!.push(t);
  }

  const groupHtml = Array.from(groups.entries()).map(([cat, list]) => `
    <div class="card mb-4">
      <h3 class="font-display font-bold text-base mb-3 capitalize">${cat.replace(/_/g, ' ')}</h3>
      <div class="space-y-2">
        ${list.map((t) => `
          <div class="grid grid-cols-1 md:grid-cols-[200px_1fr_2fr] gap-2 items-center">
            <div class="text-xs font-mono text-text-muted">${t.key}</div>
            <input type="text" data-key="${t.key}" value="${escapeHtml(t.value)}" class="input" />
            <div class="text-xs text-text-dim">${t.notas ?? ''}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  main.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <p class="text-text-muted text-sm">Configuración de tarifas y parámetros del sistema.</p>
      <button id="save-btn" class="btn btn-primary">Guardar todos</button>
    </div>
    ${groupHtml}
  `;

  document.getElementById('save-btn')?.addEventListener('click', async () => {
    const inputs = main.querySelectorAll<HTMLInputElement>('input[data-key]');
    const payload = Array.from(inputs).map((i) => ({
      key: i.dataset.key!,
      value: i.value,
      categoria: items.find((t) => t.key === i.dataset.key)?.categoria || 'general',
    }));
    try {
      await api.put('/api/tarifas', payload);
      toast(`✓ ${payload.length} tarifas guardadas`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  });
}
