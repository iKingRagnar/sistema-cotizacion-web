/**
 * service-worker.js v57 — PWA-safe + AGGRESSIVE CACHE NUKE + cache-bust v120
 *   v120 (2026-05-08): NUKE TOTAL — borra TODOS los caches al activate (no solo de versiones distintas).
 *                       Forza skipWaiting + clients.claim. Vacía JS/CSS viejos a NO-OP.
 *                       Confirmado por trace: server v119 está sano (INP 36ms, freeze=0). El problema
 *                       era cache de SW viejo (v117/v118) sirviendo scripts pesados. Esto lo nuke.
 *   v119 (2026-05-08): ROLLBACK NUCLEAR — desactivados prospeccion-pro/supreme/revision-fix JS + supreme CSS
 *   v118 (2026-05-08): PERF FINAL — html#root body#app * (DOS IDs) vence :is(#panel-X) de nano-fondo
 *   v117 (2026-05-08): PERF FIX REAL — perf-emergency.js NO-OP (causaba 372ms forced reflow), CSS body#app * lo reemplaza
 *   v116 (2026-05-08): PERF JS v2 — setProperty(...,'important')
 *   v115 (2026-05-08): PERF JS — sweeper inline-style
 *   v114 (2026-05-08): PERF EMERGENCY — kill GLOBAL de backdrop-filter
 *   v113 (2026-05-08): PERF — quitado backdrop-filter de tables/davai/sidebar
 *   v112 (2026-05-08): Modal anti-freeze UNIVERSAL
 *   v111 (2026-05-08): Tarifas inputs alineados
 *   v110 (2026-05-08): Revisión Máquina anti-freeze
 *   v109 (2026-05-08): SUPREME LAYER
 *   v108 (2026-05-08): TD transparent en hover
 *   v107 (2026-05-08): Sidebar Prospección dark + ESC safety-net
 *   v106 (2026-05-08): Prospección Pro Tabla
 *   v105 (2026-05-08): Prospección Pro KPIs
 *   v104 (2026-05-08): tables-fix v5
 * Estrategias:
 *   - HTML, CSS, JS, JSON, fonts: network-first con TIMEOUT 4s + fallback cache
 *   - Imágenes: cache-first
 *   - APIs auth: bypass total (no cache)
 *   - skipWaiting + clients.claim para PWA standalone (evita race conditions)
 */
const VERSION = 'cotizacion-pro-v120';
const CACHE_RUNTIME = VERSION + '-runtime';
const NETWORK_TIMEOUT_MS = 4000;
const STATIC_URLS = ['/', '/index.html', '/css/style.css', '/favicon.svg', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        /* AGRESSIVE NUKE: borra TODOS los caches que no sean del CURRENT VERSION.
           Esto incluye runtime caches de versiones antiguas Y cualquier basura de
           experimentos anteriores. Critical para users con cache viejo de v117/v118
           que sirve scripts pesados (boot polling, MutationObservers, etc). */
        keys.map((k) => {
          if (!k.startsWith(VERSION)) {
            console.log('[SW v120] Nuking old cache:', k);
            return caches.delete(k);
          }
          return Promise.resolve();
        })
      ))
      .then(() => self.clients.claim())
      .then(() => {
        /* Notify all clients to reload (helps PWA standalone get fresh HTML) */
        return self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((client) => {
            try { client.postMessage({ type: 'sw-updated', version: 'v120' }); } catch (_) {}
          });
        });
      })
  );
});

function classify(url, req) {
  if (req.method !== 'GET') return 'no-cache';
  const p = url.pathname;
  if (p.startsWith('/api/auth/')) return 'no-cache';
  if (/\.(png|jpe?g|webp|gif|svg|ico)$/i.test(p)) return 'cache-first';
  return 'network-first';
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  const strategy = classify(url, e.request);
  if (strategy === 'no-cache') return;
  if (strategy === 'cache-first') e.respondWith(cacheFirst(e.request));
  else                            e.respondWith(networkFirstWithTimeout(e.request));
});

async function cacheFirst(req) {
  try {
    const cache = await caches.open(CACHE_RUNTIME);
    const cached = await cache.match(req);
    if (cached) return cached;
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch {
    return new Response('', { status: 504 });
  }
}

/** Network-first con TIMEOUT — si la red tarda > 4s, usa cache de inmediato. */
async function networkFirstWithTimeout(req) {
  const cache = await caches.open(CACHE_RUNTIME);

  return new Promise(async (resolve) => {
    let resolved = false;
    const timeoutId = setTimeout(async () => {
      if (resolved) return;
      const cached = await cache.match(req);
      if (cached) { resolved = true; resolve(cached); }
    }, NETWORK_TIMEOUT_MS);

    try {
      const res = await fetch(req, { cache: 'no-store' });
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      if (res.ok) cache.put(req, res.clone()).catch(() => {});
      resolve(res);
    } catch (err) {
      if (resolved) return;
      const cached = await cache.match(req);
      if (cached) { resolved = true; clearTimeout(timeoutId); resolve(cached); return; }
      resolved = true;
      clearTimeout(timeoutId);
      resolve(new Response('Sin conexión', { status: 504, headers: { 'Content-Type': 'text/plain' } }));
    }
  });
}

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting' || e.data?.type === 'skip-waiting') self.skipWaiting();
  if (e.data === 'nuke-caches' || e.data?.type === 'nuke-caches') {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  }
});
