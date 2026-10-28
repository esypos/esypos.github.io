/* Old POS Service Worker (v12.0.0)
   - Cache-first app shell, versioned per release, so the app opens instantly with or without a network.
   - Atomic install: if any CRITICAL file cannot be cached, the install fails and the previous working version keeps running.
   - Self-repair: the page can ask the worker to re-download any missing shell file (message 'REPAIR').
   - Security headers: every page served by this worker carries frame-ancestors 'none', nosniff, a strict referrer policy
     and a Permissions-Policy that only allows the camera (barcode scan) and Bluetooth (printer) for this app.
   App data lives in localStorage + the user's Google Drive; this cache only holds the app files. */
const CACHE_VERSION = 'v12.0.0';
const APP_CACHE = `oldpos-app-${CACHE_VERSION}`;

const CRITICAL = [
  './', './index.html', './offline.html', './manifest.webmanifest',
  './css/style.css', './css/appshell.css', './css/landing.css', './css/icons.css',
  './fonts/inter-latin-var.woff2', './fonts/fa-solid-subset.woff2', './fonts/fa-brands-subset.woff2',
  './js/core/core.js', './js/core/barcode.js', './js/core/wedge.js', './js/core/linear.js', './js/core/ui.js', './js/core/config.js',
  './js/modules/app.js', './js/modules/people.js', './js/modules/misc.js', './js/modules/home.js', './js/modules/settings.js',
  './js/services/cloud.js', './js/services/guard.js', './js/services/labelprinter.js', './js/services/pwa.js', './js/services/security.js', './js/services/appshell.js', './js/services/community.js',
  './assets/icons/icon-192.png', './assets/icons/telegram.svg', './assets/icons/icon-512.png', './assets/icons/maskable-512.png', './assets/icons/apple-touch-icon.png'
];
const OPTIONAL = [
  './features.html', './privacy.html', './terms.html', './license.html', './404.html', './favicon.ico',
  './assets/icons/favicon-32.png', './assets/icons/favicon-16.png',
  './assets/screenshots/02-dashboard.png', './assets/screenshots/03-products.png', './assets/screenshots/04-customers.png', './assets/screenshots/05-purchases.png', './assets/screenshots/07-sales-history.png', './assets/screenshots/08-reports.png'
];
const APP_SHELL = CRITICAL.concat(OPTIONAL);

const SEC_HEADERS = {
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), bluetooth=(self), geolocation=(), microphone=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'   // keeps Google sign-in popups working
};

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    // addAll is atomic: one failure rejects, the install fails, and the old version stays active.
    await cache.addAll(CRITICAL.map(u => new Request(u, { cache: 'reload' })));
    await Promise.all(OPTIONAL.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => null)));
    self.skipWaiting();
  })());
});

async function dropOldCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => (k.startsWith('esypos-') || k.startsWith('oldpos-') || k.startsWith('propos-')) && k !== APP_CACHE).map(k => caches.delete(k)));
}

self.addEventListener('activate', event => {
  event.waitUntil((async () => { await dropOldCaches(); await self.clients.claim(); })());
});

async function repair() {
  const cache = await caches.open(APP_CACHE);
  const missing = [];
  for (const u of APP_SHELL) { if (!(await cache.match(u, { ignoreSearch: true }))) missing.push(u); }
  await Promise.all(missing.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => null)));
  return missing.length;
}

self.addEventListener('message', event => {
  const d = event.data, port = event.ports && event.ports[0];
  if (d === 'SKIP_WAITING') { self.skipWaiting(); return; }
  if (d === 'GET_VERSION') { if (port) port.postMessage({ version: CACHE_VERSION }); return; }
  if (d === 'CLEAR_CACHES') {
    event.waitUntil((async () => {
      await dropOldCaches();
      const cache = await caches.open(APP_CACHE);
      await Promise.all(APP_SHELL.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => null)));
      if (port) port.postMessage({ ok: true });
    })());
    return;
  }
  if (d === 'REPAIR') {
    event.waitUntil((async () => { const n = await repair().catch(() => -1); if (port) port.postMessage({ repaired: n }); })());
  }
});

const isAppRoute = url => /\/(index\.html)?$/.test(url.pathname);

// Re-wrap a page response with the security headers above (body is streamed through untouched).
function secure(res) {
  try {
    if (!res || res.type === 'opaque' || res.type === 'opaqueredirect' || !res.body) return res;
    const h = new Headers(res.headers);
    Object.keys(SEC_HEADERS).forEach(k => h.set(k, SEC_HEADERS[k]));
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  } catch (_) { return res; }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // Google sign-in / Drive calls always go straight to the network

  // Pages: serve the cached copy immediately; fall back to the network, then to the app shell / offline page.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      const hit = await cache.match(req, { ignoreSearch: true }) || (isAppRoute(url) ? await cache.match('./index.html') : null);
      if (hit) return secure(hit);
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
        if (res && res.status === 404) { const nf = await cache.match('./404.html'); if (nf) return secure(new Response(nf.body, { status: 404, statusText: 'Not Found', headers: nf.headers })); }
        return secure(res);
      } catch (_) {
        return secure((await cache.match('./offline.html')) || (await cache.match('./index.html')) || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }));
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
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (_) {
      return new Response('', { status: 503, statusText: 'Offline' });   // never answer a script/style request with a page
    }
  })());
});
