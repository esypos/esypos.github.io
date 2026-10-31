/* Old POS Guard (v10.14): section lock for staff + anonymous user counter.
   - Section lock: owner picks which sections need the PIN (Settings -> Section lock). Salesmen stay on the Sales Counter.
   - User counter: each install registers one random anonymous ID (no name, phone, shop data) in YOUR Firebase Realtime
     Database; the app shows how many installs exist. Set userCounterUrl in js/core/config.js (see README). */
(function () {
  'use strict';
  const C = Core, DB = C.DB, esc = C.esc, toast = C.toast;
  const $ = id => document.getElementById(id);
  const ITEMS = [
    ['reports', 'Reports (sales & profit analysis)', 'fa-chart-column'],
    ['profit', 'Dashboard profit (today & monthly, tap lock to view)', 'fa-lock'],
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

  /* ---- Admin PIN: separate from the home-screen PIN; protects sections/profit from staff ---- */
  const AK = { f: 'esypos_ad_f', u: 'esypos_ad_u' };
  const lsn = k => { try { return parseInt(localStorage.getItem(k) || '0', 10) || 0; } catch (_) { return 0; } };
  const lss = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (_) {} };
  const Admin = window.AdminLock = {
    has() { return !!DB.settings.adminHash; },
    async verify(pin) { return !!DB.settings.adminHash && (await Lock.hashFor(pin, DB.settings.adminSalt)) === DB.settings.adminHash; },
    async check(pin) {                              // 'ok' | 'bad' | 'wait'
      if (Date.now() < lsn(AK.u)) return 'wait';
      if (await this.verify(pin)) { lss(AK.f, 0); return 'ok'; }
      const n = lsn(AK.f) + 1; lss(AK.f, n);
      if (n >= 5) { lss(AK.f, 0); lss(AK.u, Date.now() + 30000); return 'wait'; }
      return 'bad';
    },
    wait() { return Math.max(1, Math.ceil((lsn(AK.u) - Date.now()) / 1000)); },
    setup() {
      const has = this.has();
      const m = Modal.open({ title: has ? 'Change Admin PIN' : 'Set Admin PIN', body:
        (has ? '<div class="field"><label class="label">Current Admin PIN</label><input id="ad-old" type="password" inputmode="numeric" maxlength="4" class="input"></div>' : '') +
        '<div class="field"><label class="label">New Admin PIN (4 digits)</label><input id="ad-new" type="password" inputmode="numeric" maxlength="4" class="input"></div>' +
        '<div class="field"><label class="label">Re-enter</label><input id="ad-new2" type="password" inputmode="numeric" maxlength="4" class="input"></div>' +
        '<p class="xs muted">Keep this PIN to yourself — it is different from the home-screen PIN your staff may know.</p>',
        foot: '<button class="btn" onclick="Modal.closeFrom(this)">Cancel</button><button class="btn btn-primary" id="ad-ok">Save</button>' });
      m.querySelector('#ad-ok').onclick = async () => {
        if (has && (await Admin.check($('ad-old').value)) !== 'ok') { toast('⚠️ Current Admin PIN is wrong'); return; }
        const a = $('ad-new').value, b = $('ad-new2').value;
        if (!/^\d{4}$/.test(a)) { toast('⚠️ Enter exactly 4 digits'); return; } if (/^(\d)\1{3}$/.test(a) || ['0123','1234','2345','3456','4567','5678','6789','9876','8765','7654','6543','5432','4321','3210','1212','2580','1122','2020','2021','2022','2023','2024','2025','2026'].indexOf(a) >= 0) { toast('⚠️ That PIN is too easy to guess — choose another'); return; } if (a !== b) { toast('⚠️ PINs do not match'); return; }
        const salt = C.genId(); DB.settings.adminSalt = salt; DB.settings.adminHash = await Lock.hashFor(a, salt); C.save('settings');
        log('Admin PIN ' + (has ? 'changed' : 'set')); Modal.close(m); toast('Admin PIN saved ✓'); App.refresh();
      };
    },
    remove() {
      const m = Modal.open({ title: 'Remove Admin PIN', body: '<p class="muted sm mb3">All section locks stop working until you set a new Admin PIN.</p><div class="field"><label class="label">Current Admin PIN</label><input id="ad-old" type="password" inputmode="numeric" maxlength="4" class="input" autofocus></div>',
        foot: '<button class="btn" onclick="Modal.closeFrom(this)">Cancel</button><button class="btn btn-bad" id="ad-ok">Remove</button>' });
      m.querySelector('#ad-ok').onclick = async () => { if ((await Admin.check($('ad-old').value)) !== 'ok') { toast('⚠️ Wrong Admin PIN'); return; } DB.settings.adminHash = ''; DB.settings.adminSalt = ''; C.save('settings'); log('Admin PIN removed'); Modal.close(m); toast('Admin PIN removed'); App.refresh(); };
    },
    forgot() {                                       // owner recovery: Google backup, or the home-screen PIN
      if (window.Cloud && Cloud.isOn()) { Cloud.resetPin(); return; }
      if (Lock.has()) {
        const m = Modal.open({ title: 'Reset Admin PIN', body: '<p class="muted sm mb3">Enter the home-screen PIN to remove the Admin PIN, then set a new one.</p><input id="ad-sp" type="password" inputmode="numeric" maxlength="4" class="input sl-input">',
          foot: '<button class="btn" onclick="Modal.closeFrom(this)">Cancel</button><button class="btn btn-primary" id="ad-ok">Reset</button>' });
        m.querySelector('#ad-ok').onclick = async () => { if ((await Lock.check($('ad-sp').value)) !== 'ok') { toast('⚠️ Wrong PIN'); return; } DB.settings.adminHash = ''; DB.settings.adminSalt = ''; C.save('settings'); log('Admin PIN reset'); Modal.close(m); toast('Admin PIN removed — set a new one'); App.refresh(); };
        return;
      }
      toast('Connect Google backup or set a home-screen PIN to enable recovery');
    }
  };

  let openUntil = 0;
  const LOGK = 'esypos_audit';
  function log(msg) { try { const a = JSON.parse(localStorage.getItem(LOGK) || '[]'); a.unshift({ t: Date.now(), m: msg }); localStorage.setItem(LOGK, JSON.stringify(a.slice(0, 40))); } catch (_) {} }
  const logs = () => { try { return JSON.parse(localStorage.getItem(LOGK) || '[]'); } catch (_) { return []; } };
  const minutes = () => Math.max(1, parseInt(DB.settings.sectionLockMin, 10) || 2);
  const lockedList = () => Array.isArray(DB.settings.lockedViews) ? DB.settings.lockedViews : DEFAULT_LOCKED;
  const needs = v => !!(Admin.has() && lockedList().indexOf(v) >= 0 && Date.now() > openUntil);
  const extend = () => { if (Date.now() <= openUntil) openUntil = Date.now() + minutes() * 60000; };

  function ask(done, name, noOpen) {
    const m = Modal.open({
      title: 'Admin PIN required',
      body: '<p class="muted sm mb3">Enter the Admin PIN to continue.</p>' +
        '<input id="sl-pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" class="input sl-input" placeholder="••••" autofocus>' +
        '<div class="xs sl-msg" id="sl-msg" role="alert"></div>',
      foot: '<button class="btn" onclick="Modal.closeFrom(this)">Cancel</button><button class="btn btn-ghost" id="sl-fg">Forgot?</button><button class="btn btn-primary" id="sl-ok"><i class="fas fa-lock"></i> Unlock</button>'
    });
    const inp = m.querySelector('#sl-pin'), msg = m.querySelector('#sl-msg'); let busy = false;
    const go = async () => {
      if (busy || inp.value.length < 4) return; busy = true;
      const r = await Admin.check(inp.value);
      if (r === 'ok') { log('Unlocked: ' + (name || 'section')); if (!noOpen) openUntil = Date.now() + minutes() * 60000; Modal.close(m); done(); }
      else {
        log(r === 'wait' ? 'PIN lock-out (too many wrong attempts)' : 'Wrong PIN for ' + (name || 'section'));
        msg.textContent = r === 'wait' ? '⚠️ Too many wrong attempts. Wait ' + Admin.wait() + ' seconds.' : '⚠️ Wrong PIN';
        inp.value = ''; if (navigator.vibrate) navigator.vibrate(100); inp.focus();
      }
      busy = false;
    };
    inp.addEventListener('input', go);
    m.querySelector('#sl-ok').onclick = go; m.querySelector('#sl-fg').onclick = () => { Modal.close(m); Admin.forgot(); };
    setTimeout(() => inp.focus(), 60);
  }

  function hookGo() {
    if (!window.App || App.__goGuard) return; App.__goGuard = true;
    const go0 = App.go.bind(App);
    App.go = function (v) { if (needs(v)) { ask(() => go0(v), v); return; } extend(); go0(v); };
  }
  function hook() {
    if (!window.App || App.__guarded) return; App.__guarded = true; hookDash(); migrate();
    hookGo();
    if (window.Cloud && Cloud.panel) {
      const p0 = Cloud.panel;
      Cloud.panel = function () { if (needs('settings')) { ask(() => p0.apply(Cloud, arguments), 'settings'); return; } return p0.apply(Cloud, arguments); };
    }
    if (window.Lock) {
      const l0 = Lock.lockNow.bind(Lock);
      Lock.lockNow = function () { openUntil = 0; profitOpen = 0; if (Admin.has() && App.view !== 'pos' && lockedList().indexOf(App.view) >= 0) App.go('pos'); l0(); };
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { openUntil = 0; profitOpen = 0; } });
    const s = App.Views.settings, r0 = s.render.bind(s);
    s.render = function () { r0(); try { card(); } catch (e) { console.warn('[Guard]', e); } };
  }


  /* ---- dashboard profit mask: lock icon, tap + PIN to reveal ---- */
  let profitOpen = 0;
  const profitLocked = () => !!(Admin.has() && lockedList().indexOf('profit') >= 0 && Date.now() > profitOpen);
  function maskProfit() {
    const view = $('view'); if (!view || !profitLocked()) return;
    view.querySelectorAll('.stat[data-profit],.hm[data-profit]').forEach(el => {
      const v = el.querySelector('.v'); if (!v || el.classList.contains('stat-locked')) return;
      el.classList.add('stat-locked'); el.setAttribute('role', 'button'); el.tabIndex = 0;
      el.setAttribute('aria-label', 'Profit hidden. Tap to enter PIN');
      v.dataset.real = v.innerHTML; v.innerHTML = '<span class="lock-mask"><i class="fas fa-lock"></i><em>Tap to view</em></span>';
      const open = () => ask(() => { profitOpen = Date.now() + minutes() * 60000; log('Profit revealed'); if (App.view === 'dashboard') App.refresh(); }, 'profit', true);
      el.onclick = open; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    });
  }
  function migrate() {
    if (!DB.settings.adminMigrated) { DB.settings.adminMigrated = 1; if (DB.settings.pinHash && !DB.settings.adminHash) { DB.settings.adminHash = DB.settings.pinHash; DB.settings.adminSalt = DB.settings.pinSalt; } C.save('settings'); }
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
    const has = Admin.has(), L = lockedList(), mins = minutes(), auto = Math.max(3, parseInt(DB.settings.autoLockMin, 10) || 3);
    const opt = (v, cur, txt) => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + txt + '</option>';
    const html = '<div class="card pad mb3" id="guard-card"><div class="sec-title"><i class="fas fa-user-shield ptext"></i> 2. Admin lock (hide info from staff)</div>' +
      (has ? '<p class="muted sm mb3">ON — ticked sections and profit need the <b>Admin PIN</b>. Staff can still sell.</p><div class="flex gap2 mb3"><button class="btn btn-ghost grow" onclick="AdminLock.setup()">Change Admin PIN</button><button class="btn btn-danger-soft grow" onclick="AdminLock.remove()">Remove</button></div>' :
        '<p class="muted sm mb3">OFF — set a separate Admin PIN to choose what staff cannot see.</p><button class="btn btn-primary btn-block mb3" onclick="AdminLock.setup()"><i class="fas fa-lock"></i> Set Admin PIN</button>') +
      '<div class="muted xs mb2">Choose what to lock:</div>' +
      ITEMS.map(i => '<label class="switch"><span class="sm fw6"><i class="fas ' + i[2] + ' ptext"></i> ' + esc(i[1]) + '</span><input type="checkbox" ' + (L.indexOf(i[0]) >= 0 ? 'checked' : '') + ' onchange="Guard.toggle(\'' + i[0] + '\',this.checked)"></label>').join('') +
      '<div class="grid2 mt3"><div class="field"><label class="label">Re-lock sections after</label><select class="input" onchange="Guard.set(\'sectionLockMin\',this.value)">' +
      opt(1, mins, '1 minute') + opt(2, mins, '2 minutes') + opt(5, mins, '5 minutes') + opt(15, mins, '15 minutes') + '</select></div>' +
      '<div class="field"><label class="label">Home screen re-lock after idle</label><select class="input" onchange="Guard.set(\'autoLockMin\',this.value)">' +
      opt(3, auto, '3 minutes') + opt(5, auto, '5 minutes') + opt(10, auto, '10 minutes') + opt(15, auto, '15 minutes') + '</select></div></div>' +
      '<p class="xs muted mt2">5 wrong PINs lock the keypad for 30 seconds.</p></div>';
    const L2 = logs().slice(0, 10), last = parseInt(localStorage.getItem('esypos_g_last') || '0', 10), cnt = parseInt(localStorage.getItem('esypos_g_cnt') || '0', 10);
    const on = localStorage.getItem('esypos_g_on') === '1', dirty = localStorage.getItem('esypos_g_dirty') === '1';
    const health = '<div class="card pad mb3" id="health-card"><div class="sec-title"><i class="fas fa-shield-halved ptext"></i> Backup health</div>' +
      '<div class="kv"><span>Cloud backup</span><b>' + (on ? (dirty ? 'Waiting to sync' : 'Verified ✓') : 'Not connected') + '</b></div>' +
      '<div class="kv"><span>Last verified backup</span><b>' + (last ? C.fmtDT(new Date(last).toISOString()) : '—') + '</b></div>' +
      '<div class="kv"><span>Records in last backup</span><b>' + (cnt || '—') + '</b></div>' +
      '</div>' +
      '<div class="card pad mb3" id="audit-card"><div class="sec-title"><i class="fas fa-file-lines ptext"></i> Security log</div>' +
      (L2.length ? L2.map(x => '<div class="kv"><span>' + esc(x.m) + '</span><b class="xs">' + esc(C.fmtDT(new Date(x.t).toISOString())) + '</b></div>').join('') + '<button class="btn btn-ghost btn-block mt3" onclick="Guard.clearLog()">Clear log</button>' : '<p class="xs muted">No unlock or wrong-PIN events yet.</p>') + '</div>';
    if (!$('guard-card')) { host.insertAdjacentHTML('beforeend', html + health + '<div class="card pad mb3" id="local-card"></div>'); localCard(); }
  }
  /* v12: this device + local safety copies (work without internet) */
  async function localCard() {
    const el = document.getElementById('local-card'); if (!el || !window.Safety) return;
    const [list, id, persisted] = await Promise.all([Safety.listCopies(), Safety.deviceId(), (navigator.storage && navigator.storage.persisted) ? navigator.storage.persisted().catch(() => false) : false]);
    if (!document.getElementById('local-card')) return;
    el.innerHTML = '<div class="sec-title"><i class="fas fa-hard-drive ptext"></i> This device &amp; local copies</div>' +
      '<div class="kv"><span>Device ID</span><b class="xs" style="font-family:ui-monospace,monospace">' + esc(id.slice(0, 8) + '…' + id.slice(-4)) + '</b></div>' +
      '<div class="kv"><span>Counted as</span><b>1 user (this device)</b></div>' +
      '<div class="kv"><span>Protected storage</span><b>' + (persisted ? 'On ✓' : 'Requested') + '</b></div>' +
      '<div class="kv"><span>Stay signed in</span><b>Until you press Log out</b></div>' +
      '<div class="muted xs mt3 mb2">Automatic copies kept on this device (latest ' + 10 + '). If something goes wrong you can bring a copy back, even offline.</div>' +
      (list.length ? list.slice(0, 5).map(c => '<div class="kv"><span>' + esc(C.fmtDT(new Date(c.t).toISOString())) + ' <small class="muted">· ' + c.n + ' records</small></span><span class="flex gap2"><button class="btn btn-ghost btn-sm" onclick="Guard.localRestore(' + c.t + ')">Restore</button><button class="btn btn-ghost btn-sm" onclick="Safety.downloadCopy(' + c.t + ')" aria-label="Download"><i class="fas fa-download"></i></button></span></div>').join('') : '<p class="xs muted">No copies yet — the first one is saved automatically a few seconds after you add data.</p>') +
      '<button class="btn btn-ghost btn-block mt3" onclick="Guard.localSave()"><i class="fas fa-floppy-disk"></i> Save a copy now</button>';
  }

  const Guard = window.Guard = {
    toggle(id, on) { const L = lockedList().slice(), i = L.indexOf(id); if (on && i < 0) L.push(id); if (!on && i >= 0) L.splice(i, 1); DB.settings.lockedViews = L; C.save('settings'); },
    set(k, v) { DB.settings[k] = parseInt(v, 10) || 1; C.save('settings'); toast('Saved ✓'); },
    needs, log,
    confirmPin(cb, name) { if (Admin.has()) ask(cb, name, true); else cb(); },   // always asks for the PIN (used before deleting a bill)
    clearLog() { try { localStorage.removeItem(LOGK); } catch (_) {} App.refresh(); },
    async localSave() { const ok = await Safety.saveCopy(true); toast(ok ? 'Copy saved ✓' : 'Could not save a copy'); localCard(); },
    localRestore(t) {
      askConfirm('Your current data will be replaced by this copy. A copy of the current data is saved first.', async () => {
        try { await Safety.restoreCopy(t); toast('Restored ✓'); setTimeout(() => location.reload(), 700); } catch (e) { toast('⚠️ ' + (e && e.message || 'Restore failed')); }
      }, { title: 'Restore this copy?', yes: 'Yes, restore', danger: true });
    }
  };

  /* ---- user counter: ONE DEVICE = ONE USER (v12.0.0) ----
     The id comes from the device itself (Safety.deviceId), so Log out / re-login / clearing data / re-installing the app
     on the same device is never counted again. With the default free counters the device is registered once through its
     own tiny counter: the global total only goes up when that device counter is seen for the very first time. */
  const LS = { get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} } };
  const cfg = () => window.PROPOS_CONFIG || {};
  const base = () => ((cfg().userCounterUrl) || '').trim().replace(/\/+$/, '');
  function pill() {
    const off = parseInt(cfg().userCountOffset, 10) || 0;
    const n = (parseInt(LS.get('esypos_uc') || '0', 10) || 0) + off;
    document.querySelectorAll('.js-ucount').forEach(e => { e.textContent = n > 0 ? n.toLocaleString('en-US') : '—'; });
  }
  const ABACUS = 'https://abacus.jasoncameron.dev', NS_ = 'oldpos.github.io', TOTAL = 'total-users';
  const CAPI = 'https://api.counterapi.dev/v1/esypos-github-io';
  const pick = j => { const v = j && (j.count !== undefined ? j.count : j.value !== undefined ? j.value : j.data && (j.data.up_count !== undefined ? j.data.up_count : j.data.count)); const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };
  async function hitJSON(url) {                       // one request = its own timeout, so a slow first request can no longer cancel the next one
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
    try { const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' }); if (!r.ok) return 0; return pick(await r.json()); }
    finally { clearTimeout(to); }
  }
  /* v12.1.2 counter rules (fixes under- and over-counting):
     1. ONE source of truth (Abacus) decides whether a device is new. The old fallback counted the same device again on a second service → inflated total.
     2. A device whose own counter was created but whose total-increment failed is remembered (esypos_uc_pend) and retried; before, it was lost forever.
     3. The number shown never goes down because a fallback service returned a smaller value. */
  async function viaCounters(dev, canReg) {
    const dk = 'dev-' + dev, done = LS.get('esypos_uc_dev') === dev || !canReg, legacy = LS.get('esypos_uc_reg') === '1';
    let total = 0;
    if (!done) {
      const pend = LS.get('esypos_uc_pend') === dev;
      let n = pend ? 1 : 0;
      if (!pend) { try { n = await hitJSON(ABACUS + '/hit/' + NS_ + '/' + dk); } catch (_) {} }
      if (n) {
        if (n === 1 && !legacy) {
          LS.set('esypos_uc_pend', dev);                       // survives a failed request / closed tab → retried next time
          try { total = await hitJSON(ABACUS + '/hit/' + NS_ + '/' + TOTAL); } catch (_) {}
          if (total) { LS.set('esypos_uc_dev', dev); try { localStorage.removeItem('esypos_uc_pend'); } catch (_) {} try { window.Users && Users.noteJoin(); } catch (_) {} }
        } else { LS.set('esypos_uc_dev', dev); }              // already counted before (or counted by an older version)
      }
    }
    if (!total) {
      try { total = await hitJSON(ABACUS + '/get/' + NS_ + '/' + TOTAL); } catch (_) {}
      if (!total) { try { total = await hitJSON(CAPI + '/' + TOTAL + '/'); } catch (_) {} }
    }
    return total;
  }
  async function count() {
    if (!navigator.onLine) return pill();
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 9000), b = base();
    try {
      const dev = window.Safety ? await Safety.deviceId() : null;
      if (!dev) throw new Error('no device id');
      const canReg = !!(window.Users && Users.real());          // v12.1: visitors, bots and signed-out devices are never counted
      if (b) {                                              // optional: your own Firebase database (exact, one record per real device)
        if (window.Users) await Users.sync();
        const r2 = await fetch(b + '/devices.json?shallow=true', { signal: ctl.signal });
        if (r2.ok) { const j = await r2.json(); LS.set('esypos_uc', String(j ? Object.keys(j).length : 0)); }
      } else {
        const n = await viaCounters(dev, canReg), old = parseInt(LS.get('esypos_uc') || '0', 10) || 0;
        if (n && n >= old) LS.set('esypos_uc', String(n));          // counters only ever grow: ignore a smaller answer from a fallback service
      }
    } catch (_) { /* offline or blocked: keep the last known number */ }
    clearTimeout(to); pill(); if (window.Users) Users.paint();
  }

  Guard.refreshCount = () => { count(); };
  function start() {
    hook(); pill(); setTimeout(count, 1500);
    window.addEventListener('online', count);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !parseInt(LS.get('esypos_uc') || '0', 10)) count(); });
    setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) count(); }, 30 * 60000);   // every 30 min (was every minute): saves battery and data
  }
  hookGo();                                          // immediately — before the app opens its first screen (see ?go= shortcuts)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0)); else setTimeout(start, 0);
})();
