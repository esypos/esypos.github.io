/* Old POS Safety (v12.0.0)
   1) Device identity   – one device = one user. The id is derived from the device itself (not from a random value kept in
                           browser storage), so signing out, clearing site data or re-installing the app on the same
                           device does NOT create a "new user".
   2) Stay signed in    – the Google sign-in marker is mirrored (cookie + IndexedDB). If the browser ever drops local storage the
                           session and your cloud data come back automatically. Only the Log out button ends a session.
   3) Persistent storage – asks the browser not to evict Old POS data under storage pressure.
   4) Local safety copies – rolling copies of your data inside this device (IndexedDB), restorable without internet.
   Nothing here sends personal or shop data anywhere. */
(function () {
  'use strict';

  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) {} },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} }
  };

  /* ---------- tiny IndexedDB key/value helper ---------- */
  const IDB = (function () {
    let dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((res, rej) => {
        try {
          const r = indexedDB.open('oldpos-safety', 1);
          r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv'); if (!d.objectStoreNames.contains('copies')) d.createObjectStore('copies', { keyPath: 't' }); };
          r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        } catch (e) { rej(e); }
      });
      dbp.catch(() => { dbp = null; });
      return dbp;
    }
    const tx = (store, mode, fn) => open().then(d => new Promise((res, rej) => {
      const t = d.transaction(store, mode), s = t.objectStore(store); let out;
      try { out = fn(s); } catch (e) { return rej(e); }
      t.oncomplete = () => res(out && 'result' in out ? out.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    }));
    return {
      get: k => tx('kv', 'readonly', s => s.get(k)).catch(() => undefined),
      set: (k, v) => tx('kv', 'readwrite', s => s.put(v, k)).catch(() => {}),
      del: k => tx('kv', 'readwrite', s => s.delete(k)).catch(() => {}),
      copies: () => tx('copies', 'readonly', s => s.getAll()).then(a => a || []).catch(() => []),
      putCopy: c => tx('copies', 'readwrite', s => s.put(c)).catch(() => {}),
      delCopy: t => tx('copies', 'readwrite', s => s.delete(t)).catch(() => {})
    };
  })();

  /* ---------- cookie helper (synchronous mirror for the sign-in marker) ---------- */
  const CK = {
    get(n) { const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; },
    set(n, v, days) { try { document.cookie = n + '=' + encodeURIComponent(v) + '; max-age=' + Math.round((days || 400) * 86400) + '; path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : ''); } catch (_) {} },
    del(n) { try { document.cookie = n + '=; max-age=0; path=/; SameSite=Lax'; } catch (_) {} }
  };

  /* =====================================================================
     1) DEVICE IDENTITY
     ===================================================================== */
  function sha256hex(str) {
    if (window.crypto && crypto.subtle) return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(b => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''));
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;                     // non-crypto fallback (very old browsers)
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return Promise.resolve(((h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')).repeat(3).slice(0, 64));
  }
  function osName() {
    const u = navigator.userAgent || '', d = navigator.userAgentData;
    if (d && d.platform) return d.platform;
    if (/Android/i.test(u)) return 'Android'; if (/iPhone|iPad|iPod/i.test(u)) return 'iOS'; if (/Windows/i.test(u)) return 'Windows';
    if (/Mac OS X/i.test(u)) return 'macOS'; if (/CrOS/i.test(u)) return 'ChromeOS'; if (/Linux/i.test(u)) return 'Linux'; return 'Other';
  }
  function gpu() {
    try {
      const c = document.createElement('canvas'), g = c.getContext('webgl') || c.getContext('experimental-webgl'); if (!g) return '';
      const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? String(g.getParameter(e.UNMASKED_VENDOR_WEBGL) || '') + '|' + String(g.getParameter(e.UNMASKED_RENDERER_WEBGL) || '') : '';
    } catch (_) { return ''; }
  }
  /* Traits that stay the same when you sign out, clear data, switch browser or install the PWA on the SAME device */
  function traits() {
    const s = window.screen || {};
    const big = Math.max(s.width || 0, s.height || 0), small = Math.min(s.width || 0, s.height || 0);   // rotation-proof
    return ['oldpos-device-v1', osName(), navigator.hardwareConcurrency || 0, navigator.deviceMemory || 0, big, small, Math.round((window.devicePixelRatio || 1) * 100),
      s.colorDepth || 0, navigator.maxTouchPoints || 0, gpu()].join('~');
  }
  let devP = null;
  function deviceId() {
    if (devP) return devP;
    devP = (async () => {
      const cached = LS.get('oldpos_dev') || CK.get('oldpos_dev') || await IDB.get('dev');
      const ok = v => typeof v === 'string' && /^[a-f0-9]{32}$/.test(v);
      let id = ok(cached) ? cached : null;
      if (!id) id = (await sha256hex(traits())).slice(0, 32);
      LS.set('oldpos_dev', id); CK.set('oldpos_dev', id, 3650); IDB.set('dev', id);   // keep in three places
      return id;
    })();
    return devP;
  }

  /* =====================================================================
     2) STAY SIGNED IN (mirror of the Google sign-in marker)
     ===================================================================== */
  const SESSION_KEYS = ['esypos_g_on', 'esypos_g_email', 'esypos_g_name', 'esypos_g_pic', 'esypos_g_fid', 'esypos_g_rev', 'esypos_g_client'];
  const SK = 'oldpos_sess';
  function mirrorOut() {
    if (LS.get('esypos_g_on') !== '1') return;
    const o = {}; SESSION_KEYS.forEach(k => { const v = LS.get(k); if (v) o[k] = v; });
    const s = JSON.stringify(o), lite = {}; ['esypos_g_on', 'esypos_g_email', 'esypos_g_fid', 'esypos_g_rev', 'esypos_g_client'].forEach(k => { if (o[k]) lite[k] = o[k]; });   // the cookie keeps only what is needed (no name / photo)
    const c = JSON.stringify(lite); if (c.length < 3500) CK.set(SK, c, 400);
    IDB.set('sess', s);
  }
  function restoreSync() {                                                // runs before cloud.js reads its keys
    if (LS.get('esypos_g_on') === '1') return false;
    if (LS.get('oldpos_signed_out') === '1') return false;                // the user pressed Log out on purpose
    const s = CK.get(SK); if (!s) return false;
    try {
      const o = JSON.parse(s); if (!o || o.esypos_g_on !== '1') return false;
      SESSION_KEYS.forEach(k => { if (o[k]) LS.set(k, o[k]); });
      document.documentElement.classList.remove('needs-login');
      return true;
    } catch (_) { return false; }
  }
  async function restoreAsync() {
    if (LS.get('esypos_g_on') === '1' || LS.get('oldpos_signed_out') === '1') return;
    const s = await IDB.get('sess'); if (!s) return;
    try {
      const o = JSON.parse(s); if (!o || o.esypos_g_on !== '1') return;
      SESSION_KEYS.forEach(k => { if (o[k]) LS.set(k, o[k]); });
      location.reload();
    } catch (_) {}
  }
  /* Called by Cloud when the user presses Log out: the only thing that ends a session */
  function endSession() { CK.del(SK); IDB.del('sess'); LS.set('oldpos_signed_out', '1'); }
  function startSession() { LS.del('oldpos_signed_out'); mirrorOut(); }

  const restored = restoreSync();

  /* =====================================================================
     3) PERSISTENT STORAGE
     ===================================================================== */
  async function persist() {
    try {
      if (!navigator.storage || !navigator.storage.persist) return false;
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch (_) { return false; }
  }

  /* =====================================================================
     4) LOCAL SAFETY COPIES (rolling, inside this device)
     ===================================================================== */
  const KEEP = 10, EVERY = 3 * 60 * 1000;
  let lastHash = LS.get('oldpos_copy_h') || '';
  function snapshotData() {
    const C = window.Core; if (!C || !C.DB) return null;
    const out = { app: 'Old POS', version: 4, exportDate: new Date().toISOString() };
    Object.keys(C.DB).forEach(k => { if (k !== 'cart') out[k] = C.DB[k]; });
    return out;
  }
  function quickHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16) + ':' + s.length; }
  async function saveCopy(force) {
    try {
      const d = snapshotData(); if (!d) return false;
      const n = (d.products || []).length + (d.sales || []).length + (d.customers || []).length + (d.expenses || []).length;
      if (!n && !force) return false;                                     // never store an empty shop over useful copies
      const txt = JSON.stringify(d), h = quickHash(txt);
      if (!force && h === lastHash) return false;
      await IDB.putCopy({ t: Date.now(), n, h, data: txt });
      lastHash = h; LS.set('oldpos_copy_h', h); LS.set('oldpos_copy_t', Date.now());
      const all = (await IDB.copies()).sort((a, b) => b.t - a.t);
      for (const c of all.slice(KEEP)) await IDB.delCopy(c.t);
      return true;
    } catch (_) { return false; }
  }
  async function listCopies() { return (await IDB.copies()).sort((a, b) => b.t - a.t).map(c => ({ t: c.t, n: c.n, bytes: (c.data || '').length })); }
  async function restoreCopy(t) {
    const c = (await IDB.copies()).find(x => x.t === t); if (!c) throw new Error('Copy not found');
    const d = JSON.parse(c.data); if (!d || !Array.isArray(d.products)) throw new Error('Copy damaged');
    await saveCopy(true);                                                  // keep the current state too before replacing it
    const C = window.Core, DB = C.DB;
    Object.keys(C.K).forEach(k => {
      if (k === 'settings') { const keep = { pinHash: DB.settings.pinHash || '', pinSalt: DB.settings.pinSalt || '', adminHash: DB.settings.adminHash || '', adminSalt: DB.settings.adminSalt || '' }; DB.settings = Object.assign({}, C.DEFAULTS, d.settings || {}, keep); }   // a copy can never change the PINs
      else if (k === 'cart') DB.cart = [];
      else DB[k] = Array.isArray(d[k]) ? d[k].filter(x => x && typeof x === 'object') : [];
    });
    C.migrate(); C.saveAll();
    return true;
  }
  async function downloadCopy(t) {
    const c = (await IDB.copies()).find(x => x.t === t); if (!c) return;
    let txt = c.data;
    try { const d = JSON.parse(c.data); d.settings = Object.assign({}, d.settings, { pinHash: '', pinSalt: '', adminHash: '', adminSalt: '' }); txt = JSON.stringify(d); } catch (_) {}   // a downloaded file never carries PIN hashes
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
    a.download = 'OldPOS-local-copy-' + new Date(c.t).toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json'; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function start() {
    deviceId(); persist(); mirrorOut(); if (!restored) restoreAsync();
    setTimeout(() => saveCopy(false), 20000);
    setInterval(() => { if (document.visibilityState === 'visible') saveCopy(false); }, EVERY);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { saveCopy(false); mirrorOut(); } });
    window.addEventListener('pagehide', () => { mirrorOut(); });
    window.addEventListener('storage', e => { if (e.key === 'esypos_g_on' && e.newValue === '1') mirrorOut(); });
    setInterval(mirrorOut, 60 * 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0)); else setTimeout(start, 0);

  window.Safety = { deviceId, persist, saveCopy, listCopies, restoreCopy, downloadCopy, endSession, startSession, mirror: mirrorOut, IDB, LS, CK };
})();
