/* EsyPOS Service Worker — network-first with offline fallback (v10.3)
   App data lives in localStorage + Google Drive. The SW cache only keeps the app shell
   (and icon/font CDN files) so the shop still opens offline; it is replaced on every deploy. */
const CACHE_VERSION = 'v10.3';
const APP_CACHE = `esypos-app-${CACHE_VERSION}`;
const CDN_CACHE = `esypos-cdn-${CACHE_VERSION}`;

const APP_SHELL = [
  './', './index.html', './privacy.html', './terms.html', './manifest.webmanifest', './favicon.ico', './css/style.css',
  './js/core/core.js', './js/core/ui.js', './js/core/config.js',
  './js/modules/app.js', './js/modules/people.js', './js/modules/misc.js', './js/modules/settings.js',
  './js/services/cloud.js', './js/services/pwa.js',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png', './assets/icons/maskable-512.png', './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon-32.png', './assets/icons/favicon-16.png'
];
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  // Take over immediately so users never stay on a broken old SW
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_CACHE).then(cache =>
      Promise.all(APP_SHELL.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => null)))
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Delete every old esypos cache — keep only current version
    await Promise.all(
      keys
        .filter(k => (k.startsWith('esypos-') || k.startsWith('propos-')) && k !== APP_CACHE && k !== CDN_CACHE)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const data = event.data;
  if (data === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data === 'CLEAR_CACHES') {
    // Drop caches of older versions and refresh the current app shell (CDN cache is kept for offline icons/fonts)
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => (k.startsWith('esypos-') || k.startsWith('propos-')) && k !== APP_CACHE && k !== CDN_CACHE).map(k => caches.delete(k)));
      const cache = await caches.open(APP_CACHE);
      await Promise.all(APP_SHELL.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => null)));
    })());
  }
});

/** Network-first: always try network, fall back to cache only if offline */
function networkFirst(request, cacheName) {
  return fetch(request)
    .then(res => {
      // Cache OK responses and opaque (no-cors) ones — icon/font CSS from the CDN is requested without CORS
      if (res && (res.ok || res.type === 'opaque') && request.method === 'GET') {
        const copy = res.clone();
        caches.open(cacheName).then(c => c.put(request, copy)).catch(() => {});
      }
      return res;
    })
    .catch(() => caches.open(cacheName)
      .then(c => c.match(request, { ignoreSearch: true }))
      // Never answer a script/style request with index.html — return a clean offline error instead
      .then(r => r || new Response('', { status: 503, statusText: 'Offline' })));
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Navigations: network-first
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(APP_CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })))
    );
    return;
  }

  // Same-origin app assets (JS/CSS/HTML/icons): network-first so updates are never stuck
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req, APP_CACHE));
    return;
  }

  // CDN: network-first with cache fallback
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(networkFirst(req, CDN_CACHE));
  }
});
