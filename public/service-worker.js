/**
 * service-worker.js — versión 54 — FIX agresivo de cache busting
 * - HTML, CSS, JS: NETWORK-FIRST (siempre fresco; cache solo si offline)
 * - Imágenes:      cache-first
 * - APIs GET:      network-first (más simple y predecible que SWR)
 * - skipWaiting + clients.claim para tomar control inmediato
 */
const VERSION = 'cotizacion-pro-v54';
const CACHE_RUNTIME = VERSION + '-runtime';

self.addEventListener('install', (e) => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => {
        // Notificar a todos los clientes que hay versión nueva
        return self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((c) => c.postMessage({ type: 'sw-updated', version: VERSION }));
        });
      })
  );
});

function classify(url, req) {
  if (req.method !== 'GET') return 'no-cache';
  const p = url.pathname;
  if (p.startsWith('/api/auth/')) return 'no-cache';
  if (/\.(png|jpe?g|webp|gif|svg|ico)$/i.test(p)) return 'cache-first';
  // HTML, CSS, JS, JSON, fonts → network-first siempre
  return 'network-first';
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  const strategy = classify(url, e.request);
  if (strategy === 'no-cache') return;
  if (strategy === 'cache-first') e.respondWith(cacheFirst(e.request));
  else                            e.respondWith(networkFirst(e.request));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_RUNTIME);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return new Response('', { status: 504 });
  }
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE_RUNTIME);
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    return cached || new Response('Offline', { status: 504, headers: { 'Content-Type': 'text/plain' } });
  }
}

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting' || e.data?.type === 'skip-waiting') self.skipWaiting();
});
