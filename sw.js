/* EsyPOS Service Worker (v10.7) - cache-first app shell, so the app opens instantly even on a slow or missing network.
   Every release ships a new cache (CACHE_VERSION), so users always get a complete, consistent set of files.
   App data lives in localStorage + the user's Google Drive; this cache only holds the app files. */
const CACHE_VERSION = 'v10.7.1';
const APP_CACHE = `esypos-app-${CACHE_VERSION}`;

const APP_SHELL = [
  './', './index.html', './features.html', './privacy.html', './terms.html', './license.html', './404.html',
  './manifest.webmanifest', './favicon.ico',
  './css/style.css', './css/icons.css',
  './fonts/inter-latin-var.woff2', './fonts/fa-solid-subset.woff2', './fonts/fa-brands-subset.woff2',
  './js/core/core.js', './js/core/barcode.js', './js/core/ui.js', './js/core/config.js',
  './js/modules/app.js', './js/modules/people.js', './js/modules/misc.js', './js/modules/settings.js',
  './js/services/cloud.js', './js/services/pwa.js',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png', './assets/icons/maskable-512.png', './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon-32.png', './assets/icons/favicon-16.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_CACHE).then(cache =>
      Promise.all(APP_SHELL.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => null)))
    )
  );
});

async function dropOldCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => (k.startsWith('esypos-') || k.startsWith('propos-')) && k !== APP_CACHE).map(k => caches.delete(k)));
}

self.addEventListener('activate', event => {
  event.waitUntil((async () => { await dropOldCaches(); await self.clients.claim(); })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') { self.skipWaiting(); return; }
  if (event.data === 'CLEAR_CACHES') {
    event.waitUntil((async () => {
      await dropOldCaches();
      const cache = await caches.open(APP_CACHE);
      await Promise.all(APP_SHELL.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => null)));
    })());
  }
});

const isAppRoute = url => /\/(index\.html)?$/.test(url.pathname);

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // Google sign-in / Drive calls always go straight to the network

  // Pages: serve the cached copy immediately; fall back to the network, then to the app shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      const hit = await cache.match(req, { ignoreSearch: true }) || (isAppRoute(url) ? await cache.match('./index.html') : null);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch (_) {
        return (await cache.match('./index.html')) || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // Scripts, styles, fonts, images: cache-first (the cache is versioned per release).
  event.respondWith((async () => {
    const cache = await caches.open(APP_CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (_) {
      return new Response('', { status: 503, statusText: 'Offline' });   // never answer a script/style request with a page
    }
  })());
});
