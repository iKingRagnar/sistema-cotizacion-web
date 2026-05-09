/**
 * Entry point del frontend.
 * Define rutas (lazy-loaded) y arranca el router.
 */
import { defineRoute, defineNotFound, navigate, startRouter } from './lib/router';
import { isAuthenticated } from './lib/auth';

/* ── Rutas ──────────────────────────────────────── */
defineRoute({
  pattern: '#/login',
  handler: async () => {
    const { renderLogin } = await import('./modules/auth/login');
    await renderLogin();
  },
});

defineRoute({
  pattern: '#/',
  handler: async () => {
    const { renderDashboard } = await import('./modules/dashboard/dashboard');
    await renderDashboard();
  },
  guard: isAuthenticated,
  fallback: '#/login',
});

defineRoute({
  pattern: '#/dashboard',
  handler: async () => {
    const { renderDashboard } = await import('./modules/dashboard/dashboard');
    await renderDashboard();
  },
  guard: isAuthenticated,
  fallback: '#/login',
});

defineNotFound(async () => {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <div class="min-h-screen grid place-items-center text-center p-6">
      <div>
        <h1 class="text-6xl font-display font-bold text-text-muted">404</h1>
        <p class="text-text-soft mt-2">Esta ruta no existe.</p>
        <button onclick="location.hash='#/'" class="btn btn-primary mt-4">Volver al inicio</button>
      </div>
    </div>
  `;
});

/* ── Boot ───────────────────────────────────────── */
if (!location.hash) {
  navigate(isAuthenticated() ? '#/' : '#/login', true);
}
startRouter();

/* ── Limpieza preventiva: si hay SW del v1 cacheado, lo desregistra ── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister().catch(() => {}));
  }).catch(() => {});
  if ('caches' in window) {
    caches.keys().then((keys) => {
      keys.forEach((k) => caches.delete(k).catch(() => {}));
    }).catch(() => {});
  }
}
