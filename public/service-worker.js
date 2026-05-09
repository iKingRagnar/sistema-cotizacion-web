/**
 * service-worker.js v56 — PWA-safe + timeout en content + cache-bust v115
 *   v115 (2026-05-08): PERF JS — sweeper inline-style mata 549 backdrop-filter restantes (CSS especificidad pierde)
 *   v114 (2026-05-08): PERF EMERGENCY — kill GLOBAL de backdrop-filter + animations infinitas (audit en vivo: page frozen)
 *   v113 (2026-05-08): PERF — quitado backdrop-filter de tables/davai/sidebar + animations infinitas (era 1.7s freeze)
 *   v112 (2026-05-08): Modal anti-freeze UNIVERSAL — CSS guard + JS observer + handlers calendario mant
 *   v111 (2026-05-08): Tarifas inputs alineados — overrides para inputs en TD + form-grid en panel Tarifas
 *   v110 (2026-05-08): Revisión Máquina anti-freeze — feedback inmediato + watchdog 8s + force-visible
 *   v109 (2026-05-08): SUPREME LAYER — DavAI + Tables + Forms + Prospección Kanban (4 archivos nuevos)
 *   v108 (2026-05-08): TD transparent en hover (premium.css enmascaraba el gradient con bg muddy)
 *   v107 (2026-05-08): Sidebar Prospección dark + hover tablas premium + ESC safety-net (anti-freeze modales)
 *   v106 (2026-05-08): Prospección Pro — Tabla de Leads visible + boot polling robusto
 *   v105 (2026-05-08): Prospección Pro — KPIs + IA hunter/enrich/pitch/insights/funnel/cluster/compare
 *   v104 (2026-05-08): tables-fix v5 — botones acciones compactos 30px + min-width col 200/230px
 * Estrategias:
 *   - HTML, CSS, JS, JSON, fonts: network-first con TIMEOUT 4s + fallback cache
 *   - Imágenes: cache-first
 *   - APIs auth: bypass total (no cache)
 *   - skipWaiting + clients.claim para PWA standalone (evita race conditions)
 */
const VERSION = 'cotizacion-pro-v115';
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
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
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

/** Network-first con TIMEOUT — si la red tarda > 4s, usa cache de inmediato.
 *  Crítico en PWA standalone donde la red puede colgarse silenciosamente. */
async function networkFirstWithTimeout(req) {
  const cache = await caches.open(CACHE_RUNTIME);

  return new Promise(async (resolve) => {
    let resolved = false;
    const timeoutId = setTimeout(async () => {
      if (resolved) return;
      const cached = await cache.match(req);
      if (cached) { resolved = true; resolve(cached); }
      // si no hay cache, espera la red (pero no bloquea forever)
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
});
