/**
 * service-worker.js v60 — KILLER SW (v122)
 *
 * Este SW NO cachea NADA. Su único propósito es:
 *   1. Borrar TODOS los caches existentes (de versiones v75-v121)
 *   2. Auto-desregistrarse del browser
 *   3. Recargar todas las tabs abiertas para que carguen sin SW
 *
 * Razón: el SW estaba causando freeze al servir scripts pesados desde cache.
 * Como app web normal (sin SW), el browser carga directo del server cada vez.
 * Sin SW = sin cache problem = sin freeze.
 *
 * El cliente NO tiene que hacer nada. Visita la URL una vez y se auto-limpia.
 */

self.addEventListener('install', (e) => {
  /* Skip waiting para activar inmediato */
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    /* 1. Borrar TODOS los caches sin excepción */
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      console.log('[SW killer v122] Todos los caches borrados:', keys.length);
    } catch (e) { console.error('[SW killer] Error borrando caches:', e); }

    /* 2. Auto-desregistrar este SW */
    try {
      await self.registration.unregister();
      console.log('[SW killer v122] Service worker desregistrado');
    } catch (e) { console.error('[SW killer] Error desregistrando:', e); }

    /* 3. Tomar control de todos los clients y forzarlos a recargar */
    try {
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: 'window' });
      console.log('[SW killer v122] Recargando', clients.length, 'tabs');
      for (const client of clients) {
        try { client.navigate(client.url); } catch (e) {
          /* Si navigate falla (cross-origin etc), intentar postMessage */
          try { client.postMessage({ type: 'sw-killer-reload' }); } catch (_) {}
        }
      }
    } catch (e) { console.error('[SW killer] Error reload:', e); }
  })());
});

/* Fetch handler: PASS-THROUGH al network, NO cache */
self.addEventListener('fetch', (e) => {
  /* No interceptar nada — dejar que el browser haga fetch directo */
  return;
});

self.addEventListener('message', (e) => {
  if (e.data === 'kill-sw' || e.data?.type === 'kill-sw') {
    self.registration.unregister();
  }
});
