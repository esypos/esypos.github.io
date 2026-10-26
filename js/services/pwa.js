/* PWA (v11.3): versioned offline cache, safe updates (never interrupts a sale), install prompt (Android/desktop + iPhone guide),
   offline/online badge, self-repair of the offline cache, persistent storage, and a small window.PWA API. */
(function () {
  'use strict';
  const CACHE_VERSION = 'v11.9.1';   // MUST equal sw.js — if they differ, clearOldCaches() deletes the live offline cache
  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) {} }
  };
  const isStandalone = () => { try { return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: minimal-ui)').matches || window.navigator.standalone === true; } catch (_) { return false; } };
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const swMsg = (target, msg, ms) => new Promise(res => {
    try {
      const ch = new MessageChannel(); const t = setTimeout(() => res(null), ms || 4000);
      ch.port1.onmessage = e => { clearTimeout(t); res(e.data); };
      target.postMessage(msg, [ch.port2]);
    } catch (_) { res(null); }
  });
  let REG = null;

  // Delete caches from OLDER versions only — the current offline cache must survive.
  async function clearOldCaches() {
    if (!('caches' in window)) return;
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => (k.startsWith('esypos-') || k.startsWith('oldpos-') || k.startsWith('propos-')) && !k.endsWith('-' + CACHE_VERSION)).map(k => caches.delete(k)));
    } catch (_) {}
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        await clearOldCaches();
        const hadController = !!navigator.serviceWorker.controller;
        const reg = REG = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
        try { await reg.update(); } catch (_) {}
        if (reg.waiting && hadController) showUpdateBar(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBar(nw);
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
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { try { reg.update(); } catch (_) {} } });

        // Self-repair: once the worker controls the page, make sure every app file is really in the offline cache.
        const ready = await navigator.serviceWorker.ready;
        setTimeout(() => { const w = navigator.serviceWorker.controller || ready.active; if (w) swMsg(w, 'REPAIR', 20000); }, 4000);
      } catch (err) {
        console.warn('Service Worker registration failed:', err);
      }
    });
  }

  /* ---- Install prompt (Chrome / Edge / Android / desktop) ---- */
  let deferredPrompt = null;
  const dismissedRecently = () => (Date.now() - (parseInt(LS.get('esypos_pwa_dismiss') || '0', 10) || 0)) < 7 * 864e5;
  function makeInstallBtn() {
    let b = document.getElementById('pwa-install-btn');
    if (b) return b;
    b = document.createElement('button');
    b.id = 'pwa-install-btn'; b.type = 'button'; b.className = 'pwa-install-btn';
    b.setAttribute('aria-label', 'Install Old POS app');
    b.innerHTML = '<i class="fa-solid fa-download"></i> Install app';
    b.style.display = 'none';
    document.body.appendChild(b);
    return b;
  }
  async function install() {
    if (!deferredPrompt) { if (isIOS() && !isStandalone()) iosGuide(true); return false; }
    const p = deferredPrompt; deferredPrompt = null;
    const btn = document.getElementById('pwa-install-btn'); if (btn) btn.style.display = 'none';
    try { p.prompt(); const r = await p.userChoice; if (!r || r.outcome !== 'accepted') LS.set('esypos_pwa_dismiss', Date.now()); return !!(r && r.outcome === 'accepted'); } catch (_) { return false; }
  }
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferredPrompt = e;
    if (isStandalone() || dismissedRecently()) return;
    const btn = makeInstallBtn(); btn.style.display = 'flex'; btn.onclick = install;
  });
  window.addEventListener('appinstalled', () => {
    const btn = document.getElementById('pwa-install-btn'); if (btn) btn.remove();
    deferredPrompt = null; LS.set('esypos_pwa_installed', '1');
    try { if (window.Core && Core.toast) Core.toast('Old POS installed ✓'); } catch (_) {}
  });

  /* ---- iPhone / iPad: Safari has no install event, so show a one-time guide ---- */
  function iosGuide(force) {
    if (document.getElementById('pwa-ios-guide')) return;
    if (!force && (LS.get('esypos_ios_guide') === '1' || isStandalone() || dismissedRecently())) return;
    const g = document.createElement('div');
    g.id = 'pwa-ios-guide'; g.className = 'pwa-update-bar'; g.setAttribute('role', 'dialog');
    g.innerHTML = '<div class="msg">Install Old POS<small>Tap <b>Share</b> <span aria-hidden="true">⬆️</span> then <b>Add to Home Screen</b></small></div><button type="button">OK</button>';
    g.querySelector('button').onclick = () => { LS.set('esypos_ios_guide', '1'); g.remove(); };
    document.body.appendChild(g);
  }
  window.addEventListener('load', () => { if (isIOS() && !isStandalone()) setTimeout(() => iosGuide(false), 6000); });

  /* ---- Update bar ---- */
  function showUpdateBar(worker) {
    if (document.getElementById('pwa-update-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'pwa-update-bar'; bar.className = 'pwa-update-bar'; bar.setAttribute('role', 'status');
    bar.innerHTML = '<div class="msg">New version available<small>Tap update to load the latest app</small></div><button type="button">Update</button>';
    bar.querySelector('button').onclick = () => {
      try { if (worker && worker.postMessage) worker.postMessage('SKIP_WAITING'); } catch (_) {}
      clearOldCaches().finally(() => setTimeout(() => location.reload(), 400));
    };
    document.body.appendChild(bar);
  }

  /* ---- Storage: ask the browser never to evict shop data ---- */
  async function persist() {
    try { if (navigator.storage && navigator.storage.persist) { if (await navigator.storage.persisted()) return true; return await navigator.storage.persist(); } } catch (_) {}
    return false;
  }
  persist();
  window.addEventListener('load', () => setTimeout(persist, 8000));      // some browsers only grant it after engagement

  /* ---- Offline / online badge ---- */
  let wasOffline = !navigator.onLine;
  function updateNet() {
    let b = document.getElementById('net-badge');
    if (navigator.onLine) {
      if (b) b.remove();
      if (wasOffline) { wasOffline = false; try { if (window.Core && Core.toast) Core.toast('Back online ✓'); } catch (_) {} }
      return;
    }
    wasOffline = true;
    if (!b) {
      b = document.createElement('div');
      b.id = 'net-badge'; b.setAttribute('role', 'status'); b.textContent = '● Offline mode — everything still works';
      document.body.appendChild(b);
    }
  }
  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);
  document.addEventListener('DOMContentLoaded', updateNet);

  /* ---- Display-mode class (CSS can style the installed app) ---- */
  function mark() { document.documentElement.classList.toggle('pwa-standalone', isStandalone()); }
  mark();
  try { window.matchMedia('(display-mode: standalone)').addEventListener('change', mark); } catch (_) {}

  /* ---- Small public API (used from Settings / console for support) ---- */
  window.PWA = {
    version: CACHE_VERSION,
    isInstalled: isStandalone,
    canInstall: () => !!deferredPrompt || (isIOS() && !isStandalone()),
    install,
    persisted: async () => { try { return !!(navigator.storage && await navigator.storage.persisted()); } catch (_) { return false; } },
    estimate: async () => { try { return navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch (_) { return null; } },
    checkUpdate: async () => { try { if (REG) { await REG.update(); return true; } } catch (_) {} return false; },
    repair: async () => { try { const w = navigator.serviceWorker.controller; return w ? await swMsg(w, 'REPAIR', 20000) : null; } catch (_) { return null; } },
    reset: async () => {   // support tool: rebuild the offline cache from scratch (shop data is untouched)
      try { const w = navigator.serviceWorker.controller; if (w) await swMsg(w, 'CLEAR_CACHES', 30000); location.reload(); } catch (_) {}
    }
  };
})();
