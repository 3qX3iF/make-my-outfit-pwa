self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open('outfit-cache-v1').then((cache) => cache.addAll([
      '/', '/index.html', '/style.css', '/app.js', '/manifest.json'
    ]))
  );
});
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin === location.origin) {
    event.respondWith(caches.match(event.request).then((res) => res || fetch(event.request)));
  }
});