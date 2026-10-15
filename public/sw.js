// 공개 오프라인 안내만 캐시합니다. API, 로그인, 메모 응답은 캐시하지 않습니다.
const CACHE = 'byte-back-offline-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add('/offline.html')));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('byte-back-offline-') && key !== CACHE)
      .map((key) => caches.delete(key)),
  )));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .catch(() => caches.match('/offline.html')),
  );
});
