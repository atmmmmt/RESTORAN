/* Service worker for the عجينة وطحينة dashboard.
 *
 * Strategy:
 *  • navigations → network first, fall back to the cached app shell so the
 *    SPA still boots with no connection;
 *  • hashed build assets → cache first, they never change under one URL;
 *  • everything else → network, with a cache fallback.
 *
 * API traffic is deliberately NOT handled here — src/services/offline.js owns
 * that, because it needs to distinguish reads from queued writes.
 */

/* Bump on any change to SHELL_URLS — activate() drops caches whose name no
   longer matches, which is what evicts the previous shell. */
const VERSION     = 'v5';
const SHELL_CACHE = `loliz-shell-${VERSION}`;
const ASSET_CACHE = `loliz-assets-${VERSION}`;

/* Customer routes plus the staff entry points. The SPA serves every route
   from index.html, so caching these mainly warms them; what actually makes
   a page work offline is its JS chunk, which the asset rule below stores
   cache-first the first time it is fetched. */
const SHELL_URLS = [
  '/', '/menu', '/index.html', '/logo.png', '/manifest.webmanifest', '/pwa/icon-192.png',
  '/admin/dashboard', '/admin/pos', '/admin/kitchen',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // addAll is all-or-nothing; a single 404 would abort the install.
      .then(cache => Promise.allSettled(SHELL_URLS.map(u => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith('loliz-') && k !== SHELL_CACHE && k !== ASSET_CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

const isAsset = url =>
  /\.(js|css|woff2?|png|jpe?g|svg|webp|ico)$/i.test(url.pathname);

self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept the API or the live punch stream.
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/attendance/stream')) return;
  if (url.origin !== self.location.origin) return;

  /* App shell — network first so deploys land immediately. */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then(c => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then(r => r || caches.match('/')))
    );
    return;
  }

  /* Build assets — cache first. */
  if (isAsset(url)) {
    event.respondWith(
      caches.match(request).then(hit => hit || fetch(request).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(ASSET_CACHE).then(c => c.put(request, copy));
        }
        return res;
      }))
    );
  }
});

/* Let the page trigger an immediate takeover after an update. */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
