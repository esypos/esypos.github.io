/* Old POS Wedge — USB / Bluetooth barcode scanner support (v10.8.0)
   A hardware scanner "types" the code like a very fast keyboard. This engine:
   • reads the PHYSICAL key (event.code), so Bangla / any other keyboard layout still gives the right characters;
   • tells a scan from human typing by speed (a person never averages < 70 ms per key);
   • works on every screen that registers a handler (POS, product form, product search, labels, purchase…);
   • matches codes safely (AIM prefix like "]C1", leading zeros) and never guesses when two products clash. */
(function (root) {
  'use strict';

  const MAX_GAP = 120, FAST_AVG = 70, IDLE = 90, MIN_LEN = 3;

  /* ---------- physical key → character (US scanner layout) ---------- */
  const SHIFT_DIGIT = ')!@#$%^&*(';
  const PUNCT = {
    Minus: ['-', '_'], Equal: ['=', '+'], BracketLeft: ['[', '{'], BracketRight: [']', '}'], Backslash: ['\\', '|'],
    Semicolon: [';', ':'], Quote: ["'", '"'], Comma: [',', '<'], Period: ['.', '>'], Slash: ['/', '?'], Backquote: ['`', '~'], Space: [' ', ' ']
  };
  const NUMPAD = { NumpadDecimal: '.', NumpadSubtract: '-', NumpadDivide: '/', NumpadAdd: '+', NumpadMultiply: '*' };

  function charFromEvent(e) {
    const code = e.code || '';
    let m;
    if ((m = /^Digit(\d)$/.exec(code))) return e.shiftKey ? SHIFT_DIGIT[+m[1]] : m[1];
    if ((m = /^Numpad(\d)$/.exec(code))) return m[1];
    if (NUMPAD[code]) return NUMPAD[code];
    if ((m = /^Key([A-Z])$/.exec(code))) {
      let caps = false; try { caps = !!(e.getModifierState && e.getModifierState('CapsLock')); } catch (_) {}
      return (e.shiftKey !== caps) ? m[1] : m[1].toLowerCase();
    }
    if (PUNCT[code]) return PUNCT[code][e.shiftKey ? 1 : 0];
    return (e.key && e.key.length === 1) ? e.key : '';           // unknown key / virtual keyboard: fall back to what the browser says
  }

  /* ---------- code cleaning + product matching ---------- */
  function clean(code) {
    let c = String(code == null ? '' : code).replace(/[\u0000-\u001F\u007F]/g, '').trim();
    c = c.replace(/^\][A-Za-z][0-9A-Za-z]/, '');                 // AIM symbology identifier some scanners prepend, e.g. "]C1", "]E0"
    return c.trim();
  }
  const key = v => {
    v = String(v == null ? '' : v).trim();
    return /^\d{12,13}$/.test(v) ? v.padStart(13, '0') : v.toUpperCase();
  };
  const isDigits = v => /^\d+$/.test(v);
  const stripZ = v => v.replace(/^0+/, '');

  /* Returns { code, product, ambiguous }.
     product  = the one matching product (or null)
     ambiguous = array of products when 2+ share the code — we refuse to guess. */
  function match(code, products) {
    const c = clean(code), out = { code: c, product: null, ambiguous: [] };
    if (!c) return out;
    const list = products || ((root.Core && root.Core.DB && root.Core.DB.products) || []);
    const k = key(c);
    let hits = list.filter(p => p && p.barcode && key(p.barcode) === k);
    if (!hits.length && isDigits(c) && stripZ(c)) {              // a spreadsheet may have cut the leading 0 (or the scanner added one)
      const z = stripZ(c);
      hits = list.filter(p => { const b = p && p.barcode && String(p.barcode).trim(); return b && isDigits(b) && stripZ(b) === z; });
    }
    if (hits.length === 1) out.product = hits[0];
    else if (hits.length > 1) out.ambiguous = hits;
    return out;
  }

  /* A code that Excel turned into scientific notation (8.9E+12) is destroyed — it can never match a real product. */
  const isSciNotation = v => /^\s*\d+(\.\d+)?e\+?\d+\s*$/i.test(String(v == null ? '' : v));

  /* ---------- the key listener ---------- */
  const handlers = [];          // newest first; each: { id, when(ctx)->bool, handle(code, ctx)->true|'miss'|false }
  let buf = '', t0 = 0, last = 0, timer = null, startEl = null, startVal = '', active = null, installed = false;

  const isText = el => !!el && el.tagName === 'INPUT' && /^(text|search|number|tel|email|url|password|)$/i.test(el.type || '');
  const isMultiline = el => !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  const fastBurst = () => buf.length >= MIN_LEN && (last - t0) / (buf.length - 1) <= FAST_AVG;

  function reset() { buf = ''; t0 = last = 0; startEl = null; startVal = ''; active = null; if (timer) { clearTimeout(timer); timer = null; } }

  function pickHandler(ae) {
    for (const h of handlers) { try { if (h.when({ el: ae })) return h; } catch (_) {} }
    return null;
  }

  function restoreField(el, before) {                              // undo the characters the scanner typed into a field
    if (!el || el.value === undefined || el.value === before) return;
    el.value = before;
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
  }

  function finish(viaKey) {
    const fast = fastBurst(), typed = buf.trim(), el = startEl, before = startVal, h = active;
    reset();
    if (!fast || !h) return false;
    const cands = [typed];
    if (el && el.value !== undefined && el.value.startsWith(before) && el.value.length > before.length) cands.push(el.value.slice(before.length).trim());
    let res = false, used = typed;
    for (const c of cands) {
      if (clean(c).length < MIN_LEN) continue;
      let r; try { r = h.handle(clean(c), { el, before, viaKey, typed }); } catch (err) { console.error('Old POS wedge', err); r = false; }
      if (r) { res = r; used = c; break; }
    }
    if (res && res !== 'keep') restoreField(el, before);
    return res;
  }

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    const ae = document.activeElement, now = performance.now();
    if (buf && now - last > MAX_GAP) reset();
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (buf && fastBurst()) { const r = finish(true); if (r) { e.preventDefault(); e.stopPropagation(); } }
      else reset();
      return;
    }
    if (e.key === 'Shift' || e.key === 'CapsLock' || e.key === 'Process') return;
    const ch = charFromEvent(e);
    if (!ch) return;
    if (isMultiline(ae)) { reset(); return; }
    if (!buf) {
      active = pickHandler(ae);
      if (!active) return;
      t0 = now; startEl = isText(ae) ? ae : null; startVal = startEl ? startEl.value : '';
    }
    buf += ch; last = now;
    if (buf.length >= MIN_LEN && fastBurst()) e.preventDefault();   // stop the rest of the burst from typing into the field (or "clicking" a focused button with a space)
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { if (fastBurst()) finish(false); else reset(); }, IDLE);
  }

  function install() { if (installed) return; installed = true; document.addEventListener('keydown', onKey, true); }

  function register(h) {
    install(); handlers.unshift(h);
    return () => { const i = handlers.indexOf(h); if (i >= 0) handlers.splice(i, 1); };
  }

  root.Wedge = { register, restore: restoreField, match, clean, key, charFromEvent, isSciNotation, MIN_LEN };
})(window);
