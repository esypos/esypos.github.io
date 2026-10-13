/* EsyPOS Barcode engine — Code 128 (auto subset B/C), EAN-13/UPC-A, QR. Pure JS, offline, no dependencies.
   v10.7.4 — scan-reliability rewrite:
   • Code 128 now switches to the compact "subset C" for digit runs (about 15-45% fewer bars → thicker bars on small stickers).
   • Bars are drawn on an integer module grid and sized in real millimetres, as a whole number of PRINTER DOTS per module
     (203 dpi thermal → 2 dots = 0.25 mm). Fractional dots are what makes thermal printers smear bars and scanners fail.
   • EAN-13 is only drawn when the number is a VALID EAN-13/UPC-A. The old code silently re-computed the check digit, so the
     sticker said one number while the product stored another → "scans but product not found". Invalid numbers now use
     Code 128 which carries the exact stored text. */
(function (root) {
  'use strict';

  // Each value: 11-module pattern as binary string (1=bar, 0=space)
  const C128 = [
    '11011001100','11001101100','11001100110','10010011000','10010001100','10001001100','10011001000','10011000100','10001100100','11001001000',
    '11001000100','11000100100','10110011100','10011011100','10011001110','10111001100','10011101100','10011100110','11001110010','11001011100',
    '11001001110','11011100100','11001110100','11101101110','11101001100','11100101100','11100100110','11101100100','11100110100','11100110010',
    '11011011000','11011000110','11000110110','10100011000','10001011000','10001000110','10110001000','10001101000','10001100010','11010001000',
    '11000101000','11000100010','10110111000','10110001110','10001101110','10111011000','10111000110','10001110110','11101110110','11010001110',
    '11000101110','11011101000','11011100010','11011101110','11101011000','11101000110','11100010110','11101101000','11101100010','11100011010',
    '11101111010','11001000010','11110001010','10100110000','10100001100','10010110000','10010000110','10000101100','10000100110','10110010000',
    '10110000100','10011010000','10011000010','10000110100','10000110010','11000010010','11001010000','11110111010','11000010100','10001111010',
    '10100111100','10010111100','10010011110','10111100100','10011110100','10011110010','11110100100','11110010100','11110010010','11011011110',
    '11011110110','11110110110','10101111000','10100011110','10001011110','10111101000','10111100010','11110101000','11110100010','10111011110',
    '10111101110','11101011110','11110101110','11010000100','11010010000','11010011100','11000111010'
  ];
  const START_B = 104, START_C = 105, CODE_B = 100, CODE_C = 99, STOP = 106;

  /* Optimal Code 128 symbol sequence (dynamic programming over subsets B / C). Printable ASCII only. */
  function code128Codes(s) {
    const n = s.length, INF = 1e9;
    const isD = i => i < n && s.charCodeAt(i) >= 48 && s.charCodeAt(i) <= 57;
    const cost = [new Array(n + 2).fill(INF), new Array(n + 2).fill(INF)];
    const dir = [new Array(n + 2).fill(1), new Array(n + 2).fill(1)];   // 1 = encode here, 0 = switch subset first
    cost[0][n] = 0; cost[1][n] = 0;
    for (let i = n - 1; i >= 0; i--) {
      const b = 1 + cost[0][i + 1];                                   // one char in subset B
      const c = (isD(i) && isD(i + 1)) ? 1 + cost[1][i + 2] : INF;    // a digit pair in subset C
      if (b <= 1 + c) { cost[0][i] = b; dir[0][i] = 1; } else { cost[0][i] = 1 + c; dir[0][i] = 0; }
      if (c <= 1 + b) { cost[1][i] = c; dir[1][i] = 1; } else { cost[1][i] = 1 + b; dir[1][i] = 0; }
    }
    let mode = cost[0][0] <= cost[1][0] ? 0 : 1, i = 0;
    const codes = [mode ? START_C : START_B];
    while (i < n) {
      if (mode === 0) { if (dir[0][i]) { codes.push(s.charCodeAt(i) - 32); i++; } else { codes.push(CODE_C); mode = 1; } }
      else { if (dir[1][i]) { codes.push(parseInt(s.substr(i, 2), 10)); i += 2; } else { codes.push(CODE_B); mode = 0; } }
    }
    return codes;
  }

  function code128(text) {
    text = String(text == null ? '' : text);
    let s = '';
    for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); s += (c >= 32 && c <= 126) ? text[i] : '?'; }
    if (!s) s = '0';
    const codes = code128Codes(s);
    let sum = codes[0];
    for (let k = 1; k < codes.length; k++) sum += codes[k] * k;
    codes.push(sum % 103); codes.push(STOP);
    let bits = '';
    codes.forEach(c => { bits += C128[c] || C128[0]; });
    return bits + '11';                                                // stop pattern is 13 modules: 11 + final bar
  }

  function ean13Check(d12) {
    d12 = String(d12).replace(/\D/g, '').slice(0, 12).padStart(12, '0');
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(d12[i], 10) * (i % 2 === 0 ? 1 : 3);
    return d12 + String((10 - (sum % 10)) % 10);
  }
  // A number may be drawn as EAN-13 only when its check digit is already correct (13 digits, or a 12-digit UPC-A).
  function ean13Normalize(v) {
    v = String(v == null ? '' : v).trim();
    if (/^\d{13}$/.test(v)) return ean13Check(v.slice(0, 12)) === v ? v : null;
    if (/^\d{12}$/.test(v)) { const c = '0' + v; return ean13Check(c.slice(0, 12)) === c ? c : null; }
    return null;
  }

  const EAN_L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
  const EAN_G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
  const EAN_R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
  const EAN_PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

  function ean13Bits(code13) {
    const first = parseInt(code13[0], 10), parity = EAN_PARITY[first];
    let bits = '101';
    for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === 'L' ? EAN_L : EAN_G)[parseInt(code13[i], 10)];
    bits += '01010';
    for (let i = 7; i <= 12; i++) bits += EAN_R[parseInt(code13[i], 10)];
    return bits + '101';
  }

  function escXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  const r4 = x => Math.round(x * 10000) / 10000;

  /* Human-readable line, sized so it never runs wider than the symbol. Units are module units. */
  function textLine(value, cx, y, fs, maxW) {
    value = String(value);
    const w = value.length * fs * 0.62;
    if (w > maxW) fs = maxW / (value.length * 0.62);
    return `<text x="${r4(cx)}" y="${r4(y)}" text-anchor="middle" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="${r4(fs)}" font-weight="600" fill="#000">${escXml(value)}</text>`;
  }

  /* 1-D symbol. Geometry is an integer module grid (viewBox units = modules); real size comes from width/height.
     o.mod = size of one module in o.unit ('mm' or 'px'); o.barH, o.textH in the same unit. */
  function linearSvg(bits, o) {
    const unit = o.unit || 'px', mod = o.mod, q = Math.max(10, o.quiet || 10);
    const modsW = bits.length + q * 2;
    const showText = o.text !== false && o.value != null && o.value !== '';
    const barHU = r4(o.barH / mod), textHU = showText ? r4((o.textH || o.barH * 0.3) / mod) : 0;
    let d = '', i = 0;
    while (i < bits.length) {
      if (bits[i] === '1') { let j = i; while (j < bits.length && bits[j] === '1') j++; d += `M${q + i},0h${j - i}v${barHU}h-${j - i}z`; i = j; } else i++;
    }
    const totH = r4(barHU + textHU);
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${r4(modsW * mod)}${unit}" height="${r4(totH * mod)}${unit}" viewBox="0 0 ${modsW} ${totH}" shape-rendering="crispEdges" preserveAspectRatio="none" data-mods="${modsW}">`;
    svg += `<rect width="${modsW}" height="${totH}" fill="#fff"/><path d="${d}" fill="#000"/>`;
    if (showText) svg += textLine(o.value, modsW / 2, barHU + textHU * 0.82, textHU * 0.82, modsW * 0.96);
    return svg + '</svg>';
  }

  function bitsToSvg(bits, opts) {          // legacy helper (screen preview): integer pixels per module
    opts = opts || {};
    const mod = Math.max(1, Math.round(opts.barWidth || 2));
    return linearSvg(bits, { unit: 'px', mod, barH: Math.max(20, opts.height || 60), textH: 18, text: opts.text, value: opts.value, quiet: opts.quiet });
  }

  /* ---------- Real QR Code encoder (byte mode, ECC level M, versions 1-10, UTF-8) ----------
     Offline, no dependencies. Output is a standard, scannable QR symbol. */
  const QR_ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];   // index = version
  const QR_NUM_BLOCKS    = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
  function qrRawModules(ver) {
    const size = ver * 4 + 17; let r = size * size - 8 * 8 * 3 - (15 * 2 + 1) - (size - 16) * 2;
    if (ver >= 2) { const na = Math.floor(ver / 7) + 2; r -= (na - 1) * (na - 1) * 25 + (na - 2) * 2 * 20; if (ver >= 7) r -= 36; }
    return r;
  }
  const qrDataCodewords = ver => Math.floor(qrRawModules(ver) / 8) - QR_ECC_PER_BLOCK[ver] * QR_NUM_BLOCKS[ver];
  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(str));
    const out = []; const e = unescape(encodeURIComponent(str)); for (let i = 0; i < e.length; i++) out.push(e.charCodeAt(i)); return out;
  }
  function gfMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 255; }
  function rsDivisor(deg) {
    const res = new Array(deg).fill(0); res[deg - 1] = 1; let root = 1;
    for (let i = 0; i < deg; i++) { for (let j = 0; j < deg; j++) { res[j] = gfMul(res[j], root); if (j + 1 < deg) res[j] ^= res[j + 1]; } root = gfMul(root, 2); }
    return res;
  }
  function rsRemainder(data, div) {
    const res = new Array(div.length).fill(0);
    data.forEach(b => { const f = b ^ res.shift(); res.push(0); div.forEach((c, i) => { res[i] ^= gfMul(c, f); }); });
    return res;
  }
  function qrMatrix(text) {
    const bytes = utf8Bytes(String(text == null ? '' : text));
    let ver = 0;
    for (let v = 1; v <= 10; v++) { const ccBits = v < 10 ? 8 : 16; if (4 + ccBits + bytes.length * 8 <= qrDataCodewords(v) * 8) { ver = v; break; } }
    if (!ver) return null;                                       // too long for this encoder
    const size = ver * 4 + 17, cap = qrDataCodewords(ver);
    // bit stream
    const bits = []; const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    put(0, Math.min(4, cap * 8 - bits.length)); while (bits.length % 8) bits.push(0);
    const data = []; for (let i = 0; i < bits.length; i += 8) { let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j]; data.push(v); }
    for (let pad = 0xEC; data.length < cap; pad ^= 0xEC ^ 0x11) data.push(pad);
    // error correction + interleave
    const nb = QR_NUM_BLOCKS[ver], eccLen = QR_ECC_PER_BLOCK[ver], raw = Math.floor(qrRawModules(ver) / 8);
    const shortLen = Math.floor(raw / nb), numShort = nb - raw % nb; const div = rsDivisor(eccLen); const blocks = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1)); k += dat.length;
      const ecc = rsRemainder(dat, div); if (i < numShort) dat.push(0); blocks.push(dat.concat(ecc));
    }
    const all = [];
    for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= numShort) all.push(b[i]); });
    // matrix
    const M = [], F = []; for (let y = 0; y < size; y++) { M.push(new Array(size).fill(false)); F.push(new Array(size).fill(false)); }
    const setF = (x, y, d) => { M[y][x] = !!d; F[y][x] = true; };
    for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy; if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const pos = []; if (ver > 1) { const na = Math.floor(ver / 7) + 2, step = Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2; pos.push(6); for (let p = size - 7; pos.length < na; p -= step) pos.splice(1, 0, p); }
    pos.forEach((px, i) => pos.forEach((py, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setF(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    const formatBits = mask => {
      const d = mask; let rem = d; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((d << 10) | rem) ^ 0x5412, g = i => ((b >>> i) & 1) !== 0;                       // ECC level M => format data bits 00
      for (let i = 0; i <= 5; i++) setF(8, i, g(i)); setF(8, 7, g(6)); setF(8, 8, g(7)); setF(7, 8, g(8));
      for (let i = 9; i < 15; i++) setF(14 - i, 8, g(i));
      for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, g(i));
      for (let i = 8; i < 15; i++) setF(8, size - 15 + i, g(i));
      setF(8, size - 8, true);
    };
    formatBits(0);
    if (ver >= 7) {
      let rem = ver; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const b = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) { const c = ((b >>> i) & 1) !== 0, a = size - 11 + i % 3, d = Math.floor(i / 3); setF(a, d, c); setF(d, a, c); }
    }
    // place codewords
    let bi = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!F[y][x] && bi < all.length * 8) { M[y][x] = ((all[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0; bi++; }
      }
    }
    const applyMask = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let inv; switch (m) {
        case 0: inv = (x + y) % 2 === 0; break; case 1: inv = y % 2 === 0; break; case 2: inv = x % 3 === 0; break; case 3: inv = (x + y) % 3 === 0; break;
        case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break; case 5: inv = x * y % 2 + x * y % 3 === 0; break;
        case 6: inv = (x * y % 2 + x * y % 3) % 2 === 0; break; default: inv = ((x + y) % 2 + x * y % 3) % 2 === 0;
      }
      if (!F[y][x] && inv) M[y][x] = !M[y][x];
    } };
    const penalty = () => {
      let pen = 0, dark = 0;
      const line = get => { let run = 1; for (let i = 1; i < size; i++) { if (get(i) === get(i - 1)) { run++; if (run === 5) pen += 3; else if (run > 5) pen++; } else run = 1; } };
      for (let y = 0; y < size; y++) { line(i => M[y][i]); line(i => M[i][y]); }
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (M[y][x]) dark++;
        if (x + 1 < size && y + 1 < size && M[y][x] === M[y][x + 1] && M[y][x] === M[y + 1][x] && M[y][x] === M[y + 1][x + 1]) pen += 3;
      }
      const pat = [1, 0, 1, 1, 1, 0, 1]; const scan = get => { for (let i = 0; i + 7 <= size; i++) { let ok = true; for (let k = 0; k < 7; k++) if ((get(i + k) ? 1 : 0) !== pat[k]) { ok = false; break; } if (!ok) continue;
        const lightL = i >= 4 && [1, 2, 3, 4].every(k => !get(i - k)), lightR = i + 11 <= size && [7, 8, 9, 10].every(k => !get(i + k)); if (lightL || lightR) pen += 40; } };
      for (let y = 0; y < size; y++) { scan(i => M[y][i]); scan(i => M[i][y]); }
      const total = size * size; pen += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
      return pen;
    };
    let best = 0, bestPen = Infinity;
    for (let m = 0; m < 8; m++) { applyMask(m); formatBits(m); const p = penalty(); if (p < bestPen) { bestPen = p; best = m; } applyMask(m); }
    applyMask(best); formatBits(best);
    return { size, version: ver, modules: M };
  }

  /* QR symbol on an integer module grid (same sizing rules as linearSvg). */
  function qrSvgU(text, o) {
    const q = qrMatrix(text); if (!q) return null;
    const unit = o.unit || 'px', mod = o.mod, quiet = 4, n = q.size + quiet * 2;
    const showText = o.text !== false && o.value;
    const textHU = showText ? r4((o.textH || 14) / mod) : 0, totH = r4(n + textHU);
    let d = '';
    for (let y = 0; y < q.size; y++) { let x = 0; while (x < q.size) { if (!q.modules[y][x]) { x++; continue; } let e = x; while (e < q.size && q.modules[y][e]) e++; d += `M${x + quiet},${y + quiet}h${e - x}v1h-${e - x}z`; x = e; } }
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${r4(n * mod)}${unit}" height="${r4(totH * mod)}${unit}" viewBox="0 0 ${n} ${totH}" shape-rendering="crispEdges" preserveAspectRatio="none" data-mods="${n}">`;
    svg += `<rect width="${n}" height="${totH}" fill="#fff"/><path d="${d}" fill="#000"/>`;
    if (showText) svg += textLine(String(o.value).slice(0, 40), n / 2, n + textHU * 0.75, textHU * 0.8, n * 0.98);
    return svg + '</svg>';
  }
  function qrSvg(text, opts) {               // legacy helper (screen preview)
    opts = opts || {};
    return qrSvgU(text, { unit: 'px', mod: Math.max(2, Math.round(opts.module || 4)), text: opts.text, value: opts.value, textH: 16 });
  }

  const hasNonAscii = v => /[^\x20-\x7E]/.test(String(v || ''));
  const isEan13Input = v => ean13Normalize(v) !== null;
  // Same key the POS uses to match scans: 12/13-digit codes compare as 13 digits; text codes compare case-insensitively
  // (a scanner with Caps Lock on, or a keyboard-layout quirk, can change the letter case but never the characters).
  const normKey = v => { v = String(v == null ? '' : v).trim(); return /^\d{12,13}$/.test(v) ? v.padStart(13, '0') : v.toUpperCase(); };

  /* Decide which symbology can carry this value exactly. */
  function resolveFormat(value, format) {
    let f = (format || 'code128').toLowerCase(), note = '';
    if (f === 'qrcode') f = 'qr';
    if (f === 'ean13' && !isEan13Input(value)) {
      f = hasNonAscii(value) ? 'qr' : 'code128';
      note = /^\d{12,13}$/.test(value)
        ? 'Not a valid EAN-13 (check digit wrong) — Code 128 used so the scanner reads exactly this number'
        : 'EAN-13 needs a valid 13-digit number — Code 128 used';
    }
    if (f === 'code128' && hasNonAscii(value)) { f = 'qr'; note = 'Code 128 cannot hold this text — QR used'; }
    if (f === 'qr' && !qrMatrix(value)) {
      if (hasNonAscii(value)) { note = 'Text too long for QR here'; } else { f = 'code128'; note = 'Text too long for QR — Code 128 used'; }
    }
    return { f, note };
  }

  /* Scan-safe symbol sized in millimetres.
     o.maxW / o.maxH  space available (mm) for the whole symbol incl. quiet zone (+ text line)
     o.barH           preferred bar height (mm, 1-D only)
     o.dpi            printer resolution (203 thermal default, 300, 600 …). One module = a whole number of dots.
     Returns { svg, fmt, note, moduleMm, widthMm, heightMm, ok } */
  function render(value, format, o) {
    o = o || {};
    value = String(value == null ? '' : value).trim(); if (!value) value = '0';
    const rf = resolveFormat(value, format), f = rf.f;
    let dpi = Math.max(72, +o.dpi || 203); if (dpi === 203) dpi = 203.2;   // "203 dpi" heads are 8 dots/mm
    const dot = 25.4 / dpi;
    const maxW = o.maxW || 50, maxH = o.maxH || 30, showText = o.text !== false;
    const textH = showText ? (o.textH || 3.2) : 0;
    const MIN_MOD = o.minMod || 0.19, MAX_MOD = o.maxMod || 0.5;
    let bits = null, modsW, modsH, text = value, qr = false;
    if (f === 'qr') { qr = true; const m = qrMatrix(value); modsW = m.size + 8; modsH = m.size + 8; }
    else if (f === 'ean13') { const c = ean13Normalize(value); bits = ean13Bits(c); text = c; modsW = bits.length + 22; }
    else { bits = code128(value); modsW = bits.length + 22; }
    // largest whole-dot module that fits the space
    let nFit = Math.floor(maxW / (modsW * dot) + 1e-9);
    if (qr) nFit = Math.min(nFit, Math.floor((maxH - textH) / (modsH * dot) + 1e-9));
    const nMax = Math.max(1, Math.floor(MAX_MOD / dot + 1e-9)), nMin = Math.max(1, Math.ceil(MIN_MOD / dot - 1e-9));
    let n = Math.min(nFit, nMax), note = rf.note, ok = true;
    let mod;
    if (n >= nMin) mod = n * dot;
    else {
      ok = false;
      mod = n >= 1 ? n * dot : Math.max(0.05, maxW / modsW);
      note = (note ? note + ' · ' : '') + (qr ? 'Label is too small for this QR — modules are tiny and may not scan. Use a bigger label or a shorter text.' : 'Label is too small for this code — bars are thin and may not scan. Use a bigger label, a shorter code, or QR.');
    }
    let svg, sym;
    if (qr) {
      svg = qrSvgU(value, { unit: 'mm', mod, text: showText, value, textH });
      sym = { kind: 'qr', modsW, size: qrMatrix(value).size, matrix: qrMatrix(value).modules, textHmm: textH, text: showText ? value : '' };
    } else {
      const barH = Math.max(5, Math.min(o.barH || 15, (maxH - textH)));
      svg = linearSvg(bits, { unit: 'mm', mod, barH, textH, text: showText, value: text, quiet: 11 });
      sym = { kind: '1d', bits, quiet: 11, modsW, barHmm: barH, textHmm: textH, text: showText ? text : '' };
    }
    sym.modMm = mod;
    const wm = /width="([\d.]+)mm"/.exec(svg), hm = /height="([\d.]+)mm"/.exec(svg);
    return { svg, sym, fmt: f, note, moduleMm: mod, widthMm: wm ? +wm[1] : 0, heightMm: hm ? +hm[1] : 0, ok };
  }

  /* Print page for stickers. mode 'roll' = one label per page at the exact label size (thermal/sticker printers);
     mode 'sheet' = many labels per A4 page (laser/inkjet label sheets). */
  function printDoc(labelsHtml, w, h, mode) {
    const roll = mode !== 'sheet';
    const css = roll
      ? `@page{size:${w}mm ${h}mm;margin:0}html,body{margin:0;padding:0;width:${w}mm;background:#fff}
         .bl-label{page-break-after:always;break-after:page}.bl-label:last-child{page-break-after:auto;break-after:auto}`
      : `@page{size:A4;margin:8mm}html,body{margin:0;padding:0;background:#fff}
         .sheet{display:flex;flex-wrap:wrap;align-content:flex-start;gap:1mm}.bl-label{break-inside:avoid;page-break-inside:avoid}`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Barcode Labels</title><style>
      *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{font-family:system-ui,-apple-system,"Noto Sans Bengali",sans-serif;color:#000}
      ${css}
      .bl-label{flex:none;width:${w}mm;height:${h}mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden;padding:1mm;background:#fff;color:#000}
      .bl-shop{font-size:7pt;font-weight:600;line-height:3mm;height:3mm;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
      .bl-name{font-size:7.5pt;font-weight:700;line-height:3.2mm;max-width:100%;overflow:hidden}
      .bl-svg{flex:none;display:block;line-height:0}
      .bl-svg svg{display:block;max-width:none}
      .bl-price{font-size:9pt;font-weight:800;line-height:3.8mm;height:3.8mm;white-space:nowrap}
      </style></head><body><div class="sheet">${labelsHtml}</div></body></html>`;
  }

  /* Legacy entry point (screen preview, fixed integer-pixel modules). */
  function generate(value, format, opts) {
    opts = opts || {};
    value = String(value || '').trim(); if (!value) value = '0';
    const rf = resolveFormat(value, format), f = rf.f;
    if (f === 'qr') return qrSvg(value, Object.assign({ module: 4, value }, opts));
    if (f === 'ean13') { const c = ean13Normalize(value); return bitsToSvg(ean13Bits(c), Object.assign({ value: c, height: 60, barWidth: 2, quiet: 11 }, opts)); }
    return bitsToSvg(code128(value), Object.assign({ value, height: 60, barWidth: 2, quiet: 11 }, opts));
  }

  function uniqueCode(prefix, nextNum) {
    prefix = (prefix || 'ESY').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6) || 'ESY';
    const n = Math.max(1, parseInt(nextNum, 10) || 1000001);
    return prefix + String(n).padStart(7, '0');
  }

  root.BarcodeGen = {
    generate, render, printDoc, resolveFormat,
    qrMatrix, hasNonAscii, isEan13Input, ean13Normalize, normKey, ean13Check, uniqueCode,
    code128, code128B: code128, code128Codes,
    formats: ['code128', 'ean13', 'qr']
  };
})(typeof window !== 'undefined' ? window : globalThis);
