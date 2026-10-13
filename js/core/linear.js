/* EsyPOS Linear — tiny offline 1-D barcode reader (EAN-13 / UPC-A and Code 128) for browsers WITHOUT the BarcodeDetector API
   (iPhone Safari, Firefox, desktop). Pure JS, no downloads. It reads many horizontal scan-lines of the camera picture, in both
   directions, and only accepts a result that passes the symbology's own check digit — so a wrong read is practically impossible.
   QR codes are NOT read here (use Chrome on Android, or type the code). v10.8.0 */
(function (root) {
  'use strict';
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
  const runsOfBits = b => { const r = []; let i = 0; while (i < b.length) { let j = i; while (j < b.length && b[j] === b[i]) j++; r.push(j - i); i = j; } return r; };
  const P128 = C128.map(runsOfBits);                       // 107 patterns × 6 runs (bar,space,bar,space,bar,space)
  const EAN_L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
  const EAN_G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
  const EAN_R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
  const PL = EAN_L.map(runsOfBits), PG = EAN_G.map(runsOfBits), PR = EAN_R.map(runsOfBits);
  const PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

  /* turn one row of brightness values into run lengths (adaptive threshold copes with shadows and glare) */
  function rowRuns(lum) {
    const n = lum.length, win = Math.max(15, (n / 8) | 0), pre = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + lum[i];
    const runs = []; let cur = null, len = 0, first = null;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - win), b = Math.min(n, i + win + 1), avg = (pre[b] - pre[a]) / (b - a);
      const bar = lum[i] < avg * 0.9 - 2;                   // true = dark bar
      if (cur === null) { cur = bar; first = bar; len = 1; }
      else if (bar === cur) len++;
      else { runs.push(len); cur = bar; len = 1; }
    }
    runs.push(len);
    return { runs, firstIsBar: first === true };
  }

  function bestMatch(w, pats, total, maxErr) {             // w = run widths of one symbol; returns index of the closest pattern or -1
    let s = 0; for (let i = 0; i < w.length; i++) s += w[i];
    if (s <= 0) return -1;
    const u = s / total; let best = -1, be = 1e9, se = 1e9;
    for (let k = 0; k < pats.length; k++) {
      const p = pats[k]; let e = 0;
      for (let i = 0; i < w.length; i++) { e += Math.abs(w[i] / u - p[i]); if (e > be && e > se) break; }
      if (e < be) { se = be; be = e; best = k; } else if (e < se) se = e;
    }
    return (be <= maxErr && be < se * 0.85) ? best : -1;
  }

  function decode128(r, start) {                             // r = runs, start = index of a BAR run
    if (start + 6 > r.length) return null;
    const sv = bestMatch(r.slice(start, start + 6), P128.slice(103, 106), 11, 1.7);
    if (sv < 0) return null;
    const vals = [103 + sv]; let pos = start + 6;
    for (let guard = 0; guard < 90; guard++) {
      if (pos + 6 > r.length) return null;
      const v = bestMatch(r.slice(pos, pos + 6), P128, 11, 1.7);
      if (v < 0) return null;
      vals.push(v); pos += 6;
      if (v === 106) break;
    }
    const n = vals.length;
    if (vals[n - 1] !== 106 || n < 4) return null;
    let sum = vals[0];
    for (let i = 1; i <= n - 3; i++) sum += vals[i] * i;     // data symbols only; vals[n-2] is the check character
    if (sum % 103 !== vals[n - 2]) return null;
    let mode = vals[0] === 105 ? 'C' : vals[0] === 104 ? 'B' : 'A', text = '';
    for (let i = 1; i <= n - 3; i++) {
      const v = vals[i];
      if (v === 99) mode = 'C'; else if (v === 100) mode = 'B'; else if (v === 101) mode = 'A';
      else if (v < 100) {
        if (mode === 'C') text += String(v).padStart(2, '0');
        else if (mode === 'B') { if (v < 96) text += String.fromCharCode(v + 32); }
        else if (v < 64) text += String.fromCharCode(v + 32);
      }
    }
    return text || null;
  }

  function decodeEAN13(r, start) {                           // start = index of a BAR run (first run of the 101 guard)
    if (start + 59 > r.length) return null;
    const g = r[start] + r[start + 1] + r[start + 2], u = g / 3;
    for (let i = 0; i < 3; i++) if (r[start + i] < u * 0.5 || r[start + i] > u * 1.7) return null;
    let p = start + 3, digits = [], par = '';
    for (let d = 0; d < 6; d++) {
      const w = r.slice(p, p + 4), s = w[0] + w[1] + w[2] + w[3];
      const a = bestMatch(w, PL.concat(PG), 7, 1.5); if (a < 0) return null;
      digits.push(a % 10); par += a < 10 ? 'L' : 'G'; p += 4;
      if (Math.abs(s / 7 - u) > u * 0.6) return null;
    }
    for (let i = 0; i < 5; i++) if (r[p + i] < u * 0.5 || r[p + i] > u * 1.7) return null;
    p += 5;
    for (let d = 0; d < 6; d++) {
      const a = bestMatch(r.slice(p, p + 4), PR, 7, 1.5); if (a < 0) return null;
      digits.push(a); p += 4;
    }
    const first = PARITY.indexOf(par); if (first < 0) return null;
    const all = [first].concat(digits); let sum = 0;
    for (let i = 0; i < 12; i++) sum += all[i] * (i % 2 === 0 ? 1 : 3);
    if ((10 - (sum % 10)) % 10 !== all[12]) return null;
    return all.join('');
  }

  function scanRow(lum) {
    const { runs, firstIsBar } = rowRuns(lum);
    for (let pass = 0; pass < 2; pass++) {
      const r = pass ? runs.slice().reverse() : runs;
      const bar0 = pass ? ((runs.length % 2 === 1) ? firstIsBar : !firstIsBar) : firstIsBar;   // colour of r[0]
      for (let i = bar0 ? 0 : 1; i + 6 <= r.length; i += 2) {
        let t = decode128(r, i); if (t) return { rawValue: t, format: 'code_128' };
        t = decodeEAN13(r, i); if (t) return { rawValue: t, format: 'ean_13' };
      }
    }
    return null;
  }

  /* data = RGBA ImageData-like { data, width, height }. Tries many rows, centre first. */
  function decodeImage(img, rows) {
    const w = img.width, h = img.height, d = img.data, lum = new Float32Array(w);
    rows = rows || 15;
    const order = [0]; for (let i = 1; i <= rows; i++) { order.push(i, -i); }
    for (const o of order) {
      const y = Math.min(h - 1, Math.max(0, Math.round(h / 2 + o * (h / (rows * 2.4)))));
      for (let x = 0; x < w; x++) { const j = (y * w + x) * 4; lum[x] = d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114; }
      const r = scanRow(lum); if (r) return r;
    }
    return null;
  }

  /* BarcodeDetector-compatible wrapper around a <video> */
  function createDetector() {
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
    return {
      fallback: true,
      async detect(video) {
        const vw = video.videoWidth, vh = video.videoHeight; if (!vw || !vh) return [];
        const W = Math.min(vw, 1280), s = W / vw, bandH = Math.round(Math.min(vh, vh * 0.5) * s), sy = (vh - bandH / s) / 2;
        cv.width = W; cv.height = bandH;
        ctx.drawImage(video, 0, sy, vw, bandH / s, 0, 0, W, bandH);
        const r = decodeImage(ctx.getImageData(0, 0, W, bandH), 18);
        return r ? [r] : [];
      }
    };
  }

  root.Linear = { decodeImage, scanRow, createDetector };
})(typeof window !== 'undefined' ? window : globalThis);
