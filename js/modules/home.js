/* EsyPOS Home (v10.9): the new landing screen + mobile bottom navigation.
   Greeting · Today's sales · quick actions · banner slider · popular products.
   Edit Home.SLIDES below to change the banner slides (title / accent / text / icon / action). */
(function () {
  'use strict';
  const C = Core, { DB, esc, money, toast } = C;
  const $ = id => document.getElementById(id);

  const SLIDES = [
    { cls: 's1', title: 'Manage your business.', accent: 'Simply.', text: 'Fast, easy and powerful POS system for your growing business.', icon: 'fa-cash-register' },
    { cls: 's2', title: 'Your data, always safe.', accent: 'Auto backup.', text: 'Every sale is saved to your own Google Drive.', icon: 'fa-cloud-arrow-up', go: "Cloud.panel()" },
    { cls: 's3', title: 'Sell faster.', accent: 'Scan & go.', text: 'Use the phone camera or a USB / Bluetooth scanner.', icon: 'fa-barcode', go: "Home.scan()" },
    { cls: 's4', title: 'Know your profit.', accent: 'Every day.', text: 'Sales, expenses and profit reports in one tap.', icon: 'fa-chart-column', go: "App.go('reports')" }
  ];
  const TILES = [
    { l: 'New Sale', i: 'fa-cash-register', go: "App.go('pos')" },
    { l: 'Add Product', i: 'fa-box', plus: 1, go: "Home.addProduct()" },
    { l: 'Scan Barcode', i: 'fa-barcode', go: "Home.scan()" },
    { l: 'Customers', i: 'fa-users', go: "App.go('customers')" },
    { l: 'Transactions', i: 'fa-file-invoice', go: "App.go('history')" },
    { l: 'Expenses', i: 'fa-wallet', go: "App.go('expenses')" },
    { l: 'Reports', i: 'fa-chart-column', go: "App.go('reports')" },
    { l: 'Inventory', i: 'fa-box-open', go: "App.go('products')" }
  ];
  const LEAF = `<svg class="hm-leaf" viewBox="0 0 160 120" aria-hidden="true"><circle cx="22" cy="26" r="7" fill="currentColor" opacity=".25"/><path d="M96 118C86 82 96 44 128 10c14 36 8 78-32 108Z" fill="currentColor" opacity=".55"/><path d="M104 118C112 86 136 62 168 54c-4 34-26 58-64 64Z" fill="currentColor" opacity=".35"/><path d="M92 118c-8-28-28-46-60-50 2 30 22 48 60 50Z" fill="currentColor" opacity=".3"/></svg>`;
  const HOME_SVG = `<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M12 3.2 3 10.6V21h6.2v-6h5.6v6H21V10.6L12 3.2Z"/></svg>`;

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
            <i class="fas fa-bell"></i>${al.n ? `<b>${al.n > 99 ? '99+' : al.n}</b>` : ''}</button>
        </section>
        <section class="hm-sales card" onclick="App.go('reports')">
          <div class="hm-sales-ic"><i class="fas fa-chart-column"></i></div>
          <div class="hm-sales-tx"><span>Today's Sales</span><b>${money(td.netSales)}</b></div>
          <button type="button" class="hm-link">View report <i class="fas fa-chevron-right"></i></button>
        </section>
        <section class="hm-tiles">${TILES.map(x => `<button type="button" class="hm-tile" onclick="${x.go}"><span class="hm-ti"><i class="fas ${x.i}"></i>${x.plus ? '<em class="fas fa-plus"></em>' : ''}</span><span>${x.l}</span></button>`).join('')}</section>
        <section class="hm-slider" id="hm-slider" aria-roledescription="carousel">
          <div class="hm-track" id="hm-track">${SLIDES.map((s, i) => `<article class="hm-slide ${s.cls}" ${s.go ? `onclick="${s.go}" style="cursor:pointer"` : ''} aria-label="${i + 1} / ${SLIDES.length}">
            <div class="hm-st"><h3>${esc(s.title)}</h3><h2>${esc(s.accent)}</h2><p>${esc(s.text)}</p></div>
            <div class="hm-art"><div class="hm-dev"><i class="fas ${s.icon}"></i></div></div></article>`).join('')}</div>
          <div class="hm-dots" id="hm-dots">${SLIDES.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>
        </section>
        <section class="hm-pop">
          <div class="hm-ph"><h2>Popular Products</h2><button type="button" class="hm-link" onclick="App.go('products')">View all <i class="fas fa-chevron-right"></i></button></div>
          ${pops.length ? `<div class="hm-prods">${pops.map(p => { const low = p.track !== false && p.stock <= (p.minStock || 0);
            return `<button type="button" class="hm-prod" onclick="Home.sell('${p.id}')"><div class="hm-pi">${p.image ? `<img src="${esc(C.imgSrc(p))}" alt="" loading="lazy" decoding="async" draggable="false">` : '<i class="fas fa-box"></i>'}</div>
            <div class="hm-pn">${esc(p.name)}</div><div class="hm-pp">${money(p.price)}</div><span class="hm-st-chip${low ? ' low' : ''}">${p.track === false ? 'In stock' : 'Stock: ' + esc(String(p.stock))}</span></button>`; }).join('')}</div>`
            : `<div class="card pad hm-empty"><i class="fas fa-box-open"></i><p>No products yet</p><button type="button" class="btn btn-primary" onclick="Home.addProduct()"><i class="fas fa-plus"></i> Add your first product</button></div>`}
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
        (a.low.length ? `<div class="sec-title"><i class="fas fa-triangle-exclamation warn"></i> Low stock</div>${a.low.slice(0, 12).map(p => row(p.name, p.stock + ' ' + (p.unit || ''), 'bad')).join('')}` : '') +
        (a.exp.length ? `<div class="sec-title mt3"><i class="fas fa-hourglass-half warn"></i> Expiring soon</div>${a.exp.slice(0, 12).map(p => row(p.name, p.expiry, p.expiry < C.todayKey() ? 'bad' : 'warn')).join('')}` : '') });
      return m;
    }
  };

  /* ---- Mobile bottom navigation ---- */
  const nav = document.createElement('nav');
  nav.id = 'bottom-nav'; nav.className = 'bottom-nav'; nav.setAttribute('aria-label', 'Main');
  nav.innerHTML = `<button type="button" data-v="home" onclick="App.go('home')">${HOME_SVG}<span>Home</span></button>
    <button type="button" data-v="products" onclick="App.go('products')"><i class="fas fa-box-open"></i><span>Products</span></button>
    <button type="button" class="bn-scan" onclick="Home.scan()" aria-label="Scan barcode"><i class="fas fa-barcode"></i></button>
    <button type="button" data-v="history" onclick="App.go('history')"><i class="fas fa-clock-rotate-left"></i><span>Transactions</span></button>
    <button type="button" onclick="App.toggleNav()"><i class="fas fa-bars"></i><span>Menu</span></button>`;
  document.body.appendChild(nav);
  const syncNav = () => nav.querySelectorAll('button[data-v]').forEach(b => b.classList.toggle('active', b.dataset.v === App.view));
  const go0 = App.go;
  App.go = function (v) { const r = go0.apply(this, arguments); if (App.view !== 'home') clearInterval(Home._t); syncNav(); return r; };
  App.Views.home = Home;
})();
