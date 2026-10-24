/* EsyPOS Security (v11.1): extra hardening layered on top of Lock + AdminLock.
   - Idle auto-lock: the home-screen PIN screen returns after a period with no touch/key/mouse activity.
   - Admin PIN lock-outs now escalate (30s, 1m, 5m, 15m, 30m) exactly like the home-screen PIN.
   - Clickjacking guard: the app refuses to run inside someone else's frame.
   - Clipboard / drag-drop of foreign HTML into inputs is reduced to plain text.
   - Dangerous link schemes (javascript:, data: pages) are blocked.
   - Self-XSS warning in the browser console.
   Nothing here sends data anywhere; no new permissions are requested. */
(function () {
  'use strict';

  /* 1. Anti-clickjacking (the SW also sends frame-ancestors 'none' once installed) */
  try {
    if (window.top !== window.self) {
      document.documentElement.innerHTML = '';
      window.top.location = window.self.location;
    }
  } catch (_) { document.documentElement.style.display = 'none'; }

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) {} },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} }
  };

  /* 2. Escalating Admin PIN lock-out */
  function patchAdmin() {
    const A = window.AdminLock; if (!A || A.__esc) return;
    const orig = A.check.bind(A), SECS = [30, 60, 300, 900, 1800];
    A.check = async function (pin) {
      const r = await orig(pin);
      if (r === 'ok') { ls.del('esypos_ad_l'); return r; }
      if (r === 'wait') {
        const left = (parseInt(ls.get('esypos_ad_u') || '0', 10) || 0) - Date.now();
        if (left > 29000) {                                  // a brand-new lock-out: escalate it
          const lv = parseInt(ls.get('esypos_ad_l') || '0', 10) || 0;
          ls.set('esypos_ad_l', lv + 1);
          ls.set('esypos_ad_u', Date.now() + SECS[Math.min(4, lv)] * 1000);
          try { if (window.log) window.log('Admin PIN: too many wrong attempts'); } catch (_) {}
        }
      }
      return r;
    };
    A.__esc = true;
  }

  /* 3. Idle auto-lock (home-screen PIN). Minimum 3 minutes so a busy counter is never interrupted. */
  let lastAct = Date.now();
  const bump = () => { lastAct = Date.now(); };
  ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'].forEach(ev => window.addEventListener(ev, bump, { passive: true, capture: true }));
  function idleMs() {
    const m = parseInt((window.Core && Core.DB.settings.autoLockMin), 10) || 1;
    return Math.max(3, m) * 60000;
  }
  setInterval(() => {
    try {
      if (document.visibilityState !== 'visible') return;
      if (!window.Lock || !Lock.has() || Lock.el) return;
      if (Date.now() - lastAct < idleMs()) return;
      if (window.Core && Core.DB.cart && Core.DB.cart.length && Date.now() - lastAct < idleMs() * 2) return;   // a sale in progress gets double time
      Lock.show(() => {}); bump();
    } catch (_) {}
  }, 15000);

  /* 4. Plain-text paste and drops only (no foreign HTML slipping into product names etc.) */
  document.addEventListener('paste', e => {
    const t = e.target; if (!t || !(t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const cd = e.clipboardData; if (!cd) return;
    if (cd.types && Array.prototype.indexOf.call(cd.types, 'text/html') > -1 && t.type !== 'file') {
      const txt = cd.getData('text/plain'); if (txt == null) return;
      e.preventDefault();
      try { document.execCommand('insertText', false, txt); } catch (_) {}
    }
  }, true);
  document.addEventListener('drop', e => {
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && t.type !== 'file') e.preventDefault();
  }, true);

  /* 5. Block dangerous link schemes */
  document.addEventListener('click', e => {
    const a = e.target && e.target.closest && e.target.closest('a[href]'); if (!a) return;
    const h = (a.getAttribute('href') || '').trim().toLowerCase();
    if (/^(javascript|data|vbscript):/.test(h)) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  /* 6. Never leave the current page's data in the history cache after sign-out/lock on bfcache restore */
  window.addEventListener('pageshow', e => {
    if (e.persisted) { try { if (window.Lock && Lock.has() && !Lock.el) Lock.show(() => {}); } catch (_) {} }
  });

  /* 7. Self-XSS warning */
  try {
    console.log('%cStop!', 'color:#dc2626;font-size:34px;font-weight:800');
    console.log('%cThis is a browser feature for developers. If someone told you to paste something here, it can give them access to your shop data.', 'font-size:14px');
  } catch (_) {}

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', patchAdmin); else patchAdmin();
  window.addEventListener('load', patchAdmin);
})();
