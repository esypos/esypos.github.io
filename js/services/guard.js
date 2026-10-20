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
    ['dashboard', 'Dashboard (income & profit totals)', 'fa-gauge-high'],
    ['purchases', 'Purchases & Suppliers (cost prices)', 'fa-truck'],
    ['expenses', 'Expenses', 'fa-money-bill-wave'],
    ['history', 'Sales History (view / delete bills)', 'fa-file-invoice'],
    ['products', 'Products & Stock (cost price, edit)', 'fa-box-open'],
    ['customers', 'Customers & Due', 'fa-user-group'],
    ['barcodes', 'Barcode Labels', 'fa-barcode'],
    ['settings', 'Settings, backup & data', 'fa-sliders']
  ];
  const DEFAULT_LOCKED = ['reports', 'dashboard', 'purchases', 'expenses', 'settings'];
  let openUntil = 0;
  const minutes = () => Math.max(1, parseInt(DB.settings.sectionLockMin, 10) || 2);
  const lockedList = () => Array.isArray(DB.settings.lockedViews) ? DB.settings.lockedViews : DEFAULT_LOCKED;
  const needs = v => !!(window.Lock && Lock.has() && lockedList().indexOf(v) >= 0 && Date.now() > openUntil);
  const extend = () => { if (Date.now() <= openUntil) openUntil = Date.now() + minutes() * 60000; };

  function ask(done) {
    const m = Modal.open({
      title: 'Owner PIN required',
      body: '<p class="muted sm mb3">This section is locked. Enter the owner PIN to continue.</p>' +
        '<input id="sl-pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" class="input sl-input" placeholder="••••" autofocus>' +
        '<div class="xs sl-msg" id="sl-msg" role="alert"></div>',
      foot: '<button class="btn" onclick="Modal.closeFrom(this)">Cancel</button><button class="btn btn-primary" id="sl-ok"><i class="fas fa-lock-open"></i> Unlock</button>'
    });
    const inp = m.querySelector('#sl-pin'), msg = m.querySelector('#sl-msg'); let busy = false;
    const go = async () => {
      if (busy || inp.value.length < 4) return; busy = true;
      const r = await Lock.check(inp.value);
      if (r === 'ok') { openUntil = Date.now() + minutes() * 60000; Modal.close(m); done(); }
      else {
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
    if (!window.App || App.__guarded) return; App.__guarded = true;
    const go0 = App.go.bind(App);
    App.go = function (v) { if (needs(v)) { ask(() => go0(v)); return; } extend(); go0(v); };
    if (window.Cloud && Cloud.panel) {
      const p0 = Cloud.panel;
      Cloud.panel = function () { if (needs('settings')) { ask(() => p0.apply(Cloud, arguments)); return; } return p0.apply(Cloud, arguments); };
    }
    if (window.Lock) {
      const l0 = Lock.lockNow.bind(Lock);
      Lock.lockNow = function () { openUntil = 0; if (Lock.has() && App.view !== 'pos' && lockedList().indexOf(App.view) >= 0) App.go('pos'); l0(); };
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') openUntil = 0; });
    const s = App.Views.settings, r0 = s.render.bind(s);
    s.render = function () { r0(); try { card(); } catch (e) { console.warn('[Guard]', e); } };
  }

  function card() {
    const t = Array.from(document.querySelectorAll('#view .sec-title')).find(e => /Security/.test(e.textContent)); if (!t) return;
    const has = Lock.has(), L = lockedList(), mins = minutes(), auto = parseInt(DB.settings.autoLockMin, 10) || 1;
    const opt = (v, cur, txt) => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + txt + '</option>';
    const html = '<div class="card pad mb3" id="guard-card"><div class="sec-title"><i class="fas fa-user-shield ptext"></i> Section lock (for staff)</div>' +
      (has ? '<p class="muted sm mb3">Turn on a section to hide it behind the owner PIN. Salesmen can keep selling, but cannot open locked sections.</p>' :
        '<p class="muted sm mb3">⚠️ Set an owner PIN first — section locks only work when a PIN is set.</p><button class="btn btn-primary mb3" onclick="Lock.setup()">Set PIN</button>') +
      ITEMS.map(i => '<label class="switch"><span class="sm fw6"><i class="fas ' + i[2] + ' ptext"></i> ' + esc(i[1]) + '</span><input type="checkbox" ' + (L.indexOf(i[0]) >= 0 ? 'checked' : '') + ' onchange="Guard.toggle(\'' + i[0] + '\',this.checked)"></label>').join('') +
      '<div class="grid2 mt3"><div class="field"><label class="label">Re-lock sections after</label><select class="input" onchange="Guard.set(\'sectionLockMin\',this.value)">' +
      opt(1, mins, '1 minute') + opt(2, mins, '2 minutes') + opt(5, mins, '5 minutes') + opt(15, mins, '15 minutes') + '</select></div>' +
      '<div class="field"><label class="label">Lock app after idle</label><select class="input" onchange="Guard.set(\'autoLockMin\',this.value)">' +
      opt(1, auto, '1 minute') + opt(2, auto, '2 minutes') + opt(5, auto, '5 minutes') + opt(15, auto, '15 minutes') + '</select></div></div>' +
      '<p class="xs muted mt2">Wrong PIN 5 times locks the keypad for 30 s, then 1, 5, 15 and 30 minutes.</p></div>';
    const anchor = t.closest('.card'); if (anchor && !$('guard-card')) anchor.insertAdjacentHTML('afterend', html);
  }

  const Guard = window.Guard = {
    toggle(id, on) { const L = lockedList().slice(), i = L.indexOf(id); if (on && i < 0) L.push(id); if (!on && i >= 0) L.splice(i, 1); DB.settings.lockedViews = L; C.save('settings'); },
    set(k, v) { DB.settings[k] = parseInt(v, 10) || 1; C.save('settings'); toast('Saved ✓'); },
    needs
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
    document.querySelectorAll('.uc-pill').forEach(e => e.remove());
    if (!n) return;
    document.querySelectorAll('.legal-links').forEach(l => l.insertAdjacentHTML('beforebegin', '<div class="uc-pill" title="Total EsyPOS users"><i class="fas fa-users"></i> <b>' + n.toLocaleString('en-US') + '</b> users</div>'));
  }
  async function count() {
    const b = base(); if (!b || !navigator.onLine) return pill();
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
    try {
      if (LS.get('esypos_uc_reg') !== '1') {
        const r = await fetch(b + '/users/' + uid() + '.json', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: Date.now() }), signal: ctl.signal });
        if (r.ok || r.status === 401 || r.status === 403) LS.set('esypos_uc_reg', '1');   // 401/403 = already registered (rules allow one write)
      }
      const r2 = await fetch(b + '/users.json?shallow=true', { signal: ctl.signal });
      if (r2.ok) { const j = await r2.json(); LS.set('esypos_uc', String(j ? Object.keys(j).length : 0)); }
    } catch (_) { /* offline or blocked: keep the last known number */ }
    clearTimeout(to); pill();
  }

  function start() { hook(); pill(); setTimeout(count, 2500); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0)); else setTimeout(start, 0);
})();
