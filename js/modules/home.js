/* EsyPOS Home (v10.10): one-screen landing page + mobile bottom navigation.
   Greeting · Today's sales · 8 quick actions. No scrolling: it always fits the visible screen
   and scales up on big displays / down on small ones (see the .hm rules in css/style.css). */
(function () {
  'use strict';
  const C = Core, { DB, esc, money, toast } = C;
  const $ = id => document.getElementById(id);


  /* Outline icon set (24px, currentColor) so every icon has the same weight and size on every device */
  const P = {
    cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3h2.2l2.3 11.2a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 2-1.5L21 7H5.6"/><path d="M12.5 9.5h4M14.5 7.5v4"/>',
    boxPlus: '<path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="m7.5 4.27 9 5.15"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/><path d="M16 17h6M19 14v6"/>',
    box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m7.5 4.27 9 5.15"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 7v10M12 7v10M16 7v10"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M15 8H8M16 12H8M13 16H8"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .7-1.53l7-6a2 2 0 0 1 2.6 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    warn: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>'
  };
  const ico = (n, sz) => `<svg class="ic" viewBox="0 0 24 24" width="${sz || 24}" height="${sz || 24}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;
  window.EsyIcon = ico;

  const TILES = [
    { l: 'New Sale', i: 'cart', go: "App.go('pos')" },
    { l: 'Add Product', i: 'boxPlus', go: "Home.addProduct()" },
    { l: 'Scan Barcode', i: 'scan', go: "Home.scan()" },
    { l: 'Customers', i: 'users', go: "App.go('customers')" },
    { l: 'Transactions', i: 'receipt', go: "App.go('history')" },
    { l: 'Expenses', i: 'wallet', go: "App.go('expenses')" },
    { l: 'Reports', i: 'chart', go: "App.go('reports')" },
    { l: 'Inventory', i: 'box', go: "App.go('products')" }
  ];

  const greet = () => { const h = new Date().getHours(); return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Good night'; };

  function alerts() {
    const t = C.todayKey(), soon = C.addDays(t, 30);
    const low = DB.products.filter(p => p.track !== false && p.stock <= (p.minStock || 0));
    const exp = DB.products.filter(p => p.expiry && p.expiry <= soon);
    return { low, exp, n: low.length + exp.length };
  }

  const Home = window.Home = {
    render() {
      const t = C.todayKey(), td = C.buildReport(t, t), al = alerts();
      $('view').innerHTML = `<div class="hm">
        <section class="hm-hero">
          <div class="hm-hero-txt"><div class="hm-hi">${greet()}</div><h1>Welcome back!</h1></div>
          <button type="button" class="hm-bell" onclick="Home.alerts()" aria-label="Alerts">
            ${ico('bell', 24)}${al.n ? `<b>${al.n > 99 ? '99+' : al.n}</b>` : ''}</button>
        </section>
        <section class="hm-sales card" onclick="App.go('reports')" role="button" tabindex="0">
          <div class="hm-sales-ic">${ico('chart', 26)}</div>
          <div class="hm-sales-tx"><span>Today's Sales</span><b>${money(td.netSales)}</b></div>
          <span class="hm-link">Report ${ico('right', 16)}</span>
        </section>
        <section class="hm-tiles">${TILES.map(x => `<button type="button" class="hm-tile" onclick="${x.go}"><span class="hm-ti">${ico(x.i, 28)}</span><span class="hm-tl">${x.l}</span></button>`).join('')}</section>
      </div>`;
    },
    addProduct() { App.go('products'); setTimeout(() => { try { Products.edit(); } catch (e) { console.error(e); } }, 60); },
    scan() { App.go('pos'); setTimeout(() => { try { POS.scan(); } catch (e) { console.error(e); } }, 80); },
    sell(id) { App.go('pos'); setTimeout(() => { try { POS.add(id); } catch (e) { console.error(e); } }, 60); },
    alerts() {
      const a = alerts(); if (!a.n) return toast('✓ No alerts — all good');
      const row = (n, v, c) => `<div class="kv"><span>${esc(n)}</span><b class="${c}">${esc(String(v))}</b></div>`;
      const m = Modal.open({ title: 'Alerts', body:
        (a.low.length ? `<div class="sec-title">Low stock</div>${a.low.slice(0, 12).map(p => row(p.name, p.stock + ' ' + (p.unit || ''), 'bad')).join('')}` : '') +
        (a.exp.length ? `<div class="sec-title mt3">Expiring soon</div>${a.exp.slice(0, 12).map(p => row(p.name, p.expiry, p.expiry < C.todayKey() ? 'bad' : 'warn')).join('')}` : '') });
      return m;
    }
  };

  /* ---- Mobile bottom navigation ---- */
  const nav = document.createElement('nav');
  nav.id = 'bottom-nav'; nav.className = 'bottom-nav'; nav.setAttribute('aria-label', 'Main');
  nav.innerHTML = `<button type="button" data-v="home" onclick="App.go('home')">${ico('home', 24)}<span>Home</span></button>
    <button type="button" data-v="products" onclick="App.go('products')">${ico('box', 24)}<span>Products</span></button>
    <button type="button" class="bn-scan" onclick="Home.scan()" aria-label="Scan barcode">${ico('scan', 28)}</button>
    <button type="button" data-v="history" onclick="App.go('history')">${ico('history', 24)}<span>Transactions</span></button>
    <button type="button" onclick="App.toggleNav()">${ico('menu', 24)}<span>Menu</span></button>`;
  document.body.appendChild(nav);
  const syncNav = () => nav.querySelectorAll('button[data-v]').forEach(b => b.classList.toggle('active', b.dataset.v === App.view));
  const go0 = App.go;
  App.go = function (v) { const r = go0.apply(this, arguments); syncNav(); return r; };
  App.Views.home = Home;
})();
