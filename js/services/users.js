/* Old POS Users (v12.1.1): total real users + a 30-day history (new users per day, visits per day).
   - Only genuine users are counted: a device must be signed in, and bots / headless browsers are ignored.
     One device = one user (the id comes from Safety.deviceId), so logging out and in again never counts twice.
   - No "active now", no country / city, no network-address lookup and no heartbeat — fewer requests, more privacy.
   - Free mode (default): two tiny public counters per day — `joined-YYYY-MM-DD` (a device is counted once, the first
     time it is seen) and `visit-YYYY-MM-DD` (a device is counted once per day). History starts from this version.
   - With `userCounterUrl` (Firebase Realtime Database, see README) the join date of every device is stored, so the
     "new users per day" chart is exact for the whole history. */
(function () {
  'use strict';
  const LS = { get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} } };
  const cfg = () => window.PROPOS_CONFIG || {};
  const base = () => ((cfg().userCounterUrl) || '').trim().replace(/\/+$/, '');
  const ABACUS = 'https://abacus.jasoncameron.dev', NS_ = 'oldpos.github.io';
  const DAYS = 30, TZ_H = 6;                                   // days shown · day boundary = Bangladesh time (UTC+6)
  const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|phantom|puppeteer|playwright/i;
  const dayKey = ms => new Date(ms + TZ_H * 36e5).toISOString().slice(0, 10);
  const fmt = n => (n || 0).toLocaleString('en-US');

  function real() {
    try { if (navigator.webdriver) return false; if (BOT.test(navigator.userAgent || '')) return false; } catch (_) {}
    return !!(window.Cloud && Cloud.isOn && Cloud.isOn());
  }
  async function jget(url, ms) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), ms || 8000);
    try { const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' }); if (!r.ok) return r.status === 404 ? { value: 0 } : null; return await r.json(); } catch (_) { return null; } finally { clearTimeout(to); }
  }
  async function jsend(method, url, body) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
    try { const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal }); return r.ok; } catch (_) { return false; } finally { clearTimeout(to); }
  }
  const num = j => { const n = parseInt(j && (j.value !== undefined ? j.value : j.count), 10); return isNaN(n) ? 0 : n; };

  /* ---- sidebar / menu number ---- */
  function paint() {
    const off = parseInt(cfg().userCountOffset, 10) || 0, n = (parseInt(LS.get('esypos_uc') || '0', 10) || 0) + off;
    document.querySelectorAll('.js-ucount').forEach(e => { e.textContent = n > 0 ? n.toLocaleString('en-US') : '—'; });
  }

  /* ---- recording (signed-in real devices only, at most once per day / once ever) ---- */
  async function visit() {
    if (!real() || !navigator.onLine) return;
    const today = dayKey(Date.now()); if (LS.get('esypos_vd') === today) return;
    const dev = window.Safety ? await Safety.deviceId() : null; if (!dev) return;
    const b = base();
    const ok = b ? await fbVisit(dev, today) : !!(await jget(ABACUS + '/hit/' + NS_ + '/visit-' + today, 8000));
    if (ok) LS.set('esypos_vd', today);
  }
  /* ---- exact mode (Firebase, v12.1.3) ----
     One USER = one Google account. The key is SHA-256("oldpos:" + e-mail) — the e-mail itself is never sent or stored. Clearing data, a new phone,
     a second device or a re-install all map to the same key, and two phones of the same model can never collide.
     Every change is ONE atomic multi-path update that the database rules only accept when the user record does not exist yet, so the total
     goes up exactly once per user, even with parallel tabs/devices, retries or flaky networks (a rejected/duplicate write changes nothing). */
  async function fbGet(url) {                           // {ok:false} = network/permission problem · {ok:true, v:null} = the record really does not exist
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 9000);
    try { const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' }); if (!r.ok) return { ok: false }; return { ok: true, v: await r.json() }; } catch (_) { return { ok: false }; } finally { clearTimeout(to); }
  }
  const INC = { '.sv': { increment: 1 } };
  async function sha256hex(str) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)); return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join(''); }
  async function userKey(dev) {
    try { const em = (LS.get('esypos_g_email') || '').trim().toLowerCase(); if (em && em.indexOf('@') > 0 && window.crypto && crypto.subtle) return await sha256hex('oldpos:' + em); } catch (_) {}
    return (dev + dev).slice(0, 64);                     // no e-mail / no crypto: fall back to the device id (still unique, never collides)
  }
  async function fbRegister(dev) {
    const b = base(), uid = await userKey(dev), now = Date.now(), day = dayKey(now);
    if (LS.get('esypos_uc_uid') === uid) {              // already registered: only refresh "last seen" (at most once per day)
      if (LS.get('esypos_uc_seen') !== day && await jsend('PATCH', b + '/users/' + uid + '.json', { l: now })) LS.set('esypos_uc_seen', day);
      return;
    }
    const known = await fbGet(b + '/users/' + uid + '/t.json');               // registered earlier from another device / before a data wipe?
    if (!known.ok) return;                                                   // network problem → try again next time (never guess)
    if (typeof known.v === 'number') { LS.set('esypos_uc_uid', uid); return; }
    // devices counted by older versions are already inside the number the owner keeps in userCountOffset → record them, but do not add them again
    const legacy = LS.get('esypos_uc_reg') === '1' || !!LS.get('esypos_uc_dev');
    const upd = { ['users/' + uid]: { t: now, l: now, d: dev.slice(0, 8), g: legacy ? 1 : 0 } };
    if (!legacy) { upd['stats/total'] = INC; upd['daily/' + day + '/j'] = INC; }
    if (await jsend('PATCH', b + '/.json', upd)) LS.set('esypos_uc_uid', uid);
    else { const t2 = await fbGet(b + '/users/' + uid + '/t.json'); if (t2.ok && typeof t2.v === 'number') LS.set('esypos_uc_uid', uid); }   // lost a race with another device → already counted
  }
  async function fbVisit(dev, today) {
    const b = base(), uid = await userKey(dev);
    const ok = await jsend('PATCH', b + '/.json', { ['visits/' + today + '/' + uid]: 1, ['daily/' + today + '/v']: INC });
    if (ok) return true;
    const ex = await fbGet(b + '/visits/' + today + '/' + uid + '.json');        // rejected because it already exists = already counted today
    return ex.ok && ex.v === 1;
  }
  async function fbTotal() {
    const r = await fbGet(base() + '/stats/total.json');
    if (r.ok) LS.set('esypos_uc', String(typeof r.v === 'number' ? r.v : 0));
  }

  /* ---- history for the Users page ---- */
  function lastDays() { const out = [], now = Date.now(); for (let i = DAYS - 1; i >= 0; i--) out.push(dayKey(now - i * 864e5)); return out; }
  async function history(kind) {                              // kind: 'join' | 'visit' → [{d, n}] oldest → newest
    const days = lastDays(), b = base(), ck = 'esypos_h_' + kind;
    try { const c = JSON.parse(LS.get(ck) || 'null'); if (c && Date.now() - c.t < 120000 && c.d0 === days[0]) return c.v; } catch (_) {}
    let counts = days.map(() => 0), okAny = false;
    if (b) {
      const d = await jget(b + '/daily.json?orderBy=%22%24key%22&startAt=%22' + days[0] + '%22', 12000);
      if (d && typeof d === 'object') { okAny = true; days.forEach((k, i) => { counts[i] = (d[k] && parseInt(d[k][kind === 'join' ? 'j' : 'v'], 10)) || 0; }); }
    } else {
      const prefix = kind === 'join' ? 'joined-' : 'visit-';
      const res = await Promise.all(days.map(k => jget(ABACUS + '/get/' + NS_ + '/' + prefix + k, 7000)));
      res.forEach((j, i) => { if (j) { okAny = true; counts[i] = num(j); } });
    }
    const v = days.map((d, i) => ({ d, n: counts[i] }));
    if (okAny) LS.set(ck, JSON.stringify({ t: Date.now(), d0: days[0], v }));
    return okAny ? v : null;
  }

  const Users = window.Users = {
    real, paint, exact() { return !!base(); }, userKey,
    open() { try { if (window.App) { App.closeDrawers(); App.go('users'); } } catch (_) {} },
    /* called by guard.js when this device was counted for the very first time */
    async noteJoin() {
      if (!real() || base()) return;
      const today = dayKey(Date.now());
      if (LS.get('esypos_jd') === today) return;
      if (await jget(ABACUS + '/hit/' + NS_ + '/joined-' + today, 8000)) LS.set('esypos_jd', today);
    },
    /* called by guard.js: Firebase mode registers the device */
    async sync() {
      if (!base() || !real()) return;
      const dev = window.Safety ? await Safety.deviceId() : null; if (!dev) return;
      await fbRegister(dev); await fbTotal(); paint();
    }
  };

  /* ---- Users page ---- */
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const nice = k => { const p = k.split('-'); return parseInt(p[2], 10) + ' ' + MON[parseInt(p[1], 10) - 1]; };
  let seq = 0, tab = 'join';

  const view = {
    render() {
      const my = ++seq, el = document.getElementById('view'); if (!el) return;
      const total = (parseInt(LS.get('esypos_uc') || '0', 10) || 0) + (parseInt(cfg().userCountOffset, 10) || 0);
      el.innerHTML = `<div class="usr">
        <div class="usr-head"><p>New users and visits over the last ${DAYS} days.<br><small class=\"usr-mode\">${base() ? 'Exact counter · one Google account = one user' : 'Free public counter · approximate. Add a Firebase database in config.js for an exact count.'}</small></p><button type="button" class="btn btn-sm usr-rf" onclick="App.Views.users.render()"><i class="fas fa-rotate"></i> Refresh</button></div>
        <div class="usr-cards" id="usr-cards"><div class="usr-card"><div><div class="uc-k">Total users</div><div class="uc-v">${total > 0 ? fmt(total) : '—'}</div></div></div></div>
        <section class="usr-panel"><header><div class="usr-tabs" role="tablist"><button type="button" role="tab" data-t="join" class="${tab === 'join' ? 'on' : ''}">New users</button><button type="button" role="tab" data-t="visit" class="${tab === 'visit' ? 'on' : ''}">Visits</button></div><span id="usr-sum"></span></header>
        <div id="usr-chart" class="usr-chart"><div class="usr-loading"><span class="ld-ring"></span> Loading…</div></div></section></div>`;
      el.querySelectorAll('.usr-tabs button').forEach(b => b.onclick = () => { tab = b.dataset.t; view.render(); });
      Promise.all([history('join'), history('visit')]).then(([j, v]) => {
        if (my !== seq || App.view !== 'users') return;
        const cur = tab === 'join' ? j : v, cards = document.getElementById('usr-cards'), chart = document.getElementById('usr-chart'), sum = document.getElementById('usr-sum');
        if (!cards || !chart) return;
        const sumOf = a => a ? a.reduce((s, x) => s + x.n, 0) : 0, today = j && j.length ? j[j.length - 1].n : 0;
        cards.innerHTML = card('Total users', total > 0 ? fmt(total) : '—', 'All users') + card('Joined in ' + DAYS + ' days', j ? fmt(sumOf(j)) : '—', 'New users') + card('Joined today', j ? fmt(today) : '—', 'New users') + card('Visits today', v && v.length ? fmt(v[v.length - 1].n) : '—', 'Devices that opened the app');
        sum.textContent = cur ? fmt(sumOf(cur)) + ' in ' + DAYS + ' days' : '';
        chart.innerHTML = cur ? bars(cur, tab === 'join' ? 'new user' : 'visit') : '<div class="usr-empty"><h3>Could not load</h3><p>Check your internet connection and tap Refresh.</p></div>';
        wire(chart);
      });
    }
  };
  const card = (k, v, s) => `<div class="usr-card"><div><div class="uc-k">${k}</div><div class="uc-v">${v}</div><div class="uc-s">${s}</div></div></div>`;
  function bars(arr, word) {
    const max = Math.max(1, ...arr.map(x => x.n)), any = arr.some(x => x.n > 0);
    const cols = arr.map((x, i) => `<button type="button" class="ub${i === arr.length - 1 ? ' today' : ''}${x.n ? '' : ' zero'}" data-i="${i}" aria-label="${nice(x.d)}: ${x.n} ${word}${x.n === 1 ? '' : 's'}"><i style="height:${x.n ? Math.max(6, x.n / max * 100) : 2}%"></i></button>`).join('');
    return `<div class="usr-read" id="usr-read">${any ? 'Tap a bar to see the day' : 'No data yet — numbers appear here day by day.'}</div><div class="usr-bars" data-w="${word}">${cols}</div><div class="usr-axis"><span>${nice(arr[0].d)}</span><span>${nice(arr[Math.floor(arr.length / 2)].d)}</span><span>${nice(arr[arr.length - 1].d)}</span></div>`.replace('<div class="usr-bars"', '<div class="usr-bars" data-arr=\'' + JSON.stringify(arr) + '\'');
  }
  function wire(chart) {
    const bx = chart.querySelector('.usr-bars'); if (!bx) return; const arr = JSON.parse(bx.dataset.arr), w = bx.dataset.w, rd = chart.querySelector('#usr-read');
    const show = i => { const x = arr[i]; rd.innerHTML = '<b>' + fmt(x.n) + '</b> ' + w + (x.n === 1 ? '' : 's') + ' · ' + nice(x.d); bx.querySelectorAll('.ub').forEach((b, k) => b.classList.toggle('sel', k === i)); };
    bx.querySelectorAll('.ub').forEach(b => { b.onclick = () => show(+b.dataset.i); b.onmouseenter = () => show(+b.dataset.i); });
    if (arr.some(x => x.n > 0)) show(arr.length - 1);
  }
  function register() { if (window.App && App.Views && !App.Views.users) { App.Views.users = view; return true; } return !!(window.App && App.Views && App.Views.users); }

  function start() {
    register(); paint();
    setTimeout(visit, 4000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') visit(); });
    setInterval(paint, 15000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0)); else setTimeout(start, 0);
})();
