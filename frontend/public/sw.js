const RELEASE_VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE_PREFIX = 'find-my-ride-';
const CACHE_NAME = `${CACHE_PREFIX}${RELEASE_VERSION}`;
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.svg', '/icon-512.svg'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === 'basic') {
      void cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }

    if (request.mode === 'navigate') {
      const shellFallback = await cache.match('/index.html');
      if (shellFallback) {
        return shellFallback;
      }
    }

    throw new Error('Network unavailable');
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response && response.status === 200 && response.type === 'basic') {
    const responseClone = response.clone();
    void caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') {
    return;
  }
  if (url.origin !== self.location.origin) {
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});
