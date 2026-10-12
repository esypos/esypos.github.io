/* EsyPOS Barcode Generator — pure JS Code128B + simple EAN-13 check + QR-like fallback SVG
   No external deps. Generates SVG barcodes for labels and product forms. */
(function (root) {
  'use strict';

  // Code128B character set (ASCII 32-127) patterns: startB=104, stop=106
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
  const START_B = 104, STOP = 106;

  function code128B(text) {
    text = String(text || '');
    if (!text) return '';
    // Keep printable ASCII
    let s = '';
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      s += (c >= 32 && c <= 126) ? text[i] : '?';
    }
    if (!s) s = '0';
    let sum = START_B;
    const codes = [START_B];
    for (let i = 0; i < s.length; i++) {
      const v = s.charCodeAt(i) - 32;
      codes.push(v);
      sum += v * (i + 1);
    }
    codes.push(sum % 103);
    codes.push(STOP);
    let bits = '';
    codes.forEach(c => { bits += C128[c] || C128[0]; });
    bits += '11'; // termination bar
    return bits;
  }

  function ean13Check(d12) {
    d12 = String(d12).replace(/\D/g, '').slice(0, 12).padStart(12, '0');
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(d12[i], 10) * (i % 2 === 0 ? 1 : 3);
    return d12 + String((10 - (sum % 10)) % 10);
  }

  // Simple EAN-13 left/right patterns (L & R) — enough for visual labels
  const EAN_L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
  const EAN_G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
  const EAN_R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
  const EAN_PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

  function ean13Bits(code) {
    code = ean13Check(code);
    const first = parseInt(code[0], 10);
    const parity = EAN_PARITY[first];
    let bits = '101';
    for (let i = 1; i <= 6; i++) {
      const d = parseInt(code[i], 10);
      bits += (parity[i - 1] === 'L' ? EAN_L : EAN_G)[d];
    }
    bits += '01010';
    for (let i = 7; i <= 12; i++) bits += EAN_R[parseInt(code[i], 10)];
    bits += '101';
    return { bits, text: code };
  }

  function bitsToSvg(bits, opts) {
    opts = opts || {};
    const h = Math.max(20, opts.height || 60);
    // Module (bar) width: prefer explicit barWidth; if targetWidth given, fit barcode into it
    let barW = opts.barWidth || 2;
    const quietMods = Math.max(10, opts.quiet || 10); // Code128 needs ≥10 modules quiet zone
    const modules = bits.length + quietMods * 2;
    if (opts.targetWidth && modules > 0) {
      barW = Math.max(1.2, opts.targetWidth / modules); // never thinner than 1.2 CSS px per module
    }
    barW = Math.max(1.2, barW);
    const showText = opts.text !== false;
    const label = opts.label || '';
    const quiet = quietMods * barW;
    // Build crisp rects (no anti-aliased path strokes) — critical for scanner readability
    let x = quiet;
    let rects = '';
    let i = 0;
    while (i < bits.length) {
      if (bits[i] === '1') {
        let j = i;
        while (j < bits.length && bits[j] === '1') j++;
        const bw = (j - i) * barW;
        // snap to 0.1 to reduce sub-pixel blur when scaled in print
        const rx = Math.round(x * 10) / 10;
        const rw = Math.round(bw * 10) / 10;
        rects += `<rect x="${rx}" y="0" width="${rw}" height="${h}" fill="#000"/>`;
        x += bw;
        i = j;
      } else {
        x += barW;
        i++;
      }
    }
    const w = Math.ceil(x + quiet);
    const textH = showText ? 18 : 0;
    const topH = label ? 18 : 0;
    const totalH = h + textH + topH;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${totalH}" viewBox="0 0 ${w} ${totalH}" shape-rendering="crispEdges">`;
    svg += `<rect width="${w}" height="${totalH}" fill="#fff"/>`; // solid white — scanners need contrast
    if (label) svg += `<text x="${w / 2}" y="14" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="600" fill="#000">${escXml(label)}</text>`;
    const yOff = topH;
    svg += `<g transform="translate(0,${yOff})">${rects}</g>`;
    if (showText && opts.value) {
      svg += `<text x="${w / 2}" y="${yOff + h + 14}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="12" font-weight="600" fill="#000">${escXml(opts.value)}</text>`;
    }
    svg += '</svg>';
    return svg;
  }

  function escXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  function qrSvg(text, opts) {
    opts = opts || {};
    const q = qrMatrix(text); if (!q) return null;
    const mod = opts.module || 4, quiet = 4, n = q.size + quiet * 2, px = n * mod;
    const label = opts.label || '', showText = opts.text !== false && opts.value;
    let d = '';
    for (let y = 0; y < q.size; y++) { let x = 0; while (x < q.size) { if (!q.modules[y][x]) { x++; continue; } let e = x; while (e < q.size && q.modules[y][e]) e++; d += `M${(x + quiet) * mod},${(y + quiet) * mod}h${(e - x) * mod}v${mod}h-${(e - x) * mod}z`; x = e; } }
    const top = label ? 18 : 0, bottom = showText ? 16 : 0, H = px + top + bottom;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${H}" viewBox="0 0 ${px} ${H}"><rect width="${px}" height="${H}" fill="#fff"/>`;
    if (label) svg += `<text x="${px / 2}" y="14" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="600">${escXml(label)}</text>`;
    svg += `<path transform="translate(0,${top})" d="${d}" fill="#000"/>`;
    if (showText) svg += `<text x="${px / 2}" y="${top + px - 2}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="10">${escXml(String(opts.value).slice(0, 28))}</text>`;
    return svg + '</svg>';
  }

  function generate(value, format, opts) {
    opts = opts || {};
    format = (format || 'code128').toLowerCase();
    value = String(value || '').trim();
    if (!value) value = '0';
    // Defaults tuned for thermal/inkjet sticker printers (≥0.25 mm module when scaled)
    if (format === 'ean13') {
      const { bits, text } = ean13Bits(value);
      return bitsToSvg(bits, Object.assign({ value: text, height: 60, barWidth: 2.2, quiet: 11 }, opts));
    }
    if (format === 'qr' || format === 'qrcode') {
      return qrSvg(value, Object.assign({ module: 5, value }, opts)) || bitsToSvg(code128B(value.slice(0, 40)), Object.assign({ value: value.slice(0, 40), height: 60, barWidth: 2 }, opts));
    }
    // default code128
    const bits = code128B(value);
    return bitsToSvg(bits, Object.assign({ value, height: 60, barWidth: 2, quiet: 11 }, opts));
  }

  function uniqueCode(prefix, nextNum) {
    prefix = (prefix || 'ESY').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6) || 'ESY';
    const n = Math.max(1, parseInt(nextNum, 10) || 1000001);
    return prefix + String(n).padStart(7, '0');
  }

  const hasNonAscii = v => /[^\x20-\x7E]/.test(String(v || ''));
  const isEan13Input = v => /^\d{12,13}$/.test(String(v || '').trim());
  // Same key the POS uses to match scans: 12/13-digit codes are compared as 13 digits
  const normKey = v => { v = String(v == null ? '' : v).trim(); return /^\d{12,13}$/.test(v) ? v.padStart(13, '0') : v; };

  root.BarcodeGen = {
    generate,
    qrMatrix,
    hasNonAscii,
    isEan13Input,
    normKey,
    ean13Check,
    uniqueCode,
    code128B,
    formats: ['code128', 'ean13', 'qr']
  };
})(typeof window !== 'undefined' ? window : globalThis);
