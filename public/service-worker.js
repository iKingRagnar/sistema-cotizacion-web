/**
 * service-worker.js v55 — PWA-safe + timeout en network requests
 * Estrategias:
 *   - HTML, CSS, JS, JSON, fonts: network-first con TIMEOUT 4s + fallback cache
 *   - Imágenes: cache-first
 *   - APIs auth: bypass total (no cache)
 *   - skipWaiting + clients.claim para PWA standalone (evita race conditions)
 */
const VERSION = 'cotizacion-pro-v62';
const CACHE_RUNTIME = VERSION + '-runtime';
const NETWORK_TIMEOUT_MS = 4000;

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
