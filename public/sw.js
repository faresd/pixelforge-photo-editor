/* PixelForge's service worker keeps the static editor shell available after a successful online visit. */
const CACHE_NAME = 'pixelforge-shell-v2';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/pixel-logo.svg', '/icons/pixelforge-192.png', '/icons/pixelforge-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('pixelforge-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Health reads must reach the network; cache busting queries must not grow the shell cache.
  const path = new URL(request.url).pathname;
  if (path === '/release.json' || path === '/api/readyz.json') return;

  if (request.mode === 'navigate') {
    // Always check the network first so a deploy can replace a cached HTML shell.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Hashed Vite assets are immutable; cache the first successful response and reuse it offline.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
