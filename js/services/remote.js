/* Old POS Remote control (v12.2.0): lets the owner manage the app from the Vercel admin panel.
   - The app itself is still served from GitHub Pages and works fully offline. This file only talks to the control server
     when `controlUrl` is set in js/core/config.js (empty = feature off, nothing is sent anywhere).
   - What the admin can do: maintenance notice / lock, announcement banner, minimum version (force update), block / unblock a user.
   - Safe by design: if the server is down or offline the app keeps working with the last saved settings; a network error
     NEVER locks anybody. A blocked or locked user can always download a copy of their own data.
   - Privacy: the only thing sent is an anonymous SHA-256 user key (the e-mail itself is never sent), the app version and the day. */
(function () {
  'use strict';
  const LS = { get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} }, del: k => { try { localStorage.removeItem(k); } catch (_) {} } };
  const K = { cfg: 'esypos_rc_cfg', blk: 'esypos_rc_blk', seen: 'esypos_rc_seen', dis: 'esypos_rc_dis', t: 'esypos_rc_t' };
  const cfg = () => window.PROPOS_CONFIG || {};
  const base = () => {
    const u = String(cfg().controlUrl || '').trim().replace(/\/+$/, '');
    return /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(u) ? u : '';       // https origin only
  };
  const verNow = () => String((window.PWA && PWA.version) || '').replace(/^v/i, '');
  const parseV = v => String(v || '').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const lt = (a, b) => { const x = parseV(a), y = parseV(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); } return false; };
  const str = (v, n) => (typeof v === 'string' ? v : '').slice(0, n || 400);
  const safeUrl = u => { try { const x = new URL(String(u || '')); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (_) { return ''; } };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const jparse = (k, d) => { try { const v = JSON.parse(LS.get(k) || 'null'); return v === null ? d : v; } catch (_) { return d; } };

  /* Only trust a well-formed config; every text is cut to a sane length and shown with textContent / escaping. */
  function clean(c) {
    if (!c || typeof c !== 'object') return null;
    const m = c.maintenance || {}, a = c.announcement || {}, u = c.update || {}, k = c.contact || {};
    return {
      rev: Number(c.rev) || 0,
      maintenance: { on: m.on === true, lock: m.lock !== false, title: str(m.title, 120), message: str(m.message, 800) },
      announcement: { on: a.on === true, id: str(a.id, 40) || String(c.rev || 0), level: ['info', 'warn', 'critical'].includes(a.level) ? a.level : 'info',
        title: str(a.title, 120), message: str(a.message, 800), linkText: str(a.linkText, 40), linkUrl: safeUrl(a.linkUrl), dismissible: a.dismissible !== false },
      update: { minVersion: /^\d+(\.\d+){0,2}$/.test(str(u.minVersion, 20)) ? str(u.minVersion, 20) : '', force: u.force !== false, message: str(u.message, 400) },
      contact: { label: str(k.label, 40), url: safeUrl(k.url) }
    };
  }

  /* ---------- UI ---------- */
  let styled = false;
  function style() {
    if (styled) return; styled = true;
    const s = document.createElement('style');
    s.textContent = '.rc-lock{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.92);font-family:inherit}' +
      '.rc-box{width:100%;max-width:420px;background:#fff;color:#0f172a;border-radius:16px;padding:24px 22px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4)}' +
      'html.dark .rc-box{background:#1e293b;color:#e2e8f0}' +
      '.rc-ico{font-size:34px;line-height:1;margin-bottom:10px}.rc-box h2{margin:0 0 8px;font-size:20px}.rc-box p{margin:0 0 16px;font-size:14.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;opacity:.85}' +
      '.rc-btns{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}.rc-btns button,.rc-btns a{appearance:none;border:1px solid #cbd5e1;background:transparent;color:inherit;border-radius:10px;padding:10px 14px;font:600 14px inherit;cursor:pointer;text-decoration:none;min-height:40px}' +
      '.rc-btns .rc-pri{background:#2563eb;border-color:#2563eb;color:#fff}' +
      '.rc-bar{position:fixed;z-index:99990;top:calc(env(safe-area-inset-top,0px) + 8px);left:8px;right:8px;margin:0 auto;max-width:560px;display:flex;gap:10px;align-items:flex-start;padding:11px 12px;border-radius:12px;background:#eff6ff;color:#1e3a8a;border:1px solid #bfdbfe;box-shadow:0 6px 24px rgba(0,0,0,.18);font-size:13.5px;line-height:1.45}' +
      '.rc-bar.warn{background:#fffbeb;color:#78350f;border-color:#fde68a}.rc-bar.critical{background:#fef2f2;color:#7f1d1d;border-color:#fecaca}' +
      'html.dark .rc-bar{background:#1e293b;color:#e2e8f0;border-color:#334155}' +
      '.rc-bar .rc-t{flex:1;min-width:0;word-break:break-word;white-space:pre-wrap}.rc-bar b{display:block}.rc-bar a{color:inherit;font-weight:700;text-decoration:underline}' +
      '.rc-bar button{appearance:none;border:0;background:transparent;color:inherit;font-size:20px;line-height:1;cursor:pointer;padding:0 4px;min-width:32px;min-height:32px}';
    document.head.appendChild(s);
  }
  const $ = id => document.getElementById(id);
  const drop = id => { const e = $(id); if (e && e.parentNode) e.parentNode.removeChild(e); };

  function lockScreen(icon, title, msg, opts) {
    style(); drop('rc-lock');
    const d = document.createElement('div'); d.id = 'rc-lock'; d.className = 'rc-lock'; d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-modal', 'true');
    const btns = [];
    if (opts.update) btns.push('<button type="button" class="rc-pri" data-a="update">Update now</button>');
    btns.push('<button type="button" data-a="retry">' + (opts.update ? 'Check again' : 'Try again') + '</button>');
    if (opts.contact && opts.contact.url) btns.push('<a href="' + esc(opts.contact.url) + '" target="_blank" rel="noopener noreferrer">' + esc(opts.contact.label || 'Contact') + '</a>');
    if (opts.data) btns.push('<button type="button" data-a="data">Download my data</button>');
    d.innerHTML = '<div class="rc-box"><div class="rc-ico">' + icon + '</div><h2></h2><p></p><div class="rc-btns">' + btns.join('') + '</div></div>';
    d.querySelector('h2').textContent = title; d.querySelector('p').textContent = msg;
    d.addEventListener('click', e => {
      const a = e.target && e.target.getAttribute && e.target.getAttribute('data-a'); if (!a) return;
      if (a === 'retry') { e.target.disabled = true; e.target.textContent = 'Checking…'; Remote.refresh(true).then(() => { const b = e.target; if (b && b.isConnected) { b.disabled = false; b.textContent = 'Try again'; } }); }
      if (a === 'update') { try { if (window.PWA && PWA.reset) PWA.reset(); else location.reload(); } catch (_) { location.reload(); } }
      if (a === 'data') { try { if (window.Safety && Safety.downloadCopy) Safety.downloadCopy(); else if (window.exportData) window.exportData(false, true); } catch (_) {} }
    });
    document.body.appendChild(d);
  }
  function banner(a) {
    style(); drop('rc-bar');
    if (!a || !a.on || (!a.title && !a.message)) return;
    if (a.dismissible && (jparse(K.dis, [])).indexOf(a.id) >= 0) return;
    const d = document.createElement('div'); d.id = 'rc-bar'; d.className = 'rc-bar ' + a.level; d.setAttribute('role', 'status');
    d.innerHTML = '<div class="rc-t">' + (a.title ? '<b></b>' : '') + '<span class="rc-m"></span> ' + (a.linkUrl ? '<a target="_blank" rel="noopener noreferrer"></a>' : '') + '</div>' + (a.dismissible ? '<button type="button" aria-label="Dismiss">×</button>' : '');
    if (a.title) d.querySelector('b').textContent = a.title;
    d.querySelector('.rc-m').textContent = a.message;
    const l = d.querySelector('a'); if (l) { l.href = a.linkUrl; l.textContent = a.linkText || 'Learn more'; }
    const x = d.querySelector('button'); if (x) x.onclick = () => { const l2 = jparse(K.dis, []); l2.push(a.id); LS.set(K.dis, JSON.stringify(l2.slice(-30))); drop('rc-bar'); };
    document.body.appendChild(d);
  }

  /* ---------- apply ---------- */
  function apply() {
    if (!document.body) return;
    const c = jparse(K.cfg, null), blk = jparse(K.blk, null);
    const contact = (c && c.contact) || {};
    if (blk && blk.on) { lockScreen('🔒', 'Access suspended', blk.message || 'This account has been suspended by the administrator.', { contact, data: true }); return; }
    if (c && c.maintenance.on && c.maintenance.lock) { lockScreen('🛠️', c.maintenance.title || 'Under maintenance', c.maintenance.message || 'Old POS is being updated. Please try again in a few minutes.', { contact, data: true }); return; }
    const need = c && c.update.minVersion && verNow() && lt(verNow(), c.update.minVersion);
    if (need && c.update.force) { lockScreen('⬆️', 'Update required', c.update.message || 'A new version of Old POS is required. Your shop data is safe and will not be changed.', { update: true, contact, data: true }); return; }
    drop('rc-lock');
    if (c && c.maintenance.on) banner({ on: true, id: 'm' + c.rev, level: 'warn', title: c.maintenance.title || 'Maintenance', message: c.maintenance.message, dismissible: true });
    else if (need) banner({ on: true, id: 'u' + c.update.minVersion, level: 'warn', title: 'Update available', message: c.update.message || 'Please update Old POS from the menu or reopen the app.', dismissible: true });
    else banner(c && c.announcement);
  }

  /* ---------- talking to the control server ---------- */
  let busy = null;
  async function userKey() {
    try {
      if (!(window.Cloud && Cloud.isOn && Cloud.isOn()) || !window.Users || !window.Safety) return '';
      const k = await Users.userKey(await Safety.deviceId());
      return /^[a-f0-9]{64}$/.test(k) ? k : '';
    } catch (_) { return ''; }
  }
  async function refresh(force) {
    const b = base(); if (!b || !navigator.onLine) return false;
    if (busy) return busy;
    const last = parseInt(LS.get(K.t) || '0', 10) || 0;
    if (!force && Date.now() - last < 10 * 60 * 1000) return false;          // at most once every 10 minutes
    busy = (async () => {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 9000);
      try {
        const u = await userKey();
        const r = await fetch(b + '/api/ping', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ u, v: verNow() }), signal: ctl.signal, cache: 'no-store', credentials: 'omit' });
        if (!r.ok) return false;
        const j = await r.json(); if (!j || j.ok !== true) return false;
        const c = clean(j.config); if (c) LS.set(K.cfg, JSON.stringify(c));
        if (u) { if (j.blocked) LS.set(K.blk, JSON.stringify({ on: true, message: str(j.blockMessage, 400) })); else LS.del(K.blk); }
        LS.set(K.t, String(Date.now()));
        apply(); return true;
      } catch (_) { return false; }            // network / server problem: keep whatever was saved before, never lock because of an error
      finally { clearTimeout(to); busy = null; }
    })();
    return busy;
  }

  const Remote = window.Remote = {
    on: () => !!base(), refresh, apply,
    config: () => jparse(K.cfg, null), blocked: () => !!(jparse(K.blk, null) || {}).on
  };

  function init() {
    if (!base()) return;                                  // not configured → completely inactive
    apply();                                              // show the last known state instantly (also offline)
    setTimeout(() => refresh(true), 1200);
    window.addEventListener('online', () => refresh(false));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(false); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
