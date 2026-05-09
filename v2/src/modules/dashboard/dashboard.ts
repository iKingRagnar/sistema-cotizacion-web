/**
 * Dashboard placeholder. Pantalla post-login mientras se construyen los módulos.
 */
import { getCurrentUser, clearAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { navigate } from '@/lib/router';

export async function renderDashboard(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) return;
  const user = getCurrentUser();

  app.innerHTML = `
    <div class="min-h-screen flex flex-col">
      <header class="border-b border-[var(--border)] bg-bg-surface px-6 py-3 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-md bg-gradient-to-br from-accent to-accent-2 grid place-items-center text-white font-display font-bold">ST</div>
          <div>
            <h1 class="font-display font-bold text-base leading-none">Servicio Técnico v2</h1>
            <p class="text-xs text-text-muted leading-none mt-1">Sistema sin freezes 🚀</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-sm text-text-soft">
            ${user ? `<strong>${user.username}</strong> · <span class="text-text-muted">${user.role}</span>` : 'Sin sesión'}
          </span>
          <button id="logout-btn" class="btn btn-ghost text-sm">Cerrar sesión</button>
        </div>
      </header>

      <main class="flex-1 p-6 max-w-5xl mx-auto w-full">
        <div class="card mb-4">
          <h2 class="font-display font-bold text-lg mb-2">🎉 ¡Bienvenido al v2!</h2>
          <p class="text-text-soft">
            El backend está corriendo, el login funciona, y la app carga sin
            <code class="bg-bg-elevated px-1.5 py-0.5 rounded text-accent-3 font-mono text-xs">backdrop-filter</code>
            ni service worker.
          </p>
          <p class="text-text-muted text-sm mt-3">
            Los módulos (Clientes, Cotizaciones, Prospección, etc.) se construirán en próximas sesiones.
            Ver <strong>v2/REBUILD-PROGRESS.md</strong> para el roadmap.
          </p>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          ${[
            { label: 'Sin Service Worker', val: '✓', sub: 'Sin cache hell' },
            { label: 'Sin backdrop-filter', val: '0', sub: 'Sin paint freeze' },
            { label: 'Bundle inicial', val: '~80KB', sub: 'gzip estimado' },
            { label: 'Stack', val: 'Vite+TS', sub: 'Lit + Tailwind' },
          ].map((s) => `
            <div class="card">
              <div class="text-xs text-text-muted uppercase tracking-wider">${s.label}</div>
              <div class="text-2xl font-display font-bold mt-1">${s.val}</div>
              <div class="text-xs text-text-dim mt-1">${s.sub}</div>
            </div>
          `).join('')}
        </div>

        <div class="card">
          <h3 class="font-display font-bold mb-3">Health check del backend</h3>
          <pre id="health-output" class="bg-bg-deep border border-[var(--border)] rounded-md p-3 text-xs font-mono text-text-soft overflow-auto"><span class="spinner"></span> Cargando...</pre>
        </div>
      </main>

      <footer class="text-center py-4 text-xs text-text-dim border-t border-[var(--border)]">
        v2.0.0 · Vite + TypeScript + Tailwind · Sin SW
      </footer>
    </div>
  `;

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try { await api.post('/api/auth/logout'); } catch {}
    clearAuth();
    navigate('#/login');
  });

  /* Health check live */
  try {
    const data = await api.get('/api/health');
    const out = document.getElementById('health-output');
    if (out) out.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    const out = document.getElementById('health-output');
    if (out) out.textContent = 'Error: ' + (err instanceof Error ? err.message : String(err));
  }
}
