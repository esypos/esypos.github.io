/* EsyPOS Printer profile + direct label printing (v10.8.0)
   A web page cannot ask the operating system "which paper is loaded?", so EsyPOS keeps a PRINTER PROFILE:
     1. connect the printer once (USB or Bluetooth) → the model is recognised and sensible defaults are filled in
        (type, resolution, paper size; Zebra printers also report their configured label length);
     2. the person confirms the paper that is loaded (a 5-second step, remembered per printer);
     3. from then on every label is laid out for exactly that paper, and — when direct printing works — drawn as a
        1-bit image at the printer's own resolution and sent as TSPL / ZPL commands, bypassing the print dialog and the
        driver's scaling. Bars are therefore a whole number of printer dots wide, which is what scanners need.
   Where direct access is impossible (e.g. a Windows driver owns the USB printer) the profile still sets the paper size
   and dpi used for browser printing. */
(function () {
  'use strict';
  const C = Core, { DB, esc, toast } = C;
  const $ = id => document.getElementById(id);
  const LABEL_SIZES = [[30, 20], [38, 25], [40, 20], [40, 30], [50, 25], [50, 30], [50, 40], [58, 40], [60, 40], [70, 50], [75, 50], [80, 50], [100, 50], [100, 100], [100, 150]];

  /* ---------- model recognition ---------- */
  function guess(name) {
    const n = String(name || '').toLowerCase();
    const g = { lang: 'tspl', kind: 'label', dpi: 203, w: 50, h: 30, gap: 2, paper: 58, known: false, note: '' };
    if (/zebra|\bzd\d|\bgk4|\bgx4|\bzt\d|\blp ?2844|\btlp/.test(n)) { g.lang = 'zpl'; g.known = true; g.w = 100; g.h = 150; if (/zd6\d\d|zt\d+.*600|300/.test(n)) g.dpi = 300; return g; }
    if (/(^|[^0-9])(58|80)([^0-9]|$)/.test(n) && !/label|barcode|\d{3}b\b/.test(n)) { g.kind = 'receipt'; g.lang = 'escpos'; g.paper = /80/.test(n) ? 80 : 58; g.known = true; return g; }
    if (/xp-?(2\d\d|3\d\d|4\d\d|d\d+)|tsc|\bttp|\bte\d{3}|\bta\d{3}|label|barcode|\bgk-?\d|gp-?[12]\d{3}d|gainscha|hprt|\bht\d|idprt|jadens|munbyn|netum|rongta|snbc|\bbp\d|argox|citizen|\bcl-?s|godex|postek|bixolon/.test(n)) {
      g.known = true; if (/te3\d\d|ttp-?3\d\d|\b300\b|dpi300/.test(n)) g.dpi = 300; return g;
    }
    g.note = 'Model not recognised — please check the printer type and paper below.';
    return g;
  }

  const prof = () => DB.settings.labelPrinter || null;
  const mm = v => (Math.round(v * 10) / 10);

  /* ---------- transports ---------- */
  const busyMsg = 'The printer is held by its Windows/OS driver, so the browser cannot send data to it directly. EsyPOS will use the browser print dialog with this printer\'s paper size instead. (For direct printing: connect over Bluetooth, or install the WinUSB driver for this printer with Zadig.)';
  const USB = {
    dev: null, out: null, inn: null,
    ok() { return !!(navigator.usb && window.isSecureContext); },
    async pick() { return navigator.usb.requestDevice({ filters: [] }); },
    async known(p) {
      const list = await navigator.usb.getDevices();
      return list.find(d => d.vendorId === p.vid && d.productId === p.pid) || null;
    },
    async open(dev) {
      if (this.dev === dev && dev.opened && this.out) return;
      if (!dev.opened) await dev.open();
      if (!dev.configuration) await dev.selectConfiguration(1);
      let pick = null;
      for (const i of dev.configuration.interfaces) for (const a of i.alternates) {
        const out = a.endpoints.find(e => e.direction === 'out' && e.type === 'bulk');
        if (out && (!pick || a.interfaceClass === 7)) pick = { i, a, out, inn: a.endpoints.find(e => e.direction === 'in' && e.type === 'bulk') };
      }
      if (!pick) throw new Error('No printer data channel found on this USB device');
      try {
        await dev.claimInterface(pick.i.interfaceNumber);
        if (pick.a.alternateSetting) await dev.selectAlternateInterface(pick.i.interfaceNumber, pick.a.alternateSetting);
      } catch (e) { const er = new Error(busyMsg); er.busy = true; throw er; }
      this.dev = dev; this.out = pick.out.endpointNumber; this.inn = pick.inn ? pick.inn.endpointNumber : null;
    },
    async ensure() {
      const p = prof(); if (!p) throw new Error('No printer set up');
      let d = this.dev && this.dev.opened ? this.dev : await this.known(p);
      if (!d) d = await this.pick();             // needs a click; printing starts from a click so this is allowed
      await this.open(d);
    },
    async write(bytes) {
      await this.ensure();
      const N = 4096;
      for (let i = 0; i < bytes.length; i += N) await this.dev.transferOut(this.out, bytes.slice(i, i + N));
    },
    async read(ms) {
      if (!this.inn) return '';
      const t = new Promise(r => setTimeout(() => r(null), ms || 900));
      const r = await Promise.race([this.dev.transferIn(this.inn, 256), t]);
      return r && r.data ? new TextDecoder().decode(r.data) : '';
    }
  };
  const BT = {
    chunk: 0,
    ok() { return !!navigator.bluetooth; },
    async write(bytes) {
      if (!window.Printer) throw new Error('Bluetooth module missing');
      if (!Printer.isConnected()) { const ok = await Printer.connect(); if (!ok) throw new Error('Bluetooth printer not connected'); }
      const ch = Printer.ch; let size = BT.chunk || 100, i = 0;
      while (i < bytes.length) {
        const part = bytes.slice(i, i + size);
        try {
          if (ch.properties.writeWithoutResponse) await ch.writeValueWithoutResponse(part); else await ch.writeValue(part);
        } catch (e) {
          if (size > 20) { size = size > 100 ? 100 : 20; BT.chunk = size; continue; }   // retry the same part with a smaller chunk
          throw e;
        }
        i += part.length;
        await new Promise(r => setTimeout(r, size > 20 ? 18 : 30));
      }
    }
  };
  const transport = p => (p && p.transport === 'usb' ? USB : p && p.transport === 'bt' ? BT : null);

  /* ---------- rasterising a label at printer resolution ---------- */
  const FONT = '"Noto Sans Bengali","Nirmala UI","Vrinda","Kalpurush",system-ui,Arial,sans-serif';
  function fit(ctx, text, maxPx) {
    if (ctx.measureText(text).width <= maxPx) return text;
    let t = text; while (t.length > 1 && ctx.measureText(t + '…').width > maxPx) t = t.slice(0, -1);
    return t + '…';
  }
  function wrap(ctx, text, maxPx, lines) {
    const words = String(text).split(/\s+/), out = []; let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width <= maxPx || !cur) cur = t; else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    if (out.length > lines) { const keep = out.slice(0, lines); keep[lines - 1] = fit(ctx, out.slice(lines - 1).join(' '), maxPx); return keep; }
    return out.map(l => fit(ctx, l, maxPx));
  }
  function raster(spec, dpi, size) {
    const k = (Math.round(dpi) === 203 ? 203.2 : dpi) / 25.4, W = Math.ceil(Math.round(size.w * k) / 8) * 8, H = Math.round(size.h * k);   // width = whole bytes, so no stray padding bits
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#000'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    const r = spec.r, sym = r.sym;
    const rows = [];
    if (spec.shop) rows.push({ t: 'shop', h: 3 });
    if (spec.name) rows.push({ t: 'name', h: 3.2 * spec.nameLines });
    rows.push({ t: 'sym', h: r.heightMm });
    if (spec.price) rows.push({ t: 'price', h: 3.8 });
    const total = rows.reduce((a, x) => a + x.h, 0);
    let y = Math.max(1, (size.h - total) / 2);
    const maxW = (size.w - 2) * k, cx = W / 2;
    const txt = (s, mmH, weight, top, h, fam) => {
      const px = Math.max(8, Math.round(mmH * k)); ctx.font = `${weight} ${px}px ${fam || FONT}`;
      ctx.fillText(fit(ctx, s, maxW), cx, Math.round((top + h * 0.78) * k));
    };
    for (const row of rows) {
      if (row.t === 'shop') txt(spec.shop, 2.5, 600, y, row.h);
      else if (row.t === 'name') {
        const px = Math.max(8, Math.round(2.65 * k)); ctx.font = `700 ${px}px ${FONT}`;
        wrap(ctx, spec.name, maxW, spec.nameLines).forEach((ln, i) => ctx.fillText(ln, cx, Math.round((y + i * 3.2 + 2.5) * k)));
      } else if (row.t === 'price') txt(spec.price, 3.2, 800, y, row.h);
      else {
        const n = Math.max(1, Math.round(sym.modMm * k));                 // whole dots per module
        const sx = Math.round((W - sym.modsW * n) / 2), sy = Math.round(y * k);
        if (sym.kind === '1d') {
          const bh = Math.round(sym.barHmm * k), bits = sym.bits; let i = 0;
          while (i < bits.length) {
            if (bits[i] === '1') { let j = i; while (j < bits.length && bits[j] === '1') j++; ctx.fillRect(sx + (sym.quiet + i) * n, sy, (j - i) * n, bh); i = j; } else i++;
          }
          if (sym.text) { const px = Math.max(8, Math.round(sym.textHmm * 0.8 * k)); ctx.font = `600 ${px}px ui-monospace,Menlo,Consolas,monospace`; ctx.fillText(fit(ctx, sym.text, sym.modsW * n * 0.96), cx, sy + bh + Math.round(sym.textHmm * 0.85 * k)); }
        } else {
          for (let yy = 0; yy < sym.size; yy++) { let xx = 0; while (xx < sym.size) { if (!sym.matrix[yy][xx]) { xx++; continue; } let e = xx; while (e < sym.size && sym.matrix[yy][e]) e++; ctx.fillRect(sx + (4 + xx) * n, sy + (4 + yy) * n, (e - xx) * n, n); xx = e; } }
          if (sym.text) { const px = Math.max(8, Math.round(sym.textHmm * 0.7 * k)); ctx.font = `600 ${px}px ui-monospace,Menlo,Consolas,monospace`; ctx.fillText(fit(ctx, sym.text, maxW), cx, sy + sym.modsW * n + Math.round(sym.textHmm * 0.8 * k)); }
        }
      }
      y += row.h;
    }
    return cv;
  }

  /* ---------- printer languages ---------- */
  const ascii = s => new TextEncoder().encode(s);
  const cat = parts => { const n = parts.reduce((a, b) => a + b.length, 0), o = new Uint8Array(n); let i = 0; parts.forEach(b => { o.set(b, i); i += b.length; }); return o; };
  function mono(cv, black) {        // -> {wb, H, rows:Uint8Array} with bit=1 where `black` says so
    const W = cv.width, H = cv.height, wb = Math.ceil(W / 8), id = cv.getContext('2d').getImageData(0, 0, W, H).data, out = new Uint8Array(wb * H);
    // `black` = the bit value that prints a dot. Start every bit at the WHITE value (so right-edge padding bits never print),
    // then set/clear the bit for each black pixel.
    if (!black) out.fill(0xFF);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4, lum = (id[o] * 0.299 + id[o + 1] * 0.587 + id[o + 2] * 0.114), isBlack = lum < 140 && id[o + 3] > 40;
      if (!isBlack) continue;
      if (black) out[y * wb + (x >> 3)] |= 0x80 >> (x & 7); else out[y * wb + (x >> 3)] &= ~(0x80 >> (x & 7));
    }
    return { wb, H, rows: out };
  }
  function tspl(cv, size, copies, p) {
    // TSPL BITMAP: a 0 bit prints a dot, a 1 bit leaves paper white (the "invert" setting flips this for odd firmware)
    const m = mono(cv, !!p.invert);
    const head = `SIZE ${mm(size.w)} mm,${mm(size.h)} mm\r\nGAP ${p.gap == null ? 2 : p.gap} mm,0 mm\r\nDIRECTION 1,0\r\nREFERENCE 0,0\r\nSET TEAR ON\r\nCLS\r\nBITMAP 0,0,${m.wb},${m.H},0,`;
    return cat([ascii(head), m.rows, ascii(`\r\nPRINT ${Math.max(1, copies)},1\r\n`)]);
  }
  function zpl(cv, size, copies, p) {
    const m = mono(cv, !p.invert), tot = m.rows.length; let hex = '';
    for (let i = 0; i < m.rows.length; i++) hex += (m.rows[i] < 16 ? '0' : '') + m.rows[i].toString(16);
    return ascii(`^XA^CI28^PW${cv.width}^LL${cv.height}^LH0,0^PQ${Math.max(1, copies)}^FO0,0^GFA,${tot},${tot},${m.wb},${hex.toUpperCase()}^FS^XZ\r\n`);
  }

  /* ---------- public API ---------- */
  const LP = window.LP = {
    guess, raster, tspl, zpl, USB, BT,
    profile: prof,
    paper() { const p = prof(); return p && p.kind === 'label' ? { w: p.w, h: p.h } : null; },
    canDirect() { const p = prof(); return !!(p && p.kind === 'label' && p.direct && p.lang !== 'escpos' && (p.transport === 'usb' ? USB.ok() : p.transport === 'bt' ? BT.ok() : false)); },
    async printJobs(jobs, size) {
      const p = prof(), t = transport(p); if (!p || !t) throw new Error('No printer set up');
      if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (_) {} }
      toast('Printing…');
      for (const j of jobs) {
        const cv = raster(j.r.spec, p.dpi || 203, size);
        await t.write((p.lang === 'zpl' ? zpl : tspl)(cv, size, j.copies || 1, p));
      }
      toast('✓ Sent to ' + (p.name || 'printer'));
    },

    /* ----- UI ----- */
    summary() {
      const p = prof(); if (!p) return 'No printer set up';
      const paper = p.kind === 'label' ? `${p.w}×${p.h} mm labels` : `${p.paper} mm receipt paper`;
      return `${p.name || 'Printer'} · ${paper} · ${p.dpi || 203} dpi · ${this.canDirect() ? 'direct' : 'browser print'}`;
    },
    chipHTML() {
      const p = prof();
      return `<div class="lp-chip flex gap2 items-c mb3" style="padding:10px 12px;border:1px solid var(--border);border-radius:12px"><i class="fas fa-print ptext"></i><div class="grow sm"><b>${p ? esc(p.name || 'Printer') : 'No printer set up'}</b><div class="xs muted">${p ? esc(this.summary().split(' · ').slice(1).join(' · ')) : 'Connect once — paper size is then automatic'}</div></div><button type="button" class="btn btn-soft btn-sm" onclick="LP.setup()">${p ? 'Change' : 'Connect'}</button></div>`;
    },
    cardHTML() {
      const p = prof();
      return `<div class="card pad mb3" id="lp-card"><div class="sec-title"><i class="fas fa-print ptext"></i> Label &amp; receipt printer</div>
        <p class="sm mb2">${esc(this.summary())}</p>
        <p class="xs muted mb3">Connect once, confirm the paper, and every label or receipt fits.</p>
        <div class="flex gap2 flex-wrap"><button class="btn btn-primary grow" onclick="LP.setup()"><i class="fas fa-plug"></i> ${p ? 'Change / re-detect' : 'Connect printer'}</button>${p ? '<button class="btn btn-soft" onclick="LP.edit()">Paper &amp; options</button><button class="btn btn-danger-soft" onclick="LP.forget()">Forget</button>' : ''}</div></div>`;
    },
    refresh() { const c = $('lp-card'); if (c) c.outerHTML = this.cardHTML(); const ch = document.querySelector('.lp-chip'); if (ch) ch.outerHTML = this.chipHTML(); if (window.Barcodes && App.view === 'barcodes') { Barcodes._autoPicked = false; Barcodes.render(); } },
    forget() { if (!confirm('Forget this printer? Labels will use the normal size list again.')) return; delete DB.settings.labelPrinter; C.save('settings'); try { USB.dev = null; USB.out = null; } catch (_) {} this.refresh(); toast('Printer forgotten'); },

    /* Step 1: choose how the printer is connected */
    setup() {
      const usb = USB.ok(), bt = BT.ok();
      const m = Modal.open({
        title: 'Connect printer',
        body: `<p class="sm mb3">EsyPOS will recognise the printer and fill in its paper size. You only do this once.</p>
          <div class="flex flex-col gap2">
            ${usb ? '<button class="btn btn-primary" id="lp-usb"><i class="fas fa-plug"></i> USB printer</button>' : ''}
            ${bt ? '<button class="btn btn-primary" id="lp-bt"><i class="fab fa-bluetooth-b"></i> Bluetooth printer</button>' : ''}
            <button class="btn btn-soft" id="lp-man"><i class="fas fa-sliders"></i> Set up manually (printer with Windows driver)</button>
          </div>
          ${usb || bt ? '' : '<p class="xs warn mt3">Auto-detect needs Chrome or Edge. You can still set the paper size manually.</p>'}
          <p class="xs muted mt3">Browsers cannot read the loaded paper, so confirm it once.</p>`,
        foot: '<button class="btn" data-x>Close</button>'
      });
      m.querySelector('[data-x]').onclick = () => Modal.close(m);
      const go = async (fn) => { try { const d = await fn(); Modal.close(m); this.edit(d); } catch (e) { if (e && e.name === 'NotFoundError') return; toast('⚠️ ' + (e && e.message || e)); } };
      const u = m.querySelector('#lp-usb'); if (u) u.onclick = () => go(() => this.detectUSB());
      const b = m.querySelector('#lp-bt'); if (b) b.onclick = () => go(() => this.detectBT());
      m.querySelector('#lp-man').onclick = () => { Modal.close(m); this.edit({ transport: 'browser', name: '' }); };
    },
    async detectUSB() {
      const dev = await USB.pick();
      const name = [dev.manufacturerName, dev.productName].filter(Boolean).join(' ') || ('USB device ' + dev.vendorId.toString(16) + ':' + dev.productId.toString(16));
      const g = guess(name); const d = Object.assign(g, { transport: 'usb', name, vid: dev.vendorId, pid: dev.productId, direct: true });
      try {
        await USB.open(dev);
        if (d.lang === 'zpl') {                        // Zebra: ~HS returns the configured label length in dots
          await USB.write(ascii('~HS')); const resp = await USB.read(1200);
          const f = resp.split(/\r?\n/)[1] ? resp.split(/\r?\n/)[1].split(',') : []; const dots = parseInt(f[3], 10);
          if (dots > 0) { d.h = Math.round(dots / d.dpi * 25.4); d.note = `Label length ${d.h} mm read from the printer.`; }
        }
      } catch (e) { if (e && e.busy) { d.direct = false; d.transport = 'browser'; d.note = busyMsg; } else d.note = 'Could not open the printer: ' + (e && e.message || e); }
      return d;
    },
    async detectBT() {
      const ok = await Printer.connect(); if (!ok) { const e = new Error('Bluetooth printer not connected'); e.name = 'NotFoundError'; throw e; }
      const g = guess(Printer.name); return Object.assign(g, { transport: 'bt', name: Printer.name, direct: true });
    },

    /* Step 2: confirm type + paper (pre-filled from the detected model) */
    edit(d) {
      d = Object.assign({}, prof() || { transport: 'browser', kind: 'label', lang: 'tspl', dpi: 203, w: 50, h: 30, gap: 2, paper: 58 }, d || {});
      const kindVal = d.kind === 'receipt' ? 'receipt' : d.lang === 'zpl' ? 'zpl' : 'tspl';
      const sizeOpts = LABEL_SIZES.map(([w, h]) => `<option value="${w}x${h}" ${d.w === w && d.h === h ? 'selected' : ''}>${w} × ${h} mm</option>`).join('') + `<option value="custom" ${LABEL_SIZES.some(([w, h]) => w === d.w && h === d.h) ? '' : 'selected'}>Custom…</option>`;
      const m = Modal.open({
        title: 'Printer & paper',
        body: `${d.note ? `<p class="xs ${d.known === false ? 'warn' : 'muted'} mb3">${esc(d.note)}</p>` : ''}
          <div class="field"><label class="label">Printer name</label><input id="lp-name" class="input" value="${esc(d.name || '')}" placeholder="e.g. Xprinter XP-365B"></div>
          <div class="grid2"><div class="field"><label class="label">Printer type</label><select id="lp-kind" class="input">
              <option value="tspl" ${kindVal === 'tspl' ? 'selected' : ''}>Label / sticker (TSPL — Xprinter, TSC, Gprinter…)</option>
              <option value="zpl" ${kindVal === 'zpl' ? 'selected' : ''}>Label (ZPL — Zebra)</option>
              <option value="receipt" ${kindVal === 'receipt' ? 'selected' : ''}>Receipt printer (58 / 80 mm)</option></select></div>
            <div class="field"><label class="label">Resolution</label><select id="lp-dpi" class="input">${[203, 300, 600].map(v => `<option value="${v}" ${(+d.dpi || 203) === v ? 'selected' : ''}>${v} dpi${v === 203 ? ' (most)' : ''}</option>`).join('')}</select></div></div>
          <div id="lp-label-box"><div class="grid2"><div class="field"><label class="label">Label paper loaded</label><select id="lp-size" class="input">${sizeOpts}</select></div>
              <div class="field"><label class="label">Gap between labels (mm)</label><input id="lp-gap" type="number" min="0" max="10" step="0.5" class="input" value="${d.gap == null ? 2 : d.gap}"></div></div>
            <div id="lp-custom" class="grid2 hidden"><div class="field"><label class="label">Width (mm)</label><input id="lp-w" type="number" min="15" max="120" class="input" value="${d.w}"></div><div class="field"><label class="label">Height (mm)</label><input id="lp-h" type="number" min="10" max="300" class="input" value="${d.h}"></div></div></div>
          <div id="lp-rc-box" class="field hidden"><label class="label">Receipt paper width</label><select id="lp-paper" class="input"><option value="58" ${+d.paper === 58 ? 'selected' : ''}>58 mm</option><option value="80" ${+d.paper === 80 ? 'selected' : ''}>80 mm</option></select></div>
          <div class="field"><label class="label">Sending method</label><select id="lp-direct" class="input"><option value="1" ${d.direct && d.transport !== 'browser' ? 'selected' : ''}>Direct to printer — exact size, sharpest bars (recommended)</option><option value="0" ${d.direct && d.transport !== 'browser' ? '' : 'selected'}>Browser print dialog (uses this paper size)</option></select></div>
          <label class="check-pill mb2"><input type="checkbox" id="lp-inv" ${d.invert ? 'checked' : ''}><span class="xs">Labels print inverted or blank on test → tick this</span></label>
          <div class="field"><label class="label">Scan check <span class="muted xs fw4">(after Test print, scan the sticker here)</span></label><input id="lp-scan" class="input" autocomplete="off" placeholder="Click here, then scan the test sticker"><p class="xs mt1" id="lp-scan-res"></p></div>`,
        foot: '<button class="btn" data-x>Close</button><button class="btn btn-soft" id="lp-test">Test print</button><button class="btn btn-primary" id="lp-save"><i class="fas fa-floppy-disk"></i> Save</button>'
      });
      const g = id => m.querySelector('#' + id);
      const sync = () => { const rc = g('lp-kind').value === 'receipt'; g('lp-label-box').classList.toggle('hidden', rc); g('lp-rc-box').classList.toggle('hidden', !rc); g('lp-custom').classList.toggle('hidden', rc || g('lp-size').value !== 'custom'); };
      g('lp-kind').onchange = sync; g('lp-size').onchange = sync; sync();
      const collect = () => {
        const kv = g('lp-kind').value, p = { transport: d.transport || 'browser', vid: d.vid, pid: d.pid, name: g('lp-name').value.trim() || 'Printer', dpi: +g('lp-dpi').value || 203,
          kind: kv === 'receipt' ? 'receipt' : 'label', lang: kv === 'receipt' ? 'escpos' : kv, gap: parseFloat(g('lp-gap').value) || 0, paper: +g('lp-paper').value || 58, invert: g('lp-inv').checked };
        const sv = g('lp-size').value; if (sv === 'custom') { p.w = Math.max(15, +g('lp-w').value || 50); p.h = Math.max(10, +g('lp-h').value || 30); } else { const [w, h] = sv.split('x').map(Number); p.w = w; p.h = h; }
        p.direct = g('lp-direct').value === '1' && p.transport !== 'browser' && p.kind === 'label';
        return p;
      };
      const save = () => {
        const p = collect(); DB.settings.labelPrinter = p; DB.settings.printerDpi = p.dpi;
        if (p.kind === 'receipt') DB.settings.paper = String(p.paper); else { DB.settings.labelSize = 'printer'; }
        C.save('settings'); return p;
      };
      g('lp-save').onclick = () => { const p = save(); Modal.close(m); this.refresh(); toast('✓ Printer saved — ' + (p.kind === 'label' ? `${p.w}×${p.h} mm` : `${p.paper} mm paper`)); };
      g('lp-test').onclick = async () => {
        const p = save();
        if (p.kind === 'receipt') { toast('Receipt paper set to ' + p.paper + ' mm'); return; }
        const size = { w: p.w, h: p.h }, r = Barcodes.buildLabel('TEST123456', `Test ${p.w}×${p.h} mm · ${p.dpi} dpi`, '', 'code128', size, { showName: true, showPrice: false, showShop: false, barH: 18 });
        await Barcodes.output([{ r, copies: 1 }], size);
      };
      m.querySelector('[data-x]').onclick = () => Modal.close(m);
      const sc = g('lp-scan'), scr = g('lp-scan-res'); let st = null;
      const check = () => {
        const v = sc.value.trim(); if (!v) { scr.textContent = ''; return; }
        const ok = BarcodeGen.normKey(v) === BarcodeGen.normKey('TEST123456');
        scr.className = 'xs mt1 ' + (ok ? 'ok' : 'bad');
        scr.textContent = ok ? '✓ Scanner reads the sticker correctly (TEST123456)' : '✗ Scanner read "' + v + '" — expected TEST123456. Try a bigger label, 300 dpi, or tick the inverted option.';
      };
      sc.oninput = () => { clearTimeout(st); st = setTimeout(check, 250); };
      sc.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(st); check(); } };
    }
  };
})();
