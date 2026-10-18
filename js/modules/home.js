/* EsyPOS (v10.11): mobile bottom navigation + quick actions.
   The old Home page was removed; the app opens straight on the Sales Counter. */
(function () {
  'use strict';
  const { toast } = Core;

  /* Outline icon set (24px, currentColor) so every icon has the same weight and size on every device */
  const P = {
    cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3h2.2l2.3 11.2a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 2-1.5L21 7H5.6"/><path d="M12.5 9.5h4M14.5 7.5v4"/>',
    box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m7.5 4.27 9 5.15"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 7v10M12 7v10M16 7v10"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>'
  };
  const ico = (n, sz) => `<svg class="ic" viewBox="0 0 24 24" width="${sz || 24}" height="${sz || 24}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;
  window.EsyIcon = ico;

  const Home = window.Home = {
    addProduct() { App.go('products'); setTimeout(() => { try { Products.edit(); } catch (e) { console.error(e); } }, 60); },
    scan() { App.go('pos'); setTimeout(() => { try { POS.scan(); } catch (e) { console.error(e); } }, 80); },
    sell(id) { App.go('pos'); setTimeout(() => { try { POS.add(id); } catch (e) { console.error(e); } }, 60); }
  };

  /* ---- Mobile bottom navigation ---- */
  const nav = document.createElement('nav');
  nav.id = 'bottom-nav'; nav.className = 'bottom-nav'; nav.setAttribute('aria-label', 'Main');
  nav.innerHTML = `<button type="button" data-v="pos" onclick="App.go('pos')">${ico('cart', 24)}<span>Sales</span></button>
    <button type="button" data-v="products" onclick="App.go('products')">${ico('box', 24)}<span>Products</span></button>
    <button type="button" class="bn-scan" onclick="Home.scan()" aria-label="Scan barcode">${ico('scan', 28)}</button>
    <button type="button" data-v="history" onclick="App.go('history')">${ico('history', 24)}<span>Transactions</span></button>
    <button type="button" onclick="App.toggleNav()">${ico('menu', 24)}<span>Menu</span></button>`;
  document.body.appendChild(nav);
  const syncNav = () => nav.querySelectorAll('button[data-v]').forEach(b => b.classList.toggle('active', b.dataset.v === App.view));
  const go0 = App.go;
  App.go = function () { const r = go0.apply(this, arguments); syncNav(); return r; };
})();
