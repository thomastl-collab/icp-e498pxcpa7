/* Service worker : met l'appli en cache pour un fonctionnement hors ligne.
   Pense à changer CACHE à chaque nouvelle version pour forcer la mise à jour. */
const CACHE = 'icp-v1.2.0';
const FILES = [
  './', './index.html', './style.css', './app.js', './manifest.webmanifest',
  './vendor/jspdf.umd.min.js', './vendor/jspdf.plugin.autotable.min.js',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  ...['attention', '30s', 'c1', 'c2', 'c3', 'c4', 'c5', ...Array.from({ length: 30 }, (_, i) => 'p' + (i + 1))].map(k => `./audio/${k}.mp3`),
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Réseau d'abord (pour recevoir les mises à jour), cache si hors ligne.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
