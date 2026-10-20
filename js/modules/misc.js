/* EsyPOS: Receipt, Returns, History, Expenses, Reports, Dashboard */
(function () {
  'use strict';
  const C = Core, { DB, esc, num, r2, fmt, money, genId, toast, findProduct, findCustomer } = C;
  const $ = id => document.getElementById(id);
  const MN = { cash: 'Cash', card: 'Card', mobile: 'Mobile banking', due: 'Due' };
  const RC_CSS = `body{font-family:'Courier New',ui-monospace,monospace;font-size:12px;margin:0;padding:6px;color:#000}
  .rc-c{text-align:center}.rc-b{font-weight:700}.rc-hr{border-top:1px dashed #000;margin:6px 0}.rc-row{display:flex;justify-content:space-between;gap:6px}
  .rc-s{font-size:10.5px}.rc-big{font-size:14px;font-weight:700}@page{margin:2mm}`;
  const Receipt = window.Receipt = {
    cur: null,
    inner(s) {
      const sh = DB.settings; const cust = findCustomer(s.customerId); const ret = C.returnedAmount(s.id);
      const bal = cust ? C.customerBalance(cust.id) : 0;
      return `<div class="rc-c rc-b" style="font-size:15px">${esc(sh.shopName || 'EsyPOS')}</div>
        ${sh.shopAddress ? `<div class="rc-c rc-s">${esc(sh.shopAddress)}</div>` : ''}${sh.shopPhone ? `<div class="rc-c rc-s">Phone: ${esc(sh.shopPhone)}</div>` : ''}${sh.taxId ? `<div class="rc-c rc-s">VAT/BIN: ${esc(sh.taxId)}</div>` : ''}
        <div class="rc-hr"></div>
        <div class="rc-row rc-s"><span>Receipt no.</span><b>#${C.invLabel(s)}</b></div>
        <div class="rc-row rc-s"><span>Date</span><span>${C.fmtDT(s.date)}</span></div>
        ${cust ? `<div class="rc-row rc-s"><span>Customer</span><span>${esc(cust.name)}${cust.phone ? ' · ' + esc(cust.phone) : ''}</span></div>` : ''}
        <div class="rc-row rc-s"><span>Payment</span><span>${MN[s.paymentMethod] || ''}</span></div>
        <div class="rc-hr"></div>
        ${s.items.map(i => `<div class="rc-row"><span>${esc(i.name)}${i.note ? `<br><span class="rc-s">+ ${esc(i.note)}</span>` : ''}<br><span class="rc-s">${i.qty} × ${money(i.price)}</span></span><b>${money(i.price * i.qty)}</b></div>`).join('')}
        <div class="rc-hr"></div>
        <div class="rc-row"><span>Subtotal</span><span>${money(s.subtotal)}</span></div>
        ${s.discount > 0 ? `<div class="rc-row"><span>Discount</span><span>-${money(s.discount)}</span></div>` : ''}
        ${s.tax > 0 ? `<div class="rc-row"><span>Tax</span><span>${money(s.tax)}</span></div>` : ''}
        <div class="rc-row rc-big"><span>Total</span><span>${money(s.total)}</span></div>
        <div class="rc-row"><span>Paid</span><span>${money(s.paid)}</span></div>
        ${s.change > 0 ? `<div class="rc-row"><span>Change given</span><span>${money(s.change)}</span></div>` : ''}
        ${s.due > 0 ? `<div class="rc-row rc-b"><span>Due on this bill</span><span>${money(s.due)}</span></div>` : ''}
        ${ret > 0 ? `<div class="rc-row"><span>Returned</span><span>-${money(ret)}</span></div>` : ''}
        ${cust && bal > 0 ? `<div class="rc-row rc-b"><span>Total due (all bills)</span><span>${money(bal)}</span></div>` : ''}
        ${s.note ? `<div class="rc-hr"></div><div class="rc-s">Note: ${esc(s.note)}</div>` : ''}
        <div class="rc-hr"></div><div class="rc-c rc-s">${esc(sh.footer || '')}</div>`;
    },
    text(s) {
      const sh = DB.settings; const cust = findCustomer(s.customerId);
      let t = `*${sh.shopName}*\n` + (sh.shopPhone ? 'Phone: ' + sh.shopPhone + '\n' : '') + (sh.taxId ? 'VAT/BIN: ' + sh.taxId + '\n' : '') + `Receipt #${C.invLabel(s)} · ${C.fmtDT(s.date)}\n` + (cust ? 'Customer: ' + cust.name + '\n' : '') + '------------------\n';
      s.items.forEach(i => { t += `${i.name}${i.note ? ' (+ ' + i.note + ')' : ''} ${i.qty}×${fmt(i.price)} = ${fmt(i.price * i.qty)}\n`; });
      t += '------------------\n';
      if (s.discount > 0) t += `Discount: -${fmt(s.discount)}\n`; if (s.tax > 0) t += `Tax: ${fmt(s.tax)}\n`;
      t += `*Total: ${money(s.total)}*\nPaid: ${money(s.paid)}\n`; if (s.due > 0) t += `*Due: ${money(s.due)}*\n`;
      return t + (sh.footer || '');
    },
    showId(id) { const s = C.findSale(id); if (s) Receipt.show(s); },
    show(s, opt) {
      opt = opt || {}; this.cur = s;
      const btOk = window.Printer && Printer.isConnected();
      Modal.open({ title: 'Receipt #' + C.invLabel(s), size: 'full', body: `
        <div class="receipt" id="rc-paper">${this.inner(s)}</div>
        <div style="max-width:380px;margin:14px auto 0">
          <div class="grid2 mb2"><button class="btn btn-primary" onclick="Receipt.print()"><i class="fas fa-print"></i> Print</button><button class="btn btn-soft" onclick="Receipt.bt()"><i class="fab fa-bluetooth-b"></i> ${btOk ? 'Bluetooth print' : 'Bluetooth connect'}</button></div>
          <div class="grid2 mb2"><button class="btn btn-ghost" onclick="Receipt.share('wa')"><i class="fab fa-whatsapp ok"></i> WhatsApp</button><button class="btn btn-ghost" onclick="Receipt.share('sms')"><i class="fas fa-message"></i> SMS</button></div>
          <div class="grid2">${s.due > 0 && s.customerId ? `<button class="btn btn-ok" onclick="People.collect('${s.customerId}')"><i class="fas fa-hand-holding-dollar"></i> Due Collected</button>` : '<span></span>'}
          <button class="btn btn-danger-soft" onclick="Receipt.ret('${s.id}')"><i class="fas fa-rotate-left"></i> Return items</button></div>
          <button class="btn btn-ghost btn-block mt2" onclick="Receipt.del('${s.id}')"><i class="fas fa-trash bad"></i> Delete bill</button></div>`,
        foot: `<button class="btn btn-primary" onclick="Modal.closeFrom(this)">${opt.fresh ? 'New sale' : 'Close'}</button>` });
    },
    print() {
      const w = DB.settings.paper === '80' ? '72mm' : '48mm';
      printHTML(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt</title><style>${RC_CSS}body{width:${w}}</style></head><body>${this.inner(this.cur)}</body></html>`);
    },
    bt() { Printer.print(this.cur); },
    share(kind) { const s = this.cur; const c = findCustomer(s.customerId); const ph = c ? c.phone : ''; if (kind === 'wa') shareWA(ph, this.text(s)); else shareSMS(ph, this.text(s)); },
    del(id) {
      const s = C.findSale(id); if (!s) return;
      if (DB.returns.some(r => r.saleId === id)) { toast('⚠️ This bill has returns, so it cannot be deleted'); return; }
      const run = () => askConfirm('Delete bill #' + C.invLabel(s) + '? Its items go back to stock' + (s.due > 0 ? ' and its due is removed from the customer' : '') + '. Money already collected stays on record. This cannot be undone.', () => {
        s.items.forEach(i => { const p = findProduct(i.id); if (p && p.track !== false) p.stock = r2(num(p.stock) + num(i.qty)); });
        DB.sales = DB.sales.filter(x => x.id !== id);
        C.save('products'); C.save('sales');
        if (window.Guard && Guard.log) Guard.log('Bill #' + C.invLabel(s) + ' deleted (' + money(s.total) + ')');
        Modal.closeAll(); toast('Bill deleted'); App.refresh();
      }, { title: 'Delete bill?', yes: 'Yes, delete', danger: true });
      if (window.Guard && Guard.confirmPin) Guard.confirmPin(run, 'delete bill'); else run();
    },
    ret(saleId) {
      const s = C.findSale(saleId); if (!s) return;
      const rows = s.items.map(i => ({ ...i, left: r2(i.qty - C.returnedQty(s.id, i.id, i.key)) })).filter(i => i.left > 0);
      if (!rows.length) { toast('All items on this bill have already been returned'); return; }
      const canDue = !!s.customerId;
      const m = Modal.open({ title: 'Return items — #' + C.invLabel(s), body: `
        ${rows.map((i, k) => `<div class="flex items-c gap3 mb2"><div class="grow"><div class="fw6 sm">${esc(i.name)}</div>${i.note ? `<div class="xs muted">+ ${esc(i.note)}</div>` : ''}<div class="xs muted">${money(i.price)} · Returnable ${i.left}</div></div><input type="number" min="0" max="${i.left}" step="any" class="input rt-q" data-k="${k}" style="width:90px" value="0" oninput="Receipt.retCalc()"></div>`).join('')}
        <div class="field mt3"><label class="label">Refund type</label><select id="rt-type" class="input" onchange="Receipt.retCalc()"><option value="cash">Cash refund</option>${canDue ? '<option value="due" ' + (s.due > 0 ? 'selected' : '') + '>Deduct from customer due</option>' : ''}</select></div>
        <div class="field"><label class="label">Reason (optional)</label><input id="rt-note" class="input"></div>
        <div class="card pad-s sumrow big" style="margin:0"><span>Return value</span><span class="ptext" id="rt-amt">${C.money(0)}</span></div>`,
        foot: `<button class="btn" onclick="Modal.closeFrom(this)">Cancel</button><button class="btn btn-bad" id="rt-ok">Confirm return</button>` });
      m._rows = rows; m._sale = s; this._rm = m; this.retCalc();
      m.querySelector('#rt-ok').onclick = () => {
        const calc = Receipt.retCalc(); if (!calc.items.length) { toast('⚠️ Enter return qty'); return; }
        askConfirm(`Refund ${money(calc.amount)} and return the items to stock?`, () => {
          calc.items.forEach(i => { const p = findProduct(i.id); if (p && p.track !== false) p.stock = r2(num(p.stock) + i.qty); });
          DB.returns.push({ id: genId(), date: new Date().toISOString(), saleId: s.id, customerId: s.customerId || null, items: calc.items, amount: calc.amount, revenue: calc.revenue, cogs: calc.cogs, refundType: $('rt-type').value, note: $('rt-note').value.trim() });
          C.save('products'); C.save('returns'); Modal.closeAll(); toast('Return saved ✓'); App.refresh();
        }, { yes: 'Yes, take return', icon: 'fa-rotate-left' });
      };
    },
    retCalc() {
      const m = this._rm; const s = m._sale; const items = [];
      m.querySelectorAll('.rt-q').forEach(inp => { const r = m._rows[+inp.dataset.k]; let q = num(inp.value); if (q > r.left) { q = r.left; inp.value = q; } if (q > 0) items.push({ id: r.id, key: r.key, name: r.name, price: r.price, cost: r.cost || 0, qty: q }); });
      const gross = items.reduce((t, i) => t + i.price * i.qty, 0);
      const amount = r2(gross * (s.subtotal ? s.total / s.subtotal : 1)); const revenue = r2(gross * (s.subtotal ? (s.subtotal - s.discount) / s.subtotal : 1));
      const cogs = r2(items.reduce((t, i) => t + i.cost * i.qty, 0)); $('rt-amt').textContent = money(amount);
      return { items, amount, revenue, cogs };
    }
  };
  const Hist = window.Hist = {
    preset: 'today', from: '', to: '', q: '', st: 'all', lim: 100,
    more() { this.lim += 100; this.render(); },
    range() { const t = C.todayKey(); return { today: [t, t], week: [C.addDays(t, -6), t], month: [C.monthStart(), t], all: ['', ''], custom: [this.from, this.to] }[this.preset]; },
    render() {
      const [f, t] = this.range();
      $('view').innerHTML = `<div class="page-head"><div><h2>Sales History</h2><p>View receipts, take returns, collect dues</p></div><button class="btn btn-ghost" onclick="Hist.csv()"><i class="fas fa-file-csv"></i> CSV</button></div>
      <div class="card pad-s mb3"><div class="chips mb2">${[['today', 'Today'], ['week', '7 Days'], ['month', 'This Month'], ['all', 'All'], ['custom', 'Custom']].map(p => `<button class="chip ${this.preset === p[0] ? 'on' : ''}" onclick="Hist.setP('${p[0]}')">${p[1]}</button>`).join('')}</div>
        ${this.preset === 'custom' ? `<div class="grid2 mb2"><input type="date" class="input" value="${this.from}" onchange="Hist.from=this.value;Hist.list()"><input type="date" class="input" value="${this.to}" onchange="Hist.to=this.value;Hist.list()"></div>` : ''}
        <div class="relative mb2"><i class="fas fa-magnifying-glass search-ico"></i><input class="input has-ico" placeholder="Receipt #, customer or product..." value="${esc(this.q)}" oninput="Hist.q=this.value;Hist.list()"></div>
        <div class="chips">${[['all', 'All'], ['due', 'Due'], ['ret', 'Has returns']].map(p => `<button class="chip ${this.st === p[0] ? 'on' : ''}" onclick="Hist.st='${p[0]}';Hist.render()">${p[1]}</button>`).join('')}</div></div>
      <div class="stats" id="h-stats"></div><div class="card" id="h-list"></div>`;
      this.list();
    },
    setP(p) { this.preset = p; this.render(); },
    rows() {
      const [f, t] = this.range(); const q = this.q.trim().toLowerCase();
      return DB.sales.filter(s => C.inRange(s.date, f, t)).filter(s => {
        if (this.st === 'due' && !(s.due > 0)) return false; if (this.st === 'ret' && !C.returnedAmount(s.id)) return false;
        if (!q) return true; const c = findCustomer(s.customerId);
        return C.invLabel(s).toLowerCase().includes(q) || (c && (c.name.toLowerCase().includes(q) || (c.phone || '').includes(q))) || s.items.some(i => i.name.toLowerCase().includes(q));
      });
    },
    list() {
      const arr = this.rows(); const tot = r2(arr.reduce((s, x) => s + x.total, 0)); const due = r2(arr.reduce((s, x) => s + num(x.due), 0));
      $('h-stats').innerHTML = `<div class="stat"><div class="k">Bills</div><div class="v">${arr.length}</div></div><div class="stat"><div class="k">Gross Sales</div><div class="v">${money(tot)}</div></div><div class="stat"><div class="k">Due given</div><div class="v bad">${money(due)}</div></div>`;
      const lim = this.lim || 100; $('h-list').innerHTML = arr.length ? arr.slice(0, lim).map(s => { const c = findCustomer(s.customerId); const ret = C.returnedAmount(s.id); return `<div class="row" onclick="Receipt.showId('${s.id}')"><div class="avatar"><i class="fas fa-receipt"></i></div>
        <div class="grow"><div class="t">#${C.invLabel(s)} · ${esc(c ? c.name : 'Walk-in')}</div><div class="s">${C.fmtDT(s.date)} · ${esc(s.items.map(i => i.name + '×' + i.qty).join(', '))}</div></div>
        <div class="tr"><div class="fw7 ptext">${money(s.total)}</div><div class="flex gap1" style="justify-content:flex-end">${s.due > 0 ? `<span class="badge b-bad">Due ${money(s.due)}</span>` : `<span class="badge b-ok">${MN[s.paymentMethod] || 'Cash'}</span>`}${ret ? '<span class="badge b-warn">Returns</span>' : ''}</div></div></div>`; }).join('') + (arr.length > lim ? `<div class="tc mt3"><button class="btn btn-ghost" onclick="Hist.more()">Show more (${arr.length - lim} left)</button></div>` : '') : '<div class="empty"><i class="fas fa-receipt"></i>No sales</div>';
    },
    csv() { const arr = this.rows(); C.download('esypos-sales.csv', C.toCSV([['Receipt', 'Date', 'Customer', 'Subtotal', 'Discount', 'Tax', 'Total', 'Paid', 'Due', 'Payment', 'Product'], ...arr.map(s => { const c = findCustomer(s.customerId); return [C.invLabel(s), C.dkey(s.date), c ? c.name : '', s.subtotal, s.discount, s.tax, s.total, s.paid, s.due, MN[s.paymentMethod], s.items.map(i => i.name + '×' + i.qty).join('; ')]; })]), 'text/csv'); }
  };
  App.Views.history = Hist;
  const CATS = ['Rent', 'Utilities', 'Salary', 'Transport', 'Mobile/Internet', 'Repair', 'Snacks/tea', 'Other'];
  const Exp = window.Exp = {
    from: '', to: '',
    get F() { return this.from || C.monthStart(); }, get T() { return this.to || C.todayKey(); },
    render() {
      $('view').innerHTML = `<div class="page-head"><div><h2>Expenses</h2><p>Daily and monthly expense tracking</p></div><button class="btn btn-primary" onclick="Exp.add()"><i class="fas fa-plus"></i> New expense</button></div>
      <div class="card pad-s mb3"><div class="grid2"><div><label class="label">From</label><input type="date" class="input" value="${this.F}" onchange="Exp.from=this.value;Exp.list()"></div><div><label class="label">To</label><input type="date" class="input" value="${this.T}" onchange="Exp.to=this.value;Exp.list()"></div></div></div>
      <div id="ex-sum"></div><div class="card" id="ex-list"></div>`;
      this.list();
    },
    list() {
      const arr = DB.expenses.filter(e => C.inRange(e.date, this.F, this.T)).sort((a, b) => a.date < b.date ? 1 : -1);
      const tot = r2(arr.reduce((s, e) => s + num(e.amount), 0)); const by = {};
      arr.forEach(e => by[e.category] = r2((by[e.category] || 0) + num(e.amount)));
      $('ex-sum').innerHTML = `<div class="stats"><div class="stat hl"><div class="k">Total Expenses</div><div class="v">${money(tot)}</div></div><div class="stat"><div class="k">Entries</div><div class="v">${arr.length}</div></div></div>` +
        (Object.keys(by).length ? `<div class="chips mb3">${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="badge b-p" style="padding:6px 12px;font-size:12px">${esc(k)}: ${money(v)}</span>`).join('')}</div>` : '');
      $('ex-list').innerHTML = arr.length ? arr.map(e => `<div class="row" onclick="Exp.add('${e.id}')"><div class="avatar"><i class="fas fa-wallet"></i></div><div class="grow"><div class="t">${esc(e.category)}</div><div class="s">${C.fmtDate(e.date)}${e.note ? ' · ' + esc(e.note) : ''}</div></div><div class="fw7 bad">${money(e.amount)}</div><button class="icon-btn" aria-label="Delete" title="Delete" onclick="event.stopPropagation();Exp.del('${e.id}')"><i class="fas fa-trash bad"></i></button></div>`).join('') : '<div class="empty"><i class="fas fa-wallet"></i>No expenses</div>';
    },
    add(id) {
      const ex = id ? DB.expenses.find(e => e.id === id) : null;
      const cats = [...new Set([...CATS, ...DB.expenses.map(e => e.category)])];
      const m = Modal.open({ title: ex ? 'Edit expense' : 'New expense', body: `<div class="field"><label class="label">Category *</label><input id="ex-cat" class="input" list="ex-cats" placeholder="e.g. rent" autofocus value="${esc(ex ? ex.category : '')}"><datalist id="ex-cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="grid2"><div class="field"><label class="label">Amount *</label><input id="ex-amt" type="number" step="any" min="0" class="input" value="${ex ? ex.amount : ''}"></div><div class="field"><label class="label">Date</label><input id="ex-date" type="date" class="input" value="${ex ? C.dkey(ex.date) : C.todayKey()}"></div></div>
        <div class="field"><label class="label">Note</label><input id="ex-note" class="input" value="${esc(ex ? ex.note : '')}"></div>`, foot: `<button class="btn" onclick="Modal.closeFrom(this)">Cancel</button><button class="btn btn-primary" id="ex-ok">Save</button>` });
      m.querySelector('#ex-ok').onclick = () => {
        const cat = $('ex-cat').value.trim(), amt = num($('ex-amt').value); if (!cat || amt <= 0) { toast('⚠️ Enter category & amount'); return; }
        const d = $('ex-date').value || C.todayKey(); const now = new Date(); const iso = new Date(d + 'T' + C.z2(now.getHours()) + ':' + C.z2(now.getMinutes()) + ':00').toISOString();
        const rec = { category: cat, amount: r2(amt), note: $('ex-note').value.trim() };
        if (ex) { Object.assign(ex, rec); if (C.dkey(ex.date) !== d) ex.date = iso; } else DB.expenses.push(Object.assign({ id: genId(), date: iso }, rec));
        C.save('expenses'); Modal.close(m); toast('Expense saved ✓'); this.list();
      };
    },
    del(id) { askConfirm('Delete this expense?', () => { DB.expenses = DB.expenses.filter(e => e.id !== id); C.save('expenses'); toast('Deleted'); this.list(); }, { danger: true, yes: 'Delete' }); }
  };
  App.Views.expenses = Exp;
  const Rep = window.Rep = {
    preset: 'today', from: '', to: '',
    range() { const t = C.todayKey(); return { today: [t, t], yday: [C.addDays(t, -1), C.addDays(t, -1)], week: [C.addDays(t, -6), t], month: [C.monthStart(), t], all: ['', ''], custom: [this.from, this.to] }[this.preset]; },
    render() {
      $('view').innerHTML = `<div class="page-head"><div><h2>Reports</h2><p>Sales, profit/loss & collections</p></div><div class="flex gap2"><button class="btn btn-ghost" onclick="Rep.csv()"><i class="fas fa-file-csv"></i></button><button class="btn btn-ghost" onclick="Rep.print()"><i class="fas fa-print"></i></button></div></div>
      <div class="card pad-s mb3"><div class="chips">${[['today', 'Today'], ['yday', 'Yesterday'], ['week', '7 Days'], ['month', 'This Month'], ['all', 'All'], ['custom', 'Custom']].map(p => `<button class="chip ${this.preset === p[0] ? 'on' : ''}" onclick="Rep.setP('${p[0]}')">${p[1]}</button>`).join('')}</div>
        ${this.preset === 'custom' ? `<div class="grid2 mt2"><input type="date" class="input" value="${this.from}" onchange="Rep.from=this.value;Rep.body()"><input type="date" class="input" value="${this.to}" onchange="Rep.to=this.value;Rep.body()"></div>` : ''}</div><div id="rep-body"></div>`;
      this.body();
    },
    setP(p) { this.preset = p; this.render(); },
    data() { const [f, t] = this.range(); return C.buildReport(f, t); },
    body() {
      const r = this.data();
      $('rep-body').innerHTML = `
      <div class="stats"><div class="stat hl"><div class="k">Net profit (after expenses & write-offs)</div><div class="v">${money(r.netProfit)}</div></div><div class="stat"><div class="k">Net Sales</div><div class="v">${money(r.netSales)}</div></div>
        <div class="stat"><div class="k">Gross Profit</div><div class="v ok">${money(r.grossProfit)}</div></div><div class="stat"><div class="k">Expenses</div><div class="v bad">${money(r.expenses)}</div></div></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-cash-register ptext"></i> Sales breakdown</div>
        ${[['Invoices', r.count], ['Gross Sales', money(r.grossSales)], ['Returns', '-' + money(r.returnsTotal)], ['Discount applied', money(r.discount)], ['Tax Collected', money(r.tax)], ['COGS of sold products', money(r.cogs)], ['Stock write-offs (at cost)', money(r.writeOff)]].map(x => `<div class="kv"><span class="muted">${x[0]}</span><b>${x[1]}</b></div>`).join('')}</div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-hand-holding-dollar ptext"></i> Collections & dues</div>
        ${[['New due given', `<span class="bad">${money(r.newDue)}</span>`], ['Due collected', `<span class="ok">${money(r.dueCollected)}</span>`], ['Cash collected (sales+due)', money(r.collected.cash)], ['Card collected', money(r.collected.card)], ['Mobile banking collected', money(r.collected.mobile)], ['Purchases (stock)', money(r.purchases)], ['Paid to suppliers', money(r.supplierPaid)], ['Cash refunds', money(r.cashRefund)]].map(x => `<div class="kv"><span class="muted">${x[0]}</span><b>${x[1]}</b></div>`).join('')}
        <div class="kv"><span class="muted">Total customer due (now)</span><b class="bad">${money(C.totalCustomerDue())}</b></div></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-cash-register ptext"></i> Cash drawer (estimate)</div>
        ${[['Cash from sales + due collected', money(r.collected.cash)], ['Cash refunds', '-' + money(r.cashRefund)], ['Supplier payments (cash)', '-' + money(r.cashSupplier)], ['Expenses', '-' + money(r.expenses)]].map(x => `<div class="kv"><span class="muted">${x[0]}</span><b>${x[1]}</b></div>`).join('')}
        <div class="kv"><span class="fw6">Net cash movement</span><b class="${r.cashNet >= 0 ? 'ok' : 'bad'}">${money(r.cashNet)}</b></div><p class="xs muted mt2">Estimate: purchases and expenses are treated as paid in cash.</p></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-trophy ptext"></i> Top selling products</div>${r.topProducts.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Product</th><th class="r">Qty</th><th class="r">Sales</th><th class="r">Profit</th></tr></thead><tbody>${r.topProducts.map(p => `<tr><td>${esc(p.name)}</td><td class="r">${p.qty}</td><td class="r">${money(p.amount)}</td><td class="r ok">${money(p.profit)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No data</div>'}</div>
      <div class="card pad"><div class="sec-title"><i class="fas fa-tags ptext"></i> Sales by category</div>${r.categories.length ? r.categories.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><b>${money(v)}</b></div>`).join('') : '<div class="empty">No data</div>'}</div>`;
    },
    label() { const [f, t] = this.range(); return f || t ? `${f || '…'} → ${t || '…'}` : 'All time'; },
    csv() {
      const r = this.data();
      C.download('esypos-report.csv', C.toCSV([['EsyPOS Report', this.label()], [], ['Invoices', r.count], ['Gross Sales', r.grossSales], ['Returns', r.returnsTotal], ['Net Sales', r.netSales], ['COGS', r.cogs], ['Gross Profit', r.grossProfit], ['Expenses', r.expenses], ['Stock write-offs', r.writeOff], ['Net Profit', r.netProfit], ['Net cash movement (estimate)', r.cashNet], ['New Due', r.newDue], ['Due Collected', r.dueCollected], [], ['Product', 'Qty', 'Sales', 'Profit'], ...r.topProducts.map(p => [p.name, p.qty, p.amount, p.profit])]), 'text/csv');
    },
    print() {
      const r = this.data(); const row = (a, b) => `<tr><td>${a}</td><td style="text-align:right"><b>${b}</b></td></tr>`;
      printHTML(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reports</title><style>body{font-family:sans-serif;padding:20px;color:#111}table{width:100%;border-collapse:collapse}td,th{padding:7px 4px;border-bottom:1px solid #ddd;font-size:14px}h2{margin:0}</style></head><body><h2>${esc(DB.settings.shopName)} — Reports</h2><p>${esc(this.label())}</p><table>${row('Invoices', r.count)}${row('Gross Sales', money(r.grossSales))}${row('Returns', money(r.returnsTotal))}${row('Net Sales', money(r.netSales))}${row('COGS', money(r.cogs))}${row('Gross Profit', money(r.grossProfit))}${row('Expenses', money(r.expenses))}${row('Stock write-offs', money(r.writeOff))}${row('Net Profit', money(r.netProfit))}${row('Net cash movement (estimate)', money(r.cashNet))}${row('New Due', money(r.newDue))}${row('Due Collected', money(r.dueCollected))}</table></body></html>`);
    }
  };
  App.Views.reports = Rep;
  App.Views.dashboard = {
    render() {
      const t = C.todayKey(); const td = C.buildReport(t, t); const mo = C.buildReport(C.monthStart(), t);
      const days = []; const dn = {};
      for (let i = 6; i >= 0; i--) { const k = C.addDays(t, -i); dn[k] = 0; days.push({ k, v: 0 }); }
      DB.sales.forEach(s => { const k = C.dkey(s.date); if (k in dn) dn[k] += num(s.total); });
      DB.returns.forEach(r => { const k = C.dkey(r.date); if (k in dn) dn[k] -= num(r.amount); });
      days.forEach(d => { d.v = r2(dn[d.k]); });
      const mx = Math.max.apply(null, days.map(d => d.v).concat([1]));
      const low = DB.products.filter(p => p.track !== false && p.stock <= (p.minStock || 0)).slice(0, 8);
      const soon = C.addDays(t, 30); const exp = DB.products.filter(p => p.expiry && p.expiry <= soon).sort((a, b) => a.expiry < b.expiry ? -1 : 1).slice(0, 6);
      const debtors = DB.customers.map(c => ({ c, b: C.customerBalance(c.id) })).filter(x => x.b > 0).sort((a, b) => b.b - a.b).slice(0, 5);
      const recent = DB.sales.slice(0, 5);
      $('view').innerHTML = `<div class="page-head"><div><h2>Dashboard</h2><p>${esc(DB.settings.shopName)} · ${C.fmtDate(new Date().toISOString())}</p></div></div>
      <div class="stats"><div class="stat hl"><div class="k">Today's sales</div><div class="v">${money(td.netSales)}</div></div>
        <div class="stat"><div class="k">Today's profit</div><div class="v ok">${money(td.grossProfit)}</div></div><div class="stat"><div class="k">Today's bills</div><div class="v">${td.count}</div></div><div class="stat"><div class="k">Today's expenses</div><div class="v bad">${money(td.expenses)}</div></div>
        <div class="stat"><div class="k">This month's sales</div><div class="v">${money(mo.netSales)}</div></div><div class="stat"><div class="k">This month's net profit</div><div class="v ${mo.netProfit >= 0 ? 'ok' : 'bad'}">${money(mo.netProfit)}</div></div>
        <div class="stat" onclick="App.go('customers')" style="cursor:pointer"><div class="k">Total customer due</div><div class="v bad">${money(C.totalCustomerDue())}</div></div><div class="stat"><div class="k">Stock value</div><div class="v">${money(C.stockValue())}</div></div></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-chart-column ptext"></i> Last 7 days sales</div><div class="bars">${days.map(d => `<div class="bar"><b>${d.v ? fmt(Math.round(d.v)) : ''}</b><i style="height:${Math.max(3, d.v / mx * 90)}%"></i><small>${new Date(d.k + 'T00:00').toLocaleDateString('en-GB', { weekday: 'short' })}</small></div>`).join('')}</div></div>
      <div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));align-items:start">
        <div class="card pad"><div class="sec-title"><i class="fas fa-user-clock bad"></i> Highest dues</div>${debtors.length ? debtors.map(x => `<div class="kv" onclick="People.detail('${x.c.id}')" style="cursor:pointer"><span>${esc(x.c.name)}</span><b class="bad">${money(x.b)}</b></div>`).join('') : '<div class="empty" style="padding:14px">No dues ✓</div>'}</div>
        <div class="card pad"><div class="sec-title"><i class="fas fa-triangle-exclamation warn"></i> Low Stock</div>${low.length ? low.map(p => `<div class="kv"><span>${esc(p.name)}</span><b class="bad">${p.stock} ${esc(p.unit || '')}</b></div>`).join('') : '<div class="empty" style="padding:14px">All stock levels OK ✓</div>'}</div>
        <div class="card pad"><div class="sec-title"><i class="fas fa-hourglass-half warn"></i> Expiring soon</div>${exp.length ? exp.map(p => `<div class="kv"><span>${esc(p.name)}</span><b class="${p.expiry < t ? 'bad' : 'warn'}">${p.expiry}</b></div>`).join('') : '<div class="empty" style="padding:14px">All good ✓</div>'}</div>
        <div class="card pad"><div class="sec-title"><i class="fas fa-clock-rotate-left ptext"></i> Recent sales</div>${recent.length ? recent.map(s => `<div class="kv" onclick="Receipt.showId('${s.id}')" style="cursor:pointer"><span>#${C.invLabel(s)} · ${C.fmtTime(s.date)}</span><b>${money(s.total)}</b></div>`).join('') : '<div class="empty" style="padding:14px">No sales yet</div>'}</div></div>`;
    }
  };
})();

/* ---------- Standalone Barcode Labels generator (no product required) ---------- */
(function () {
  'use strict';
  const C = Core, { DB, esc, money, toast } = C;
  const $ = id => document.getElementById(id);

  const SIZES = [
    { id: '40x30', w: 40, h: 30, label: '40×30 mm' },
    { id: '50x30', w: 50, h: 30, label: '50×30 mm' },
    { id: '50x40', w: 50, h: 40, label: '50×40 mm' },
    { id: '58x40', w: 58, h: 40, label: '58×40 mm' },
    { id: '60x40', w: 60, h: 40, label: '60×40 mm' },
    { id: '80x50', w: 80, h: 50, label: '80×50 mm' },
    { id: '100x50', w: 100, h: 50, label: '100×50 mm' },
    { id: 'custom', w: 50, h: 30, label: 'Custom' }
  ];

  const Barcodes = window.Barcodes = {
    SIZES,
    state: {
      value: '', name: '', price: '', fmt: 'code128', size: '50x30',
      customW: 50, customH: 30, copies: 1, showName: true, showPrice: true,
      showShop: false, barH: 18, sequential: false, seqCount: 1
    },

    sizeObj() {
      const s = this.state;
      if (s.size === 'printer' && window.LP && LP.paper()) { const p = LP.paper(); return { w: p.w, h: p.h, id: 'printer' }; }
      if (s.size === 'custom') return { w: Math.max(20, Math.min(200, +s.customW || 50)), h: Math.max(15, Math.min(150, +s.customH || 30)) };
      return SIZES.find(x => x.id === s.size) || SIZES[1];
    },

    readForm() {
      const s = this.state;
      s.value = ($('bc-val') && $('bc-val').value.trim()) || '';
      s.name = ($('bc-name') && $('bc-name').value.trim()) || '';
      s.price = ($('bc-price') && $('bc-price').value) || '';
      s.fmt = ($('bc-fmt') && $('bc-fmt').value) || 'code128';
      s.size = ($('bc-size') && $('bc-size').value) || '50x30';
      s.customW = ($('bc-cw') && parseFloat($('bc-cw').value)) || 50;
      s.customH = ($('bc-ch') && parseFloat($('bc-ch').value)) || 30;
      s.copies = Math.min(500, Math.max(1, parseInt(($('bc-copies') && $('bc-copies').value) || 1, 10) || 1));
      s.showName = !!( $('bc-show-name') && $('bc-show-name').checked);
      s.showPrice = !!( $('bc-show-price') && $('bc-show-price').checked);
      s.showShop = !!( $('bc-show-shop') && $('bc-show-shop').checked);
      s.barH = Math.min(40, Math.max(8, parseInt(($('bc-barh') && $('bc-barh').value) || 18, 10) || 18));
      s.sequential = !!( $('bc-seq') && $('bc-seq').checked);
      s.seqCount = Math.min(200, Math.max(1, parseInt(($('bc-seqn') && $('bc-seqn').value) || 1, 10) || 1));
      const customRow = $('bc-custom-row');
      if (customRow) customRow.classList.toggle('hidden', s.size !== 'custom');
      const seqRow = $('bc-seq-row');
      if (seqRow) seqRow.classList.toggle('hidden', !s.sequential);
    },

    genOne() {
      if (!window.BarcodeGen) { toast('⚠️ Barcode engine not loaded'); return; }
      this.readForm();
      const fmt = this.state.fmt;
      const used = new Set(DB.products.filter(p => p.barcode).map(p => BarcodeGen.normKey(p.barcode)));
      let n = Math.max(1, parseInt(DB.settings.nextBarcode, 10) || 1000001);
      let code = '', guard = 0;
      do {
        code = fmt === 'ean13'
          ? BarcodeGen.ean13Check('2' + String(n).padStart(11, '0').slice(-11))
          : BarcodeGen.uniqueCode(DB.settings.barcodePrefix || 'ESY', n);
        n++;
      } while (used.has(BarcodeGen.normKey(code)) && ++guard < 100000);
      DB.settings.nextBarcode = n;
      C.save('settings');
      if ($('bc-val')) $('bc-val').value = code;
      this.state.value = code;
      this.preview();
      toast('✓ Generated: ' + code);
    },

    pickProduct() {
      const body = `<div class="field mb2"><input id="bc-pick-q" class="input" placeholder="Search product…" oninput="Barcodes._pickFilter()"></div>
        <div id="bc-pick-list" style="max-height:50vh;overflow:auto"></div>`;
      Modal.open({ title: 'Pick product for label', body, foot: `<button class="btn" onclick="Modal.closeFrom(this)">Close</button>` });
      this._pickFilter();
      setTimeout(() => { const i = $('bc-pick-q'); if (i) i.focus(); }, 80);
    },

    _pickFilter() {
      const qq = (($('bc-pick-q') && $('bc-pick-q').value) || '').trim().toLowerCase();
      let arr = DB.products.slice().sort((a, b) => C.collator.compare(a.name, b.name));
      if (qq) arr = arr.filter(p => p.name.toLowerCase().includes(qq) || (p.barcode || '').toLowerCase().includes(qq));
      const el = $('bc-pick-list');
      if (!el) return;
      if (!arr.length) { el.innerHTML = '<div class="empty">No products</div>'; return; }
      el.innerHTML = arr.slice(0, 80).map(p =>
        `<div class="row" style="cursor:pointer" onclick="Barcodes.applyProduct('${p.id}');Modal.closeAll()">
          <div class="grow"><div class="t">${esc(p.name)}</div><div class="s">${p.barcode ? esc(p.barcode) : 'No barcode'} · ${money(p.price)}</div></div>
          <i class="fas fa-chevron-right muted"></i></div>`).join('');
    },

    applyProduct(id) {
      const p = DB.products.find(x => x.id === id);
      if (!p) return;
      if ($('bc-val')) $('bc-val').value = p.barcode || '';
      if ($('bc-name')) $('bc-name').value = p.name || '';
      if ($('bc-price')) $('bc-price').value = p.price != null ? p.price : '';
      if (p.barcodeFormat && $('bc-fmt')) $('bc-fmt').value = p.barcodeFormat;
      this.preview();
      toast('✓ Loaded: ' + p.name);
    },

    /* One sticker. Everything is laid out in real millimetres so the barcode is printed at an exact size:
       the barcode gets whatever height/width is left after the optional shop/name/price lines. */
    buildLabel(value, name, price, fmt, size, opt) {
      if (!window.BarcodeGen) return { html: '', note: 'Engine missing' };
      const o = Object.assign({}, this.state, opt || {});
      const shop = (DB.settings.shopName || '').trim();
      const showShop = !!(o.showShop && shop), showName = !!(o.showName && name);
      const showPrice = !!(o.showPrice && price !== '' && price != null);
      const nameLines = size.h >= 40 ? 2 : 1;
      let used = 2;                                              // 1 mm padding top + bottom
      if (showShop) used += 3;
      if (showName) used += 3.2 * nameLines;
      if (showPrice) used += 3.8;
      const r = BarcodeGen.render(value, fmt, {
        maxW: size.w - 2, maxH: Math.max(8, size.h - used), barH: o.barH || 18,
        dpi: DB.settings.printerDpi || 203, text: true
      });
      const parts = [];
      let priceTxt = '';
      if (showPrice) { const pr0 = parseFloat(price); priceTxt = isNaN(pr0) ? String(price) : money(pr0); }
      if (showShop) parts.push(`<div class="bl-shop">${esc(shop)}</div>`);
      if (showName) parts.push(`<div class="bl-name" style="${nameLines > 1 ? 'max-height:6.4mm' : 'height:3.2mm;white-space:nowrap;text-overflow:ellipsis'}">${esc(name)}</div>`);
      parts.push(`<div class="bl-svg">${r.svg}</div>`);
      if (showPrice) {
        const pr = parseFloat(price);
        parts.push(`<div class="bl-price">${isNaN(pr) ? esc(String(price)) : esc(money(pr))}</div>`);
      }
      return {
        html: `<div class="bl-label" style="width:${size.w}mm;height:${size.h}mm">${parts.join('')}</div>`,
        note: r.note, fmt: r.fmt, ok: r.ok,
        spec: { size, r, shop: showShop ? shop : '', name: showName ? String(name) : '', nameLines, price: priceTxt }
      };
    },

    /* Send labels to the printer: straight to a connected label printer (exact paper size, whole-dot bars) when a
       printer profile with direct printing is set up; otherwise through the browser print dialog (sized from the profile). */
    async output(jobs, size) {
      if (window.LP && LP.canDirect() && (DB.settings.labelMode || 'roll') !== 'sheet') {
        try { await LP.printJobs(jobs, size); return true; }
        catch (e) { console.error(e); toast('⚠️ Direct print failed: ' + (e && e.message || e) + ' — using browser print'); }
      }
      printHTML(BarcodeGen.printDoc(jobs.map(j => j.r.html.repeat(j.copies || 1)).join(''), size.w, size.h, DB.settings.labelMode || 'roll'));
      return false;
    },

    savePrint() {
      const m = $('bc-mode'), d = $('bc-dpi');
      if (m) DB.settings.labelMode = m.value === 'sheet' ? 'sheet' : 'roll';
      if (d) DB.settings.printerDpi = parseInt(d.value, 10) || 203;
      C.save('settings'); this.preview();
    },

    valuesList() {
      this.readForm();
      const s = this.state;
      if (!s.value) return [];
      if (!s.sequential || s.seqCount <= 1) return [s.value];
      const m = s.value.match(/^(.*?)(\d+)$/);
      if (!m) return Array(s.seqCount).fill(s.value);
      const prefix = m[1];
      let num = parseInt(m[2], 10);
      const pad = m[2].length;
      const out = [];
      for (let i = 0; i < s.seqCount; i++) out.push(prefix + String(num + i).padStart(pad, '0'));
      return out;
    },

    preview() {
      this.readForm();
      const box = $('bc-preview');
      const noteEl = $('bc-note');
      if (!box) return;
      const vals = this.valuesList();
      if (!vals.length) {
        box.innerHTML = '<div class="bc-empty"><i class="fas fa-barcode"></i><p>Enter a code or generate one</p></div>';
        if (noteEl) noteEl.textContent = '';
        return;
      }
      const size = this.sizeObj();
      const s = this.state;
      let note = '';
      const labels = vals.slice(0, 12).map(v => {
        const r = this.buildLabel(v, s.name, s.price, s.fmt, size);
        if (r.note) note = r.note;
        return r.html;
      });
      const extra = vals.length > 12 ? `<div class="xs muted tc mt2">+${vals.length - 12} more on print</div>` : '';
      const zoom = Math.max(1, Math.min(2, Math.round(((box.clientWidth || 320) - 36) / (size.w * 3.7795) * 20) / 20));
      box.innerHTML = `<div class="bc-sheet" style="zoom:${zoom}">${labels.join('')}</div>${extra}`;
      if (noteEl) { noteEl.textContent = note; const tooSmall = vals.some(v => !BarcodeGen.render(v, s.fmt, { maxW: size.w - 2, maxH: Math.max(8, size.h - 2), dpi: DB.settings.printerDpi || 203 }).ok); noteEl.classList.toggle('bad', tooSmall); noteEl.classList.toggle('warn', !tooSmall); }
    },

    print() {
      this.readForm();
      const vals = this.valuesList();
      if (!vals.length) { toast('⚠️ Enter or generate a barcode first'); return; }
      if (!window.BarcodeGen) { toast('⚠️ Barcode engine not loaded'); return; }
      const size = this.sizeObj();
      const s = this.state;
      const copies = s.sequential ? 1 : s.copies;
      const jobs = [];
      let warn = '';
      vals.forEach(v => {
        const r = this.buildLabel(v, s.name, s.price, s.fmt, size);
        if (r.note && !r.ok) warn = r.note;
        jobs.push({ r, copies });
      });
      this.output(jobs, size);
      if (warn) toast('⚠️ ' + warn);
    },

    render() {
      const s = this.state;
      const lpPaper = window.LP && LP.paper();
      if (lpPaper && !this._autoPicked) { this._autoPicked = true; s.size = 'printer'; }
      const sizeOpts = (lpPaper ? `<option value="printer"${s.size === 'printer' ? ' selected' : ''}>Printer paper — auto (${lpPaper.w}×${lpPaper.h} mm)</option>` : '') + SIZES.map(x => `<option value="${x.id}"${s.size === x.id ? ' selected' : ''}>${x.label}</option>`).join('');
      $('view').innerHTML = `
      <div class="page-head">
        <div><h2>Barcode Labels</h2><p>Generate &amp; print stickers — no product required · any printer</p></div>
        <div class="flex gap2 flex-wrap">
          <button type="button" class="btn btn-soft" onclick="Barcodes.pickProduct()"><i class="fas fa-box-open"></i> From product</button>
          <button type="button" class="btn btn-primary" onclick="Barcodes.print()"><i class="fas fa-print"></i> Print labels</button>
        </div>
      </div>
      <div class="bc-layout">
        <div class="card pad bc-form">
          ${window.LP ? LP.chipHTML() : ''}
          <div class="sec-title"><i class="fas fa-barcode ptext"></i> Barcode value</div>
          <div class="field">
            <label class="label">Code / text</label>
            <div class="flex gap2">
              <input id="bc-val" class="input grow" placeholder="Scan, type, or generate…" value="${esc(s.value)}" oninput="Barcodes.preview()" autocomplete="off">
              <button type="button" class="btn btn-soft" onclick="Barcodes.genOne()" title="Auto-generate unique code"><i class="fas fa-plus"></i></button>
            </div>
          </div>
          <div class="grid2">
            <div class="field"><label class="label">Format</label>
              <select id="bc-fmt" class="input" onchange="Barcodes.preview()">
                <option value="code128"${s.fmt === 'code128' ? ' selected' : ''}>Code 128</option>
                <option value="ean13"${s.fmt === 'ean13' ? ' selected' : ''}>EAN-13</option>
                <option value="qr"${s.fmt === 'qr' ? ' selected' : ''}>QR Code</option>
              </select>
            </div>
            <div class="field"><label class="label">Barcode height</label>
              <select id="bc-barh" class="input" onchange="Barcodes.preview()">
                <option value="12"${s.barH === 12 ? ' selected' : ''}>Compact</option>
                <option value="18"${s.barH === 18 ? ' selected' : ''}>Normal</option>
                <option value="24"${s.barH === 24 ? ' selected' : ''}>Tall</option>
                <option value="32"${s.barH === 32 ? ' selected' : ''}>Extra tall</option>
              </select>
            </div>
          </div>

          <div class="sec-title mt3"><i class="fas fa-tags ptext"></i> Label text <span class="muted xs fw4">(optional)</span></div>
          <div class="grid2">
            <div class="field"><label class="label">Product name</label>
              <input id="bc-name" class="input" placeholder="Optional" value="${esc(s.name)}" oninput="Barcodes.preview()">
            </div>
            <div class="field"><label class="label">Price</label>
              <input id="bc-price" type="number" step="any" min="0" class="input" placeholder="Optional" value="${esc(s.price)}" oninput="Barcodes.preview()">
            </div>
          </div>
          <div class="flex gap3 flex-wrap mt1 bc-toggles">
            <label class="check-pill"><input type="checkbox" id="bc-show-name"${s.showName ? ' checked' : ''} onchange="Barcodes.preview()"><span>Show name</span></label>
            <label class="check-pill"><input type="checkbox" id="bc-show-price"${s.showPrice ? ' checked' : ''} onchange="Barcodes.preview()"><span>Show price</span></label>
            <label class="check-pill"><input type="checkbox" id="bc-show-shop"${s.showShop ? ' checked' : ''} onchange="Barcodes.preview()"><span>Shop name</span></label>
          </div>
          <p class="xs muted mt1">Leave name &amp; price empty for pure barcode stickers.</p>

          <div class="sec-title mt3"><i class="fas fa-sliders ptext"></i> Size &amp; quantity</div>
          <div class="grid2">
            <div class="field"><label class="label">Label size</label>
              <select id="bc-size" class="input" onchange="Barcodes.preview()">${sizeOpts}</select>
            </div>
            <div class="field"><label class="label">Copies</label>
              <input id="bc-copies" type="number" min="1" max="500" class="input" value="${s.copies}" oninput="Barcodes.preview()">
            </div>
          </div>
          <div id="bc-custom-row" class="grid2${s.size === 'custom' ? '' : ' hidden'}">
            <div class="field"><label class="label">Width (mm)</label>
              <input id="bc-cw" type="number" min="20" max="200" class="input" value="${s.customW}" oninput="Barcodes.preview()">
            </div>
            <div class="field"><label class="label">Height (mm)</label>
              <input id="bc-ch" type="number" min="15" max="150" class="input" value="${s.customH}" oninput="Barcodes.preview()">
            </div>
          </div>

          <div class="grid2">
            <div class="field"><label class="label">Print on</label>
              <select id="bc-mode" class="input" onchange="Barcodes.savePrint()">
                <option value="roll"${(DB.settings.labelMode || 'roll') === 'roll' ? ' selected' : ''}>Sticker roll (1 label per page)</option>
                <option value="sheet"${DB.settings.labelMode === 'sheet' ? ' selected' : ''}>A4 sheet (many per page)</option>
              </select>
            </div>
            <div class="field"><label class="label">Printer resolution</label>
              <select id="bc-dpi" class="input" onchange="Barcodes.savePrint()">
                <option value="203"${(DB.settings.printerDpi || 203) == 203 ? ' selected' : ''}>203 dpi (most sticker printers)</option>
                <option value="300"${DB.settings.printerDpi == 300 ? ' selected' : ''}>300 dpi</option>
                <option value="600"${DB.settings.printerDpi == 600 ? ' selected' : ''}>600 dpi (laser / inkjet)</option>
              </select>
            </div>
          </div>

          <div class="field mt2">
            <label class="check-pill"><input type="checkbox" id="bc-seq"${s.sequential ? ' checked' : ''} onchange="Barcodes.preview()"><span class="sm fw6">Sequential codes <span class="muted xs fw4">(ESY0001 → ESY0002…)</span></span></label>
          </div>
          <div id="bc-seq-row" class="field${s.sequential ? '' : ' hidden'}">
            <label class="label">How many sequential</label>
            <input id="bc-seqn" type="number" min="1" max="200" class="input" value="${s.seqCount}" oninput="Barcodes.preview()" style="max-width:140px">
          </div>

          <div class="flex gap2 mt3 flex-wrap">
            <button type="button" class="btn btn-primary grow" onclick="Barcodes.print()"><i class="fas fa-print"></i> Print labels</button>
            <button type="button" class="btn btn-soft" onclick="Barcodes.genOne()"><i class="fas fa-plus"></i> Generate</button>
          </div>
          <p class="xs muted mt2"><i class="fas fa-circle-question"></i> In the print dialog choose your label size as paper, set <b>Margins: None</b> and <b>Scale: 100%</b> (not "Fit to page"). The preview is only for checking the layout — scan the printed sticker.</p>
        </div>

        <div class="card pad bc-prev-card">
          <div class="sec-title"><i class="fas fa-receipt ptext"></i> Preview</div>
          <div id="bc-preview" class="bc-preview"></div>
          <p class="xs warn tc mt2" id="bc-note"></p>
        </div>
      </div>`;
      this.preview();
    }
  };

  App.Views.barcodes = Barcodes;
})();
