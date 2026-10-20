/* EsyPOS core: data, calculations, helpers (no DOM dependency except toast) */
(function (root) {
  'use strict';
  const K = {
    products: 'esypos_products', sales: 'esypos_sales', customers: 'esypos_customers',
    payments: 'esypos_payments', suppliers: 'esypos_suppliers', purchases: 'esypos_purchases',
    spayments: 'esypos_spayments', expenses: 'esypos_expenses', returns: 'esypos_returns',
    hold: 'esypos_hold', cart: 'esypos_cart', settings: 'esypos_settings', adjust: 'esypos_adjust'
  };
  const DEFAULTS = {
    shopName: 'My Shop', shopAddress: '', shopPhone: '', defaultTax: 0,
    footer: 'Thank you! Come again', paper: '58', btMode: 'image',
    invPrefix: '', nextInvoice: 1, pinHash: '', pinSalt: '', lowStockDefault: 5, currency: '\u09F3',
    businessType: 'retail', barcodePrefix: 'ESY', nextBarcode: 1000001, barcodeFormat: 'code128', taxId: ''
  };
  const DB = { products: [], sales: [], customers: [], payments: [], suppliers: [], purchases: [],
               spayments: [], expenses: [], returns: [], hold: [], cart: [], adjust: [], settings: Object.assign({}, DEFAULTS) };
  function safeLoad(key, fallback) {
    try {
      const raw = root.localStorage.getItem(key);
      if (raw === null) return fallback;
      const val = JSON.parse(raw);
      if (val === null || Array.isArray(val) !== Array.isArray(fallback) || typeof val !== typeof fallback) return fallback;
      return val;
    } catch (e) {
      console.error('Could not read data:', key, e);
      try { root.localStorage.setItem(key + '_corrupt_' + Date.now(), root.localStorage.getItem(key)); } catch (_) {}
      return fallback;
    }
  }
  let rev = 0;                                   // bumps on every data change (cheap cache key for lists)
  function writeKey(key, value) {
    try {
      root.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Save failed:', key, e);
      toast('⚠️ Data not saved! Storage full — free space or reduce old data/images');
      return false;
    }
  }
  function safeSave(key, value) {                // immediate write (used for restore/import paths)
    const ok = writeKey(key, value);
    if (ok && key !== K.cart) { try { root.localStorage.setItem('esypos_dirty', '1'); } catch (_) {} if (root.Cloud) root.Cloud.markDirty(); }
    return ok;
  }
  // save(name): marks the collection dirty and writes it a moment later, so a tap never waits on JSON.stringify of
  // a large list. Several saves in the same action are merged into one write each. flush() runs on hide/close.
  const pending = new Set(); let saveTimer = null;
  function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    const names = Array.from(pending); pending.clear();
    let synced = false;
    names.forEach(name => {
      const key = K[name]; const ok = writeKey(key, name === 'settings' ? DB.settings : DB[name]);
      if (ok && name !== 'cart') synced = true;
    });
    if (synced) { try { root.localStorage.setItem('esypos_dirty', '1'); } catch (_) {} if (root.Cloud) root.Cloud.markDirty(); }
  }
  function save(name) {
    rev++;
    pending.add(name);
    if (name !== 'cart') { try { root.localStorage.setItem('esypos_dirty', '1'); } catch (_) {} }   // crash-safe marker, tiny write
    if (!saveTimer) saveTimer = setTimeout(flush, name === 'cart' ? 350 : 120);
    return true;
  }
  function saveAll() { Object.keys(K).forEach(n => pending.delete(n)); clearTimeout(saveTimer); saveTimer = null; rev++; Object.keys(K).forEach(n => safeSave(K[n], n === 'settings' ? DB.settings : DB[n])); }
  if (typeof root.addEventListener === 'function') {
    root.addEventListener('pagehide', flush);
    root.addEventListener('beforeunload', flush);
    if (root.document) root.document.addEventListener('visibilitychange', () => { if (root.document.visibilityState === 'hidden') flush(); });
  }
  function migrateBrandKeys() {
    try {
      const pairs = [
        ['propos_products','esypos_products'],['propos_sales','esypos_sales'],['propos_customers','esypos_customers'],
        ['propos_payments','esypos_payments'],['propos_suppliers','esypos_suppliers'],['propos_purchases','esypos_purchases'],
        ['propos_spayments','esypos_spayments'],['propos_expenses','esypos_expenses'],['propos_returns','esypos_returns'],
        ['propos_hold','esypos_hold'],['propos_cart','esypos_cart'],['propos_settings','esypos_settings'],
        ['propos_theme','esypos_theme'],['propos_sound','esypos_sound'],['propos_dirty','esypos_dirty'],
        ['propos_last_backup','esypos_last_backup'],['propos_welcomed','esypos_welcomed'],
        ['propos_g_on','esypos_g_on'],['propos_g_email','esypos_g_email'],['propos_g_name','esypos_g_name'],
        ['propos_g_pic','esypos_g_pic'],['propos_g_rev','esypos_g_rev'],['propos_g_fid','esypos_g_fid'],
        ['propos_g_last','esypos_g_last'],['propos_g_snap','esypos_g_snap'],['propos_g_dirty','esypos_g_dirty'],
        ['propos_g_client','esypos_g_client'],['propos_g_tok','esypos_g_tok']
      ];
      let moved = false;
      pairs.forEach(([oldK, newK]) => {
        if (root.localStorage.getItem(newK) != null) return;
        const v = root.localStorage.getItem(oldK);
        if (v != null) { root.localStorage.setItem(newK, v); root.localStorage.removeItem(oldK); moved = true; }
      });
      try {
        const st = sessionStorage.getItem('propos_g_tok');
        if (st && !sessionStorage.getItem('esypos_g_tok')) {
          sessionStorage.setItem('esypos_g_tok', st);
          sessionStorage.removeItem('propos_g_tok');
        }
      } catch (_) {}
      if (moved) console.info('EsyPOS: migrated data from ProPOS keys');
    } catch (e) { console.warn('EsyPOS migrate keys', e); }
  }
  function load() {
    migrateBrandKeys();
    Object.keys(K).forEach(name => {
      if (name === 'settings') DB.settings = Object.assign({}, DEFAULTS, safeLoad(K.settings, {}));
      else DB[name] = safeLoad(K[name], []);
    });
    migrate();
  }
  function migrate() {
    let changed = false;
    DB.products.forEach(p => {
      if (p.track === undefined) { p.track = true; changed = true; }
      if (p.expiry === undefined) { p.expiry = ''; changed = true; }
    });
    const need = DB.sales.some(s => s.no === undefined);
    if (need) {
      const old = DB.sales.filter(s => s.no !== undefined).map(s => s.no);
      let n = old.length ? Math.max.apply(null, old) : 0;
      DB.sales.slice().reverse().forEach(s => { if (s.no === undefined) { s.no = ++n; } });
      DB.settings.nextInvoice = Math.max(DB.settings.nextInvoice || 1, n + 1);
      changed = true;
    }
    DB.sales.forEach(s => {
      if (s.paid === undefined) { s.paid = s.total; s.due = 0; changed = true; }
      if (s.customerId === undefined) { s.customerId = null; changed = true; }
      (s.items || []).forEach(it => {
        if (it.cost === undefined) { const p = DB.products.find(x => x.id === it.id); it.cost = p ? (p.cost || 0) : 0; changed = true; }
      });
    });
    if (changed) { save('products'); save('sales'); save('settings'); }
  }
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const fmt = n => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  /* Legacy unit names saved by older versions (escaped so the source stays pure ASCII) -> English units */
  const UNIT_MAP = { '\u09AA\u09BF\u09B8':'Pcs', '\u0995\u09C7\u099C\u09BF':'Kg', '\u0997\u09CD\u09B0\u09BE\u09AE':'g', '\u09B2\u09BF\u099F\u09BE\u09B0':'L', '\u09AE\u09BF\u099F\u09BE\u09B0':'m', '\u09A1\u099C\u09A8':'Dozen', '\u09AC\u0995\u09CD\u09B8':'Box', '\u09AA\u09CD\u09AF\u09BE\u0995\u09C7\u099F':'Packet', '\u09AC\u09CB\u09A4\u09B2':'Bottle', '\u099C\u09CB\u09A1\u09BC\u09BE':'Pair', '\u0995\u09BE\u09AA':'Cup' };
  const unitLabel = u => UNIT_MAP[u] || u || 'Pcs';
  const cur = () => (DB.settings && DB.settings.currency != null ? String(DB.settings.currency) : '\u09F3');
  const money = n => cur() + fmt(n);
  const collator = (typeof Intl !== 'undefined' && Intl.Collator) ? new Intl.Collator(undefined, { sensitivity: 'base', numeric: true }) : { compare: (a, b) => String(a).localeCompare(String(b)) };
  const debounce = (fn, ms) => { let t = null; return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(() => fn.apply(c, a), ms); }; };
  // Product photos are stored as data URLs. Putting them straight into innerHTML re-parses megabytes on every keystroke,
  // so each photo is converted once to a small blob: URL and reused.
  const imgCache = new Map();
  function imgSrc(p) {
    const d = p && p.image; if (!d) return '';
    if (typeof d !== 'string' || d.slice(0, 5) !== 'data:' || typeof Blob === 'undefined' || !root.URL || !root.URL.createObjectURL) return d;
    const hit = imgCache.get(p.id); if (hit && hit.d === d) return hit.u;
    try {
      const i = d.indexOf(','); const mime = (d.slice(5, i).split(';')[0]) || 'image/jpeg'; const bin = root.atob(d.slice(i + 1));
      const arr = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
      if (hit) { try { root.URL.revokeObjectURL(hit.u); } catch (_) {} }
      const u = root.URL.createObjectURL(new Blob([arr], { type: mime })); imgCache.set(p.id, { d, u }); return u;
    } catch (_) { return d; }
  }
  const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const z2 = x => String(x).padStart(2, '0');
  const dkey = d => { d = d instanceof Date ? d : new Date(d); return d.getFullYear() + '-' + z2(d.getMonth() + 1) + '-' + z2(d.getDate()); };
  const todayKey = () => dkey(new Date());
  const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); const t = new Date(y, m - 1, d + n); return dkey(t); };
  const monthStart = () => { const t = new Date(); return t.getFullYear() + '-' + z2(t.getMonth() + 1) + '-01'; };
  const fmtDate = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtTime = iso => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const fmtDT = iso => fmtDate(iso) + ' · ' + fmtTime(iso);
  const invLabel = s => (DB.settings.invPrefix || '') + String(s.no || 0).padStart(4, '0');
  let toastTimer = null;
  function toast(msg) {
    if (typeof document === 'undefined') return;
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = msg; el.classList.remove('hidden');
    el.classList.toggle('t-ok', /✓/.test(msg)); el.classList.toggle('t-warn', /⚠/.test(msg));
    if (root.Sound) root.Sound.play(/✓/.test(msg) ? 'success' : /⚠/.test(msg) ? 'warn' : null);
    if (root.Haptic) { if (/✓/.test(msg)) root.Haptic.ok(); else if (/⚠/.test(msg)) root.Haptic.warn(); }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2800);
  }
  const findProduct = id => DB.products.find(p => p.id === id);
  const findCustomer = id => DB.customers.find(c => c.id === id);
  const findSupplier = id => DB.suppliers.find(c => c.id === id);
  const findSale = id => DB.sales.find(s => s.id === id);
  function customerBalance(id) {
    const c = findCustomer(id); if (!c) return 0;
    let b = num(c.openingDue);
    DB.sales.forEach(s => { if (s.customerId === id) b += num(s.due); });
    DB.payments.forEach(p => { if (p.customerId === id) b -= num(p.amount); });
    DB.returns.forEach(r => { if (r.customerId === id && r.refundType === 'due') b -= num(r.amount); });
    return r2(b);
  }
  function supplierBalance(id) {
    const c = findSupplier(id); if (!c) return 0;
    let b = num(c.openingDue);
    DB.purchases.forEach(p => { if (p.supplierId === id) b += num(p.due); });
    DB.spayments.forEach(p => { if (p.supplierId === id) b -= num(p.amount); });
    return r2(b);
  }
  const totalCustomerDue = () => r2(DB.customers.reduce((s, c) => s + Math.max(0, customerBalance(c.id)), 0));
  const totalSupplierDue = () => r2(DB.suppliers.reduce((s, c) => s + Math.max(0, supplierBalance(c.id)), 0));
  function returnedQty(saleId, itemId, key) {          // key = cart-line key (variant/add-on combo); older sales have none and match by product id
    let q = 0;
    DB.returns.forEach(r => { if (r.saleId === saleId) r.items.forEach(i => { if (key ? i.key === key : i.id === itemId) q += i.qty; }); });
    return q;
  }
  const returnedAmount = saleId => r2(DB.returns.filter(r => r.saleId === saleId).reduce((s, r) => s + num(r.amount), 0));
  function customerLedger(id) {
    const c = findCustomer(id); const rows = [];
    if (!c) return rows;
    if (num(c.openingDue)) rows.push({ date: c.created || '1970-01-01T00:00:00.000Z', type: 'opening', desc: 'Opening due', debit: num(c.openingDue), credit: 0 });
    DB.sales.forEach(s => { if (s.customerId === id) rows.push({ date: s.date, type: 'sale', desc: 'Sales #' + invLabel(s) + ' (Total ' + money(s.total) + ', Paid ' + money(s.paid) + ')', debit: num(s.due), credit: 0, ref: s.id }); });
    DB.payments.forEach(p => { if (p.customerId === id) rows.push({ date: p.date, type: 'payment', desc: 'Due Collected' + (p.note ? ' — ' + p.note : ''), debit: 0, credit: num(p.amount), ref: p.id }); });
    DB.returns.forEach(r => { if (r.customerId === id && r.refundType === 'due') rows.push({ date: r.date, type: 'return', desc: 'Returns (deducted from due)', debit: 0, credit: num(r.amount), ref: r.id }); });
    rows.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    let bal = 0; rows.forEach(r => { bal = r2(bal + r.debit - r.credit); r.balance = bal; });
    return rows;
  }
  function supplierLedger(id) {
    const c = findSupplier(id); const rows = [];
    if (!c) return rows;
    if (num(c.openingDue)) rows.push({ date: c.created || '1970-01-01T00:00:00.000Z', type: 'opening', desc: 'Opening payable', debit: num(c.openingDue), credit: 0 });
    DB.purchases.forEach(p => { if (p.supplierId === id) rows.push({ date: p.date, type: 'purchase', desc: 'Purchases #' + p.no + ' (Total ' + money(p.total) + ', Payment ' + money(p.paid) + ')', debit: num(p.due), credit: 0 }); });
    DB.spayments.forEach(p => { if (p.supplierId === id) rows.push({ date: p.date, type: 'payment', desc: 'Payment' + (p.note ? ' — ' + p.note : ''), debit: 0, credit: num(p.amount) }); });
    rows.sort((a, b) => a.date < b.date ? -1 : 1);
    let bal = 0; rows.forEach(r => { bal = r2(bal + r.debit - r.credit); r.balance = bal; });
    return rows;
  }
  function inRange(iso, from, to) { const k = dkey(iso); return (!from || k >= from) && (!to || k <= to); }
  function buildReport(from, to) {
    const S = DB.sales.filter(s => inRange(s.date, from, to));
    const R = DB.returns.filter(r => inRange(r.date, from, to));
    const E = DB.expenses.filter(e => inRange(e.date, from, to));
    const P = DB.payments.filter(p => inRange(p.date, from, to));
    const PU = DB.purchases.filter(p => inRange(p.date, from, to));
    const SP = DB.spayments.filter(p => inRange(p.date, from, to));
    const A = (DB.adjust || []).filter(a => inRange(a.date, from, to));
    const sum = (arr, f) => r2(arr.reduce((t, x) => t + num(f(x)), 0));
    const grossSales = sum(S, s => s.total);
    const returnsTotal = sum(R, r => r.amount);
    const cogs = sum(S, s => s.items.reduce((t, i) => t + num(i.cost) * i.qty, 0));
    const retCogs = sum(R, r => r.cogs);
    const salesRevenue = sum(S, s => num(s.subtotal) - num(s.discount));
    const retRevenue = sum(R, r => r.revenue);
    const grossProfit = r2(salesRevenue - cogs - (retRevenue - retCogs));
    const expenses = sum(E, e => e.amount);
    const writeOff = r2(A.reduce((t, a) => t + (a.pl && num(a.qty) < 0 ? -num(a.qty) * num(a.cost) : 0), 0));   // damaged / expired / lost stock, at cost
    const byMethod = { cash: 0, card: 0, mobile: 0 };
    S.forEach(s => { const m = byMethod[s.paymentMethod] !== undefined ? s.paymentMethod : 'cash'; byMethod[m] += num(s.paid); });
    const collected = {};
    ['cash', 'card', 'mobile'].forEach(m => { collected[m] = r2(byMethod[m] + sum(P.filter(p => (p.method || 'cash') === m), p => p.amount)); });
    const cashRefundAmt = sum(R.filter(r => r.refundType === 'cash'), r => r.amount);
    const cashSupplier = r2(sum(SP.filter(p => (p.method || 'cash') === 'cash'), p => p.amount) + sum(PU, p => p.paid));
    const cashNet = r2(collected.cash - cashRefundAmt - cashSupplier - expenses);   // estimate: purchases and expenses are assumed to be paid in cash
    const prod = {}; const cat = {};
    S.forEach(s => s.items.forEach(i => {
      const t = prod[i.id] = prod[i.id] || { name: i.name, qty: 0, amount: 0, profit: 0 };
      t.qty += i.qty; t.amount = r2(t.amount + i.price * i.qty); t.profit = r2(t.profit + (i.price - num(i.cost)) * i.qty);
      const p = findProduct(i.id); const cn = (p && p.category) || 'Other';
      cat[cn] = r2((cat[cn] || 0) + i.price * i.qty);
    }));
    return {
      from, to, count: S.length, grossSales, returnsTotal, netSales: r2(grossSales - returnsTotal),
      discount: sum(S, s => s.discount), tax: sum(S, s => s.tax), cogs: r2(cogs - retCogs), grossProfit,
      expenses, writeOff, netProfit: r2(grossProfit - expenses - writeOff), newDue: sum(S, s => s.due),
      dueCollected: sum(P, p => p.amount), supplierPaid: sum(SP, p => p.amount) + sum(PU, p => p.paid),
      purchases: sum(PU, p => p.total), cashRefund: cashRefundAmt, cashSupplier, cashNet,
      collected, topProducts: Object.values(prod).sort((a, b) => b.amount - a.amount).slice(0, 10),
      categories: Object.entries(cat).sort((a, b) => b[1] - a[1]), S, R, E, P, PU
    };
  }
  const stockValue = () => r2(DB.products.reduce((s, p) => s + (p.track === false ? 0 : num(p.stock) * num(p.cost)), 0));
  // Neutralise spreadsheet formulas (=, @, tab, or +/- followed by non-numeric text) in exported text cells
  function csvCell(c) {
    if (c == null) return '';
    if (typeof c === 'number') return String(c);
    c = String(c);
    if (/^[=@\t\r]/.test(c) || (/^[+-]/.test(c) && !/^[+-]?[\d\s().-]+$/.test(c))) c = "'" + c;
    return /[",\n\r]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
  }
  function toCSV(rows) {
    return '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  }
  function parseCSV(text) {
    text = text.replace(/^\ufeff/, ''); const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (ch !== '\r') cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  }
  function download(name, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  const api = { K, DEFAULTS, DB, safeLoad, safeSave, save, saveAll, flush, rev: () => rev, collator, debounce, imgSrc, cur, load, migrate, esc, num, r2, fmt, money, genId, z2, dkey, todayKey, addDays, monthStart,
    fmtDate, fmtTime, fmtDT, invLabel, toast, unitLabel, findProduct, findCustomer, findSupplier, findSale, customerBalance, supplierBalance, totalCustomerDue,
    totalSupplierDue, returnedQty, returnedAmount, customerLedger, supplierLedger, buildReport, stockValue, toCSV, parseCSV, download, inRange };
  root.Core = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
