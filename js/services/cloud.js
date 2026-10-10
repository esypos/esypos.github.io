/* EsyPOS Cloud: Google sign-in + automatic backup & restore in Google Drive (private appDataFolder)
   - Only the drive.appdata scope is used: the app cannot see any other file in your Drive.
   - If browser data is ever cleared, signing in again brings all shop data back. */
(function () {
  'use strict';
  const C = Core, DB = C.DB, K = C.K, esc = C.esc, toast = C.toast;
  const LS = localStorage;
  const $ = id => document.getElementById(id);
  const KEY = { on: 'esypos_g_on', email: 'esypos_g_email', name: 'esypos_g_name', pic: 'esypos_g_pic', rev: 'esypos_g_rev', fid: 'esypos_g_fid',
    last: 'esypos_g_last', snap: 'esypos_g_snap', dirty: 'esypos_g_dirty', welcomed: 'esypos_welcomed', client: 'esypos_g_client', tok: 'esypos_g_tok', pinReset: 'esypos_pin_reset' };
  const MAIN = 'esypos-data.json', SNAP = 'esypos-snap-', KEEP_SNAPS = 14;
  const SCOPE = 'openid email profile https://www.googleapis.com/auth/drive.appdata';
  const DRIVE = 'https://www.googleapis.com/drive/v3/files', UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  const get = k => { try { return LS.getItem(k); } catch (_) { return null; } };
  const set = (k, v) => { try { LS.setItem(k, v); } catch (_) {} };
  const del = k => { try { LS.removeItem(k); } catch (_) {} };
  const isOn = () => get(KEY.on) === '1';
  const clientId = () => ((window.PROPOS_CONFIG && window.PROPOS_CONFIG.googleClientId) || get(KEY.client) || '').trim();
  const hasLocal = () => !!(DB.products.length || DB.sales.length || DB.customers.length || DB.suppliers.length || DB.expenses.length);
  const mk = (code, status) => { const e = new Error(code); e.code = code; e.status = status; return e; };
  const S = { status: 'off', busy: false, applying: false, timer: null, tok: null, exp: 0, authP: null, lastTry: 0, seq: 0, gis: null };
  try { const t = JSON.parse(sessionStorage.getItem(KEY.tok) || 'null'); if (t && t.exp > Date.now() + 60000) { S.tok = t.t; S.exp = t.exp; } } catch (_) {}
  const validTok = () => !!S.tok && Date.now() < S.exp - 60000;
  function loadGIS() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (S.gis) return S.gis;
    S.gis = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => res(); s.onerror = () => { S.gis = null; rej(mk('offline')); };
      document.head.appendChild(s);
    });
    return S.gis;
  }
  function setTok(t, sec) {
    S.tok = t; S.exp = Date.now() + (Number(sec) || 3600) * 1000;
    try { sessionStorage.setItem(KEY.tok, JSON.stringify({ t: S.tok, exp: S.exp })); } catch (_) {}
  }
  function requestToken(interactive, pick) {
    if (validTok()) return Promise.resolve(S.tok);
    if (!interactive) return Promise.reject(mk('auth'));
    if (S.authP) return S.authP;
    S.lastTry = Date.now();
    S.authP = (async () => {
      if (!clientId()) throw mk('noclient');
      try { await loadGIS(); } catch (_) { throw mk('offline'); }
      return new Promise((resolve, reject) => {
        const cl = google.accounts.oauth2.initTokenClient({
          client_id: clientId(), scope: SCOPE,
          callback: r => { if (r.error) return reject(mk(r.error)); setTok(r.access_token, r.expires_in); resolve(S.tok); },
          error_callback: e => reject(mk((e && e.type) || 'popup_closed'))
        });
        const o = { prompt: pick ? 'select_account' : '' };
        const hint = get(KEY.email); if (hint && !pick) o.hint = hint;
        cl.requestAccessToken(o);
      });
    })();
    S.authP.then(() => { S.authP = null; }, () => { S.authP = null; });
    return S.authP;
  }
  async function api(url, opt, noRetry) {
    if (!navigator.onLine) throw mk('offline');
    const t = await requestToken(false);
    const r = await fetch(url, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + t }, (opt && opt.headers) || {}) }));
    if (r.status === 401 && !noRetry) { S.tok = null; S.exp = 0; try { sessionStorage.removeItem(KEY.tok); } catch (_) {} throw mk('auth', 401); }
    if (!r.ok) throw mk('http', r.status);
    return r;
  }
  async function listFiles(q) {
    const u = DRIVE + '?' + new URLSearchParams({ spaces: 'appDataFolder', pageSize: '100', orderBy: 'modifiedTime desc', fields: 'files(id,name,modifiedTime,size)', q });
    return ((await (await api(u)).json()).files) || [];
  }
  const findMain = async () => {
    let f = (await listFiles("name = '" + MAIN + "' and trashed = false"))[0];
    if (!f) f = (await listFiles("name = 'propos-data.json' and trashed = false"))[0] || null;
    return f || null;
  };
  const getMeta = async id => { const j = await (await api(DRIVE + '/' + id + '?fields=id,modifiedTime')).json(); if (!j || !j.id) throw mk('http', 404); return j; };
  const download = async id => (await api(DRIVE + '/' + id + '?alt=media')).json();
  async function writeMain(fid, text) {
    const b = 'pp' + Date.now().toString(36);
    const meta = fid ? {} : { name: MAIN, parents: ['appDataFolder'] };
    const body = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) +
      '\r\n--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + text + '\r\n--' + b + '--';
    const r = await api((fid ? UPLOAD + '/' + fid : UPLOAD) + '?uploadType=multipart&fields=id,modifiedTime',
      { method: fid ? 'PATCH' : 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body });
    return r.json();
  }
  const copyFile = (id, name) => api(DRIVE + '/' + id + '/copy?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, parents: ['appDataFolder'] }) });
  async function snapshotBefore(f, tag) {
    const day = C.todayKey();
    if (!tag && get(KEY.snap) === day) return;
    try {
      const name = SNAP + (tag || day) + '.json';
      const ex = await listFiles("name = '" + name + "' and trashed = false");
      if (!ex.length) await copyFile(f.id, name);
      if (!tag) set(KEY.snap, day);
      const all = (await listFiles("name contains '" + SNAP + "' and trashed = false")).sort((a, b) => a.name < b.name ? 1 : -1);
      for (const x of all.slice(KEEP_SNAPS)) { try { await api(DRIVE + '/' + x.id, { method: 'DELETE' }); } catch (_) {} }
    } catch (e) { console.warn('[Cloud] snapshot', e); }
  }
  function payload() {
    const out = { app: 'EsyPOS', version: 4, exportDate: new Date().toISOString(), device: (navigator.platform || '') };
    Object.keys(K).forEach(k => { if (k !== 'cart') out[k] = k === 'settings' ? DB.settings : DB[k]; });
    return out;
  }
  const sum = d => ({ p: (d.products || []).length, s: (d.sales || []).length, c: (d.customers || []).length });
  function applyRemote(d, f, pushAfter) {
    if (!d || !Array.isArray(d.products)) throw mk('badfile');
    S.applying = true;
    Object.keys(K).forEach(k => {
      if (k === 'settings') DB.settings = Object.assign({}, C.DEFAULTS, d.settings || {});
      else if (k === 'cart') DB.cart = [];
      else DB[k] = Array.isArray(d[k]) ? d[k] : [];
    });
    if (get(KEY.pinReset) === '1') { DB.settings.pinHash = ''; DB.settings.pinSalt = ''; pushAfter = true; del(KEY.pinReset); }
    C.migrate(); C.saveAll();
    set(KEY.rev, f.modifiedTime); set(KEY.fid, f.id); set(KEY.last, String(Date.now()));
    if (pushAfter) set(KEY.dirty, '1'); else del(KEY.dirty);
    del('esypos_dirty');
    toast('✓ Data restored from cloud');
    setTimeout(() => location.reload(), 900);
  }
  function markDirty() {
    if (!isOn() || S.applying) return;
    set(KEY.dirty, '1'); S.seq++;
    if (S.status !== 'syncing' && S.status !== 'auth' && S.status !== 'offline') setStatus('pending'); else renderUI();
    clearTimeout(S.timer); S.timer = setTimeout(() => push(), 12000);
  }
  async function push(force) {
    if (!isOn() || S.busy || S.applying || !hasLocal()) return;
    clearTimeout(S.timer);
    if (!validTok()) { setStatus(navigator.onLine ? 'auth' : 'offline'); return; }
    S.busy = true; setStatus('syncing'); const seq = S.seq;
    try {
      let f = null; const cached = get(KEY.fid);
      if (cached) { try { f = await getMeta(cached); } catch (e) { if (e.status !== 404) throw e; } }
      if (!f) f = await findMain();
      if (f && !force && get(KEY.rev) !== f.modifiedTime) { S.busy = false; setStatus('pending'); await conflict(f); return; }
      if (f) await snapshotBefore(f);
      const res = await writeMain(f ? f.id : null, JSON.stringify(payload()));
      set(KEY.fid, res.id); set(KEY.rev, res.modifiedTime); set(KEY.last, String(Date.now()));
      if (S.seq === seq) { del(KEY.dirty); del('esypos_dirty'); setStatus('ok'); }
      else { setStatus('pending'); S.timer = setTimeout(() => push(), 3000); }
    } catch (e) { fail(e); }
    finally { S.busy = false; }
  }
  async function syncNow() {
    if (!isOn()) return signIn();
    try { setStatus('syncing'); await requestToken(true); } catch (e) { return fail(e, true); }
    await push();
    if (S.status === 'ok') toast('✓ Synced to cloud');
  }
  async function conflict(f) {
    let d;
    try { d = await download(f.id); } catch (e) { return fail(e, true); }
    if (!hasLocal()) return applyRemote(d, f);
    const rs = sum(d), ls = sum({ products: DB.products, sales: DB.sales, customers: DB.customers });
    const m = Modal.open({
      title: 'Which data to keep?', static: true,
      body: `<p class="muted sm mb3">Your Google Drive already has EsyPOS data that differs from this device.</p>
        <div class="grid2 mb3">
          <div class="cl-opt"><div class="xs muted mb1"><i class="fas fa-cloud"></i> Cloud data</div><div class="fw7">${rs.p} Product · ${rs.s} Sales</div><div class="xs muted">${rs.c} Customer<br>${d.exportDate ? C.fmtDT(d.exportDate) : C.fmtDT(f.modifiedTime)}</div></div>
          <div class="cl-opt"><div class="xs muted mb1"><i class="fas fa-mobile-screen"></i> This device data</div><div class="fw7">${ls.p} Product · ${ls.s} Sales</div><div class="xs muted">${ls.c} Customer</div></div>
        </div>
        <p class="xs muted">Safety: if you choose cloud data, a backup of this device data will download first. If you keep device data, a copy of the old cloud data will be saved on Drive.</p>`,
      foot: `<button class="btn btn-primary" id="cf-cloud"><i class="fas fa-cloud-arrow-down"></i> Take cloud data</button><button class="btn btn-ghost" id="cf-local"><i class="fas fa-cloud-arrow-up"></i> Keep device data</button>`
    });
    m.querySelector('#cf-cloud').onclick = () => {
      Modal.close(m);
      try { C.download('esypos-device-backup-' + C.todayKey() + '.json', JSON.stringify(payload()), 'application/json'); } catch (_) {}
      setTimeout(() => applyRemote(d, f), 400);
    };
    m.querySelector('#cf-local').onclick = async () => {
      Modal.close(m); setStatus('syncing');
      try { await snapshotBefore(f, 'before-overwrite-' + C.todayKey() + '-' + Date.now().toString(36)); } catch (_) {}
      set(KEY.fid, f.id); set(KEY.rev, f.modifiedTime); await push(true);
    };
  }
  async function afterSignIn() {
    const f = await findMain();
    if (!f) {
      if (hasLocal()) await push(true);
      else { setStatus('ok'); toast('✓ Google connected — auto backup when data changes'); }
      return;
    }
    set(KEY.fid, f.id);
    if (hasLocal() && get(KEY.rev) === f.modifiedTime) { if (get(KEY.dirty) === '1') await push(); else setStatus('ok'); return; }
    await conflict(f);
  }
  async function signIn(pick) {
    if (!clientId()) return setup();
    try {
      if (pick) [KEY.rev, KEY.fid, KEY.last, KEY.snap].forEach(del);
      const t = await requestToken(true, pick);
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + t } });
      const u = r.ok ? await r.json() : {};
      const prev = get(KEY.email);
      if (isOn() && prev && u.email && u.email.toLowerCase() !== prev.toLowerCase()) {
        try { google.accounts.oauth2.revoke(t, () => {}); } catch (_) {} S.tok = null; S.exp = 0; try { sessionStorage.removeItem(KEY.tok); } catch (_) {}
        toast('⚠️ This device is signed in as ' + prev + '. Use that account or tap “Use a different account”.'); return;
      }
      set(KEY.email, u.email || ''); set(KEY.name, u.name || ''); set(KEY.pic, u.picture || '');
      set(KEY.on, '1'); set(KEY.welcomed, '1'); closeWelcome(); setStatus('syncing');
      await afterSignIn();
    } catch (e) { fail(e, true); }
  }
  function wipeLocal() {
    try { Object.keys(LS).forEach(k => { if (/^(esypos_|propos_)/.test(k) && k !== 'esypos_theme' && k !== KEY.client) LS.removeItem(k); }); } catch (_) {}
    try { sessionStorage.removeItem(KEY.tok); } catch (_) {}
  }
  function finishSignOut(mode) {
    S.applying = true; clearTimeout(S.timer);
    try { if (S.tok && window.google && google.accounts) google.accounts.oauth2.revoke(S.tok, () => {}); } catch (_) {}
    S.tok = null; S.exp = 0; wipeLocal();
    if (mode === 'pin') set(KEY.pinReset, '1');
    toast(mode === 'pin' ? 'Signed out — sign in again to reset your PIN' : 'Signed out'); setTimeout(() => location.reload(), 350);
  }
  function signOut() {
    const dirty = get(KEY.dirty) === '1';
    askConfirm(dirty
      ? 'Some changes are not synced yet. EsyPOS will sync them first, then sign you out and clear this device. Your data stays in your Google Drive.'
      : 'You will be signed out and this device will be cleared. Your data stays safe in your Google Drive — sign in again anytime to restore it.',
    async () => {
      if (dirty) {
        toast('Syncing before sign out…');
        const before = Modal.stack.length;
        try { await requestToken(true); await push(); } catch (_) {}
        if (get(KEY.dirty) === '1') {
          if (Modal.stack.length > before) return;   // a "which data to keep?" dialog opened — let the user answer it first
          askConfirm('Sync did not finish. If you sign out now, the unsynced changes will be lost.', () => finishSignOut(), { title: 'Unsynced changes', yes: 'Sign out anyway', danger: true });
          return;
        }
      }
      finishSignOut();
    }, { title: 'Sign out?', yes: 'Sign out', danger: true });
  }
  // Forgot PIN: sign out + clear this device; on the next Google sign-in the data is restored with the PIN removed.
  function resetPin() {
    const dirty = get(KEY.dirty) === '1';
    askConfirm('To reset your PIN, EsyPOS will sign you out and clear this device. Sign in with Google again (internet needed) and your shop data returns from Google Drive without the PIN.' + (dirty ? ' Changes not yet synced may be lost.' : ''),
      async () => {
        if (dirty && validTok()) { try { await push(); } catch (_) {} }
        if (get(KEY.dirty) === '1') {
          askConfirm('Some changes are not synced and will be lost. Reset the PIN anyway?', () => finishSignOut('pin'), { title: 'Unsynced changes', yes: 'Reset anyway', danger: true });
          return;
        }
        finishSignOut('pin');
      }, { title: 'Reset PIN', yes: 'Sign out & reset', danger: true });
  }
  async function pull() {
    try { await requestToken(true); setStatus('syncing'); const f = await findMain(); if (!f) { setStatus('ok'); return toast('No data in cloud yet'); }
      const d = await download(f.id); setStatus('ok');
      askConfirm('Current device data will be replaced by cloud data.', () => { setTimeout(() => applyRemote(d, f), 400); }, { title: 'Restore from cloud?', yes: 'Yes, restore', danger: true });
    } catch (e) { fail(e, true); }
  }
  async function snapshots() {
    try {
      await requestToken(true); setStatus('syncing');
      const list = (await listFiles("name contains '" + SNAP + "' and trashed = false")).sort((a, b) => a.name < b.name ? 1 : -1);
      setStatus(get(KEY.dirty) === '1' ? 'pending' : 'ok');
      const rows = list.length ? list.map(x => {
        const tag = x.name.slice(SNAP.length, -5); const day = /^\d{4}-\d{2}-\d{2}$/.test(tag) ? C.fmtDate(tag + 'T12:00:00') : 'Copy before overwrite';
        return `<div class="row" style="cursor:default"><div class="grow"><div class="t">${esc(day)}</div><div class="s">${C.fmtDT(x.modifiedTime)} · ${Math.round((x.size || 0) / 1024)} KB</div></div><button class="btn btn-sm btn-primary" data-id="${x.id}">Restore</button></div>`;
      }).join('') : '<div class="empty"><i class="fas fa-clock-rotate-left"></i>No old copies yet</div>';
      const m = Modal.open({ title: 'Old backups (cloud)', body: '<p class="xs muted mb3">A snapshot is kept before the first sync each day (last ' + KEEP_SNAPS + ').</p>' + rows });
      m.querySelectorAll('button[data-id]').forEach(b => b.onclick = async () => {
        try {
          const d = await download(b.dataset.id); const f = await findMain();
          askConfirm('Current device data will be replaced by this old copy, which will also become the main cloud data.', () => { Modal.close(m); setTimeout(() => applyRemote(d, f || { id: '', modifiedTime: '' }, true), 400); }, { title: 'Restore old copy?', yes: 'Yes', danger: true });
        } catch (e) { fail(e, true); }
      });
    } catch (e) { fail(e, true); }
  }
  function fail(e, loud) {
    const c = e && (e.code || ''); let st = 'error', msg = '';
    if (c === 'auth' || e.status === 401) st = 'auth';
    else if (c === 'offline' || e instanceof TypeError || !navigator.onLine) st = 'offline';
    else if (/popup|access_denied|interaction|immediate/.test(c)) { st = 'auth'; msg = '⚠️ Sign-in incomplete'; }
    else if (c === 'noclient') { setup(); st = 'off'; }
    else if (c === 'badfile') msg = '⚠️ Cloud file is not valid EsyPOS data';
    else if (e.status === 403) msg = '⚠️ Google Drive API not enabled or no permission — view setup guide';
    else if (e.status === 404) msg = '⚠️ Cloud file not found';
    console.warn('[Cloud]', e);
    setStatus(isOn() ? st : 'off');
    if (loud && st === 'offline') msg = '⚠️ No internet connection';
    if (msg || (loud && st === 'error')) toast(msg || '⚠️ Cloud sync failed (' + (c || e.status || 'error') + ')');
  }
  function setStatus(s) { S.status = s; renderUI(); }
  const timeOf = () => { const l = +get(KEY.last); return l ? C.fmtTime(new Date(l).toISOString()) : ''; };
  function lbl() {
    switch (S.status) {
      case 'ok': return { t: 'Secured in cloud', long: 'Synced' + (timeOf() ? ' · ' + timeOf() : ''), c: 'ok', i: 'fa-cloud' };
      case 'pending': return { t: 'Sync pending', long: 'Changes waiting to sync', c: 'pending', i: 'fa-cloud-arrow-up' };
      case 'syncing': return { t: 'Syncing', long: 'Syncing…', c: 'spin', i: 'fa-rotate' };
      case 'auth': return { t: 'Renew', long: 'Reconnect needed — tap here', c: 'pending pulse', i: 'fa-link-slash' };
      case 'offline': return { t: 'Offline', long: 'Offline — will sync when online', c: 'pending', i: 'fa-wifi' };
      case 'error': return { t: 'Sync failed', long: 'Sync failed — try again', c: 'err', i: 'fa-triangle-exclamation' };
      default: return { t: 'Sign in', long: 'Not connected', c: '', i: 'fa-cloud' };
    }
  }
  const avatar = (big) => { const pic = get(KEY.pic), nm = get(KEY.name) || get(KEY.email) || 'G';
    return pic ? `<img class="g-av ${big ? 'big' : ''}" src="${esc(pic)}" alt="" referrerpolicy="no-referrer">` : `<div class="g-av ${big ? 'big' : ''}">${esc(nm.trim().charAt(0).toUpperCase())}</div>`; };
  const gIcon = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';
  function bodyHTML() {
    if (!isOn()) return `<p class="muted sm mb3">Sign in with Google to auto-save all data to a private folder in your Google Drive. Even if browser data is cleared, signing in again restores everything.</p>
      <button class="btn btn-google btn-block" onclick="Cloud.signIn()">${gIcon} Sign in / Sign up with Google</button>
      <div class="consent-note">By signing in you accept our <a href="terms.html" target="_blank" rel="noopener">Terms of Service</a> &amp; <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</div>
      ${clientId() ? '' : '<div class="note-warn mt3"><i class="fas fa-triangle-exclamation"></i> Client ID is not set. <a href="#" onclick="Cloud.setup();return false">View setup guide</a></div>'}`;
    const l = lbl();
    return `<div class="flex items-c gap3 mb3">${avatar(true)}<div class="grow"><div class="fw7 trunc">${esc(get(KEY.name) || 'Google account')}</div><div class="xs muted trunc">${esc(get(KEY.email))}</div></div></div>
      <div class="sync-line ${l.c}"><i class="fas ${l.i}"></i><span>${l.long}</span></div>
      <div class="grid2 mt3"><button class="btn btn-primary" onclick="Cloud.syncNow()"><i class="fas fa-rotate"></i> Sync now</button><button class="btn btn-ghost" onclick="Cloud.pull()"><i class="fas fa-cloud-arrow-down"></i> Pull from cloud</button></div>
      <div class="mt2"><button class="btn btn-ghost btn-block" onclick="Cloud.snapshots()"><i class="fas fa-clock-rotate-left"></i> Old copies</button></div>
      <button class="btn btn-danger-soft btn-block mt2" onclick="Cloud.signOut()"><i class="fas fa-right-from-bracket"></i> Sign out</button>
      <p class="xs muted mt3">🔒 Data stays only in your Drive's private app folder — the app cannot see any other files. Data changes auto-sync within a few seconds; Google permission may need renewal every hour.</p>`;
  }
  function renderUI() {
    const l = lbl(), on = isOn();
    document.querySelectorAll('.js-chip').forEach(b => { b.className = 'sync-chip js-chip ' + (on ? l.c : ''); b.innerHTML = `<i class="fas ${on ? l.i : 'fa-cloud'}"></i><span class="lbl">${on ? l.t : 'Sign in'}</span>`; });
    document.querySelectorAll('.js-acct').forEach(el => {
      el.innerHTML = on
        ? `<button class="acct" onclick="Cloud.panel()">${avatar()}<span class="grow"><b class="trunc">${esc(get(KEY.name) || get(KEY.email))}</b><small class="${l.c}"><i class="fas ${l.i}"></i> ${l.long}</small></span><i class="fas fa-chevron-right xs muted"></i></button>`
        : `<button class="acct signin" onclick="Cloud.panel()"><span class="g-av g">${gIcon}</span><span class="grow"><b>Sign in with Google</b><small>Keep data safe on Drive</small></span></button>`;
    });
    document.querySelectorAll('.js-cloud-body').forEach(el => { el.innerHTML = bodyHTML(); });
  }
  function panel() {
    const m = Modal.open({ title: 'Google Drive Cloud Backup', body: '<div class="js-cloud-body"></div>' }); renderUI(); return m;
  }
  function closeWelcome() { const w = $('welcome'); if (w) { w.classList.add('out'); setTimeout(() => w.remove(), 250); } document.body.classList.remove('gated'); document.documentElement.classList.remove('needs-login'); if (window.syncLock) syncLock(); }
  function showGate(mode) {
    if ($('welcome')) return;
    const restore = mode === 'restore', resume = mode === 'resume';
    document.body.classList.add('gated');
    const el = document.createElement('div'); el.id = 'welcome'; el.className = 'welcome authgate'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<div class="gate">
      <section class="gate-brand">
        <div class="gate-logo"><img class="logo-img" src="assets/icons/icon-192.png" alt="EsyPOS" draggable="false"></div>
        <h1>EsyPOS</h1>
        <p class="gate-tag">Simple POS for Every Business</p>
        <ul class="gate-feats">
          <li><i class="fas fa-cloud-arrow-up"></i><span><b>Cloud saved</b>Every sale is backed up to your Google Drive</span></li>
          <li><i class="fas fa-mobile-screen-button"></i><span><b>Any device</b>Sign in anywhere and continue where you left off</span></li>
          <li><i class="fas fa-shield-halved"></i><span><b>Private &amp; secure</b>Only you can access your shop data</span></li>
        </ul>
      </section>
      <section class="gate-card">
        <h2>${restore || resume ? 'Welcome back' : 'Sign in to continue'}</h2>
        <p>${resume ? 'Continue as <b>' + esc(get(KEY.email) || 'your Google account') + '</b>. Please verify with Google to open your shop.' : restore ? 'Signed in as <b>' + esc(get(KEY.email)) + '</b>. Restore your shop data from the cloud to continue.' : 'EsyPOS needs a Google account. Sign in to open your shop — your data is stored safely in your own Google Drive.'}</p>
        <button class="btn btn-google btn-block btn-lg" id="w-go">${gIcon} <span>${restore ? 'Restore from cloud' : 'Continue with Google'}</span></button>
        <div class="gate-msg" id="w-msg" role="alert"></div>
        ${restore || resume ? '<button class="gate-link" id="w-other" type="button">Use a different account</button>' : ''}
        <div class="consent-note">By continuing you accept our <a href="terms.html" target="_blank" rel="noopener">Terms of Service</a> &amp; <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</div>
        <div class="consent-note"><a href="features.html">Features &amp; FAQ</a> · <a href="bn.html">বাংলা</a></div>
        ${clientId() ? '' : '<div class="note-warn mt3"><i class="fas fa-triangle-exclamation"></i> Google Client ID is not set. <a href="#" onclick="Cloud.setup();return false">View setup guide</a></div>'}
      </section>
    </div>`;
    document.body.appendChild(el);
    const go = el.querySelector('#w-go'), msg = el.querySelector('#w-msg');
    const note = () => { msg.textContent = navigator.onLine ? '' : 'No internet connection. Connect to the internet to sign in.'; };
    if (clientId() && navigator.onLine) loadGIS().catch(() => {});
    note(); window.addEventListener('online', note); window.addEventListener('offline', note);
    go.onclick = async () => {
      if (!navigator.onLine) { note(); return; }
      go.disabled = true; go.classList.add('busy'); msg.textContent = '';
      await signIn(false);
      const g = $('w-go'); if (g && !el.classList.contains('out')) { g.disabled = false; g.classList.remove('busy'); msg.textContent = navigator.onLine ? 'Sign-in was not completed. Please try again.' : 'No internet connection. Connect to the internet to sign in.'; }
    };
    const other = el.querySelector('#w-other'); if (other) other.onclick = () => { if (resume) signOut(); else finishSignOut(); };
    if (window.syncLock) syncLock();
  }
  function setup() {
    const cur = get(KEY.client) || '';
    const m = Modal.open({ title: 'Google Sign-in setup', body: `
      <p class="sm muted mb3">One-time setup (free). Then put the Client ID in <code>js/core/config.js</code> and upload the app to GitHub/your server.</p>
      <ol class="guide sm">
        <li>Open <b>console.cloud.google.com</b> and create a new project.</li>
        <li><b>APIs &amp; Services → Library</b>: enable the <b>Google Drive API</b>.</li>
        <li><b>OAuth consent screen</b>: User type = External, Enter app name. Add the scopes <code>drive.appdata</code>, <code>email</code>, <code>profile</code>, <code>openid</code>. Finally <b>Publish app (In production)</b> — these scopes do not require Google verification.</li>
        <li><b>Credentials → Create credentials → OAuth client ID → Web application</b>.</li>
        <li><b>Authorized JavaScript origins</b> — enter your site address (no path, no trailing /):<br><code class="sel">${esc(location.origin)}</code></li>
        <li>Copy the Client ID you get (<code>…apps.googleusercontent.com</code>) into <code>js/core/config.js</code>.</li>
      </ol>
      <div class="field mt3"><label class="label">Quick test — paste Client ID here (saved only in this browser)</label><input id="cl-id" class="input" placeholder="xxxx.apps.googleusercontent.com" value="${esc(cur)}"></div>
      <p class="xs muted">⚠️ For permanent use put it in <code>js/core/config.js</code> — otherwise clearing browser data also removes this ID.</p>`,
      foot: '<button class="btn" onclick="Modal.closeFrom(this)">Close</button><button class="btn btn-primary" id="cl-save">Save</button>' });
    m.querySelector('#cl-save').onclick = () => { const v = m.querySelector('#cl-id').value.trim(); if (v) set(KEY.client, v); else del(KEY.client); Modal.close(m); toast('✓ Client ID saved'); renderUI(); if (clientId()) loadGIS().catch(() => {}); };
  }
  let inited = false;
  function init() {
    if (inited) { renderUI(); return; } inited = true;
    if (isOn()) {
      S.status = get(KEY.dirty) === '1' ? 'pending' : 'ok';
      // Only offer "Restore" when this account has synced before (so a cloud copy exists). A brand-new empty shop just opens.
      if (!hasLocal() && get(KEY.rev)) { del(KEY.rev); showGate('restore'); }
      else if (navigator.onLine && !validTok()) showGate('resume');
      else if (get(KEY.dirty) === '1') { setStatus(validTok() ? 'pending' : 'auth'); if (validTok()) S.timer = setTimeout(() => push(), 3000); }
    } else showGate('new');
    renderUI();
    if (clientId() && navigator.onLine) loadGIS().catch(() => {});
    window.addEventListener('online', () => { if (isOn() && get(KEY.dirty) === '1') { if (validTok()) { setStatus('pending'); push(); } else setStatus('auth'); } });
    window.addEventListener('offline', () => { if (isOn()) renderUI(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && isOn() && get(KEY.dirty) === '1' && validTok()) push(); });
  }
  window.Cloud = { init, markDirty, signIn, signOut, resetPin, syncNow, pull, snapshots, panel, setup, renderUI, isOn };
  if (!isOn()) showGate('new'); else if (navigator.onLine && !validTok()) showGate('resume');
  window.addEventListener('storage', e => { if (e.key === KEY.on && e.newValue !== '1') location.reload(); });
})();
