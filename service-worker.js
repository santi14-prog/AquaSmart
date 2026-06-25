// AquaSmart Service Worker - PWA Caching + Offline Support
const CACHE = 'aquasmart-v3';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => {
      return cache.addAll([
        '/',
        'index.html',
        'manifest.json',
        'css/style.css',
        'css/splash.css',
        'js/logger.js',
        'js/bluetooth.js',
        'js/serial.js',
        'js/wifi.js',
        'js/demo.js',
        'js/app.js',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/logo.png'
      ]);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/log')) return;
  if (e.request.url.includes('open-meteo.com')) return;
  if (e.request.url.includes('googleapis.com') || e.request.url.includes('gstatic.com')) return;
  if (e.request.url.includes('jsdelivr.net')) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetched = fetch(e.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});

self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'AquaSmart';
  const options = {
    body: data.body || 'Rega concluida',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    vibrate: [100, 50, 100]
  };
  e.waitUntil(self.registration.showNotification(title, options));
});
