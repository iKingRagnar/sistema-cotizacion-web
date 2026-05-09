/**
 * Entry point del frontend.
 * Define rutas (lazy-loaded por módulo) y arranca el router.
 */
import { defineRoute, defineNotFound, navigate, startRouter } from './lib/router';
import { isAuthenticated } from './lib/auth';

const guard = isAuthenticated;
const fallback = '#/login';

/* ── Auth ──────────────────────────────────────── */
defineRoute({ pattern: '#/login', handler: async () => (await import('./modules/auth/login')).renderLogin() });

/* ── Dashboard ─────────────────────────────────── */
defineRoute({ pattern: '#/', handler: async () => (await import('./modules/dashboard/dashboard')).renderDashboard(), guard, fallback });
defineRoute({ pattern: '#/dashboard', handler: async () => (await import('./modules/dashboard/dashboard')).renderDashboard(), guard, fallback });

/* ── Catálogos ─────────────────────────────────── */
defineRoute({ pattern: '#/clientes', handler: async () => (await import('./modules/clientes/clientes')).renderClientes(), guard, fallback });
defineRoute({ pattern: '#/refacciones', handler: async () => (await import('./modules/refacciones/refacciones')).renderRefacciones(), guard, fallback });
defineRoute({ pattern: '#/categorias', handler: async () => (await import('./modules/categorias/categorias')).renderCategorias(), guard, fallback });
defineRoute({ pattern: '#/maquinas', handler: async () => (await import('./modules/maquinas/maquinas')).renderMaquinas(), guard, fallback });

/* ── Operaciones ───────────────────────────────── */
defineRoute({ pattern: '#/cotizaciones', handler: async () => (await import('./modules/cotizaciones/cotizaciones')).renderCotizaciones(), guard, fallback });
defineRoute({ pattern: '#/ventas', handler: async () => (await import('./modules/ventas/ventas')).renderVentas(), guard, fallback });

/* ── Comercial ─────────────────────────────────── */
defineRoute({ pattern: '#/prospeccion', handler: async () => (await import('./modules/prospeccion/prospeccion')).renderProspeccion(), guard, fallback });

/* ── Técnico ───────────────────────────────────── */
defineRoute({ pattern: '#/revision-maquinas', handler: async () => (await import('./modules/revision-maquinas/revision-maquinas')).renderRevisionMaquinas(), guard, fallback });
defineRoute({ pattern: '#/garantias', handler: async () => (await import('./modules/garantias/garantias')).renderGarantias(), guard, fallback });
defineRoute({ pattern: '#/mantenimientos', handler: async () => (await import('./modules/mantenimientos/mantenimientos')).renderMantenimientos(), guard, fallback });
defineRoute({ pattern: '#/sin-cobertura', handler: async () => (await import('./modules/sin-cobertura/sin-cobertura')).renderSinCobertura(), guard, fallback });

/* ── Configuración ─────────────────────────────── */
defineRoute({ pattern: '#/tarifas', handler: async () => (await import('./modules/tarifas/tarifas')).renderTarifas(), guard, fallback });

/* ── RRHH ──────────────────────────────────────── */
defineRoute({ pattern: '#/personal', handler: async () => (await import('./modules/personal/personal')).renderPersonal(), guard, fallback });
defineRoute({ pattern: '#/bonos', handler: async () => (await import('./modules/bonos/bonos')).renderBonos(), guard, fallback });
defineRoute({ pattern: '#/viajes', handler: async () => (await import('./modules/viajes/viajes')).renderViajes(), guard, fallback });
defineRoute({ pattern: '#/bitacora', handler: async () => (await import('./modules/bitacora/bitacora')).renderBitacora(), guard, fallback });

/* ── Analytics ─────────────────────────────────── */
defineRoute({ pattern: '#/reportes', handler: async () => (await import('./modules/reportes/reportes')).renderReportes(), guard, fallback });

/* ── Admin ─────────────────────────────────────── */
defineRoute({ pattern: '#/usuarios', handler: async () => (await import('./modules/usuarios/usuarios')).renderUsuarios(), guard, fallback });
defineRoute({ pattern: '#/audit', handler: async () => (await import('./modules/audit/audit')).renderAudit(), guard, fallback });

/* ── DavAI ─────────────────────────────────────── */
defineRoute({ pattern: '#/davai', handler: async () => (await import('./modules/davai/davai')).renderDavai(), guard, fallback });

/* ── 404 ───────────────────────────────────────── */
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

/* ── Boot ──────────────────────────────────────── */
if (!location.hash) navigate(isAuthenticated() ? '#/' : '#/login', true);
startRouter();

/* ── Cleanup preventivo de SW v1 (NO registrar SW propio) ── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister().catch(() => {}));
  }).catch(() => {});
  if ('caches' in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k).catch(() => {}))).catch(() => {});
  }
}
