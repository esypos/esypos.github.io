/* EsyPOS App: router, back-button handling, Sales Counter (POS), Products */
(function () {
  'use strict';
  const C = Core, { DB, esc, num, r2, fmt, money, genId, toast, findProduct, findCustomer } = C;
  const $ = id => document.getElementById(id);
  const NAV = [
    { id: 'pos', label: 'Sales Counter', icon: 'fa-store' },
    { id: 'customers', label: 'Customers & Due', icon: 'fa-user-group' },
    { id: 'products', label: 'Products & Stock', icon: 'fa-box-open' },
    { id: 'barcodes', label: 'Barcode Labels', icon: 'fa-barcode' },
    { id: 'purchases', label: 'Purchases & Suppliers', icon: 'fa-truck' },
    { id: 'expenses', label: 'Expenses', icon: 'fa-money-bill-wave' },
    { id: 'history', label: 'Sales History', icon: 'fa-file-invoice' },
    { id: 'reports', label: 'Reports', icon: 'fa-chart-column' },
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-gauge-high' },
    { id: 'settings', label: 'Settings', icon: 'fa-sliders' }
  ];
  const Views = {};
  const App = window.App = {
    view: 'pos', Views,
    go(v) {
      if (!Views[v]) v = 'pos';
      Modal.closeAll(); App.closeDrawers(); App.view = v; document.body.dataset.view = v;
      document.querySelectorAll('.nav-link[data-v]').forEach(b => b.classList.toggle('active', b.dataset.v === v));
      try {
        const viewEl = document.getElementById('view');
        if (viewEl && Views[v] && typeof Views[v].render === 'function') Views[v].render();
      } catch (err) { console.error('EsyPOS view render', v, err); }
      window.scrollTo(0, 0);
    },
    refresh() { Views[App.view] && Views[App.view].render(); },
    toggleNav() { const d = $('mobile-nav'); const o = d.classList.contains('open'); App.closeDrawers(); if (!o) { d.classList.add('open'); $('scrim').classList.remove('hidden'); } syncLock(); },
    toggleCart() { const d = $('mobile-cart'); const o = d.classList.contains('open'); App.closeDrawers(); if (!o) { d.classList.add('open'); $('scrim').classList.remove('hidden'); } syncLock(); },
    closeDrawers() { document.querySelectorAll('.drawer.open').forEach(d => d.classList.remove('open')); $('scrim').classList.add('hidden'); syncLock(); },
    drawerOpen() { return !!document.querySelector('.drawer.open'); }
  };
  function buildNav() {
    const html = NAV.map(n => `<button type="button" class="nav-link" data-v="${n.id}" onclick="App.go('${n.id}')"><i class="fas ${n.icon}"></i> ${n.label}</button>`).join('');
    $('nav-desk').innerHTML = html; $('nav-mob').innerHTML = html;
  }
  let exitArmed = false;
  function pushGuard() { try { history.pushState({ g: 1 }, ''); } catch (_) {} }
  function handleBack() {
    if (window.hasConfirm && hasConfirm()) { closeConfirm(); return true; }
    if (document.querySelector('.lock,.welcome,.authgate')) return true;
    if (window.Scanner && Scanner.isOpen()) { Scanner.close(); return true; }
    if (Modal.stack.length) { Modal.close(); return true; }
    if (App.drawerOpen()) { App.closeDrawers(); return true; }
    if (App.view !== 'pos') { App.go('pos'); return true; }
    return false;
  }
  try { history.replaceState({ root: 1 }, ''); pushGuard(); } catch (_) {}
  window.addEventListener('popstate', () => {
    if (handleBack()) { pushGuard(); return; }
    if (exitArmed) return;                       // second Back: let the system close the app
    exitArmed = true; toast('Press Back again to exit');
    setTimeout(() => { if (exitArmed) { exitArmed = false; pushGuard(); } }, 2500);
  });
  const Fx = window.Fx = {
    reduced() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; },
    cartTarget() {
      const d = $('cart-desk');
      if (d && d.getClientRects().length) return d.querySelector('.cart-ico');
      const b = $('cart-bar');
      if (b && b.getClientRects().length) return b.querySelector('.cb-ico');
      return document.querySelector('#cart-bar');
    },
    added(id, quiet) {
      const card = document.querySelector('#pgrid .pcard[data-id="' + id + '"]');
      if (card) {
        card.classList.remove('added'); void card.offsetWidth; card.classList.add('added');
        const q = card.querySelector('.pqty'); if (q) { q.classList.remove('pop'); void q.offsetWidth; q.classList.add('pop'); }
      }
      const src = !quiet && card ? card.querySelector('.pimg') : null;
      const tgt = this.cartTarget();
      if (!src || !tgt || this.reduced()) { this.landed(); return; }
      const s = src.getBoundingClientRect(), t = tgt.getBoundingClientRect();
      if (!s.width || !t.width) { this.landed(); return; }
      const size = Math.min(s.width, s.height, 76);
      const sx = s.left + s.width / 2, sy = s.top + s.height / 2, tx = t.left + t.width / 2, ty = t.top + t.height / 2;
      const g = src.cloneNode(true); g.className = 'fly-ghost';
      g.style.cssText = 'left:' + (sx - size / 2) + 'px;top:' + (sy - size / 2) + 'px;width:' + size + 'px;height:' + size + 'px';
      document.body.appendChild(g);
      const dx = tx - sx, dy = ty - sy, lift = Math.min(130, Math.max(60, Math.abs(dy) * 0.3));
      const a = g.animate([
        { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1, offset: 0 },
        { transform: 'translate(' + dx * 0.4 + 'px,' + (dy * 0.4 - lift) + 'px) scale(.82) rotate(-10deg)', opacity: 1, offset: 0.45 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.2) rotate(14deg)', opacity: 0.55, offset: 1 }
      ], { duration: 720, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'forwards' });
      const done = () => { g.remove(); this.landed(); };
      a.onfinish = done; a.oncancel = () => g.remove();
    },
    landed() {
      const tgt = this.cartTarget();
      document.querySelectorAll('#cart-badge,.cb-count,.cart-bar .cb-ico,#cart-desk .cart-ico').forEach(e => { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); });
      if (tgt && !this.reduced()) {
        const r = tgt.getBoundingClientRect();
        if (r.width) { const ring = document.createElement('div'); ring.className = 'fly-ring'; ring.style.left = (r.left + r.width / 2) + 'px'; ring.style.top = (r.top + r.height / 2) + 'px'; document.body.appendChild(ring); setTimeout(() => ring.remove(), 700); }
      }
    }
  };
  const POS = window.POS = {
    cat: 'all', q: '', limit: 120, disc: 0, discType: 'percent', tax: 0, customerId: null, note: '', payMethod: 'cash',
    taxInit() { this.tax = num(DB.settings.defaultTax); },
    totals() {
      const subtotal = r2(DB.cart.reduce((s, c) => s + c.price * c.qty, 0));
      let discount = this.discType === 'percent' ? subtotal * Math.max(0, num(this.disc)) / 100 : Math.max(0, num(this.disc));
      discount = r2(Math.min(Math.max(discount, 0), subtotal));
      const tax = r2((subtotal - discount) * Math.max(0, num(this.tax)) / 100);
      return { subtotal, discount, tax, total: r2(subtotal - discount + tax) };
    },
    render() {
      $('view').innerHTML = `
      <div class="pos-grid"><div>
        <div class="card search-wrap">
          <div class="flex gap2 mb2">
            <div class="relative grow"><i class="fas fa-magnifying-glass search-ico"></i>
              <input id="pos-search" class="input has-ico" placeholder="Search or scan barcode..." value="${esc(this.q)}" oninput="POS.search(this.value)" onkeydown="if(event.key==='Enter')POS.enter()" autocomplete="off"></div>
            <button class="btn btn-soft" onclick="POS.scan()" title="Camera scan"><i class="fas fa-barcode"></i></button>
            <button class="btn btn-soft" onclick="POS.showHold()" title="Held Bills"><i class="fas fa-pause"></i><span id="hold-count"></span></button>
            <span class="scan-ready only-desk" title="USB/Bluetooth barcode scanner ready"><i class="fas fa-plug"></i> Scanner</span>
          </div>
          <div class="chips" id="pos-cats"></div>
        </div>
        <div class="pgrid" id="pgrid"></div>
        <div class="tc mt3"><button class="btn btn-ghost hidden" id="pos-more" onclick="POS.more()">Show more</button></div>
      </div>
      <div class="cart-desk card pad" id="cart-desk"></div></div>`;
      this.renderCats(); this.renderGrid(); this.renderCart();
    },
    renderCats() {
      const cats = [...new Set(DB.products.map(p => p.category).filter(Boolean))].sort();
      const el = $('pos-cats'); if (!el) return;
      el.innerHTML = ['all', ...cats].map(c => `<button class="chip ${this.cat === c ? 'on' : ''}" onclick="POS.setCat(this.dataset.c)" data-c="${esc(c)}">${c === 'all' ? 'All' : esc(c)}</button>`).join('');
    },
    filtered() {
      const q = this.q.trim().toLowerCase(); const key = C.rev() + '|' + this.cat + '|' + q;
      if (this._fk === key) return this._fl;
      if (this._sk !== C.rev()) { this._sorted = DB.products.slice().sort((a, b) => C.collator.compare(a.name, b.name)); this._sk = C.rev(); }
      const out = this._sorted.filter(p => (this.cat === 'all' || p.category === this.cat) &&
        (!q || p.name.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)));
      this._fk = key; this._fl = out; return out;
    },
    renderGrid() {
      const g = $('pgrid'); if (!g) return;
      const list = this.filtered(); const shown = list.slice(0, this.limit);
      if (!DB.products.length) g.innerHTML = '<div class="empty card" style="grid-column:1/-1"><i class="fas fa-box-open"></i>No products yet.<br><button class="btn btn-primary mt3" onclick="Products.edit()">+ Add first product</button></div>';
      else if (!list.length) g.innerHTML = '<div class="empty" style="grid-column:1/-1"><i class="fas fa-magnifying-glass"></i>No products found</div>';
      else g.innerHTML = shown.map(p => {
        const low = p.track !== false && p.stock <= (p.minStock || 0);
        const exp = p.expiry && p.expiry < C.todayKey();
        return `<div class="pcard" data-id="${p.id}" onclick="POS.add('${p.id}')">
          <span class="pqty"></span><span class="added-fx"></span>
          <div class="pimg">${p.image ? `<img src="${esc(C.imgSrc(p))}" alt="" loading="lazy" decoding="async" draggable="false">` : '<i class="fas fa-box"></i>'}</div>
          ${exp ? '<span class="ptag">Expired</span>' : (p.track !== false && p.stock <= 0 ? '<span class="ptag">Out of stock</span>' : (low ? '<span class="ptag" style="background:#d97706">Low Stock</span>' : ''))}
          <div class="pname">${esc(p.name)}</div>
          <div class="pmeta"><span class="pprice">${money(p.price)}</span><span class="${low ? 'bad fw6' : 'muted'}">${p.track === false ? '∞' : p.stock + ' ' + esc(C.unitLabel ? C.unitLabel(p.unit) : (p.unit || ''))}</span></div></div>`;
      }).join('');
      const more = $('pos-more'); if (more) more.classList.toggle('hidden', list.length <= this.limit);
      const hc = $('hold-count'); if (hc) hc.textContent = DB.hold.length ? ' ' + DB.hold.length : '';
      this.markCards();
    },
    markCards() {
      const m = {}; DB.cart.forEach(c => { const k = c.productId || c.id; m[k] = (m[k] || 0) + c.qty; });
      document.querySelectorAll('#pgrid .pcard').forEach(el => { const q = m[el.dataset.id]; el.classList.toggle('sel', !!q); const b = el.querySelector('.pqty'); if (b) b.textContent = q ? '×' + q : ''; });
    },
    search(v) { this.q = v; this.limit = 120; if (this._st) cancelAnimationFrame(this._st); clearTimeout(this._sd); this._sd = setTimeout(() => { this._st = requestAnimationFrame(() => this.renderGrid()); }, 90); },
    setCat(c) { this.cat = c; this.limit = 120; this.renderCats(); this.renderGrid(); },
    more() { this.limit += 120; this.renderGrid(); },
    findByBarcode(code) {
      const key = window.BarcodeGen ? BarcodeGen.normKey : (x => { x = String(x == null ? '' : x).trim(); return /^\d{12,13}$/.test(x) ? x.padStart(13, '0') : x.toUpperCase(); });
      let c = String(code == null ? '' : code).replace(/[\u0000-\u001F\u007F]/g, '').trim();
      c = c.replace(/^\][A-Za-z][0-9A-Za-z]/, '');            // AIM symbology identifier (e.g. "]C1") that some scanners prepend
      const k = key(c); if (!k) return null;
      return DB.products.find(p => p.barcode && key(p.barcode) === k) || null;
    },
    enter() {
      const q = this.q.trim(); if (!q) return;
      const exact = this.findByBarcode(q);
      const list = this.filtered();
      const p = exact || (list.length === 1 ? list[0] : null);
      if (p) { this.add(p.id); this.q = ''; const s = $('pos-search'); if (s) { s.value = ''; s.focus(); } this.renderGrid(); }
      else toast(list.length ? list.length + ' products match — type more or tap one' : '⚠️ No product found: ' + q);
    },
    scan() {
      if (!window.Scanner || Scanner.isOpen()) return;
      Scanner.open(code => {
        const p = this.findByBarcode(code);
        if (!p) { Scanner.flash('⚠️ Barcode not found: ' + code, 'bad'); return false; }   // camera stays open so the user can retry
        Scanner.close();                                         // product found: close the camera right away
        this.add(p.id, true, { picked: true });                  // add to cart + "Product selected" message
      }, { hint: 'Hold product barcode in frame' });
    },
    inCart(pid) { return DB.cart.reduce((n, c) => (c.productId || c.id) === pid ? n + c.qty : n, 0); },   // total qty of one product over all its cart lines (variants/add-on combos)
    add(id, quiet, opt) {
      opt = opt || {};
      const p = findProduct(id); if (!p) return;
      const hasOpts = (p.variants && p.variants.length) || (p.addons && p.addons.some(g => g.options && g.options.length));
      if (hasOpts && !opt.configured) {
        if (p.track !== false && p.stock <= 0) { toast('⚠️ Out of stock!'); return; }
        Products.configureForSale(p, quiet, opt);
        return;
      }
      const go = () => {
        const cartId = opt.cartKey || p.id;
        const ex = DB.cart.find(c => c.id === cartId);
        if (p.track !== false) {
          if (p.stock <= 0) { toast('⚠️ Out of stock!'); return; }
          if (this.inCart(p.id) >= p.stock) { toast('⚠️ Insufficient stock!'); return; }
        }
        const lineName = opt.lineName || p.name;
        const linePrice = opt.linePrice != null ? opt.linePrice : p.price;
        if (ex) ex.qty++; else DB.cart.push({ id: cartId, productId: p.id, name: lineName, price: linePrice, cost: p.cost || 0, qty: 1, unit: p.unit, note: opt.note || '' });
        C.save('cart'); this.lastAdded = { id: cartId, isNew: !ex }; this.renderCart(); Fx.added(p.id, quiet);
        if (opt.picked) toast('✓ Product selected: ' + lineName);
        else if (quiet) { try { window.Sound && window.Sound.play && window.Sound.play('beep'); } catch (_) {} }
      };
      if (p.expiry && p.expiry < C.todayKey()) askConfirm(`"${p.name}"  has expired. Sell anyway?`, go, { title: 'Expired product', danger: true, yes: 'Yes, add' });
      else go();
    },
    qty(id, d) {
      const it = DB.cart.find(c => c.id === id); if (!it) return;
      const p = findProduct(it.productId || id); const n = it.qty + d;
      if (n <= 0) DB.cart = DB.cart.filter(c => c.id !== id);
      else if (p && p.track !== false && (this.inCart(p.id) - it.qty + n) > p.stock) { toast('⚠️ Insufficient stock!'); return; }
      else it.qty = n;
      C.save('cart'); this.renderCart();
    },
    remove(id) { DB.cart = DB.cart.filter(c => c.id !== id); C.save('cart'); this.renderCart(); },
    editItem(id) {
      const it = DB.cart.find(c => c.id === id); if (!it) return;
      const m = Modal.open({ title: it.name, body: `<div class="grid2"><div class="field"><label class="label">Unit price</label><input id="ei-price" type="number" step="any" class="input" value="${it.price}"></div>
        <div class="field"><label class="label">Qty</label><input id="ei-qty" type="number" step="any" class="input" value="${it.qty}"></div></div>`,
        foot: `<button class="btn" onclick="Modal.closeFrom(this)">Cancel</button><button class="btn btn-primary" id="ei-ok">Save</button>` });
      m.querySelector('#ei-ok').onclick = () => {
        const pr = num($('ei-price').value), q = num($('ei-qty').value); const p = findProduct(it.productId || id);
        if (pr < 0 || q <= 0) { toast('⚠️ Enter a valid value'); return; }
        if (p && p.track !== false && (this.inCart(p.id) - it.qty + q) > p.stock) { toast('⚠️ Stock only ' + p.stock); return; }
        it.price = pr; it.qty = q; C.save('cart'); Modal.close(m); this.renderCart();
      };
    },
    clear() {
      if (!DB.cart.length) return;
      askConfirm('Clear all items from cart?', () => { DB.cart = []; this.resetBill(); C.save('cart'); this.renderCart(); toast('Cart cleared'); }, { title: 'Clear cart?', yes: 'Yes, clear', danger: true });
    },
    resetBill() { this.disc = 0; this.discType = 'percent'; this.customerId = null; this.note = ''; this.taxInit(); },
    cartHTML() {
      const t = this.totals(); const cust = this.customerId ? findCustomer(this.customerId) : null;
      const la = this.lastAdded;
      const items = DB.cart.length ? DB.cart.map(c => `<div class="cart-item${la && la.id === c.id ? (la.isNew ? ' new' : ' bumped') : ''}" data-id="${c.id}">
          <div class="grow" onclick="POS.editItem('${c.id}')"><div class="fw6 sm trunc">${esc(c.name)}</div>${c.note ? `<div class="xs muted cart-note">+ ${esc(c.note)}</div>` : ''}<div class="xs muted">${money(c.price)} × ${c.qty} <i class="fas fa-pen" style="font-size:9px;opacity:.5"></i></div></div>
          <div class="qty"><button onclick="POS.qty('${c.id}',-1)">−</button><span>${c.qty}</span><button onclick="POS.qty('${c.id}',1)">+</button></div>
          <div class="fw7 ptext sm" style="min-width:56px;text-align:right">${money(c.price * c.qty)}</div>
          <button class="icon-btn" style="width:28px;height:28px" onclick="POS.remove('${c.id}')"><i class="fas fa-xmark"></i></button></div>`).join('')
        : '<div class="empty"><i class="fas fa-bag-shopping"></i>Cart empty</div>';
      return `<div class="flex between items-c mb3"><div class="sec-title" style="margin:0"><i class="fas fa-bag-shopping ptext cart-ico"></i> Cart <span class="badge b-p">${DB.cart.reduce((s, c) => s + c.qty, 0)}</span></div>
          <div class="flex gap1"><button class="btn btn-sm btn-ghost" onclick="POS.hold()"><i class="fas fa-pause"></i> Hold</button><button class="btn btn-sm btn-danger-soft" onclick="POS.clear()"><i class="fas fa-trash"></i></button></div></div>
        <div style="max-height:38vh;overflow-y:auto;margin-bottom:10px">${items}</div>
        <button class="btn btn-ghost btn-block mb3" onclick="POS.pickCust()"><i class="fas fa-user"></i> ${cust ? esc(cust.name) + (C.customerBalance(cust.id) > 0 ? ' · Due ' + money(C.customerBalance(cust.id)) : '') : 'Customer: Walk-in (select for due)'}</button>
        <div class="grid2 mb2"><div><label class="label">Discount</label><div class="flex gap1"><input type="number" min="0" step="any" class="input" value="${this.disc || ''}" placeholder="0" oninput="POS.setDisc(this.value)"><select class="input" style="width:70px" onchange="POS.setDiscType(this.value)"><option value="percent" ${this.discType === 'percent' ? 'selected' : ''}>%</option><option value="amount" ${this.discType === 'amount' ? 'selected' : ''}>৳</option></select></div></div>
          <div><label class="label">Tax (%)</label><input type="number" min="0" step="any" class="input" value="${this.tax || ''}" placeholder="0" oninput="POS.setTax(this.value)"></div></div>
        <div class="sumrow muted"><span>Subtotal</span><span class="js-sub">${money(t.subtotal)}</span></div>
        <div class="sumrow muted"><span>Discount</span><span class="js-disc bad">-${money(t.discount)}</span></div>
        <div class="sumrow muted"><span>Tax</span><span class="js-tax">${money(t.tax)}</span></div>
        <div class="sumrow big"><span>Total</span><span class="ptext js-total">${money(t.total)}</span></div>
        <button class="btn btn-primary btn-block mt3" style="padding:14px;font-size:15px" ${DB.cart.length ? '' : 'disabled'} onclick="POS.checkout()"><i class="fas fa-circle-check"></i> Checkout</button>`;
    },
    renderCart() {
      const h = this.cartHTML(); ['cart-desk', 'cart-mobile'].forEach(id => { const e = $(id); if (e) e.innerHTML = h; });
      this.lastAdded = null;
      const n = DB.cart.reduce((s, c) => s + c.qty, 0); const b = $('cart-badge');
      if (b) { b.textContent = n; b.classList.toggle('hidden', !n); }
      const bar = $('cart-bar');
      if (bar) {
        const t = this.totals(); bar.classList.toggle('empty', !n);
        bar.innerHTML = n
          ? `<span class="cb-ico"><i class="fas fa-bag-shopping"></i><b class="cb-count">${n}</b></span><span class="cb-mid"><b>${n} items</b><small>Tap to view cart</small></span><span class="cb-total">${money(t.total)}</span><i class="fas fa-chevron-up cb-arrow"></i>`
          : `<span class="cb-ico"><i class="fas fa-bag-shopping"></i></span><span class="cb-mid"><b>Cart empty</b><small>Tap a product to add</small></span>`;
      }
      this.markCards();
    },
    updTotals() { const t = this.totals(); const set = (c, v) => document.querySelectorAll(c).forEach(e => e.textContent = v); set('.js-sub', money(t.subtotal)); set('.js-disc', '-' + money(t.discount)); set('.js-tax', money(t.tax)); set('.js-total', money(t.total)); set('.cb-total', money(t.total)); },
    setDisc(v) { this.disc = num(v); this.updTotals(); },
    setDiscType(v) { this.discType = v; this.updTotals(); },
    setTax(v) { this.tax = num(v); this.updTotals(); },
    pickCust() { People.pick(id => { this.customerId = id; this.renderCart(); }, true); },
    hold() {
      if (!DB.cart.length) { toast('Cart empty'); return; }
      const c = findCustomer(this.customerId);
      DB.hold.unshift({ id: genId(), date: new Date().toISOString(), items: DB.cart, customerId: this.customerId, disc: this.disc, discType: this.discType, tax: this.tax, note: this.note || '', label: c ? c.name : '' });
      C.save('hold'); DB.cart = []; this.resetBill(); C.save('cart'); this.renderCart(); this.renderGrid(); toast('Bill held ✓');
    },
    showHold() {
      if (!DB.hold.length) { toast('No held bills'); return; }
      const m = Modal.open({ title: 'Held Bills', body: DB.hold.map(h => `<div class="row" style="cursor:default"><div class="grow"><div class="t">${esc(h.label || 'Walk-in')} · ${money(h.items.reduce((s, c) => s + c.price * c.qty, 0))}</div><div class="s">${C.fmtDT(h.date)} · ${h.items.length} items</div></div>
        <button class="btn btn-sm btn-primary" onclick="POS.restore('${h.id}',this)">Resume</button><button class="btn btn-sm btn-danger-soft" onclick="POS.dropHold('${h.id}',this)"><i class="fas fa-trash"></i></button></div>`).join('') });
      m._hold = true;
    },
    restore(id, btn) {
      const h = DB.hold.find(x => x.id === id); if (!h) return;
      const run = () => {
        DB.cart = h.items; this.customerId = h.customerId; this.disc = h.disc; this.discType = h.discType; this.tax = h.tax; this.note = h.note || '';
        DB.hold = DB.hold.filter(x => x.id !== id); C.save('hold'); C.save('cart'); Modal.closeAll(); this.renderCart(); this.renderGrid(); toast('Bill resumed ✓');
      };
      if (DB.cart.length) askConfirm('Current cart items will be replaced. Continue?', run, { yes: 'Yes' }); else run();
    },
    dropHold(id, btn) { askConfirm('Delete this held bill?', () => { DB.hold = DB.hold.filter(x => x.id !== id); C.save('hold'); Modal.closeAll(); this.renderGrid(); toast('Deleted'); if (DB.hold.length) this.showHold(); }, { danger: true, yes: 'Delete' }); },
    checkout() {
      if (!DB.cart.length) return;
      App.closeDrawers(); this.payMethod = 'cash';
      const t = this.totals();
      const m = Modal.open({ title: 'Checkout', body: `
        <div class="tc mb3"><div class="muted xs">Payable</div><div class="xxl fw7 ptext" id="co-total">${money(t.total)}</div></div>
        <div class="pay-opts mb3" id="co-methods">
          <button class="pay-opt on" data-m="cash" onclick="POS.setMethod('cash')"><i class="fas fa-money-bill-wave"></i>Cash</button>
          <button class="pay-opt" data-m="card" onclick="POS.setMethod('card')"><i class="fas fa-credit-card"></i>Card</button>
          <button class="pay-opt" data-m="mobile" onclick="POS.setMethod('mobile')"><i class="fas fa-mobile-screen"></i>Mobile</button>
          <button class="pay-opt" data-m="due" onclick="POS.setMethod('due')"><i class="fas fa-clock"></i>Due</button>
        </div>
        <div class="field"><label class="label" id="co-paid-label">Amount received</label><input id="co-paid" type="number" step="any" min="0" class="input" style="font-size:18px;font-weight:700" oninput="POS.coCalc()"></div>
        <div class="chips mb3" id="co-quick"></div>
        <div class="card pad-s mb3" id="co-info"></div>
        <button class="btn btn-ghost btn-block mb3" id="co-cust" onclick="POS.coPick()"></button>
        <div class="field"><label class="label">Note (optional)</label><input id="co-note" class="input" value="${esc(this.note)}" placeholder="e.g. pay tomorrow"></div>`,
        foot: `<button class="btn" onclick="Modal.closeFrom(this)">Cancel</button><button class="btn btn-primary" id="co-ok" onclick="POS.complete()"><i class="fas fa-check"></i> Complete sale</button>` });
      this.setMethod('cash'); this.coCust();
    },
    coCust() {
      const b = $('co-cust'); if (!b) return; const c = findCustomer(this.customerId);
      b.innerHTML = c ? `<i class="fas fa-user"></i> ${esc(c.name)} · Current due ${money(Math.max(0, C.customerBalance(c.id)))}` : '<i class="fas fa-user-plus"></i> Select customer (required for due)';
    },
    coPick() { People.pick(id => { this.customerId = id; this.coCust(); this.renderCart(); this.coCalc(); }, true); },
    setMethod(m) {
      this.payMethod = m; const t = this.totals();
      document.querySelectorAll('#co-methods .pay-opt').forEach(b => b.classList.toggle('on', b.dataset.m === m));
      $('co-paid-label').textContent = m === 'due' ? 'Advance (Optional)' : (m === 'cash' ? 'Amount received' : 'Payment');
      $('co-paid').value = m === 'due' ? '' : t.total;
      const q = $('co-quick'); const opts = new Set([t.total]);
      if (m === 'cash') { [10, 50, 100, 500, 1000].forEach(s => { const v = Math.ceil(t.total / s) * s; if (v >= t.total) opts.add(v); }); }
      q.innerHTML = m === 'due' ? '' : [...opts].slice(0, 5).map(v => `<button class="chip" onclick="document.getElementById('co-paid').value=${v};POS.coCalc()">${v === t.total ? 'Exact ' : ''}${C.cur()}${fmt(v)}</button>`).join('');
      this.coCalc();
    },
    coCalc() {
      const t = this.totals(); const raw = Math.max(0, num($('co-paid').value)); let paid = raw, change = 0;
      if (this.payMethod === 'cash') { if (raw > t.total) { change = r2(raw - t.total); paid = t.total; } }
      else if (raw > t.total) paid = t.total;
      const due = r2(Math.max(0, t.total - paid));
      $('co-info').innerHTML = `<div class="sumrow" style="margin:2px 0"><span class="muted">Paying</span><b>${money(paid)}</b></div>` +
        (change > 0 ? `<div class="sumrow" style="margin:2px 0"><span class="muted">Change</span><b class="ok">${money(change)}</b></div>` : '') +
        (due > 0 ? `<div class="sumrow" style="margin:2px 0"><span class="muted">Due remaining</span><b class="bad">${money(due)}</b></div>` : '');
      return { paid, change, due };
    },
    complete() {
      if (this._busy) return; this._busy = true;
      const t = this.totals(); const { paid, change, due } = this.coCalc();
      if (!DB.cart.length) { this._busy = false; return; }
      if (due > 0 && !this.customerId) { this._busy = false; toast('⚠️ Select a customer for due'); this.coPick(); return; }
      const need = {}; DB.cart.forEach(it => { const k = it.productId || it.id; need[k] = (need[k] || 0) + it.qty; });
      for (const it of DB.cart) { const k = it.productId || it.id; const p = findProduct(k); if (p && p.track !== false && p.stock < need[k]) { this._busy = false; toast('⚠️ ' + p.name + ' has insufficient stock!'); return; } }
      const cust = findCustomer(this.customerId);
      const proceed = () => {
        DB.cart.forEach(it => { const p = findProduct(it.productId || it.id); if (p && p.track !== false) p.stock = r2(p.stock - it.qty); });
        const sale = {
          id: genId(), no: DB.settings.nextInvoice++, date: new Date().toISOString(), customerId: this.customerId || null,
          items: DB.cart.map(c => ({ id: c.productId || c.id, key: c.id, name: c.name, price: c.price, cost: (findProduct(c.productId || c.id) || {}).cost || c.cost || 0, qty: c.qty, unit: c.unit, note: c.note || '' })),
          subtotal: t.subtotal, discount: t.discount, tax: t.tax, total: t.total, paid, due, change,
          paymentMethod: this.payMethod === 'due' ? (paid > 0 ? 'cash' : 'due') : this.payMethod,
          note: ($('co-note') ? $('co-note').value.trim() : '')
        };
        DB.sales.unshift(sale); DB.cart = [];
        C.save('products'); C.save('sales'); C.save('cart'); C.save('settings');
        this.resetBill(); Modal.closeAll(); this.renderCart(); this.renderGrid();
        Receipt.show(sale, { fresh: true }); toast('Sale completed! ✓'); this._busy = false; const _s=$('pos-search'); if(_s) setTimeout(()=>_s.focus(), 300);
      };
      if (cust && due > 0) {
        const lim = num(cust.creditLimit); const after = C.customerBalance(cust.id) + due;
        if (lim > 0 && after > lim) { this._busy = false; askConfirm(`${cust.name} — due limit is ${money(lim)}. After this sale due will be ${money(after)}. Continue anyway?`, () => { this._busy = true; proceed(); }, { title: 'Exceeds due limit', danger: true, yes: 'Yes, continue' }); return; }
      }
      proceed();
    }
  };
  Views.pos = POS;
  const UNITS = ['Pcs', 'Kg', 'g', 'L', 'Packet', 'Bottle', 'Cup', 'Dozen', 'm', 'Box', 'Pair'];
  const Products = window.Products = {
    q: '', filter: 'all', img: null,
    render() {
      const low = DB.products.filter(p => p.track !== false && p.stock <= (p.minStock || 0)).length;
      $('view').innerHTML = `
      <div class="page-head"><div><h2>Products & Stock</h2><p>Add products, edit & control stock</p></div>
        <div class="flex gap2"><button class="btn btn-ghost" onclick="Products.csvMenu()"><i class="fas fa-file-csv"></i> CSV</button><button class="btn btn-primary" onclick="Products.edit()"><i class="fas fa-plus"></i> New Product</button></div></div>
      <div class="stats"><div class="stat"><div class="k">Total Product</div><div class="v">${DB.products.length}</div></div>
        <div class="stat"><div class="k">Stock value (at cost)</div><div class="v">${money(C.stockValue())}</div></div>
        <div class="stat"><div class="k">Low Stock</div><div class="v ${low ? 'bad' : ''}">${low}</div></div>
        <div class="stat"><div class="k">Expiry issue</div><div class="v ${this.expiring().length ? 'warn' : ''}">${this.expiring().length}</div></div></div>
      <div class="card pad-s mb3"><div class="relative mb2"><i class="fas fa-magnifying-glass search-ico"></i><input class="input has-ico" id="prod-q" placeholder="Name, barcode or category..." value="${esc(this.q)}" oninput="Products.setQ(this.value)"></div>
        <div class="chips">${[['all', 'All'], ['low', 'Low Stock'], ['out', 'Out of Stock'], ['exp', 'Expiry issue']].map(f => `<button class="chip ${this.filter === f[0] ? 'on' : ''}" onclick="Products.setF('${f[0]}')">${f[1]}</button>`).join('')}</div></div>
      <div class="card" id="prod-list"></div>`;
      this.list();
    },
    expiring() { const soon = C.addDays(C.todayKey(), 30); return DB.products.filter(p => p.expiry && p.expiry <= soon); },
    setQ(v) { this.q = v; this.lim = 100; clearTimeout(this._qd); this._qd = setTimeout(() => this.list(), 100); }, setF(f) { this.filter = f; this.lim = 100; this.render(); },
    more() { this.lim = (this.lim || 100) + 100; this.list(); },
    list() {
      const q = this.q.trim().toLowerCase(); const soon = C.addDays(C.todayKey(), 30);
      let arr = DB.products.filter(p => !q || p.name.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q));
      if (this.filter === 'low') arr = arr.filter(p => p.track !== false && p.stock <= (p.minStock || 0));
      if (this.filter === 'out') arr = arr.filter(p => p.track !== false && p.stock <= 0);
      if (this.filter === 'exp') arr = arr.filter(p => p.expiry && p.expiry <= soon);
      arr.sort((a, b) => C.collator.compare(a.name, b.name));
      const lim = this.lim || 100; const el = $('prod-list'); if (!el) return;
      if (!arr.length) { el.innerHTML = '<div class="empty"><i class="fas fa-box-open"></i>No products</div>'; return; }
      el.innerHTML = arr.slice(0, lim).map(p => {
        const low = p.track !== false && p.stock <= (p.minStock || 0);
        const exp = p.expiry ? (p.expiry < C.todayKey() ? '<span class="badge b-bad">Expired</span>' : (p.expiry <= soon ? '<span class="badge b-warn">Expiry ' + p.expiry + '</span>' : '')) : '';
        return `<div class="row" onclick="Products.edit('${p.id}')">
          <div class="avatar" style="overflow:hidden">${p.image ? `<img src="${esc(C.imgSrc(p))}" loading="lazy" decoding="async" draggable="false" style="width:100%;height:100%;object-fit:cover">` : '<i class="fas fa-box"></i>'}</div>
          <div class="grow"><div class="t">${esc(p.name)} ${exp}</div><div class="s">${esc(p.category || 'No category')}${p.barcode ? ' · ' + esc(p.barcode) : ''} · Cost ${money(p.cost || 0)}</div></div>
          <div class="tr"><div class="fw7 ptext">${money(p.price)}</div><div class="xs ${low ? 'bad fw6' : 'muted'}">${p.track === false ? 'Not tracked' : p.stock + ' ' + esc(p.unit || '')}</div></div>
          <button class="icon-btn" onclick="event.stopPropagation();Products.del('${p.id}')"><i class="fas fa-trash bad"></i></button></div>`;
      }).join('') + (arr.length > lim ? `<div class="tc mt3"><button class="btn btn-ghost" onclick="Products.more()">Show more (${arr.length - lim} left)</button></div>` : '');
    },
    edit(id) {
      const p = id ? findProduct(id) : null; this.img = p ? (p.image || null) : null;
      this._variants = (p && p.variants) ? JSON.parse(JSON.stringify(p.variants)) : [];
      this._addons = (p && p.addons) ? JSON.parse(JSON.stringify(p.addons)) : [];
      this._editId = id || '';
      const cats = [...new Set(DB.products.map(x => x.category).filter(Boolean))];
      const biz = DB.settings.businessType || 'retail';
      const extra = this._extraFieldsHtml(biz, p);
      const m = Modal.open({ title: p ? 'Edit Product' : 'New Product', size: 'xl', body: `
        <div class="pf-layout"><div class="pf-main">
        <div class="flex gap3 mb3 items-c"><label style="cursor:pointer"><div class="avatar" id="pf-img" style="width:64px;height:64px;overflow:hidden">${this.img ? `<img src="${esc(this.img)}" style="width:100%;height:100%;object-fit:cover">` : '<i class="fas fa-camera"></i>'}</div><input type="file" accept="image/*" class="hidden" onchange="Products.pickImg(this)"></label>
          <div class="grow"><label class="label">Product name *</label><input id="pf-name" class="input" autofocus value="${esc(p ? p.name : '')}"></div></div>
        <div class="field"><label class="label">Barcode</label><div class="flex gap2 flex-wrap">
          <input id="pf-bc" class="input grow" value="${esc(p ? p.barcode : '')}" placeholder="Scan, type or generate" style="min-width:120px">
          <button class="btn btn-soft" onclick="Products.scanBC()" title="Scan"><i class="fas fa-camera"></i></button>
          <button class="btn btn-soft" onclick="Products.genBC()" title="Generate barcode"><i class="fas fa-plus"></i> Gen</button>
          <button class="btn btn-soft" onclick="Products.printLabel()" title="Print / preview label"><i class="fas fa-print"></i></button>
        </div>
        <div class="flex gap2 mt2 items-c"><label class="label xs mb0">Format</label>
          <select id="pf-bcfmt" class="input" style="width:auto;min-width:110px" onchange="Products.bcHint()"><option value="code128">Code 128</option><option value="ean13">EAN-13</option><option value="qr">QR Code</option></select>
          <span class="xs muted" id="pf-bc-hint">Auto-unique from settings</span></div></div>
        <div class="grid2"><div class="field"><label class="label">Category</label><input id="pf-cat" class="input" list="pf-cats" value="${esc(p ? p.category : '')}"><datalist id="pf-cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
          <div class="field"><label class="label">Unit</label><input id="pf-unit" class="input" list="pf-units" value="${esc(p ? p.unit : 'Pcs')}"><datalist id="pf-units">${UNITS.map(u => `<option value="${u}">`).join('')}</datalist></div></div>
        <div class="grid2"><div class="field"><label class="label">Cost price</label><input id="pf-cost" type="number" step="any" min="0" class="input" value="${p ? p.cost || '' : ''}"></div>
          <div class="field"><label class="label">Sell price *</label><input id="pf-price" type="number" step="any" min="0" class="input" value="${p ? p.price : ''}"></div></div>
        <div class="grid2"><div class="field"><label class="label">Current stock</label><input id="pf-stock" type="number" step="any" class="input" value="${p ? p.stock : 0}"></div>
          <div class="field"><label class="label">Low stock limit</label><input id="pf-min" type="number" step="any" min="0" class="input" value="${p ? (p.minStock === undefined ? 5 : p.minStock) : (DB.settings.lowStockDefault || 5)}"></div></div>
        <div class="field"><label class="label">Expiry date (optional)</label><input id="pf-exp" type="date" class="input" value="${esc(p ? p.expiry : '')}"></div>
        <label class="switch"><span class="sm fw6">Track stock <span class="muted xs">(off for service/unlimited)</span></span><input type="checkbox" id="pf-track" ${!p || p.track !== false ? 'checked' : ''}></label>
        </div><div class="pf-side">
        ${extra}
        <div id="pf-variants-box" class="${biz === 'restaurant' || biz === 'clothing' || this._variants.length ? '' : 'hidden'}">
          <div class="sec-title mt3"><i class="fas fa-sliders ptext"></i> Sizes / Variants <button type="button" class="btn btn-sm btn-soft" onclick="Products.addVariantRow()">+ Add</button></div>
          <div id="pf-variants" class="mb2"></div>
          <p class="xs muted">e.g. Pizza 6″ / 9″ / 12″ with different prices</p>
        </div>
        <div id="pf-addons-box" class="${biz === 'restaurant' || this._addons.length ? '' : 'hidden'}">
          <div class="sec-title mt3"><i class="fas fa-plus ptext"></i> Add-ons / Modifiers <button type="button" class="btn btn-sm btn-soft" onclick="Products.addAddonGroup()">+ Group</button></div>
          <div id="pf-addons" class="mb2"></div>
          <p class="xs muted">e.g. Sauce, Extra cheese, Toppings — shown when selling</p>
        </div></div></div>
        `,
        foot: `<button class="btn" onclick="Modal.closeFrom(this)">Cancel</button><button class="btn btn-primary" onclick="Products.save('${id || ''}',this)">Save</button>` });
      setTimeout(() => { Products.renderVariantRows(); Products.renderAddonGroups(); const fmt = (p && p.barcodeFormat) || DB.settings.barcodeFormat || 'code128'; const sel = $('pf-bcfmt'); if (sel) sel.value = fmt; Products.bcHint(); }, 30);
    },
    _extraFieldsHtml(biz, p) {
      p = p || {};
      if (biz === 'pharmacy') {
        return `<div class="sec-title mt3"><i class="fas fa-tags ptext"></i> Pharmacy details</div>
          <div class="grid2"><div class="field"><label class="label">Manufacturer / Brand</label><input id="pf-mfr" class="input" value="${esc(p.manufacturer || '')}"></div>
            <div class="field"><label class="label">Strength / Dosage</label><input id="pf-strength" class="input" value="${esc(p.strength || '')}" placeholder="e.g. 500mg"></div></div>
          <div class="grid2"><div class="field"><label class="label">Form</label><input id="pf-form" class="input" list="pf-forms" value="${esc(p.form || '')}" placeholder="Tablet, Syrup…"><datalist id="pf-forms"><option value="Tablet"><option value="Capsule"><option value="Syrup"><option value="Injection"><option value="Cream"><option value="Drops"></datalist></div>
            <div class="field"><label class="label">Batch no.</label><input id="pf-batch" class="input" value="${esc(p.batch || '')}"></div></div>
          <label class="switch mt2"><span class="sm fw6">Prescription required (Rx)</span><input type="checkbox" id="pf-rx" ${p.rxRequired ? 'checked' : ''}></label>`;
      }
      if (biz === 'electronics') {
        return `<div class="sec-title mt3"><i class="fas fa-tags ptext"></i> Electronics details</div>
          <div class="grid2"><div class="field"><label class="label">Brand</label><input id="pf-brand" class="input" value="${esc(p.brand || '')}"></div>
            <div class="field"><label class="label">Model</label><input id="pf-model" class="input" value="${esc(p.model || '')}"></div></div>
          <div class="grid2"><div class="field"><label class="label">Warranty (months)</label><input id="pf-warranty" type="number" min="0" class="input" value="${p.warrantyMonths != null ? p.warrantyMonths : ''}"></div>
            <div class="field"><label class="label">Serial / IMEI (optional)</label><input id="pf-serial" class="input" value="${esc(p.serial || '')}"></div></div>`;
      }
      if (biz === 'clothing') {
        return `<div class="sec-title mt3"><i class="fas fa-tags ptext"></i> Clothing details</div>
          <div class="grid2"><div class="field"><label class="label">Brand</label><input id="pf-brand" class="input" value="${esc(p.brand || '')}"></div>
            <div class="field"><label class="label">Material</label><input id="pf-material" class="input" value="${esc(p.material || '')}"></div></div>
          <div class="grid2"><div class="field"><label class="label">Default size</label><input id="pf-size" class="input" value="${esc(p.size || '')}" placeholder="M, L, 42…"></div>
            <div class="field"><label class="label">Color</label><input id="pf-color" class="input" value="${esc(p.color || '')}"></div></div>`;
      }
      if (biz === 'grocery' || biz === 'wholesale') {
        return `<div class="sec-title mt3"><i class="fas fa-tags ptext"></i> Extra details</div>
          <div class="grid2"><div class="field"><label class="label">Brand</label><input id="pf-brand" class="input" value="${esc(p.brand || '')}"></div>
            <div class="field"><label class="label">SKU / Item code</label><input id="pf-sku" class="input" value="${esc(p.sku || '')}"></div></div>`;
      }
      if (biz === 'restaurant') {
        return `<div class="sec-title mt3"><i class="fas fa-tags ptext"></i> Food details</div>
          <div class="grid2"><div class="field"><label class="label">Prep time (min)</label><input id="pf-prep" type="number" min="0" class="input" value="${p.prepMinutes != null ? p.prepMinutes : ''}"></div>
            <div class="field"><label class="label">Allergens / notes</label><input id="pf-allergens" class="input" value="${esc(p.allergens || '')}" placeholder="Nuts, dairy…"></div></div>`;
      }
      return `<div class="sec-title mt3"><i class="fas fa-tags ptext"></i> Extra</div>
        <div class="grid2"><div class="field"><label class="label">Brand</label><input id="pf-brand" class="input" value="${esc(p.brand || '')}"></div>
          <div class="field"><label class="label">SKU</label><input id="pf-sku" class="input" value="${esc(p.sku || '')}"></div></div>`;
    },
    renderVariantRows() {
      const el = $('pf-variants'); if (!el) return;
      const rows = this._variants || [];
      if (!rows.length) { el.innerHTML = '<p class="xs muted">No variants yet</p>'; return; }
      el.innerHTML = rows.map((v, i) => `<div class="flex gap2 mb2 items-c">
        <input class="input grow" placeholder="Size / name" value="${esc(v.name || '')}" oninput="Products._variants[${i}].name=this.value">
        <input class="input" type="number" step="any" min="0" style="width:100px" placeholder="Price" value="${v.price != null ? v.price : ''}" oninput="Products._variants[${i}].price=parseFloat(this.value)||0">
        <button type="button" class="icon-btn" onclick="Products._variants.splice(${i},1);Products.renderVariantRows()"><i class="fas fa-trash bad"></i></button></div>`).join('');
    },
    addVariantRow() {
      if (!this._variants) this._variants = [];
      this._variants.push({ name: '', price: 0 });
      this.renderVariantRows();
    },
    renderAddonGroups() {
      const el = $('pf-addons'); if (!el) return;
      const groups = this._addons || [];
      if (!groups.length) { el.innerHTML = '<p class="xs muted">No add-on groups</p>'; return; }
      el.innerHTML = groups.map((g, gi) => {
        const opts = (g.options || []).map((o, oi) => `<div class="flex gap2 mb1 items-c">
          <input class="input grow" placeholder="Option" value="${esc(o.name || '')}" oninput="Products._addons[${gi}].options[${oi}].name=this.value">
          <input class="input" type="number" step="any" style="width:90px" placeholder="+price" value="${o.price != null ? o.price : 0}" oninput="Products._addons[${gi}].options[${oi}].price=parseFloat(this.value)||0">
          <button type="button" class="icon-btn" onclick="Products._addons[${gi}].options.splice(${oi},1);Products.renderAddonGroups()"><i class="fas fa-xmark"></i></button></div>`).join('');
        return `<div class="card pad-s mb2"><div class="flex gap2 items-c mb2">
          <input class="input grow" placeholder="Group name (e.g. Sauce)" value="${esc(g.name || '')}" oninput="Products._addons[${gi}].name=this.value">
          <label class="xs"><input type="checkbox" ${g.required ? 'checked' : ''} onchange="Products._addons[${gi}].required=this.checked"> Required</label>
          <button type="button" class="btn btn-sm btn-soft" onclick="Products._addons[${gi}].options=Products._addons[${gi}].options||[];Products._addons[${gi}].options.push({name:'',price:0});Products.renderAddonGroups()">+ Opt</button>
          <button type="button" class="icon-btn" onclick="Products._addons.splice(${gi},1);Products.renderAddonGroups()"><i class="fas fa-trash bad"></i></button></div>${opts || '<p class="xs bad fw6">No options yet — tap “+ Opt” to add one</p>'}</div>`;
      }).join('');
    },
    addAddonGroup() {
      if (!this._addons) this._addons = [];
      this._addons.push({ name: '', required: false, options: [{ name: '', price: 0 }] });
      this.renderAddonGroups();
    },
    bcHint() {
      const h = $('pf-bc-hint'); if (!h) return; const f = ($('pf-bcfmt') && $('pf-bcfmt').value) || 'code128';
      h.textContent = f === 'ean13' ? 'EAN-13: needs a valid 13-digit number (use Gen). Any other number is printed as Code 128 so it scans back exactly as stored' : f === 'qr' ? 'QR: any text, scannable by phone camera' : 'Code 128: letters + numbers, prefix from Settings';
    },
    usedBarcodes() { const me = this._editId || ''; return new Set(DB.products.filter(x => x.id !== me && x.barcode).map(x => BarcodeGen.normKey(x.barcode))); },
    genBC() {
      if (!window.BarcodeGen) { toast('⚠️ Barcode engine not loaded'); return; }
      const fmt = ($('pf-bcfmt') && $('pf-bcfmt').value) || DB.settings.barcodeFormat || 'code128';
      const used = this.usedBarcodes(); let n = Math.max(1, parseInt(DB.settings.nextBarcode, 10) || 1000001), code = '', guard = 0;
      do {                                                       // skip any number whose code already belongs to another product
        code = fmt === 'ean13' ? BarcodeGen.ean13Check('2' + String(n).padStart(11, '0').slice(-11))   // 20-29 = in-store range, never clashes with real products
          : BarcodeGen.uniqueCode(DB.settings.barcodePrefix || 'ESY', n);
        n++;
      } while (used.has(BarcodeGen.normKey(code)) && ++guard < 100000);
      const f = $('pf-bc'); if (f) f.value = code;
      DB.settings.nextBarcode = n; C.save('settings');
      toast('✓ Barcode generated: ' + code);
    },
    printLabel() {
      const name = ($('pf-name') && $('pf-name').value.trim()) || 'Product';
      const price = parseFloat(($('pf-price') && $('pf-price').value) || 0) || 0;
      const bc = ($('pf-bc') && $('pf-bc').value.trim()) || '';
      const fmt0 = ($('pf-bcfmt') && $('pf-bcfmt').value) || 'code128';
      if (!bc) { toast('⚠️ Enter or generate a barcode first'); return; }
      if (!window.BarcodeGen || !window.Barcodes) { toast('⚠️ Barcode engine not loaded'); return; }
      const lpP = window.LP && LP.paper(), sizes = (lpP ? [{ id: 'printer', w: lpP.w, h: lpP.h, label: `Printer paper — auto (${lpP.w}×${lpP.h} mm)` }] : []).concat(Barcodes.SIZES.filter(x => x.id !== 'custom')), sz0 = DB.settings.labelSize || (lpP ? 'printer' : '50x30');
      const dpi0 = DB.settings.printerDpi || 203, mode0 = DB.settings.labelMode || 'roll';
      const m = Modal.open({ title: 'Barcode label', body: `
        <div class="lbl-prev" id="lbl-prev" style="overflow:auto"></div><p class="xs warn tc mt2" id="lbl-note"></p>
        <div class="grid2 mt3"><div class="field"><label class="label">Format</label><select id="lbl-fmt" class="input"><option value="code128">Code 128</option><option value="ean13">EAN-13</option><option value="qr">QR Code</option></select></div>
          <div class="field"><label class="label">Label size</label><select id="lbl-size" class="input">${sizes.map(x => `<option value="${x.id}">${x.label}</option>`).join('')}</select></div></div>
        <div class="grid2"><div class="field"><label class="label">Copies</label><input id="lbl-n" type="number" min="1" max="200" value="1" class="input"></div>
          <div class="field"><label class="label">Print on</label><select id="lbl-mode" class="input"><option value="roll">Sticker roll (1 per page)</option><option value="sheet">A4 sheet (many per page)</option></select></div></div>
        <div class="field"><label class="label">Printer resolution</label><select id="lbl-dpi" class="input"><option value="203">203 dpi (most sticker printers)</option><option value="300">300 dpi</option><option value="600">600 dpi (laser / inkjet)</option></select></div>
        <p class="xs muted">In the print dialog choose your label size as paper, <b>Margins: None</b>, <b>Scale: 100%</b>. Scan the printed sticker, not the screen preview.</p>`,
        foot: `<button class="btn" onclick="Modal.closeFrom(this)">Close</button><button class="btn btn-primary" id="lbl-print"><i class="fas fa-print"></i> Print</button>` });
      const fs = m.querySelector('#lbl-fmt'), sel = m.querySelector('#lbl-size'), md = m.querySelector('#lbl-mode'), dp = m.querySelector('#lbl-dpi');
      fs.value = fmt0; sel.value = sizes.some(x => x.id === sz0) ? sz0 : sizes[0].id; md.value = mode0; dp.value = String(dpi0);
      const draw = () => {
        DB.settings.labelSize = sel.value; DB.settings.labelMode = md.value; DB.settings.printerDpi = parseInt(dp.value, 10) || 203;
        const size = sizes.find(x => x.id === sel.value) || sizes[0];
        const r = Barcodes.buildLabel(bc, name, price, fs.value, size, { showName: true, showPrice: true, showShop: false, barH: 18 });
        const z = Math.max(1, Math.min(2, Math.round(((m.querySelector('#lbl-prev').clientWidth || 300) - 36) / (size.w * 3.7795) * 20) / 20));
        m.querySelector('#lbl-prev').innerHTML = `<div style="zoom:${z}">${r.html}</div>`; m.querySelector('#lbl-note').textContent = r.note || '';
        return { r, size };
      };
      [fs, sel, md, dp].forEach(el => el.onchange = () => { draw(); C.save('settings'); }); draw();
      m.querySelector('#lbl-print').onclick = () => {
        const { r, size } = draw(); const n = Math.min(200, Math.max(1, parseInt(m.querySelector('#lbl-n').value, 10) || 1));
        Barcodes.output([{ r, copies: n }], size);
        if (r.note && !r.ok) toast('⚠️ ' + r.note);
      };
    },
    pickImg(input) {
      const f = input.files && input.files[0]; if (!f) return; const rd = new FileReader();
      rd.onload = e => { const im = new Image(); im.onload = () => { const r = Math.min(1, 320 / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * r); c.height = Math.round(im.height * r); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); this.img = c.toDataURL('image/jpeg', .7); $('pf-img').innerHTML = `<img src="${this.img}" style="width:100%;height:100%;object-fit:cover">`; }; im.src = e.target.result; };
      rd.readAsDataURL(f);
    },
    scanBC() { Scanner.open(code => { const f = $('pf-bc'); if (f) { f.value = code; toast('✓ Barcode captured'); } }, { hint: 'Hold product barcode' }); },
    configureForSale(p, quiet, opt0) {
      const variants = p.variants || [], addons = (p.addons || []).filter(g => g.options && g.options.length);
      let body = '';
      if (variants.length) {
        body += `<div class="cfg-group" id="cfg-g-var"><div class="cfg-title">Size / Variant <span class="cfg-hint">Choose one</span></div><div class="chips wrap" id="cfg-var">`;
        variants.forEach((v, i) => { body += `<button type="button" class="chip cfg-chip ${i === 0 ? 'on' : ''}" data-i="${i}"><span>${esc(v.name)}</span><small>${money(v.price)}</small></button>`; });
        body += `</div></div>`;
      }
      addons.forEach((g, gi) => {
        body += `<div class="cfg-group" id="cfg-g-${gi}"><div class="cfg-title">${esc(g.name || 'Option')} <span class="${g.required ? 'cfg-req' : 'cfg-hint'}">${g.required ? 'Required' : 'Optional'}</span></div><div class="chips wrap" id="cfg-ad-${gi}">`;
        (g.options || []).forEach((o, oi) => { body += `<button type="button" class="chip cfg-chip" data-gi="${gi}" data-oi="${oi}"><span>${esc(o.name)}</span>${o.price ? `<small>+${money(o.price)}</small>` : ''}</button>`; });
        body += `</div></div>`;
      });
      const m = Modal.open({
        title: p.name, size: 'wide',
        body: `${body}<div class="cfg-total"><span>Total</span><b id="cfg-total"></b></div>`,
        foot: `<button class="btn" onclick="Modal.closeFrom(this)">Cancel</button><button class="btn btn-primary" id="cfg-ok"><i class="fas fa-bag-shopping"></i> Add to cart</button>`
      });
      const read = () => {
        let linePrice = p.price, lineName = p.name, vi = -1; const sel = [], missing = [];
        const vb = m.querySelector('#cfg-var .chip.on');
        if (vb) { vi = parseInt(vb.getAttribute('data-i'), 10); const v = variants[vi]; if (v) { lineName = p.name + ' (' + v.name + ')'; linePrice = num(v.price); } }
        addons.forEach((g, gi) => {
          const on = m.querySelectorAll('#cfg-ad-' + gi + ' .chip.on');
          if (g.required && !on.length) missing.push(gi);
          on.forEach(btn => { const oi = parseInt(btn.getAttribute('data-oi'), 10), o = (g.options || [])[oi]; if (o) { linePrice = r2(linePrice + num(o.price)); sel.push({ gi, oi, name: o.name }); } });
        });
        return { lineName, linePrice, vi, sel, missing };
      };
      const upd = () => { const r = read(); const t = m.querySelector('#cfg-total'); if (t) t.textContent = money(r.linePrice); };
      m.addEventListener('click', e => {
        const b = e.target.closest('.cfg-chip'); if (!b || !m.contains(b)) return;
        if (b.hasAttribute('data-gi')) { b.classList.toggle('on'); const g = b.closest('.cfg-group'); if (g) g.classList.remove('miss'); }
        else { m.querySelectorAll('#cfg-var .chip').forEach(c => c.classList.remove('on')); b.classList.add('on'); }
        upd();
      });
      upd();
      m.querySelector('#cfg-ok').onclick = () => {
        const r = read();
        m.querySelectorAll('.cfg-group.miss').forEach(g => g.classList.remove('miss'));
        if (r.missing.length) {                                  // a required group is empty: block the add and say which one
          r.missing.forEach(gi => { const g = m.querySelector('#cfg-g-' + gi); if (g) g.classList.add('miss'); });
          const first = m.querySelector('#cfg-g-' + r.missing[0]); if (first && first.scrollIntoView) first.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          toast('⚠️ Select: ' + r.missing.map(gi => addons[gi].name || 'option').join(', '));
          return;
        }
        // one cart line per distinct configuration (same size + same add-ons merge; anything else stays separate)
        const cartKey = p.id + '|' + (r.vi >= 0 ? 'v' + r.vi : '') + '|' + r.sel.map(x => x.gi + '.' + x.oi).join(',');
        Modal.close(m);
        POS.add(p.id, quiet, { configured: true, lineName: r.lineName, linePrice: r.linePrice, note: r.sel.map(x => x.name).join(', '), cartKey, picked: !!(opt0 && opt0.picked) });
      };
    },
    save(id, btn) {
      const name = $('pf-name').value.trim(); const price = parseFloat($('pf-price').value);
      if (!name) { toast('⚠️ Enter product name'); return; } if (!isFinite(price) || price < 0) { toast('⚠️ Enter a valid sell price'); return; }
      const bc = $('pf-bc').value.trim();
      if (bc && DB.products.some(x => x.barcode && x.id !== id && (window.BarcodeGen ? BarcodeGen.normKey(x.barcode) === BarcodeGen.normKey(bc) : x.barcode === bc))) { toast('⚠️ This barcode is used by another product'); return; }
      const vs = (this._variants || []).filter(v => (v.name || '').trim()), seenV = new Set();
      for (const v of vs) { const k = v.name.trim().toLowerCase(); if (seenV.has(k)) { toast('⚠️ Duplicate size/variant: ' + v.name.trim()); return; } seenV.add(k); }
      for (const g of (this._addons || []).filter(g => (g.name || '').trim())) { if (!(g.options || []).some(o => (o.name || '').trim())) { toast('⚠️ Add at least one option to "' + g.name.trim() + '" (or delete the group)'); return; } }
      const old = id ? findProduct(id) : null;
      const obj = { id: id || genId(), name, barcode: bc, category: $('pf-cat').value.trim(), unit: $('pf-unit').value.trim() || 'Pcs', cost: Math.max(0, num($('pf-cost').value)), price,
        stock: Math.max(0, num($('pf-stock').value)), minStock: Math.max(0, num($('pf-min').value)), expiry: $('pf-exp').value, track: $('pf-track').checked, image: this.img || null, barcodeFormat: ($('pf-bcfmt') && $('pf-bcfmt').value) || DB.settings.barcodeFormat || 'code128' };
      // business-specific fields
      const biz = DB.settings.businessType || 'retail';
      if ($('pf-mfr')) obj.manufacturer = $('pf-mfr').value.trim();
      if ($('pf-strength')) obj.strength = $('pf-strength').value.trim();
      if ($('pf-form')) obj.form = $('pf-form').value.trim();
      if ($('pf-batch')) obj.batch = $('pf-batch').value.trim();
      if ($('pf-rx')) obj.rxRequired = $('pf-rx').checked;
      if ($('pf-brand')) obj.brand = $('pf-brand').value.trim();
      if ($('pf-model')) obj.model = $('pf-model').value.trim();
      if ($('pf-warranty')) obj.warrantyMonths = Math.max(0, num($('pf-warranty').value));
      if ($('pf-serial')) obj.serial = $('pf-serial').value.trim();
      if ($('pf-material')) obj.material = $('pf-material').value.trim();
      if ($('pf-size')) obj.size = $('pf-size').value.trim();
      if ($('pf-color')) obj.color = $('pf-color').value.trim();
      if ($('pf-sku')) obj.sku = $('pf-sku').value.trim();
      if ($('pf-prep')) obj.prepMinutes = Math.max(0, num($('pf-prep').value));
      if ($('pf-allergens')) obj.allergens = $('pf-allergens').value.trim();
      // variants & addons
      obj.variants = (this._variants || []).filter(v => (v.name || '').trim()).map(v => ({ name: String(v.name).trim(), price: Math.max(0, num(v.price)) }));
      obj.addons = (this._addons || []).filter(g => (g.name || '').trim()).map(g => ({
        name: String(g.name).trim(),
        required: !!g.required,
        options: (g.options || []).filter(o => (o.name || '').trim()).map(o => ({ name: String(o.name).trim(), price: num(o.price) }))
      }));
      if (old) Object.assign(old, obj); else DB.products.push(obj);
      C.save('products'); Modal.closeFrom(btn); toast(old ? 'Product updated ✓' : 'New product added ✓'); App.refresh();
    },
    del(id) {
      const p = findProduct(id); if (!p) return;
      askConfirm(`"${p.name}" Delete? Sales history stays, but the product is removed from the list.`, () => {
        DB.products = DB.products.filter(x => x.id !== id); DB.cart = DB.cart.filter(c => (c.productId || c.id) !== id); C.save('products'); C.save('cart'); toast('Product Deleted'); App.refresh();
      }, { title: 'Delete product?', yes: 'Yes, Delete', danger: true });
    },
    csvMenu() {
      Modal.open({ title: 'Product CSV', body: `<p class="muted sm mb3">Import many products from Excel/Google Sheet. Columns: Name, Barcode, Category, Cost, Sell price, Stock, Unit, Low stock limit, Expiry</p>
        <button class="btn btn-ghost btn-block mb2" onclick="Products.csvOut()"><i class="fas fa-file-export"></i> All Product Export (CSV)</button>
        <button class="btn btn-ghost btn-block mb2" onclick="Products.csvTemplate()"><i class="fas fa-file-lines"></i> Download empty template</button>
        <label class="btn btn-primary btn-block" style="cursor:pointer"><i class="fas fa-file-import"></i> CSV Import<input type="file" accept=".csv,text/csv" class="hidden" onchange="Products.csvIn(this)"></label>` });
    },
    head: ['Name', 'Barcode', 'Category', 'Cost', 'Sell price', 'Stock', 'Unit', 'Low stock limit', 'Expiry'],
    csvOut() { C.download('esypos-products.csv', C.toCSV([this.head, ...DB.products.map(p => [p.name, p.barcode, p.category, p.cost, p.price, p.stock, p.unit, p.minStock, p.expiry])]), 'text/csv'); },
    csvTemplate() { C.download('esypos-products-template.csv', C.toCSV([this.head, ['Tea', '8901001', 'Beverages', 5, 10, 100, 'Cup', 20, '']]), 'text/csv'); },
    csvIn(input) {
      const f = input.files && input.files[0]; input.value = ''; if (!f) return; const rd = new FileReader();
      rd.onload = e => {
        let rows = C.parseCSV(e.target.result); if (!rows.length) { toast('⚠️ File is empty'); return; }
        if (/^\s*(Name|name)\s*$/i.test(rows[0][0] || '')) rows = rows.slice(1);
        let add = 0, upd = 0, bad = 0;
        rows.forEach(r => {
          const name = (r[0] || '').trim(); const price = parseFloat(r[4]); if (!name || !isFinite(price) || price < 0) { bad++; return; }
          const bc = (r[1] || '').trim(); let p = (bc && DB.products.find(x => x.barcode === bc)) || DB.products.find(x => x.name === name);
          const data = { name, barcode: bc, category: (r[2] || '').trim(), cost: Math.max(0, num(r[3])), price, stock: Math.max(0, num(r[5])), unit: (r[6] || '').trim() || 'Pcs', minStock: r[7] === undefined || r[7] === '' ? (DB.settings.lowStockDefault || 5) : Math.max(0, num(r[7])), expiry: (r[8] || '').trim() };
          if (p) { Object.assign(p, data); upd++; } else { DB.products.push(Object.assign({ id: genId(), track: true, image: null }, data)); add++; }
        });
        C.save('products'); Modal.closeAll(); toast(`✓ ${add} new, ${upd} updated${bad ? ', ' + bad + ' excluded' : ''}`); App.refresh();
      };
      rd.readAsText(f);
    }
  };
  Views.products = Products;
  // Hide the cart bar while the on-screen keyboard is in use (like native apps).
  (function keyboardAware() {
    const field = el => !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !/^(checkbox|radio|button|submit|file)$/.test(el.type || '');
    document.addEventListener('focusin', e => { if (field(e.target)) document.body.classList.add('kb-open'); });
    document.addEventListener('focusout', () => setTimeout(() => { if (!field(document.activeElement)) document.body.classList.remove('kb-open'); }, 120));
  })();
  // A failure in one screen should never freeze the whole shop: log it and show one calm message.
  (function safety() {
    let last = 0;
    const warn = () => { const n = Date.now(); if (n - last > 8000) { last = n; try { toast('⚠️ Something went wrong. Your data is safe — please try again.'); } catch (_) {} } };
    window.addEventListener('error', e => { console.error('EsyPOS error', e.message); if (e && e.message && !/ResizeObserver|Script error/.test(e.message)) warn(); });
    window.addEventListener('unhandledrejection', e => { console.error('EsyPOS promise', e && e.reason); });
  })();
  document.addEventListener('DOMContentLoaded', () => {
    C.load(); POS.taxInit(); buildNav();
    const start = () => {
      let first = 'pos'; try { const g = new URLSearchParams(location.search).get('go'); if (g && App.Views[g]) first = g; } catch (_) {}   // app-icon shortcuts: index.html?go=products
      App.go(first); checkPendingBackup(); POS.renderCart(); if (window.Cloud) Cloud.init();
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});   // ask the browser not to evict shop data
    };
    if (window.Lock) Lock.init(start); else start();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && window.Lock) Lock.onResume(); else if (window.Lock) Lock.onHide(); });
  });
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = ((document.activeElement && document.activeElement.tagName) || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || (document.activeElement && document.activeElement.isContentEditable);
    if (document.querySelector('.modal-back,.ui-confirm-backdrop,.lock,.scan')) {
      if (e.key === 'Escape') {
        try {
          if (window.hasConfirm && hasConfirm()) closeConfirm();
          else if (window.Scanner && Scanner.isOpen()) Scanner.close();
          else if (Modal.stack.length) Modal.close();
        } catch (_) {}
      }
      return;
    }
    if (e.key === 'Escape') { App.closeDrawers(); return; }
    if (e.key === 'F2') {
      e.preventDefault();
      if (App.view !== 'pos') App.go('pos');
      setTimeout(() => { const s = document.getElementById('pos-search'); if (s) s.focus(); }, 50);
      return;
    }
    if (e.key === 'F4' && App.view === 'pos' && !typing) {
      e.preventDefault();
      if (DB.cart.length) POS.checkout();
      return;
    }
  });
  (function setupWedgeScanner() {
    /* A USB / Bluetooth scanner "types" the code like a very fast keyboard (a few ms per character), usually ending with Enter or Tab.
       Some scanners send NO ending key, so a scan is also finished after a short silence. Human typing is never treated as a scan:
       only a burst whose average speed is far faster than a person can type counts. When the code matches a product it is added to
       the cart straight away — no click, no Enter — wherever the cursor happens to be on the POS screen. */
    const MAX_GAP = 120, FAST_AVG = 70, IDLE = 90, MIN_LEN = 3;
    let buf = '', t0 = 0, last = 0, timer = null, startEl = null, startVal = '';
    const $s = () => document.getElementById('pos-search');
    const blocked = () => !!document.querySelector('.modal-back, .ui-confirm-backdrop, .lock, .scan');
    const isText = el => !!el && el.tagName === 'INPUT' && /^(text|search|number|tel|email|url|password|)$/i.test(el.type || '');
    function isTypingTarget(el) {                       // fields where a person is really typing (the search box is NOT one: scans go there)
      if (!el) return false;
      const t = (el.tagName || '').toLowerCase();
      if (t === 'textarea' || t === 'select' || el.isContentEditable) return true;
      if (t === 'input') { if (el.id === 'pos-search') return false; const ty = (el.type || '').toLowerCase(); return ty !== 'button' && ty !== 'checkbox' && ty !== 'radio' && ty !== 'submit'; }
      return false;
    }
    const fastBurst = () => buf.length >= MIN_LEN && (last - t0) / (buf.length - 1) <= FAST_AVG;
    function indicator(kind, code) {
      const el = document.querySelector('.scan-ready'); if (!el) return;
      el.classList.remove('hit', 'miss'); void el.offsetWidth; el.classList.add(kind);
      el.title = (kind === 'hit' ? 'Scanned: ' : 'Not found: ') + code;
      clearTimeout(indicator._t); indicator._t = setTimeout(() => el.classList.remove('hit', 'miss'), 1400);
    }
    function reset() { buf = ''; t0 = last = 0; startEl = null; startVal = ''; if (timer) { clearTimeout(timer); timer = null; } }
    function finish(viaKey) {
      const fast = fastBurst(), typed = buf, el = startEl, before = startVal, ps = $s();
      reset();
      if (!fast || App.view !== 'pos' || blocked() || (window.Scanner && Scanner.isOpen && Scanner.isOpen())) return false;
      // candidate codes: the burst itself, what the search box gained during the burst, then the whole box (irregular key timing)
      const cands = [typed.trim()];
      if (el && el.value !== undefined && el.value.startsWith(before) && el.value.length > before.length) cands.push(el.value.slice(before.length).trim());
      if (ps && document.activeElement === ps) cands.push(ps.value.trim());
      let p = null, used = typed.trim();
      for (const c of cands) { if (c.length >= MIN_LEN && (p = POS.findByBarcode(c))) { used = c; break; } }
      if (p) {
        if (el && el !== ps && isText(el)) { el.value = before; try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {} }   // undo the digits typed into another field
        POS.q = ''; if (ps) ps.value = '';
        POS.add(p.id, true, { picked: true });
        POS.renderGrid();
        if (ps && window.matchMedia && matchMedia('(hover:hover)').matches) { try { ps.focus(); } catch (_) {} }   // desktop: stay ready for the next scan; phones: no keyboard pop-up
        else { try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (_) {} }
        try { window.Sound && window.Sound.play && window.Sound.play('ok'); } catch (_) {}
        indicator('hit', used);
        return true;
      }
      // Looks like a barcode (has a digit, no spaces) but matches no product → report it. Anything else (a product NAME typed
      // quickly) is left alone so the normal search / Enter behaviour still works.
      if (/^(?=.*\d)[\w\-./]{4,}$/.test(used) && (viaKey || used.length >= 6)) {
        if (ps && ps.value) { ps.value = ''; POS.q = ''; POS.renderGrid(); }
        toast('⚠️ Barcode not found: ' + used);
        try { window.Sound && window.Sound.play && window.Sound.play('err'); } catch (_) {}
        indicator('miss', used);
        return false;
      }
      return viaKey ? 'pass' : false;
    }
    document.addEventListener('keydown', e => {
      if (App.view !== 'pos' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const ae = document.activeElement;
      if (blocked()) { reset(); return; }
      const now = performance.now();
      if (buf && now - last > MAX_GAP) reset();
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (fastBurst()) { const r = finish(true); if (r !== 'pass') { e.preventDefault(); e.stopPropagation(); } } else reset();
        return;
      }
      if (!e.key || e.key.length !== 1) return;
      if (isTypingTarget(ae) && !isText(ae)) { reset(); return; }               // textarea / select / contenteditable: never a scan
      if (!buf) { t0 = now; startEl = isText(ae) ? ae : null; startVal = startEl ? startEl.value : ''; }
      buf += e.key; last = now;
      if (e.key === ' ' && buf.length > 2 && fastBurst()) e.preventDefault();       // a space inside a code must not "click" a focused button
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { if (fastBurst()) finish(false); else reset(); }, IDLE);
    }, true);
  })();
})();
