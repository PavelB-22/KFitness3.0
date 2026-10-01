/* Офлайн-кэш. Данные сервера не кэшируем, чтобы профили не смешивались. */
const CACHE = 'kfitnes-v3.8';
const NO_CACHE = ['/login', '/logout', '/me', '/clients', '/analytics', '/api/'];
const FILES = [
  './', './index.html', './login.html', './style.css?v=3.2',
  './core.js?v=3.6', './parse.js?v=3.8', './train.js?v=3.8', './video.js?v=3.8', './plans.js?v=3.2',
  './timer.js?v=3.2', './manage.js?v=3.6', './measurements.js?v=3.6',
  './sync.js?v=3.2', './trainer.js?v=3.2', './push.js?v=3.7', './start.js?v=3.2',
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

/* ───── push-уведомления тренеру ───── */
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let title = 'KFitness', body = 'Клиент добавил новые данные';
    try {
      const r = await fetch('/api/notifs', { cache: 'no-store', credentials: 'include' });
      const d = await r.json();
      const list = d.notifs || [];
      if (list.length) {
        title = list[0].client_name || title;
        body = list[0].text + (list.length > 1 ? ' (и ещё ' + (list.length - 1) + ')' : '');
      }
      if (self.navigator && navigator.setAppBadge) navigator.setAppBadge(list.length || 1).catch(() => {});
    } catch (err) {}
    await self.registration.showNotification(title, {
      body, icon: './icon-192.png', badge: './icon-192.png', tag: 'kf-new', renotify: true
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    if (list.length) return list[0].focus();
    return self.clients.openWindow('./');
  }));
});
