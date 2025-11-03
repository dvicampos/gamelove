// service-worker.js
(() => {
  // Lee la versión desde la query string: /service-worker.js?v=YYYYMMDDHHmm
  const VERSION = new URL(self.location).searchParams.get('v') || 'dev';
  const STATIC_CACHE  = `bubugame-static-${VERSION}`;
  const RUNTIME_CACHE = `bubugame-runtime-${VERSION}`;

  // Precarga solo lo esencial y en SU versión (con ?v=)
  const PRECACHE_ASSETS = [
    `/manifest.json?v=${VERSION}`,
    `/static/style.css?v=${VERSION}`,
    `/static/game.js?v=${VERSION}`,
    `/static/icons/icon-192.png?v=${VERSION}`,
    `/static/icons/icon-512.png?v=${VERSION}`,
  ];

  self.addEventListener('install', (event) => {
    self.skipWaiting(); // pasa directo a waiting
    event.waitUntil(
      caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_ASSETS))
    );
  });

  self.addEventListener('activate', (event) => {
    clients.claim(); // toma control sin recargar
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
            .map((k) => caches.delete(k))
        )
      )
    );
  });

  // Permite que la app le diga "aplíquese ya"
  self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
      self.skipWaiting();
    }
  });

  self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // ignora otros orígenes
    if (url.origin !== self.location.origin) return;

    // Navegaciones/HTML → network-first (para ver cambios al instante)
    if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
      event.respondWith((async () => {
        try {
          return await fetch(req, { cache: 'no-store' });
        } catch {
          // fallback a lo que haya en caché
          return (await caches.match(req)) || (await caches.match('/'));
        }
      })());
      return;
    }

    // Estáticos (css/js/img) → stale-while-revalidate
    if (
      url.pathname.startsWith('/static/') ||
      /\.(css|js|png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(url.pathname)
    ) {
      event.respondWith((async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(req);
        const fetching = fetch(req).then((res) => {
          if (res && res.status === 200 && req.method === 'GET') {
            cache.put(req, res.clone());
          }
          return res;
        }).catch(() => null);
        return cached || fetching || new Response('', { status: 503 });
      })());
      return;
    }

    // default → network-first
    event.respondWith(fetch(req).catch(() => caches.match(req)));
  });
})();
