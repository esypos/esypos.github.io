/* PWA: versioned offline cache, safe updates (never interrupts a sale), install + offline badge */
(function () {
  'use strict';
  const CACHE_VERSION = 'v10.14.5';   // MUST equal sw.js — if they differ, clearOldCaches() deletes the live offline cache
  // Delete caches from OLDER versions only — the current offline cache must survive.
  async function clearOldCaches() {
    if (!('caches' in window)) return;
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => (k.startsWith('esypos-') || k.startsWith('propos-')) && !k.endsWith('-' + CACHE_VERSION)).map(k => caches.delete(k))
      );
    } catch (_) {}
  }
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        await clearOldCaches();
        const hadController = !!navigator.serviceWorker.controller;
        const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
        try { await reg.update(); } catch (_) {}
        if (reg.waiting && hadController) showUpdateBar(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBar(nw);
            }
          });
        });
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing || !hadController) return;
          // Never reload in the middle of a sale: ask first when the cart has items or a dialog is open.
          const busy = () => { try { return (window.Core && Core.DB.cart.length > 0) || (window.Modal && Modal.stack.length > 0); } catch (_) { return false; } };
          if (busy() && document.visibilityState === 'visible') { showUpdateBar(null); return; }
          refreshing = true;
          clearOldCaches().finally(() => location.reload());
        });
        setInterval(() => { try { reg.update(); } catch (_) {} }, 15 * 60 * 1000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            try { reg.update(); } catch (_) {}
          }
        });
      } catch (err) {
        console.warn('Service Worker registration failed:', err);
      }
    });
  }
  let deferredPrompt = null;
  function makeInstallBtn() {
    let b = document.getElementById('pwa-install-btn');
    if (b) return b;
    b = document.createElement('button');
    b.id = 'pwa-install-btn';
    b.type = 'button';
    b.className = 'pwa-install-btn';
    b.innerHTML = '<i class="fa-solid fa-download"></i> Install app';
    b.style.display = 'none';
    document.body.appendChild(b);
    return b;
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = makeInstallBtn();
    if (!btn) return;
    btn.style.display = 'flex';
    btn.onclick = async () => {
      btn.style.display = 'none';
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (_) {}
      deferredPrompt = null;
    };
  });
  window.addEventListener('appinstalled', () => {
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.remove();
    deferredPrompt = null;
  });
  function showUpdateBar(worker) {
    if (document.getElementById('pwa-update-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'pwa-update-bar';
    bar.className = 'pwa-update-bar';
    bar.innerHTML =
      '<div class="msg">New version available<small>Tap update to load the latest app</small></div>' +
      '<button type="button">Update</button>';
    bar.querySelector('button').onclick = () => {
      try {
        if (worker && worker.postMessage) worker.postMessage('SKIP_WAITING');
      } catch (_) {}
      clearOldCaches().finally(() => setTimeout(() => location.reload(), 400));
    };
    document.body.appendChild(bar);
  }
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
  function updateNet() {
    let b = document.getElementById('net-badge');
    if (navigator.onLine) {
      if (b) b.remove();
      return;
    }
    if (!b) {
      b = document.createElement('div');
      b.id = 'net-badge';
      b.textContent = '● Offline mode';
      document.body.appendChild(b);
    }
  }
  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);
  document.addEventListener('DOMContentLoaded', updateNet);
  try {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      document.documentElement.classList.add('pwa-standalone');
    }
  } catch (_) {}
})();
