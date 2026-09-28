/* Офлайн-кэш. После изменения файлов на GitHub поменяй номер версии. */
const CACHE = 'kfitnes-v3.0';
const FILES = ['./', './index.html', './login.html', './style.css?v=3.0', './core.js?v=3.1', './parse.js?v=3.1', './train.js?v=3.1',
  './plans.js?v=3.1', './timer.js?v=3.1', './sync.js?v=3.1', './manage.js?v=3.1', './pdf.min.js', './pdf.worker.min.js',
  './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
/* Сначала сеть (чтобы обновления приходили сразу), без сети из кэша */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;

  const path = new URL(e.request.url).pathname;

  // серверные запросы — только сеть, мимо кэша
  if (NO_CACHE.some(p => path.startsWith(p))) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }));
    return;
  }

  // статика — сеть с обновлением кэша, при офлайне из кэша
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
