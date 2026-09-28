/* Офлайн-кэш. Данные сервера не кэшируем, чтобы профили не смешивались. */
const CACHE = 'kfitnes-v3.5';
const NO_CACHE = ['/login', '/logout', '/me', '/clients', '/analytics', '/api/'];
const FILES = [
  './', './index.html', './login.html', './style.css?v=3.2',
  './core.js?v=3.2', './parse.js?v=3.2', './train.js?v=3.2', './plans.js?v=3.2',
  './timer.js?v=3.2', './manage.js?v=3.2', './measurements.js?v=3.2',
  './sync.js?v=3.2', './trainer.js?v=3.2', './start.js?v=3.2',
  './pdf.min.js', './pdf.worker.min.js', './manifest.webmanifest',
  './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  const path = new URL(e.request.url).pathname;

  if (NO_CACHE.some(p => path.startsWith(p))) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }));
    return;
  }

  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request))
  );
});
