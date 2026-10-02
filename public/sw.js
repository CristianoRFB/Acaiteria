const STATIC_CACHE_PREFIX = 'acai-mais-sabor-static-';
const STATIC_CACHE_NAME = `${STATIC_CACHE_PREFIX}v1`;
const OFFLINE_PAGE = '/offline.html';
const IMMUTABLE_ASSET_PATH = /^\/_next\/static\/.+\.(?:js|css|woff2?|png|svg|webp|jpe?g|avif)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => cache.add(OFFLINE_PAGE)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names
        .filter((name) => name.startsWith(STATIC_CACHE_PREFIX) && name !== STATIC_CACHE_NAME)
        .map((name) => caches.delete(name)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE_PAGE)) || new Response(
        'Sem conexão. Conecte-se à internet e tente novamente.',
        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
      )),
    );
    return;
  }

  if (!IMMUTABLE_ASSET_PATH.test(url.pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
