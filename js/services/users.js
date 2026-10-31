/* Old POS Users (v12.1.0): real-user counter, live "active now" count and the Users details page.
   - Only genuine users are counted: a device must be signed in, and bots / headless browsers are ignored.
     One device = one user (the id comes from Safety.deviceId), so logging out and in again never counts twice.
   - Active now = devices that sent a heartbeat in the last 2 minutes while the app is open.
   - The details page (Sidebar → Total users) shows countries and cities. Only the country and city (from the network
     address, never an exact location) are stored, together with a random device id — no name, e-mail or shop data.
   - With `userCounterUrl` (Firebase Realtime Database) in js/core/config.js everything is exact and the details page is full.
     Without it, the free public counters still give the total and a live active count. See README for the database rules. */
(function () {
  'use strict';
  const LS = { get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} } };
  const cfg = () => window.PROPOS_CONFIG || {};
  const base = () => ((cfg().userCounterUrl) || '').trim().replace(/\/+$/, '');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ACTIVE_MS = 120000, BEAT_MS = 45000;
  const ABACUS = 'https://abacus.jasoncameron.dev', NS_ = 'oldpos.github.io';
  const BUCKET = 300000;                                       // free-counter mode: one 5-minute bucket per heartbeat

  /* A real person on a signed-in device (not a crawler, preview bot or automated browser) */
  const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|phantom|puppeteer|playwright/i;
  function real() {
    try { if (navigator.webdriver) return false; if (BOT.test(navigator.userAgent || '')) return false; } catch (_) {}
    return !!(window.Cloud && Cloud.isOn && Cloud.isOn());
  }
  const platform = () => { const u = navigator.userAgent || ''; return /Android/i.test(u) ? 'Android' : /iPhone|iPad|iPod/i.test(u) ? 'iOS' : /Windows/i.test(u) ? 'Windows' : /Mac/i.test(u) ? 'macOS' : /Linux/i.test(u) ? 'Linux' : 'Other'; };

  async function jget(url, ms) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), ms || 8000);
    try { const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' }); if (!r.ok) return null; return await r.json(); } catch (_) { return null; } finally { clearTimeout(to); }
  }
  async function jsend(method, url, body, keepalive) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
    try { const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal, keepalive: !!keepalive }); return r.ok; } catch (_) { return false; } finally { clearTimeout(to); }
  }

  /* ---- coarse location: country + city only, cached for a week ---- */
  let geoP = null;
  function geo() {
    if (geoP) return geoP;
    geoP = (async () => {
      try { const c = JSON.parse(LS.get('esypos_geo') || 'null'); if (c && c.c && Date.now() - c.t < 7 * 864e5) return c; } catch (_) {}
      let g = null;
      const a = await jget('https://get.geojs.io/v1/ip/geo.json', 6000);
      if (a && a.country_code) g = { c: String(a.country_code).toUpperCase(), cn: a.country || a.country_code, ci: a.city || '' };
      if (!g) { const b = await jget('https://ipwho.is/', 6000); if (b && b.success !== false && b.country_code) g = { c: String(b.country_code).toUpperCase(), cn: b.country || b.country_code, ci: b.city || '' }; }
      if (g) { g.t = Date.now(); LS.set('esypos_geo', JSON.stringify(g)); return g; }
      return { c: '', cn: '', ci: '', t: 0 };
    })();
    geoP.then(g => { if (!g.c) geoP = null; });                // retry later when it failed
    return geoP;
  }

  /* ---- numbers shown in the sidebar / menu / landing page ---- */
  function paint() {
    const off = parseInt(cfg().userCountOffset, 10) || 0;
    const n = (parseInt(LS.get('esypos_uc') || '0', 10) || 0) + off, a = parseInt(LS.get('esypos_ua') || '0', 10) || 0;
    document.querySelectorAll('.js-ucount').forEach(e => { e.textContent = n > 0 ? n.toLocaleString('en-US') : '—'; });
    document.querySelectorAll('.js-acount').forEach(e => { e.textContent = a > 0 ? a.toLocaleString('en-US') : (real() ? '1' : '—'); });
  }

  /* ---- Firebase mode ---- */
  async function fbRegister(dev) {
    const b = base(), g = await geo(), now = Date.now();
    const rec = { l: now, p: platform() }; if (g.c) { rec.c = g.c; rec.cn = g.cn; rec.ci = g.ci; }
    const first = LS.get('esypos_uc_dev') !== dev;
    const ok = first ? await jsend('PATCH', b + '/devices/' + dev + '.json', Object.assign({ t: now }, rec)) : await jsend('PATCH', b + '/devices/' + dev + '.json', rec);
    if (ok) LS.set('esypos_uc_dev', dev);
  }
  async function fbTotal() {
    const j = await jget(base() + '/devices.json?shallow=true', 9000);
    if (j !== undefined && j !== null) LS.set('esypos_uc', String(Object.keys(j).length));
    else if (j === null) { /* empty database or offline: keep last known */ }
  }
  async function fbBeat(dev) {
    const b = base(), g = await geo();
    await jsend('PUT', b + '/presence/' + dev + '.json', { t: Date.now(), c: g.c || '', ci: g.ci || '' });
  }
  async function fbActive() {
    const j = await jget(base() + '/presence.json?orderBy=%22t%22&startAt=' + (Date.now() - ACTIVE_MS), 8000);
    if (j && typeof j === 'object') { const n = Object.keys(j).length; LS.set('esypos_ua', String(n)); return j; }
    return null;
  }

  /* ---- free-counter mode (no database): total from guard.js, active from 5-minute buckets ---- */
  async function ctBeat() {
    const bk = Math.floor(Date.now() / BUCKET);
    if (LS.get('esypos_ua_b') !== String(bk)) {
      const j = await jget(ABACUS + '/hit/' + NS_ + '/active-' + bk, 8000);
      if (j) LS.set('esypos_ua_b', String(bk));
    }
  }
  async function ctActive() {
    const bk = Math.floor(Date.now() / BUCKET);
    const v = j => { const n = parseInt(j && (j.value !== undefined ? j.value : j.count), 10); return isNaN(n) ? 0 : n; };
    const [a, b] = await Promise.all([jget(ABACUS + '/get/' + NS_ + '/active-' + bk, 6000), jget(ABACUS + '/get/' + NS_ + '/active-' + (bk - 1), 6000)]);
    const n = Math.max(v(a), v(b)); if (n > 0) LS.set('esypos_ua', String(n));
  }

  let busy = false;
  async function tick() {
    if (busy || !real() || !navigator.onLine || document.visibilityState !== 'visible') { paint(); return; }
    busy = true;
    try {
      const dev = window.Safety ? await Safety.deviceId() : null; if (!dev) return;
      if (base()) { await fbBeat(dev); await fbActive(); }
      else { await ctBeat(); await ctActive(); }
    } catch (_) {} finally { busy = false; paint(); if (window.App && App.view === 'users' && Users._live) Users._live(); }
  }

  const Users = window.Users = {
    real, paint,
    open() { try { if (window.App) { App.closeDrawers(); App.go('users'); } } catch (_) {} },
    /* called by guard.js: registers this device (signed-in real users only) and refreshes the total */
    async sync() {
      if (!base() || !real()) return;
      const dev = window.Safety ? await Safety.deviceId() : null; if (!dev) return;
      await fbRegister(dev); await fbTotal(); paint();
    },
    async load() {
      const b = base(), out = { live: !!b, total: parseInt(LS.get('esypos_uc') || '0', 10) || 0, active: parseInt(LS.get('esypos_ua') || '0', 10) || 0, countries: [], activeList: [], today: 0, week: 0 };
      if (!b) return out;
      const [d, pr] = await Promise.all([jget(b + '/devices.json?orderBy=%22l%22&limitToLast=5000', 12000), fbActive()]);
      const map = new Map(); const now = Date.now(), day = new Date(); day.setHours(0, 0, 0, 0);
      if (d && typeof d === 'object') {
        const arr = Object.values(d);
        out.total = Math.max(out.total, arr.length);
        arr.forEach(x => {
          if (!x) return; if (x.t >= day.getTime()) out.today++; if (x.t >= now - 7 * 864e5) out.week++;
          const code = x.c || '??', name = x.cn || 'Unknown';
          let c = map.get(code); if (!c) { c = { code, name, n: 0, active: 0, cities: new Map() }; map.set(code, c); }
          c.n++; const cn = x.ci || 'Unknown city'; let ct = c.cities.get(cn); if (!ct) { ct = { name: cn, n: 0, active: 0 }; c.cities.set(cn, ct); } ct.n++;
        });
      }
      if (pr) Object.values(pr).forEach(x => {
        const code = (x && x.c) || '??'; const c = map.get(code); if (c) { c.active++; const ct = c.cities.get((x && x.ci) || 'Unknown city'); if (ct) ct.active++; }
        out.activeList.push({ c: code, ci: (x && x.ci) || '' });
      });
      out.active = Math.max(out.active, out.activeList.length);
      out.countries = [...map.values()].sort((a, b) => b.n - a.n).map(c => Object.assign(c, { cities: [...c.cities.values()].sort((a, b) => b.n - a.n) }));
      return out;
    }
  };

  /* ---- Users details page ---- */
  const I = {
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/><path d="M3 12A9 9 0 0 1 18.5 5.8L21 8"/><path d="M21 3v5h-5"/>'
  };
  const svg = (n, z) => '<svg viewBox="0 0 24 24" width="' + (z || 20) + '" height="' + (z || 20) + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[n] + '</svg>';
  const fmt = n => (n || 0).toLocaleString('en-US');
  const flag = code => /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65)) : '';
  let seq = 0;

  const view = {
    _t: null,
    render() {
      const my = ++seq; clearInterval(this._t);
      const el = document.getElementById('view'); if (!el) return;
      const total = parseInt(LS.get('esypos_uc') || '0', 10) || 0, act = parseInt(LS.get('esypos_ua') || '0', 10) || 0;
      el.innerHTML = `<div class="usr">
        <div class="usr-head"><div><p>Who is using Old POS, and where from. Only the country and city are shown — never names or shop data.</p></div>
          <button type="button" class="btn btn-sm usr-rf" id="usr-rf" onclick="App.Views.users.render()">${svg('refresh', 16)} Refresh</button></div>
        <div class="usr-cards" id="usr-cards">${this.cards({ total, active: act, today: 0, week: 0, countries: [] }, true)}</div>
        <div id="usr-body" class="usr-body"><div class="usr-loading"><span class="spin"></span> Loading…</div></div></div>`;
      const run = async () => {
        const d = await Users.load(); if (my !== seq || App.view !== 'users') return;
        const c = document.getElementById('usr-cards'), b = document.getElementById('usr-body'); if (!c || !b) return;
        c.innerHTML = this.cards(d, false); b.innerHTML = this.body(d); paint();
      };
      run(); this._t = setInterval(() => { if (App.view !== 'users') clearInterval(view._t); else if (document.visibilityState === 'visible') run(); }, 30000);
    },
    cards(d, wait) {
      const card = (cls, ic, k, v, s) => `<div class="usr-card ${cls}"><span class="uc-i">${svg(ic, 22)}</span><div><div class="uc-k">${k}</div><div class="uc-v">${wait && !v ? '…' : fmt(v)}</div><div class="uc-s">${s}</div></div></div>`;
      return card('uc-total', 'users', 'Total users', d.total, 'Real signed-in devices') +
        card('uc-live', 'pulse', 'Active now', d.active, '<span class="live-dot"></span> Live · last 2 minutes') +
        card('uc-new', 'plus', 'New today', d.today, d.live ? fmt(d.week) + ' in the last 7 days' : 'Needs live tracking') +
        card('uc-geo', 'globe', 'Countries', d.countries.filter(c => c.code !== '??').length, d.live ? 'Where Old POS is used' : 'Needs live tracking');
    },
    body(d) {
      if (!d.live) return `<div class="usr-empty"><span>${svg('globe', 30)}</span><h3>Country &amp; city details are not switched on</h3><p>The total and the live active count above are working. To also see countries and cities, connect the live database (<code>userCounterUrl</code> in <code>js/core/config.js</code>) as described in the README.</p></div>`;
      if (!d.countries.length) return `<div class="usr-empty"><span>${svg('globe', 30)}</span><h3>No location data yet</h3><p>Countries and cities appear here as signed-in devices open the app.</p></div>`;
      const max = d.countries[0].n || 1;
      const rows = d.countries.map(c => `<details class="ctry"><summary><span class="ct-flag">${flag(c.code) || esc(c.code)}</span><span class="ct-n"><b>${esc(c.name)}</b><small>${c.cities.length} cit${c.cities.length === 1 ? 'y' : 'ies'}</small></span>
          <span class="ct-bar"><i style="width:${Math.max(3, c.n / max * 100)}%"></i></span>${c.active ? `<span class="ct-act"><span class="live-dot"></span>${fmt(c.active)} live</span>` : '<span class="ct-act off"></span>'}<b class="ct-c">${fmt(c.n)}</b><i class="fas fa-chevron-right ct-chev"></i></summary>
          <div class="ct-cities">${c.cities.map(x => `<div class="ct-city">${svg('pin', 14)}<span>${esc(x.name)}</span>${x.active ? `<em><span class="live-dot"></span>${fmt(x.active)} live</em>` : ''}<b>${fmt(x.n)}</b></div>`).join('')}</div></details>`).join('');
      const live = {}; d.activeList.forEach(x => { const k = (x.ci || 'Unknown city') + '|' + x.c; live[k] = (live[k] || 0) + 1; });
      const liveRows = Object.entries(live).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => { const [ci, c] = k.split('|'); return `<div class="lv-row"><span class="ct-flag sm">${flag(c) || esc(c)}</span><span>${esc(ci)}</span><b>${fmt(n)}</b></div>`; }).join('');
      return `<div class="usr-grid"><section class="usr-panel"><header><h2>Countries &amp; cities</h2><span>${fmt(d.countries.length)} total</span></header><div class="ctry-list">${rows}</div></section>
        <section class="usr-panel usr-side"><header><h2><span class="live-dot"></span> Live right now</h2><span>${fmt(d.active)}</span></header>${liveRows ? `<div class="lv-list">${liveRows}</div>` : '<div class="wc-empty"><i class="fas fa-moon"></i><span>No one else is online at this moment</span></div>'}</section></div>`;
    }
  };
  function register() { if (window.App && App.Views && !App.Views.users) { App.Views.users = view; Users._view = view; return true; } return !!(window.App && App.Views && App.Views.users); }

  function start() {
    register(); paint();
    setTimeout(tick, 2500);
    setInterval(tick, BEAT_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
    window.addEventListener('online', tick);
    window.addEventListener('pagehide', () => { try { if (base() && real()) { const dev = LS.get('esypos_uc_dev'); if (dev) fetch(base() + '/presence/' + dev + '.json', { method: 'DELETE', keepalive: true }); } } catch (_) {} });
    setInterval(paint, 5000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0)); else setTimeout(start, 0);
})();
