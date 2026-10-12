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
    const h = opts.height || 60;
    const barW = opts.barWidth || 1.5;
    const showText = opts.text !== false;
    const label = opts.label || '';
    const quiet = 10;
    let x = quiet;
    let paths = '';
    for (let i = 0; i < bits.length; i++) {
      if (bits[i] === '1') paths += `M${x},0h${barW}v${h}h-${barW}z`;
      x += barW;
    }
    const w = x + quiet;
    const textH = showText ? 16 : 0;
    const totalH = h + textH + (label ? 18 : 0);
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${totalH}" viewBox="0 0 ${w} ${totalH}">`;
    if (label) svg += `<text x="${w / 2}" y="14" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="600">${escXml(label)}</text>`;
    const yOff = label ? 18 : 0;
    svg += `<g transform="translate(0,${yOff})"><path d="${paths}" fill="#000"/></g>`;
    if (showText && opts.value) {
      svg += `<text x="${w / 2}" y="${yOff + h + 13}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="11">${escXml(opts.value)}</text>`;
    }
    svg += '</svg>';
    return svg;
  }

  function escXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Minimal QR-like matrix for short data (not a real QR, visual placeholder + text)
  // For real QR we keep it simple: show Code128 primarily; QR option uses a data-matrix style blocks for short codes
  function simpleMatrixSvg(text, size) {
    size = size || 120;
    // Hash-based pseudo pattern so same text = same look
    let h = 0;
    for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
    const n = 21;
    const cell = size / (n + 2);
    let rects = '';
    // finder patterns
    function finder(ox, oy) {
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const on = (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
        if (on) rects += `<rect x="${(ox + x + 1) * cell}" y="${(oy + y + 1) * cell}" width="${cell}" height="${cell}" fill="#000"/>`;
      }
    }
    finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if ((x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9)) continue;
      const bit = ((h ^ (x * 31 + y * 17 + text.length)) >>> (x % 8)) & 1;
      if (bit) rects += `<rect x="${(x + 1) * cell}" y="${(y + 1) * cell}" width="${cell}" height="${cell}" fill="#000"/>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 18}" viewBox="0 0 ${size} ${size + 18}">${rects}<text x="${size / 2}" y="${size + 14}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="10">${escXml(text.slice(0, 24))}</text></svg>`;
  }

  function generate(value, format, opts) {
    opts = opts || {};
    format = (format || 'code128').toLowerCase();
    value = String(value || '').trim();
    if (!value) value = '0';
    if (format === 'ean13') {
      const { bits, text } = ean13Bits(value);
      return bitsToSvg(bits, Object.assign({ value: text, height: 50, barWidth: 1.8 }, opts));
    }
    if (format === 'qr' || format === 'qrcode') {
      return simpleMatrixSvg(value, opts.size || 140);
    }
    // default code128
    const bits = code128B(value);
    return bitsToSvg(bits, Object.assign({ value, height: 55, barWidth: 1.4 }, opts));
  }

  function uniqueCode(prefix, nextNum) {
    prefix = (prefix || 'ESY').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6) || 'ESY';
    const n = Math.max(1, parseInt(nextNum, 10) || 1000001);
    return prefix + String(n).padStart(7, '0');
  }

  root.BarcodeGen = {
    generate,
    ean13Check,
    uniqueCode,
    code128B,
    formats: ['code128', 'ean13', 'qr']
  };
})(typeof window !== 'undefined' ? window : globalThis);
