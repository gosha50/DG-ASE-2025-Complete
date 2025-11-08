const CACHE = 'df2025-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './style.css',
  './diastolic-bulk-paste-2025-anywhere.js'
];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request).then(net => {
      const copy = net.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return net;
    }).catch(() => caches.match('./index.html')))
  );
});