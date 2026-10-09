// Screener service worker. App shell: instant open, works offline. Data: network first, last copy when offline.
const CACHE = 'screener-v2';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'config.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Sheet API etc. go straight to network
  // Network first for everything (fresh code and data), cache copy as the offline fallback. 'no-cache' makes the browser
  // revalidate with the server instead of using its 10-minute HTTP cache, so a new page never runs with an old app.js.
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request.url.split('?')[0], copy)); }
    return res;
  }).catch(() => caches.match(e.request.url.split('?')[0], { ignoreSearch: true })));
});
