/* Old POS App Shell (v11.4.0): makes the software feel like a native app.
   Phone  → installed-app feel: no pull-to-refresh bounce, no text-selection on buttons, press feedback, safe areas.
   Desktop → window feel: a title bar with the page name and a New sale button, plus keyboard shortcuts. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  const root = document.documentElement;
  if (standalone()) root.classList.add('is-app');

  function bar() {
    const main = document.querySelector('.main'); if (!main || $('desk-bar')) return;
    const b = document.createElement('div'); b.id = 'desk-bar'; b.className = 'desk-bar';
    b.innerHTML = `<div class="db-title"><b id="db-page">Dashboard</b></div>
      <div class="db-actions"><button type="button" class="sync-chip js-chip" onclick="Cloud.chip()" title="Back up to Google Drive"><i class="fas fa-cloud-arrow-up"></i><span class="lbl">Backup</span></button><span class="db-tg"></span>
      <button type="button" id="db-sell" class="btn btn-primary btn-sm" onclick="App.go('pos')"><i class="fas fa-cash-register"></i> New sale</button></div>`;
    main.insertBefore(b, main.firstChild);
    title(); if (window.Community && Community.fill) Community.fill();
  }

  function title() {
    const p = $('db-page'); if (!p) return;
    const a = document.querySelector('#nav-desk .nav-link.active');
    const t = App.view === 'pos' ? 'Sales Counter' : App.view === 'users' ? 'Users' : (a ? a.textContent.trim() : ''); if (t) p.textContent = t;
    shopName();
  }

  /* Phone header: shop name (first word in the brand colour) + tagline, like an installed app */
  function shopName() {
    const el = $('tb-shop'); if (!el || !window.Core) return;
    const n = String(Core.DB.settings.shopName || 'Old POS').trim() || 'Old POS', parts = n.split(/\s+/), first = parts.shift();
    const h = '<em>' + Core.esc(first) + '</em>' + (parts.length ? ' ' + Core.esc(parts.join(' ')) : '');
    if (el.dataset.n !== n) { el.innerHTML = h; el.dataset.n = n; }
    const sub = $('tb-sub'); if (sub && !sub.dataset.set) { sub.textContent = 'Smart POS & Billing'; sub.dataset.set = '1'; }
  }
  window.addEventListener('esypos:saved', shopName);

  function hookGo() {
    if (!window.App || App._shell) return; App._shell = 1;
    const g = App.go; App.go = function () { const r = g.apply(this, arguments); setTimeout(title, 30); return r; };
  }

  /* Keyboard shortcuts for desktop: Ctrl/⌘+L lock · Alt+1..5 jump to Dashboard / Sales / Products / Customers / Reports */
  const MAP = { '1': 'dashboard', '2': 'pos', '3': 'products', '4': 'customers', '5': 'reports' };
  document.addEventListener('keydown', e => {
    const tag = (e.target && e.target.tagName) || '';
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'l' && !/INPUT|TEXTAREA|SELECT/.test(tag)) {
      if (window.Lock && Lock.has && Lock.has()) { e.preventDefault(); Lock.lockNow(); }
    } else if (e.altKey && !e.ctrlKey && !e.metaKey && MAP[e.key] && window.App && App.Views && App.Views[MAP[e.key]]) {
      e.preventDefault(); App.go(MAP[e.key]);
    }
  });

  /* Stop the browser's own pinch / double-tap zoom on the app chrome (inputs still zoom-safe: font-size ≥ 16px on phones) */
  document.addEventListener('gesturestart', e => e.preventDefault());

  function init() { bar(); hookGo(); shopName(); setInterval(shopName, 4000); setTimeout(hookGo, 500); setTimeout(title, 800); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
