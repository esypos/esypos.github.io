/* EsyPOS Guard (v10.14): section lock for staff + anonymous user counter.
   - Section lock: owner picks which sections need the PIN (Settings -> Section lock). Salesmen stay on the Sales Counter.
   - User counter: each install registers one random anonymous ID (no name, phone, shop data) in YOUR Firebase Realtime
     Database; the app shows how many installs exist. Set userCounterUrl in js/core/config.js (see README). */
(function () {
  'use strict';
  const C = Core, DB = C.DB, esc = C.esc, toast = C.toast;
  const $ = id => document.getElementById(id);
  const ITEMS = [
    ['reports', 'Reports (sales & profit analysis)', 'fa-chart-column'],
    ['profit', 'Dashboard profit (today & monthly, tap lock to view)', 'fa-eye-slash'],
    ['dashboard', 'Dashboard (whole page)', 'fa-gauge-high'],
    ['purchases', 'Purchases & Suppliers (cost prices)', 'fa-truck'],
    ['expenses', 'Expenses', 'fa-money-bill-wave'],
    ['history', 'Sales History (view / delete bills)', 'fa-file-invoice'],
    ['products', 'Products & Stock (cost price, edit)', 'fa-box-open'],
    ['customers', 'Customers & Due', 'fa-user-group'],
    ['barcodes', 'Barcode Labels', 'fa-barcode'],
    ['settings', 'Settings, backup & data', 'fa-sliders']
  ];
  const DEFAULT_LOCKED = ['reports', 'profit', 'purchases', 'expenses', 'settings'];
  let openUntil = 0;
  const LOGK = 'esypos_audit';
  function log(msg) { try { const a = JSON.parse(localStorage.getItem(LOGK) || '[]'); a.unshift({ t: Date.now(), m: msg }); localStorage.setItem(LOGK, JSON.stringify(a.slice(0, 40))); } catch (_) {} }
  const logs = () => { try { return JSON.parse(localStorage.getItem(LOGK) || '[]'); } catch (_) { return []; } };
  const minutes = () => Math.max(1, parseInt(DB.settings.sectionLockMin, 10) || 2);
  const lockedList = () => Array.isArray(DB.settings.lockedViews) ? DB.settings.lockedViews : DEFAULT_LOCKED;
  const needs = v => !!(window.Lock && Lock.has() && lockedList().indexOf(v) >= 0 && Date.now() > openUntil);
  const extend = () => { if (Date.now() <= openUntil) openUntil = Date.now() + minutes() * 60000; };

  function ask(done, name, noOpen) {
    const m = Modal.open({
      title: 'Owner PIN required',
      body: '<p class="muted sm mb3">Enter the owner PIN to open this section.</p>' +
        '<input id="sl-pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" class="input sl-input" placeholder="••••" autofocus>' +
        '<div class="xs sl-msg" id="sl-msg" role="alert"></div>',
      foot: '<button class="btn" onclick="Modal.closeFrom(this)">Cancel</button><button class="btn btn-primary" id="sl-ok"><i class="fas fa-lock"></i> Unlock</button>'
    });
    const inp = m.querySelector('#sl-pin'), msg = m.querySelector('#sl-msg'); let busy = false;
    const go = async () => {
      if (busy || inp.value.length < 4) return; busy = true;
      const r = await Lock.check(inp.value);
      if (r === 'ok') { log('Unlocked: ' + (name || 'section')); if (!noOpen) openUntil = Date.now() + minutes() * 60000; Modal.close(m); done(); }
      else {
        log(r === 'wait' ? 'PIN lock-out (too many wrong attempts)' : 'Wrong PIN for ' + (name || 'section'));
        msg.textContent = r === 'wait' ? '⚠️ Too many wrong attempts. Wait ' + Math.max(1, Math.ceil((Lock.until - Date.now()) / 1000)) + ' seconds.' : '⚠️ Wrong PIN';
        inp.value = ''; if (navigator.vibrate) navigator.vibrate(100); inp.focus();
      }
      busy = false;
    };
    inp.addEventListener('input', go);
    m.querySelector('#sl-ok').onclick = go;
    setTimeout(() => inp.focus(), 60);
  }

  function hook() {
    if (!window.App || App.__guarded) return; App.__guarded = true; hookDash(); migrate();
    const go0 = App.go.bind(App);
    App.go = function (v) { if (needs(v)) { ask(() => go0(v), v); return; } extend(); go0(v); };
    if (window.Cloud && Cloud.panel) {
      const p0 = Cloud.panel;
      Cloud.panel = function () { if (needs('settings')) { ask(() => p0.apply(Cloud, arguments), 'settings'); return; } return p0.apply(Cloud, arguments); };
    }
    if (window.Lock) {
      const l0 = Lock.lockNow.bind(Lock);
      Lock.lockNow = function () { openUntil = 0; profitOpen = 0; if (Lock.has() && App.view !== 'pos' && lockedList().indexOf(App.view) >= 0) App.go('pos'); l0(); };
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { openUntil = 0; profitOpen = 0; } });
    const s = App.Views.settings, r0 = s.render.bind(s);
    s.render = function () { r0(); try { card(); } catch (e) { console.warn('[Guard]', e); } };
  }


  /* ---- dashboard profit mask: lock icon, tap + PIN to reveal ---- */
  let profitOpen = 0;
  const profitLocked = () => !!(window.Lock && Lock.has() && lockedList().indexOf('profit') >= 0 && Date.now() > profitOpen);
  function maskProfit() {
    const view = $('view'); if (!view || !profitLocked()) return;
    view.querySelectorAll('.stat[data-profit]').forEach(el => {
      const v = el.querySelector('.v'); if (!v || el.classList.contains('stat-locked')) return;
      el.classList.add('stat-locked'); el.setAttribute('role', 'button'); el.tabIndex = 0;
      el.setAttribute('aria-label', 'Profit hidden. Tap to enter PIN');
      v.dataset.real = v.innerHTML; v.innerHTML = '<span class="lock-mask"><i class="fas fa-lock"></i><em>Tap to view</em></span>';
      const open = () => ask(() => { profitOpen = Date.now() + minutes() * 60000; log('Profit revealed'); if (App.view === 'dashboard') App.refresh(); }, 'profit', true);
      el.onclick = open; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    });
  }
  function migrate() {
    if (DB.settings.profitLockInit) return; DB.settings.profitLockInit = 1;
    if (Array.isArray(DB.settings.lockedViews) && DB.settings.lockedViews.indexOf('profit') < 0) DB.settings.lockedViews.push('profit');
    C.save('settings');
  }
  function hookDash() {
    const d = App.Views && App.Views.dashboard; if (!d || d.__masked) return; d.__masked = true;
    const r0 = d.render.bind(d); d.render = function () { r0(); try { maskProfit(); } catch (e) { console.warn('[Guard]', e); } };
  }

  function card() {
    const host = document.querySelector('#view .st-sec[data-s="security"]'); if (!host) return;
    const has = Lock.has(), L = lockedList(), mins = minutes(), auto = parseInt(DB.settings.autoLockMin, 10) || 1;
    const opt = (v, cur, txt) => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + txt + '</option>';
    const html = '<div class="card pad mb3" id="guard-card"><div class="sec-title"><i class="fas fa-user-shield ptext"></i> Section lock (for staff)</div>' +
      (has ? '<p class="muted sm mb3">Locked sections need the owner PIN. Staff can still sell.</p>' :
        '<p class="muted sm mb3">⚠️ Set a PIN first — locks need it.</p><button class="btn btn-primary mb3" onclick="Lock.setup()">Set PIN</button>') +
      ITEMS.map(i => '<label class="switch"><span class="sm fw6"><i class="fas ' + i[2] + ' ptext"></i> ' + esc(i[1]) + '</span><input type="checkbox" ' + (L.indexOf(i[0]) >= 0 ? 'checked' : '') + ' onchange="Guard.toggle(\'' + i[0] + '\',this.checked)"></label>').join('') +
      '<div class="grid2 mt3"><div class="field"><label class="label">Re-lock sections after</label><select class="input" onchange="Guard.set(\'sectionLockMin\',this.value)">' +
      opt(1, mins, '1 minute') + opt(2, mins, '2 minutes') + opt(5, mins, '5 minutes') + opt(15, mins, '15 minutes') + '</select></div>' +
      '<div class="field"><label class="label">Lock app after idle</label><select class="input" onchange="Guard.set(\'autoLockMin\',this.value)">' +
      opt(1, auto, '1 minute') + opt(2, auto, '2 minutes') + opt(5, auto, '5 minutes') + opt(15, auto, '15 minutes') + '</select></div></div>' +
      '<p class="xs muted mt2">5 wrong PINs lock the keypad (30 s, then longer).</p></div>';
    const L2 = logs().slice(0, 10), last = parseInt(localStorage.getItem('esypos_g_last') || '0', 10), cnt = parseInt(localStorage.getItem('esypos_g_cnt') || '0', 10);
    const on = localStorage.getItem('esypos_g_on') === '1', dirty = localStorage.getItem('esypos_g_dirty') === '1';
    const health = '<div class="card pad mb3" id="health-card"><div class="sec-title"><i class="fas fa-shield-halved ptext"></i> Backup health</div>' +
      '<div class="kv"><span>Cloud backup</span><b>' + (on ? (dirty ? 'Waiting to sync' : 'Verified ✓') : 'Not connected') + '</b></div>' +
      '<div class="kv"><span>Last verified backup</span><b>' + (last ? C.fmtDT(new Date(last).toISOString()) : '—') + '</b></div>' +
      '<div class="kv"><span>Records in last backup</span><b>' + (cnt || '—') + '</b></div>' +
      '</div>' +
      '<div class="card pad mb3" id="audit-card"><div class="sec-title"><i class="fas fa-file-lines ptext"></i> Security log</div>' +
      (L2.length ? L2.map(x => '<div class="kv"><span>' + esc(x.m) + '</span><b class="xs">' + esc(C.fmtDT(new Date(x.t).toISOString())) + '</b></div>').join('') + '<button class="btn btn-ghost btn-block mt3" onclick="Guard.clearLog()">Clear log</button>' : '<p class="xs muted">No unlock or wrong-PIN events yet.</p>') + '</div>';
    if (!$('guard-card')) host.insertAdjacentHTML('beforeend', html + health);
  }

  const Guard = window.Guard = {
    toggle(id, on) { const L = lockedList().slice(), i = L.indexOf(id); if (on && i < 0) L.push(id); if (!on && i >= 0) L.splice(i, 1); DB.settings.lockedViews = L; C.save('settings'); },
    set(k, v) { DB.settings[k] = parseInt(v, 10) || 1; C.save('settings'); toast('Saved ✓'); },
    needs, log,
    confirmPin(cb, name) { if (window.Lock && Lock.has()) ask(cb, name, true); else cb(); },   // always asks for the PIN (used before deleting a bill)
    clearLog() { try { localStorage.removeItem(LOGK); } catch (_) {} App.refresh(); }
  };

  /* ---- anonymous user counter ---- */
  const LS = { get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} } };
  const base = () => (((window.PROPOS_CONFIG || {}).userCounterUrl) || '').trim().replace(/\/+$/, '');
  function uid() {
    let id = LS.get('esypos_uid');
    if (!/^[a-f0-9]{40}$/.test(id || '')) { const a = new Uint8Array(20); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => a[i] = Math.floor(Math.random() * 256)); id = Array.from(a).map(x => x.toString(16).padStart(2, '0')).join(''); LS.set('esypos_uid', id); }
    return id;
  }
  function pill() {
    const n = parseInt(LS.get('esypos_uc') || '0', 10);
    document.querySelectorAll('.js-ucount').forEach(e => { e.textContent = n ? n.toLocaleString('en-US') : '—'; });
  }
  // Default counter: free public CounterAPI (no account). One "up" per install; clearing browser data counts again.
  const ABACUS = 'https://abacus.jasoncameron.dev', NS = 'esypos.github.io/total-users';
  const CAPI = 'https://api.counterapi.dev/v1/esypos-github-io/total-users';
  const pick = j => { const v = j && (j.count !== undefined ? j.count : j.value !== undefined ? j.value : j.data && (j.data.up_count !== undefined ? j.data.up_count : j.data.count)); const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };
  async function count() {
    if (!navigator.onLine) return pill();
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 9000), b = base();
    try {
      if (b) {                                              // optional: your own Firebase database
        if (LS.get('esypos_uc_reg') !== '1') {
          const r = await fetch(b + '/users/' + uid() + '.json', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: Date.now() }), signal: ctl.signal });
          if (r.ok || r.status === 401 || r.status === 403) LS.set('esypos_uc_reg', '1');
        }
        const r2 = await fetch(b + '/users.json?shallow=true', { signal: ctl.signal });
        if (r2.ok) { const j = await r2.json(); LS.set('esypos_uc', String(j ? Object.keys(j).length : 0)); }
      } else {
        const first = LS.get('esypos_uc_reg') !== '1';
        let n = 0;
        try { const r = await fetch(ABACUS + (first ? '/hit/' : '/get/') + NS, { signal: ctl.signal }); if (r.ok) n = pick(await r.json()); } catch (_) {}
        if (!n) { try { const r = await fetch(CAPI + (first ? '/up' : '/'), { signal: ctl.signal }); if (r.ok) n = pick(await r.json()); } catch (_) {} }
        if (n) { LS.set('esypos_uc', String(n)); if (first) LS.set('esypos_uc_reg', '1'); }
      }
    } catch (_) { /* offline or blocked: keep the last known number */ }
    clearTimeout(to); pill();
  }

  Guard.refreshCount = () => { count(); };
  function start() {
    hook(); pill(); setTimeout(count, 1500);
    window.addEventListener('online', count);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !parseInt(LS.get('esypos_uc') || '0', 10)) count(); });
    setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) count(); }, 60000);   // keeps the shown number fresh
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0)); else setTimeout(start, 0);
})();
