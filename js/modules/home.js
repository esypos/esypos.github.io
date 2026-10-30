/* Old POS: mobile bottom navigation (Dashboard · Products · New sale · Customers · Menu). The app opens on the Dashboard. */
(function () {
  'use strict';
  const { toast } = Core;

  /* Outline icon set (24px, currentColor) so every icon has the same weight and size on every device */
  const P = {
    cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3h2.2l2.3 11.2a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 2-1.5L21 7H5.6"/><path d="M12.5 9.5h4M14.5 7.5v4"/>',
    box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m7.5 4.27 9 5.15"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 7v10M12 7v10M16 7v10"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    dash: '<rect width="7" height="9" x="3" y="3" rx="1.5"/><rect width="7" height="5" x="14" y="3" rx="1.5"/><rect width="7" height="9" x="14" y="12" rx="1.5"/><rect width="7" height="5" x="3" y="16" rx="1.5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
    reports: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    grid: '<rect width="7" height="7" x="3" y="3" rx="1.6"/><rect width="7" height="7" x="14" y="3" rx="1.6"/><rect width="7" height="7" x="3" y="14" rx="1.6"/><rect width="7" height="7" x="14" y="14" rx="1.6"/>',
    till: '<rect x="5" y="9" width="14" height="11" rx="2"/><path d="M7 9V6a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v3"/><path d="M8.5 13h1M12 13h1M15.5 13h.01M8.5 16.5h7"/>',
    trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    wallet: '<path d="M20 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v3"/><path d="M3 6v12a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3"/><path d="M21 12v4h-4a2 2 0 0 1 0-4Z"/>',
    store: '<path d="M3 9 4.5 4h15L21 9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v8h14v-8"/><path d="M10 20v-5h4v5"/>',
    plus: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>',
    truck: '<path d="M2 6h11v10H2z"/><path d="M13 9h4.5L21 12.5V16h-8"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    bars: '<path d="M6 20V12M12 20V5M18 20v-5"/>'
  };
  const ico = (n, sz) => `<svg class="ic" viewBox="0 0 24 24" width="${sz || 24}" height="${sz || 24}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;
  window.EsyIcon = ico;

  const Home = window.Home = {
    addProduct() { App.go('products'); setTimeout(() => { try { Products.edit(); } catch (e) { console.error(e); } }, 60); }
  };

  /* ---- Mobile bottom navigation ---- */
  const nav = document.createElement('nav');
  nav.id = 'bottom-nav'; nav.className = 'bottom-nav'; nav.setAttribute('aria-label', 'Main');
  nav.innerHTML = `<button type="button" data-v="dashboard" onclick="App.go('dashboard')">${ico('home', 24)}<span>Home</span></button>
    <button type="button" data-v="products" onclick="App.go('products')">${ico('box', 24)}<span>Products</span></button>
    <button type="button" class="bn-scan" data-v="pos" onclick="App.go('pos')" aria-label="New sale">${ico('till', 28)}</button>
    <button type="button" data-v="reports" onclick="App.go('reports')">${ico('reports', 24)}<span>Reports</span></button>
    <button type="button" data-more="1" onclick="App.toggleNav()">${ico('grid', 24)}<span>More</span></button>`;
  document.body.appendChild(nav);
  const syncNav = () => nav.querySelectorAll('button[data-v]').forEach(b => b.classList.toggle('active', b.dataset.v === App.view));
  const go0 = App.go;
  App.go = function () { const r = go0.apply(this, arguments); syncNav(); return r; };
})();
