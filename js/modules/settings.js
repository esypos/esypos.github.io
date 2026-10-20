/* EsyPOS: Settings, barcode scanner, PIN lock, Bluetooth printer */
(function () {
  'use strict';
  const C = Core, { DB, esc, num, money, fmt, toast } = C;
  const $ = id => document.getElementById(id);
  const Scanner = window.Scanner = {
    el: null, stream: null, timer: null, last: '', lastT: 0, busy: false, opening: false, tok: 0, msgT: null,
    isOpen() { return !!this.el || this.opening; },
    // Ask the browser for the camera. Tries a few constraint sets so devices that reject "environment" still work.
    async getStream() {
      const tries = [
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
        { video: { facingMode: 'environment' }, audio: false },
        { video: true, audio: false }
      ];
      let err;
      for (const c of tries) {
        try { return await navigator.mediaDevices.getUserMedia(c); }
        catch (e) {
          err = e;
          // Permission and hardware problems will not change with other constraints: stop here.
          if (e && /NotAllowed|Security|NotFound|NotReadable|Abort/.test(e.name || '')) break;
        }
      }
      throw err;
    },
    // Friendly dialog that explains how to re-enable the camera (a browser "Block" cannot be overridden by the app).
    help(kind, retry) {
      const msgs = {
        denied: ['Camera access is blocked', 'EsyPOS needs the camera only to scan barcodes. Allow it once and scanning will work from then on.'],
        busy: ['Camera is in use', 'Another app or browser tab is using the camera. Close it and try again.'],
        none: ['No camera found', 'This device has no usable camera. You can type the barcode, or use a USB or Bluetooth scanner.'],
        insecure: ['Camera needs a secure page', 'Open EsyPOS over HTTPS to use the camera.'],
        error: ['Camera could not start', 'Something went wrong while starting the camera. Please try again.']
      };
      const m = msgs[kind] || msgs.error;
      const steps = kind === 'denied' ? `<ol class="perm-steps">
          <li><b>Chrome / browser:</b> tap the <i class="fas fa-sliders"></i> or <i class="fas fa-lock"></i> icon next to the address bar, then <b>Permissions → Camera → Allow</b>.</li>
          <li><b>Installed app:</b> press and hold the EsyPOS icon → <b>App info → Permissions → Camera → Allow</b>.</li>
          <li><b>iPhone:</b> Settings → Safari → Camera → <b>Ask</b> or <b>Allow</b>.</li>
          <li>Come back here and tap <b>Try again</b>.</li></ol>` : '';
      const el = Modal.open({
        title: m[0], size: '',
        body: `<div class="perm-ico ${kind === 'denied' ? 'bad' : ''}"><i class="fas ${kind === 'none' ? 'fa-video-slash' : 'fa-camera'}"></i></div><p class="perm-msg">${esc(m[1])}</p>${steps}`,
        foot: `<button class="btn" data-x2>Close</button>${kind === 'none' || kind === 'insecure' ? '' : '<button class="btn btn-primary" data-retry><i class="fas fa-rotate-right"></i> Try again</button>'}`
      });
      el.querySelector('[data-x2]').onclick = () => Modal.close(el);
      const r = el.querySelector('[data-retry]'); if (r) r.onclick = () => { Modal.close(el); setTimeout(() => { if (typeof retry === 'function') retry(); }, 150); };
    },
    async open(cb, o) {
      o = o || {};
      if (this.el || this.opening) return;
      const retry = () => this.open(cb, o);
      /* camera reader: native BarcodeDetector when the browser has it (Chrome/Android), else our offline reader (iPhone, Firefox, desktop) */
      if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { this.help('insecure'); return; }
      let det = null;
      if ('BarcodeDetector' in window) { try { det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'] }); } catch (_) { try { det = new BarcodeDetector(); } catch (e2) { det = null; } } }
      if (!det && window.Linear) det = Linear.createDetector();
      if (!det) { toast('⚠️ Camera scan is not available in this browser. Type the code or use a USB/Bluetooth scanner.'); return; }
      const fallback = !!det.fallback;
      const tok = ++this.tok; this.opening = true;
      let stream;
      try { stream = await this.getStream(); }
      catch (e) {
        this.opening = false;
        const n = (e && e.name) || '';
        this.help(/NotAllowed|Security/.test(n) ? 'denied' : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'none' : /NotReadable|Abort/.test(n) ? 'busy' : 'error', retry);
        return;
      }
      this.opening = false;
      if (tok !== this.tok) { stream.getTracks().forEach(t => t.stop()); return; }   // Back/Close was pressed while the camera was starting
      this.stream = stream;
      const el = document.createElement('div'); el.className = 'scan';
      el.innerHTML = `<video playsinline muted autoplay></video><div class="frame"><i></i><i></i><i></i><i></i><span class="beam"></span></div><div class="bar-top"><b>Barcode scan</b><button type="button" class="btn btn-sm" id="sc-x">Close</button></div><div class="sc-msg hidden" id="sc-msg"></div><div class="sc-tools"><button type="button" class="sc-btn hidden" id="sc-torch" title="Torch"><i class="fas fa-sun"></i></button><input type="range" id="sc-zoom" class="hidden" aria-label="Zoom"><button type="button" class="sc-btn" id="sc-keep" title="Keep scanning"><i class="fas fa-rotate-right"></i> Keep scanning</button><button type="button" class="sc-btn" id="sc-type" title="Type code"><i class="fas fa-pen"></i> Type code</button></div><div class="sc-typebox hidden" id="sc-typebox"><input id="sc-code" class="input" placeholder="Type barcode…" autocomplete="off" inputmode="text"><button type="button" class="btn btn-primary" id="sc-ok">OK</button></div><div class="bar-bot">${esc(o.hint || 'Hold barcode inside the frame')}${fallback ? '<br><span class="sc-sub">Reads EAN / UPC / Code 128 · for QR use Chrome</span>' : ''}</div>`;
      document.body.appendChild(el); this.el = el; this.last = ''; this.lastT = 0; this.busy = false; syncLock();
      const v = el.querySelector('video'); v.srcObject = stream; try { await v.play(); } catch (_) {}
      el.querySelector('#sc-x').onclick = () => this.close();
      const got = (code, typed) => {
        const now = Date.now();
        if (!typed && code === this.last && now - this.lastT < 1800) return;
        this.last = code; this.lastT = now; window.Sound && window.Sound.play && window.Sound.play('beep'); if (navigator.vibrate) navigator.vibrate(40);
        const keep = cb(code);
        const stay = !o.once && (o.continuous || this.keep);
        if (!stay && keep !== false) this.close();
      };
      // torch / zoom when the phone offers them
      try {
        const tr = stream.getVideoTracks()[0], cap = (tr && tr.getCapabilities && tr.getCapabilities()) || {};
        if (cap.torch) { const tb = el.querySelector('#sc-torch'); tb.classList.remove('hidden'); let on = false; tb.onclick = async () => { on = !on; try { await tr.applyConstraints({ advanced: [{ torch: on }] }); tb.classList.toggle('on', on); } catch (_) { on = !on; } }; }
        if (cap.zoom && cap.zoom.max > cap.zoom.min) { const z = el.querySelector('#sc-zoom'); z.min = cap.zoom.min; z.max = cap.zoom.max; z.step = cap.zoom.step || 0.1; z.value = (tr.getSettings && tr.getSettings().zoom) || cap.zoom.min; z.classList.remove('hidden'); z.oninput = () => { try { tr.applyConstraints({ advanced: [{ zoom: +z.value }] }); } catch (_) {} }; }
      } catch (_) {}
      const kb = el.querySelector('#sc-keep'); kb.classList.toggle('on', !!this.keep && !o.once);
      if (o.once || o.continuous) kb.classList.add('hidden');
      kb.onclick = () => { this.keep = !this.keep; kb.classList.toggle('on', this.keep); this.flash(this.keep ? 'Keep scanning: ON' : 'Keep scanning: OFF', 'ok'); };
      const tb2 = el.querySelector('#sc-typebox'), ti = el.querySelector('#sc-code');
      const submit = () => { const v = ti.value.trim(); if (!v) return; ti.value = ''; got(v, true); };
      el.querySelector('#sc-type').onclick = () => { tb2.classList.toggle('hidden'); if (!tb2.classList.contains('hidden')) setTimeout(() => ti.focus(), 30); };
      el.querySelector('#sc-ok').onclick = submit;
      ti.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
      this.timer = setInterval(async () => {
        if (!this.el || this.busy || v.readyState < 2) return;
        this.busy = true;
        try {
          const codes = await det.detect(v);
          if (!this.el || tok !== this.tok || !codes.length) return;
          const code = String(codes[0].rawValue || '').trim(); if (!code) return;
          got(code, false);
        } catch (_) {} finally { this.busy = false; }
      }, fallback ? 260 : 220);
    },
    /* unknown barcode → a bar with an "Add product" button (works over the camera and on normal screens) */
    unknown(code, msg) {
      document.querySelectorAll('.addbar').forEach(e => e.remove());
      const bar = document.createElement('div'); bar.className = 'addbar' + (this.el ? ' in-scan' : '');
      bar.innerHTML = `<span class="ab-t"><i class="fas fa-triangle-exclamation"></i> ${esc(msg || 'Barcode not found')}<b>${esc(code)}</b></span><button type="button" class="btn btn-primary btn-sm"><i class="fas fa-plus"></i> Add product</button><button type="button" class="ab-x" aria-label="Dismiss"><i class="fas fa-xmark"></i></button>`;
      (this.el || document.body).appendChild(bar);
      const gone = () => { clearTimeout(bar._t); bar.remove(); };
      bar.querySelector('.btn').onclick = () => { gone(); if (window.Products) Products.addWithBarcode(code); };
      bar.querySelector('.ab-x').onclick = gone; bar._t = setTimeout(gone, 9000);
    },
    flash(msg, kind) {
      const m = this.el && this.el.querySelector('#sc-msg'); if (!m) { toast(msg); return; }
      m.textContent = msg; m.className = 'sc-msg ' + (kind || '');
      clearTimeout(this.msgT); this.msgT = setTimeout(() => { if (m) m.classList.add('hidden'); }, 2200);
    },
    close() {
      document.querySelectorAll('.addbar.in-scan').forEach(e => e.remove());
      this.tok++; this.opening = false; clearInterval(this.timer); this.timer = null; clearTimeout(this.msgT);
      if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
      if (this.el) { const v = this.el.querySelector('video'); if (v) v.srcObject = null; this.el.remove(); this.el = null; }
      this.busy = false; syncLock();
    }
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && Scanner.isOpen()) Scanner.close(); });
  window.addEventListener('pagehide', () => { if (Scanner.isOpen()) Scanner.close(); });
  async function legacyHash(pin, salt) {
    const s = salt + ':' + pin;
    if (window.crypto && crypto.subtle) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''); }
    let h1 = 5381, h2 = 52711; for (let i = 0; i < s.length; i++) { h1 = (h1 * 33) ^ s.charCodeAt(i); h2 = (h2 * 33) ^ s.charCodeAt(s.length - 1 - i); } return 'x' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  }
  // v10.14: PIN is stored as PBKDF2-SHA256 (150,000 rounds) with a per-device salt; old SHA-256 PINs upgrade silently on the next correct entry.
  async function hashPin(pin, salt) {
    if (window.crypto && crypto.subtle) {
      try {
        const enc = new TextEncoder(), key = await crypto.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('esypos:' + salt), iterations: 150000 }, key, 256);
        return 'p2$' + Array.from(new Uint8Array(bits)).map(x => x.toString(16).padStart(2, '0')).join('');
      } catch (_) {}
    }
    return legacyHash(pin, salt);
  }
  async function verifyPin(pin) {
    const st = DB.settings.pinHash, salt = DB.settings.pinSalt; if (!st) return false;
    if (st.indexOf('p2$') === 0) return (await hashPin(pin, salt)) === st;
    if ((await legacyHash(pin, salt)) === st) { try { DB.settings.pinHash = await hashPin(pin, salt); C.save('settings'); } catch (_) {} return true; }
    return false;
  }
  const Lock = window.Lock = {
    hiddenAt: 0, el: null,
    get fails() { try { return parseInt(localStorage.getItem('esypos_lk_f') || '0', 10) || 0; } catch (_) { return 0; } },
    set fails(v) { try { localStorage.setItem('esypos_lk_f', String(v)); } catch (_) {} },
    get until() { try { return parseInt(localStorage.getItem('esypos_lk_u') || '0', 10) || 0; } catch (_) { return 0; } },
    set until(v) { try { localStorage.setItem('esypos_lk_u', String(v)); } catch (_) {} },
    has() { return !!DB.settings.pinHash; },
    init(start) { if (this.has()) this.show(start); else start(); },
    lockNow() { if (!this.has()) { toast('Set PIN in Settings first'); return; } this.show(() => {}); },
    onHide() { this.hiddenAt = Date.now(); },
    onResume() { if (this.has() && !this.el && this.hiddenAt && Date.now() - this.hiddenAt > (parseInt(DB.settings.autoLockMin, 10) || 1) * 60000) this.show(() => {}); },
    penalty() {                                   // 30s, 1m, 5m, 15m, 30m for repeated lock-outs
      let lv = 0; try { lv = parseInt(localStorage.getItem('esypos_lk_l') || '0', 10) || 0; localStorage.setItem('esypos_lk_l', String(lv + 1)); } catch (_) {}
      const secs = [30, 60, 300, 900, 1800][Math.min(4, lv)]; this.until = Date.now() + secs * 1000; this.fails = 0; return secs;
    },
    async check(pin) {                            // used by section locks: 'ok' | 'bad' | 'wait'
      if (Date.now() < this.until) return 'wait';
      if (await verifyPin(pin)) { this.fails = 0; try { localStorage.removeItem('esypos_lk_l'); } catch (_) {} return 'ok'; }
      this.fails = this.fails + 1; if (this.fails >= 5) { this.penalty(); return 'wait'; }
      return 'bad';
    },
    show(done) {
      if (this.el) return; let pin = '';
      const el = document.createElement('div'); el.className = 'lock';
      el.innerHTML = `<div class="logo" style="width:72px;height:72px"><img class="logo-img" src="assets/icons/icon-192.png" alt="EsyPOS" draggable="false"></div><h2>${esc(DB.settings.shopName)}</h2><p>Unlock with PIN</p><div class="dots" id="lk-dots"><i></i><i></i><i></i><i></i></div>
        <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button type="button" data-k="${k}">${k}</button>`).join('')}</div>
        <button type="button" id="lk-forgot" style="margin-top:26px;background:none;border:0;color:#fff;opacity:.7;font-size:13px;cursor:pointer;text-decoration:underline">Forgot PIN?</button>`;
      document.body.appendChild(el); this.el = el; syncLock();
      const dots = el.querySelectorAll('#lk-dots i');
      const paint = () => dots.forEach((d, i) => d.classList.toggle('f', i < pin.length));
      el.querySelectorAll('[data-k]').forEach(b => b.onclick = async () => {
        const k = b.dataset.k; if (k === '⌫') pin = pin.slice(0, -1); else if (pin.length < 4) pin += k; paint();
        if (pin.length === 4) {
          if (Date.now() < this.until) { toast('⚠️ Too many wrong attempts — ' + Math.ceil((this.until - Date.now()) / 1000) + ' seconds, try later'); pin = ''; paint(); return; }
          if (await verifyPin(pin)) { this.fails = 0; try { localStorage.removeItem('esypos_lk_l'); } catch (_) {} el.remove(); this.el = null; syncLock(); done && done(); }
          else {
            this.fails = this.fails + 1;
            if (this.fails >= 5) { const secs = this.penalty(); toast('⚠️ Too many wrong attempts — wait ' + (secs >= 60 ? Math.round(secs / 60) + ' minutes' : secs + ' seconds')); }
            const d = el.querySelector('#lk-dots'); d.classList.add('shake'); if (navigator.vibrate) navigator.vibrate(120); setTimeout(() => { d.classList.remove('shake'); pin = ''; paint(); }, 450);
          }
        }
      });
      el.querySelector('#lk-forgot').onclick = () => {
        if (window.Cloud && Cloud.isOn()) Cloud.resetPin();
        else askConfirm('Without a Google backup, the only way to remove a forgotten PIN is to wipe all data on this device. Continue?', () => { wipeAllData(); }, { danger: true, yes: 'Wipe & Reset Data', title: 'Reset PIN' });
      };
    },
    setup() {
      const has = this.has();
      const m = Modal.open({ title: has ? 'Change PIN' : 'Set PIN', body: `${has ? '<div class="field"><label class="label">Current PIN</label><input id="pn-old" type="password" inputmode="numeric" maxlength="4" class="input"></div>' : ''}
        <div class="field"><label class="label">New PIN (4 digits)</label><input id="pn-new" type="password" inputmode="numeric" maxlength="4" class="input" ${has ? '' : 'autofocus'}></div>
        <div class="field"><label class="label">Re-enter</label><input id="pn-new2" type="password" inputmode="numeric" maxlength="4" class="input"></div>
        <p class="xs muted">Forgot PIN? Reset needs cloud backup.</p>`, foot: `<button class="btn" onclick="Modal.closeFrom(this)">Cancel</button><button class="btn btn-primary" id="pn-ok">Save</button>` });
      m.querySelector('#pn-ok').onclick = async () => {
        if (has && !(await verifyPin($('pn-old').value))) { toast('⚠️ Current PIN is wrong'); return; }
        const a = $('pn-new').value, b = $('pn-new2').value; if (!/^\d{4}$/.test(a)) { toast('⚠️ Enter exactly 4 digits'); return; } if (a !== b) { toast('⚠️ PINs do not match'); return; }
        const salt = C.genId(); DB.settings.pinSalt = salt; DB.settings.pinHash = await hashPin(a, salt); C.save('settings'); Modal.close(m); toast('PIN set ✓'); App.refresh();
      };
    },
    remove() {
      const m = Modal.open({ title: 'Disable PIN', body: '<div class="field"><label class="label">Current PIN</label><input id="pn-old" type="password" inputmode="numeric" maxlength="4" class="input" autofocus></div>', foot: `<button class="btn" onclick="Modal.closeFrom(this)">Cancel</button><button class="btn btn-bad" id="pn-ok">Disable PIN</button>` });
      m.querySelector('#pn-ok').onclick = async () => { if (!(await verifyPin($('pn-old').value))) { toast('⚠️ Wrong PIN'); return; } DB.settings.pinHash = ''; DB.settings.pinSalt = ''; C.save('settings'); Modal.close(m); toast('PIN disabled'); App.refresh(); };
    }
  };
  const SERVICES = ['000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '0000ff00-0000-1000-8000-00805f9b34fb', '0000ffe0-0000-1000-8000-00805f9b34fb', '0000ffb0-0000-1000-8000-00805f9b34fb'];
  const Printer = window.Printer = {
    dev: null, ch: null, name: '',
    isConnected() { return !!(this.ch && this.dev && this.dev.gatt && this.dev.gatt.connected); },
    ui() {
      const ok = this.isConnected(); const s = $('bt-status'); if (s) s.innerHTML = ok ? `<span class="badge b-ok">● Connected: ${esc(this.name)}</span>` : '<span class="badge">● Not connected</span>';
      const c = $('bt-conn'), d = $('bt-disc'); if (c) c.classList.toggle('hidden', ok); if (d) d.classList.toggle('hidden', !ok);
    },
    async connect() {
      if (!navigator.bluetooth) { toast('⚠️ Web Bluetooth not available. Use Android Chrome/Edge.'); return false; }
      try {
        toast('Searching for printer...');
        this.dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
        this.dev.addEventListener('gattserverdisconnected', () => { this.ch = null; this.ui(); toast('Printer disconnected'); });
        const server = await this.dev.gatt.connect(); const services = await server.getPrimaryServices(); let found = null;
        for (const sv of services) { const cs = await sv.getCharacteristics(); for (const c of cs) { if (c.properties.write || c.properties.writeWithoutResponse) { found = c; break; } } if (found) break; }
        if (!found) throw new Error('Printer write channel not available');
        this.ch = found; this.name = this.dev.name || 'Printer'; this.ui(); toast('Printer connected ✓'); return true;
      } catch (e) { console.error(e); toast(e.name === 'NotFoundError' ? 'No device selected' : '⚠️ Connection failed: ' + (e.message || '')); this.ch = null; this.ui(); return false; }
    },
    disconnect() { try { if (this.dev && this.dev.gatt.connected) this.dev.gatt.disconnect(); } catch (_) {} this.ch = null; this.ui(); },
    async write(bytes) {
      const size = 100;
      for (let i = 0; i < bytes.length; i += size) {
        const chunk = bytes.slice(i, i + size);
        if (this.ch.properties.writeWithoutResponse) await this.ch.writeValueWithoutResponse(chunk); else await this.ch.writeValue(chunk);
        await new Promise(r => setTimeout(r, 18));
      }
    },
    async print(sale) {
      if (!sale) return;
      if (!this.isConnected()) { const ok = await this.connect(); if (!ok) return; }
      try { toast('Printing...'); const data = DB.settings.btMode === 'text' ? this.textJob(sale) : await this.imageJob(sale); await this.write(data); toast('Print done ✓'); }
      catch (e) { console.error(e); toast('⚠️ Print failed: ' + (e.message || 'Error')); }
    },
    lines(s) {
      const sh = DB.settings; const cust = C.findCustomer(s.customerId); const bal = cust ? C.customerBalance(cust.id) : 0; const L = [];
      const MN = { cash: 'Cash', card: 'Card', mobile: 'Mobile', due: 'Due' };
      L.push({ t: sh.shopName || 'EsyPOS', a: 'c', b: 1, s: 28 });
      if (sh.shopAddress) L.push({ t: sh.shopAddress, a: 'c', s: 20 }); if (sh.shopPhone) L.push({ t: 'Phone: ' + sh.shopPhone, a: 'c', s: 20 });
      L.push({ hr: 1 }, { t: 'Receipt no.', t2: '#' + C.invLabel(s), s: 21 }, { t: 'Date', t2: C.fmtDT(s.date), s: 21 });
      if (cust) L.push({ t: 'Customer', t2: cust.name, s: 21 }); L.push({ t: 'Payment', t2: MN[s.paymentMethod] || '', s: 21 }, { hr: 1 });
      s.items.forEach(i => { L.push({ t: i.name, s: 22, b: 1 }); if (i.note) L.push({ t: '+ ' + i.note, s: 19 }); L.push({ t: i.qty + ' × ' + fmt(i.price), t2: fmt(i.price * i.qty), s: 21 }); });
      L.push({ hr: 1 }, { t: 'Subtotal', t2: fmt(s.subtotal), s: 21 });
      if (s.discount > 0) L.push({ t: 'Discount', t2: '-' + fmt(s.discount), s: 21 }); if (s.tax > 0) L.push({ t: 'Tax', t2: fmt(s.tax), s: 21 });
      L.push({ t: 'Total', t2: C.cur() + fmt(s.total), s: 28, b: 1 }, { t: 'Paid', t2: fmt(s.paid), s: 21 });
      if (s.change > 0) L.push({ t: 'Change given', t2: fmt(s.change), s: 21 }); if (s.due > 0) L.push({ t: 'Due on this bill', t2: fmt(s.due), s: 23, b: 1 });
      if (cust && bal > 0) L.push({ t: 'Total due', t2: fmt(bal), s: 23, b: 1 });
      L.push({ hr: 1 }, { t: sh.footer || '', a: 'c', s: 20 }, { gap: 40 });
      return L;
    },
    async imageJob(sale) {
      const W = DB.settings.paper === '80' ? 576 : 384; const pad = 6;
      try { await document.fonts.load('20px Inter'); } catch (_) {}
      const cv = document.createElement('canvas'); cv.width = W; let ctx = cv.getContext('2d');
      const font = (s, b) => `${b ? '700 ' : ''}${s}px Inter, system-ui, sans-serif`;
      const wrap = (txt, maxW, f) => { ctx.font = f; const out = []; let line = ''; String(txt).split(' ').forEach(w => { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }); if (line) out.push(line); return out; };
      const layout = []; let y = 4;
      this.lines(sale).forEach(l => {
        if (l.hr) { layout.push({ hr: 1, y: y + 6 }); y += 14; return; } if (l.gap) { y += l.gap; return; }
        const f = font(l.s, l.b); const lh = Math.round(l.s * 1.45);
        if (l.t2 !== undefined) { ctx.font = f; const rw = ctx.measureText(l.t2).width; const lines = wrap(l.t, W - rw - pad * 3, f); lines.forEach((ln, k) => { layout.push({ f, x: pad, y: y + lh * (k + 1) - 6, t: ln }); }); layout.push({ f, right: 1, y: y + lh - 6, t: l.t2 }); y += lh * Math.max(1, lines.length); }
        else { wrap(l.t, W - pad * 2, f).forEach(ln => { layout.push({ f, c: l.a === 'c', y: y + lh - 6, t: ln, x: pad }); y += lh; }); }
      });
      cv.height = y + 10; ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, cv.height); ctx.fillStyle = '#000'; ctx.textBaseline = 'alphabetic';
      layout.forEach(it => { if (it.hr) { for (let x = 0; x < W; x += 8) ctx.fillRect(x, it.y, 4, 2); return; } ctx.font = it.f; const w = ctx.measureText(it.t).width; ctx.fillText(it.t, it.right ? W - pad - w : it.c ? (W - w) / 2 : it.x, it.y); });
      const img = ctx.getImageData(0, 0, W, cv.height).data; const bpr = W / 8; const out = [0x1B, 0x40, 0x1B, 0x61, 0x00];
      for (let y0 = 0; y0 < cv.height; y0 += 96) {
        const h = Math.min(96, cv.height - y0); out.push(0x1D, 0x76, 0x30, 0x00, bpr & 255, bpr >> 8, h & 255, h >> 8);
        for (let yy = 0; yy < h; yy++) for (let bx = 0; bx < bpr; bx++) { let byte = 0; for (let bit = 0; bit < 8; bit++) { const i = ((y0 + yy) * W + bx * 8 + bit) * 4; const lum = img[i] * .3 + img[i + 1] * .59 + img[i + 2] * .11; if (lum < 150 && img[i + 3] > 20) byte |= 0x80 >> bit; } out.push(byte); }
      }
      out.push(0x1B, 0x64, 0x04, 0x1D, 0x56, 0x01); return new Uint8Array(out);
    },
    textJob(s) {
      const sh = DB.settings; const w = sh.paper === '80' ? 48 : 32; const asc = t => String(t || '').replace(/[^\x20-\x7E]/g, '?');
      const lr = (a, b) => { a = asc(a); b = asc(b); return a.slice(0, Math.max(1, w - b.length - 1)).padEnd(w - b.length) + b + '\n'; };
      const e = new TextEncoder(); const o = []; const t = x => e.encode(x).forEach(c => o.push(c));
      o.push(0x1B, 0x40, 0x1B, 0x61, 0x01, 0x1B, 0x21, 0x30); t(asc(sh.shopName || 'EsyPOS') + '\n'); o.push(0x1B, 0x21, 0x00); if (sh.shopPhone) t('Tel: ' + asc(sh.shopPhone) + '\n'); t('-'.repeat(w) + '\n'); o.push(0x1B, 0x61, 0x00);
      t(lr('No', '#' + C.invLabel(s))); t(lr('Date', C.dkey(s.date))); t('-'.repeat(w) + '\n');
      s.items.forEach(i => { t(asc(i.name) + '\n'); if (i.note) t('  + ' + asc(i.note) + '\n'); t(lr('  ' + i.qty + ' x ' + i.price.toFixed(2), (i.price * i.qty).toFixed(2))); });
      t('-'.repeat(w) + '\n'); t(lr('Subtotal', s.subtotal.toFixed(2))); if (s.discount > 0) t(lr('Discount', '-' + s.discount.toFixed(2))); if (s.tax > 0) t(lr('Tax', s.tax.toFixed(2)));
      o.push(0x1B, 0x21, 0x08); t(lr('TOTAL', s.total.toFixed(2))); o.push(0x1B, 0x21, 0x00); t(lr('Paid', s.paid.toFixed(2))); if (s.due > 0) t(lr('DUE', s.due.toFixed(2)));
      o.push(0x1B, 0x61, 0x01); t('\nThank You!\n\n\n\n'); o.push(0x1D, 0x56, 0x01); return new Uint8Array(o);
    }
  };
  App.Views.settings = {
    render() {
      const s = DB.settings; let bytes = 0; try { Object.keys(localStorage).forEach(k => { bytes += (k.length + (localStorage.getItem(k) || '').length) * 2; }); } catch (_) {}
      const kb = Math.round(bytes / 1024); const last = parseInt(localStorage.getItem('esypos_last_backup') || '0', 10);
      $('view').innerHTML = `<div class="page-head"><div><h2>Settings</h2><p>Shop, appearance, security, printer & data</p></div></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-store ptext"></i> Shop info</div>
        <div class="field"><label class="label">Shop name</label><input id="st-name" class="input" value="${esc(s.shopName)}"></div>
        <div class="field"><label class="label">Address</label><input id="st-addr" class="input" value="${esc(s.shopAddress)}"></div>
        <div class="grid2"><div class="field"><label class="label">Phone</label><input id="st-phone" class="input" value="${esc(s.shopPhone)}"></div><div class="field"><label class="label">Default tax (%)</label><input id="st-tax" type="number" step="any" min="0" class="input" value="${s.defaultTax || 0}"></div></div>
        <div class="field"><label class="label">Business type</label><select id="st-biz" class="input">
          <option value="retail" ${(s.businessType||'retail')==='retail'?'selected':''}>Retail / General shop</option>
          <option value="restaurant" ${s.businessType==='restaurant'?'selected':''}>Restaurant / Cafe / Fast food</option>
          <option value="pharmacy" ${s.businessType==='pharmacy'?'selected':''}>Pharmacy / Medicine</option>
          <option value="grocery" ${s.businessType==='grocery'?'selected':''}>Grocery / Supermarket</option>
          <option value="electronics" ${s.businessType==='electronics'?'selected':''}>Electronics / Mobile</option>
          <option value="clothing" ${s.businessType==='clothing'?'selected':''}>Clothing / Fashion</option>
          <option value="wholesale" ${s.businessType==='wholesale'?'selected':''}>Wholesale / Distributor</option>
        </select>
        <p class="xs muted mt1">Adds matching fields to the product form.</p></div>
        <div class="grid2"><div class="field"><label class="label">Currency symbol</label><input id="st-cur" class="input" maxlength="4" value="${esc(s.currency)}" placeholder="$"></div><div class="field"><label class="label">Example</label><div class="input" style="display:flex;align-items:center;background:var(--hover)">${esc(s.currency)}1,250.50</div></div></div>
        <div class="field"><label class="label">Receipt footer text</label><input id="st-foot" class="input" value="${esc(s.footer)}"></div>
        <div class="grid3"><div class="field"><label class="label">Invoice prefix</label><input id="st-pre" class="input" value="${esc(s.invPrefix)}" placeholder="INV-"></div><div class="field"><label class="label">Paper</label><select id="st-paper" class="input"><option value="58" ${s.paper === '58' ? 'selected' : ''}>58 mm</option><option value="80" ${s.paper === '80' ? 'selected' : ''}>80 mm</option></select></div><div class="field"><label class="label">Low stock (default)</label><input id="st-low" type="number" min="0" class="input" value="${s.lowStockDefault == null ? 5 : s.lowStockDefault}"></div></div>
        <div class="grid2"><div class="field"><label class="label">Barcode prefix</label><input id="st-bcpre" class="input" maxlength="6" value="${esc(s.barcodePrefix||'ESY')}" placeholder="ESY"></div>
          <div class="field"><label class="label">Default barcode format</label><select id="st-bcfmt" class="input"><option value="code128" ${(s.barcodeFormat||'code128')==='code128'?'selected':''}>Code 128</option><option value="ean13" ${s.barcodeFormat==='ean13'?'selected':''}>EAN-13</option><option value="qr" ${s.barcodeFormat==='qr'?'selected':''}>QR Code</option></select></div></div>
        <div class="field"><label class="label">Barcode sequence counter (next number)</label><input id="st-bcnext" type="number" min="1" step="1" class="input" value="${parseInt(s.nextBarcode, 10) || 1000001}"><p class="xs muted mt1">Next code: <b>${esc((window.BarcodeGen ? BarcodeGen.uniqueCode(s.barcodePrefix || 'ESY', s.nextBarcode) : ''))}</b> · each Generate uses this number, then adds 1</p></div>
        <button class="btn btn-primary btn-block" onclick="Settings.save()"><i class="fas fa-floppy-disk"></i> Save</button></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-palette ptext"></i> Appearance & sound</div>
        <div class="field"><label class="label">Theme</label><select id="theme-select" class="input" onchange="Theme.set(this.value)"><option value="auto">Auto (device setting)</option><option value="light">Light mode</option><option value="dark">Dark mode</option></select></div>
        <label class="switch"><span class="sm fw6"><i class="fas fa-volume-high ptext"></i> Click sound</span><input type="checkbox" ${Sound.isEnabled() ? 'checked' : ''} onchange="Sound.setEnabled(this.checked)"></label>
        ${Haptic.supported() ? `<label class="switch mt2"><span class="sm fw6"><i class="fas fa-mobile-screen ptext"></i> Vibration feedback</span><input type="checkbox" ${Haptic.isEnabled() ? 'checked' : ''} onchange="Haptic.setEnabled(this.checked)"></label>` : ''}</div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-lock ptext"></i> Security (PIN lock)</div><p class="muted sm mb3">${Lock.has() ? 'PIN on. Asked on open and after idle.' : 'Protect sales and accounts with a PIN.'}</p>
        <div class="flex gap2"><button class="btn btn-primary" onclick="Lock.setup()">${Lock.has() ? 'Change PIN' : 'Set PIN'}</button>${Lock.has() ? '<button class="btn btn-ghost" onclick="Lock.lockNow()">Lock now</button><button class="btn btn-danger-soft" onclick="Lock.remove()">Disable PIN</button>' : ''}</div></div>
      ${window.LP ? LP.cardHTML() : ''}
      <div class="card pad mb3"><div class="sec-title"><i class="fab fa-bluetooth-b ptext"></i> Bluetooth printer</div><div class="mb3" id="bt-status"></div>
        <div class="field"><label class="label">Print mode</label><select class="input" onchange="DB_.btMode(this.value)"><option value="image" ${s.btMode !== 'text' ? 'selected' : ''}>Image mode — supports all languages (recommended)</option><option value="text" ${s.btMode === 'text' ? 'selected' : ''}>Text mode — English only, faster</option></select></div>
        <div class="flex gap2"><button class="btn btn-primary grow" id="bt-conn" onclick="Printer.connect()"><i class="fab fa-bluetooth-b"></i> Connect printer</button><button class="btn btn-danger-soft grow hidden" id="bt-disc" onclick="Printer.disconnect()">Disconnect</button></div>
        <p class="xs muted mt2">Android Chrome/Edge. Pair in Bluetooth first.</p></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fab fa-google ptext"></i> Google Drive Cloud Backup</div><div class="js-cloud-body"></div></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-database ptext"></i> Data management</div>
        <p class="xs muted mt2">Sales save to <b>Google Drive</b> instantly; this device keeps a working copy for offline use.</p>
        <button class="btn btn-danger-soft btn-block mt2" onclick="wipeAllData()"><i class="fas fa-trash"></i> Delete all data</button></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-scale-balanced ptext"></i> Legal</div>
        <div class="grid2"><a class="btn btn-ghost" href="privacy.html" target="_blank" rel="noopener"><i class="fas fa-user-shield"></i> Privacy Policy</a><a class="btn btn-ghost" href="terms.html" target="_blank" rel="noopener"><i class="fas fa-file-contract"></i> Terms of Service</a></div></div>
      <div class="tc muted xs">EsyPOS · Simple POS for Every Business<br>© EsyPOS · <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a> · <a href="license.html" target="_blank" rel="noopener">MIT License</a> · <a href="terms.html" target="_blank" rel="noopener">Terms of Service</a></div>`;
      Theme.apply(); Printer.ui(); if (window.Cloud) Cloud.renderUI();
    },
    save() {
      const s = DB.settings; s.shopName = $('st-name').value.trim() || 'My Shop'; s.shopAddress = $('st-addr').value.trim(); s.shopPhone = $('st-phone').value.trim();
      s.defaultTax = Math.max(0, num($('st-tax').value)); s.footer = $('st-foot').value.trim(); s.invPrefix = $('st-pre').value.trim(); s.currency = ($('st-cur').value || '').trim().slice(0, 4) || C.DEFAULTS.currency; s.paper = $('st-paper').value; const lw = parseFloat($('st-low').value); s.lowStockDefault = isFinite(lw) && lw >= 0 ? lw : 5;
      s.businessType = ($('st-biz') && $('st-biz').value) || 'retail';
      s.barcodePrefix = (($('st-bcpre') && $('st-bcpre').value) || 'ESY').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6) || 'ESY';
      s.barcodeFormat = ($('st-bcfmt') && $('st-bcfmt').value) || 'code128';
      const bn = parseInt($('st-bcnext') && $('st-bcnext').value, 10); if (isFinite(bn) && bn >= 1) s.nextBarcode = bn;
      C.save('settings'); POS.taxInit(); POS.renderCart(); toast('Settings saved ✓');
    }
  };
  window.Settings = App.Views.settings;
  window.DB_ = { btMode(v) { DB.settings.btMode = v; C.save('settings'); } };
})();
