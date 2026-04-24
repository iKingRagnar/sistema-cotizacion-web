/** Bump al desplegar para limpiar caches viejas (HTML/JS con ?v=). No precargar /js/app.js (la página usa app.js?v=…). */
const CACHE_NAME = 'cotizacion-pro-v42-login-nano-fondo';
const STATIC_URLS = ['/', '/index.html', '/css/style.css', '/favicon.svg', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || e.request.method !== 'GET') return;
  const p = url.pathname;
  const isStatic =
    /\.(html|css|js|svg|json)$/i.test(p) || p.endsWith('manifest.json');
  if (!isStatic) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const clone = r.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
