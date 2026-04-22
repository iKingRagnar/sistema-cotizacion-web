/**
 * service-worker.js — estrategias inteligentes por tipo de recurso
 *  - HTML / app shell:  network-first (siempre fresco, fallback a cache)
 *  - JS / CSS / assets: stale-while-revalidate (instant load + actualización en bg)
 *  - GET /api/...:      stale-while-revalidate corto (5s TTL preferido)
 *  - POST/PUT/DELETE:   network-only
 *  - Imágenes:          cache-first con fallback transparent
 */
const VERSION = 'cotizacion-pro-v53';
const CACHE_STATIC = VERSION + '-static';
const CACHE_RUNTIME = VERSION + '-runtime';
const CACHE_API = VERSION + '-api';

const APP_SHELL = ['/', '/index.html', '/manifest.json', '/favicon.svg'];
const API_TTL_MS = 5 * 1000; // dentro de este margen, sirve cache antes que red

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_STATIC)
      .then((c) => c.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
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
  );
});

/** Detecta el tipo de recurso para elegir estrategia. */
function classify(url, req) {
  if (req.method !== 'GET') return 'no-cache';
  const p = url.pathname;
  if (p.startsWith('/api/')) {
    if (p.startsWith('/api/attachments/') && p.endsWith('/download')) return 'cache-first';
    if (p === '/api/auth/me' || p.startsWith('/api/auth/')) return 'no-cache';
    return 'api-swr';
  }
  if (/\.(png|jpe?g|webp|gif|svg|ico)$/i.test(p)) return 'cache-first';
  if (/\.(js|css|woff2?|ttf)$/i.test(p))         return 'swr';
  if (p === '/' || p.endsWith('.html') || p === '/index.html') return 'network-first';
  if (p.endsWith('.json'))                                     return 'swr';
  return 'no-cache';
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  const strategy = classify(url, e.request);
  if (strategy === 'no-cache') return;

  if (strategy === 'cache-first')   e.respondWith(cacheFirst(e.request, CACHE_RUNTIME));
  else if (strategy === 'swr')      e.respondWith(staleWhileRevalidate(e.request, CACHE_RUNTIME));
  else if (strategy === 'api-swr')  e.respondWith(apiStaleWhileRevalidate(e.request));
  else if (strategy === 'network-first') e.respondWith(networkFirst(e.request, CACHE_STATIC));
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
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

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || network || new Response('', { status: 504 });
}

/** SWR específico para /api/: si la respuesta cacheada es <5s la sirve directo
    (instantáneo); si es más vieja, sirve cache + dispara fetch en background. */
async function apiStaleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_API);
  const cached = await cache.match(req);
  const ageMs = cached ? (Date.now() - Number(cached.headers.get('x-prem-cached-at') || 0)) : Infinity;

  const networkPromise = fetch(req).then(async (res) => {
    if (res.ok) {
      const headers = new Headers(res.headers);
      headers.set('x-prem-cached-at', String(Date.now()));
      const body = await res.clone().blob();
      const wrapped = new Response(body, { status: res.status, statusText: res.statusText, headers });
      cache.put(req, wrapped.clone());
      return wrapped;
    }
    return res;
  }).catch(() => null);

  if (cached && ageMs < API_TTL_MS) return cached.clone();
  if (cached) {
    networkPromise.then((r) => r && notifyClientsApiUpdated(req.url));
    return cached.clone();
  }
  const fresh = await networkPromise;
  return fresh || new Response('', { status: 504 });
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    return cached || new Response('Offline', { status: 504 });
  }
}

async function notifyClientsApiUpdated(url) {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const c of clients) c.postMessage({ type: 'api-updated', url });
}

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting' || e.data?.type === 'skip-waiting') self.skipWaiting();
});
