// Only a static offline page is cached. Never cache health data or API responses.
const CACHE = 'stillform-static-v1';
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add('/offline.html')),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith('stillform-static-') && key !== CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate')
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/offline.html')),
    );
});
