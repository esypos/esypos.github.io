/* EsyPOS Home (v10.9): the new landing screen + mobile bottom navigation.
   Greeting · Today's sales · quick actions · banner slider · popular products.
   Edit Home.SLIDES below to change the banner slides (title / accent / text / icon / action). */
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

  const SLIDES = [
    { cls: 's1', title: 'Manage your business.', accent: 'Simply.', text: 'Fast, easy and powerful POS system for your growing business.', icon: 'cart' },
    { cls: 's2', title: 'Your data, always safe.', accent: 'Auto backup.', text: 'Every sale is saved to your own Google Drive.', icon: 'history', go: "Cloud.panel()" },
    { cls: 's3', title: 'Sell faster.', accent: 'Scan & go.', text: 'Use the phone camera or a USB / Bluetooth scanner.', icon: 'scan', go: "Home.scan()" },
    { cls: 's4', title: 'Know your profit.', accent: 'Every day.', text: 'Sales, expenses and profit reports in one tap.', icon: 'chart', go: "App.go('reports')" }
  ];
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
  const LEAF = `<svg class="hm-leaf" viewBox="0 0 160 120" aria-hidden="true"><circle cx="22" cy="26" r="7" fill="currentColor" opacity=".25"/><path d="M96 118C86 82 96 44 128 10c14 36 8 78-32 108Z" fill="currentColor" opacity=".55"/><path d="M104 118C112 86 136 62 168 54c-4 34-26 58-64 64Z" fill="currentColor" opacity=".35"/><path d="M92 118c-8-28-28-46-60-50 2 30 22 48 60 50Z" fill="currentColor" opacity=".3"/></svg>`;

  const greet = () => { const h = new Date().getHours(); return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Good night'; };

  function alerts() {
    const t = C.todayKey(), soon = C.addDays(t, 30);
    const low = DB.products.filter(p => p.track !== false && p.stock <= (p.minStock || 0));
    const exp = DB.products.filter(p => p.expiry && p.expiry <= soon);
    return { low, exp, n: low.length + exp.length };
  }
  function popular() {
    const q = {};
    DB.sales.forEach(s => (s.items || []).forEach(it => { if (it && it.id) q[it.id] = (q[it.id] || 0) + (Number(it.qty) || 0); }));
    const ids = Object.keys(q).sort((a, b) => q[b] - q[a]);
    const out = []; ids.forEach(id => { const p = C.findProduct(id); if (p && out.length < 8) out.push(p); });
    DB.products.forEach(p => { if (out.length < 6 && out.indexOf(p) < 0) out.push(p); });
    return out;
  }

  const Home = window.Home = {
    SLIDES, _t: null, _i: 0,
    render() {
      clearInterval(this._t);
      const t = C.todayKey(), td = C.buildReport(t, t), al = alerts(), pops = popular();
      $('view').innerHTML = `<div class="hm">
        <section class="hm-hero">${LEAF}
          <div class="hm-hero-txt"><div class="hm-hi">${greet()}</div><h1>Welcome back!</h1><p>Keep going, your business is growing.</p></div>
          <button type="button" class="hm-bell" onclick="Home.alerts()" aria-label="Alerts">
            ${ico('bell', 24)}${al.n ? `<b>${al.n > 99 ? '99+' : al.n}</b>` : ''}</button>
        </section>
        <section class="hm-sales card" onclick="App.go('reports')">
          <div class="hm-sales-ic">${ico('chart', 26)}</div>
          <div class="hm-sales-tx"><span>Today's Sales</span><b>${money(td.netSales)}</b></div>
          <button type="button" class="hm-link">View report ${ico('right', 16)}</button>
        </section>
        <section class="hm-tiles">${TILES.map(x => `<button type="button" class="hm-tile" onclick="${x.go}"><span class="hm-ti">${ico(x.i, 28)}</span><span class="hm-tl">${x.l}</span></button>`).join('')}</section>
        <section class="hm-slider" id="hm-slider" aria-roledescription="carousel">
          <div class="hm-track" id="hm-track">${SLIDES.map((s, i) => `<article class="hm-slide ${s.cls}" ${s.go ? `onclick="${s.go}" style="cursor:pointer"` : ''} aria-label="${i + 1} / ${SLIDES.length}">
            <div class="hm-st"><h3>${esc(s.title)}</h3><h2>${esc(s.accent)}</h2><p>${esc(s.text)}</p></div>
            <div class="hm-art"><div class="hm-dev">${ico(s.icon, 46)}</div></div></article>`).join('')}</div>
          <div class="hm-dots" id="hm-dots">${SLIDES.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>
        </section>
        <section class="hm-pop">
          <div class="hm-ph"><h2>Popular Products</h2><button type="button" class="hm-link" onclick="App.go('products')">View all ${ico('right', 16)}</button></div>
          ${pops.length ? `<div class="hm-prods">${pops.map(p => { const low = p.track !== false && p.stock <= (p.minStock || 0);
            return `<button type="button" class="hm-prod" onclick="Home.sell('${p.id}')"><div class="hm-pi">${p.image ? `<img src="${esc(C.imgSrc(p))}" alt="" loading="lazy" decoding="async" draggable="false">` : '<i class="fas fa-box"></i>'}</div>
            <div class="hm-pn">${esc(p.name)}</div><div class="hm-pp">${money(p.price)}</div><span class="hm-st-chip${low ? ' low' : ''}">${p.track === false ? 'In stock' : 'Stock: ' + esc(String(p.stock))}</span></button>`; }).join('')}</div>`
            : `<div class="card pad hm-empty">${ico('box', 34)}<p>No products yet</p><button type="button" class="btn btn-primary" onclick="Home.addProduct()">+ Add your first product</button></div>`}
        </section></div>`;
      this.initSlider();
    },
    initSlider() {
      const tr = $('hm-track'); if (!tr) return;
      const dots = $('hm-dots').children; let paused = false, raf = 0;
      const idx = () => Math.max(0, Math.min(SLIDES.length - 1, Math.round(tr.scrollLeft / (tr.clientWidth || 1))));
      const mark = () => { const i = idx(); Home._i = i; for (let k = 0; k < dots.length; k++) dots[k].classList.toggle('on', k === i); };
      tr.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(mark); }, { passive: true });
      const hold = () => { paused = true; }, free = () => { paused = false; };
      tr.addEventListener('pointerdown', hold); tr.addEventListener('touchstart', hold, { passive: true });
      ['pointerup', 'pointercancel', 'touchend', 'touchcancel', 'mouseleave'].forEach(e => tr.addEventListener(e, () => setTimeout(free, 2500)));
      Array.prototype.forEach.call(dots, (d, i) => { d.onclick = () => tr.scrollTo({ left: i * tr.clientWidth, behavior: 'smooth' }); });
      if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      this._t = setInterval(() => {
        if (!$('hm-track') || App.view !== 'home') return clearInterval(Home._t);
        if (paused || document.hidden || document.querySelector('.modal-back,.scan,.lock,.welcome,.drawer.open')) return;
        tr.scrollTo({ left: ((idx() + 1) % SLIDES.length) * tr.clientWidth, behavior: 'smooth' });
      }, 4500);
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
  App.go = function (v) { const r = go0.apply(this, arguments); if (App.view !== 'home') clearInterval(Home._t); syncNav(); return r; };
  App.Views.home = Home;
})();
