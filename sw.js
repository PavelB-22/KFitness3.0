/* Офлайн-кэш. После изменения файлов на GitHub поменяй номер версии. */
const CACHE = 'kfitnes-v3.0';
const FILES = ['./', './index.html', './style.css?v=3.0', './core.js?v=3.0', './parse.js?v=3.0', './train.js?v=3.0',
  './plans.js?v=3.0', './timer.js?v=3.0', './sync.js?v=3.0', './manage.js?v=3.0', './pdf.min.js', './pdf.worker.min.js',
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
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
