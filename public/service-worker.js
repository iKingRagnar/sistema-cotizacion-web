const CACHE_NAME = 'cotizacion-pro-v21';
const STATIC_URLS = ['/', '/index.html', '/css/style.css', '/js/app.js', '/favicon.svg', '/manifest.json'];

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
  if (e.request.url.startsWith(self.location.origin) && (e.request.url.endsWith('.html') || e.request.url.endsWith('.css') || e.request.url.endsWith('.js') || e.request.url.endsWith('.svg') || e.request.url.endsWith('manifest.json'))) {
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request).then((r) => { const clone = r.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone)); return r; }))
    );
  }
});
