// أدوات مشتركة: مراجع الخلايا، تحويل الإدخال، عرض القيم، إزاحة مراجع الصيغ
export const key = (r, c) => r + ',' + c;
export const unkey = (k) => { const i = k.indexOf(','); return [+k.slice(0, i), +k.slice(i + 1)]; };

export function colName(c) {
  let s = ''; c++;
  while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
  return s;
}
export const a1 = (r, c) => colName(c) + (r + 1);
export function colIndex(letters) {
  let c = 0; for (const ch of letters.toUpperCase()) c = c * 26 + ch.charCodeAt(0) - 64; return c - 1;
}
export function parseA1(s) {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(String(s).trim());
  if (!m) return null; return { r: +m[2] - 1, c: colIndex(m[1]) };
}
export function parseRange(s) {
  const parts = String(s).trim().split(':');
  const a = parseA1(parts[0]); if (!a) return null;
  const b = parts[1] ? parseA1(parts[1]) : a; if (!b) return null;
  return { r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) };
}

const AR_DIGITS = /[٠-٩۰-۹]/g;
export const normDigits = (s) => s.replace(AR_DIGITS, (d) => String((d.charCodeAt(0) & 0xF) % 10));

// تحويل نص أدخله المستخدم إلى قيمة خلية
export function parseInput(text) {
  if (text == null) return null;
  const t = String(text);
  if (t === '') return null;
  if (t[0] === '=' && t.length > 1) return { f: t.slice(1) };
  const n = normDigits(t.trim()).replace(/٫/g, '.').replace(/٬/g, ',');
  if (/^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(n)) return { v: Number(n) };
  if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(n)) return { v: Number(n.replace(/,/g, '')) };
  const up = t.trim().toUpperCase();
  if (up === 'TRUE') return { v: true };
  if (up === 'FALSE') return { v: false };
  return { v: t };
}

function pad(n) { return n < 10 ? '0' + n : '' + n; }
export function fmtDate(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  const base = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  const hasTime = d.getUTCHours() || d.getUTCMinutes() || d.getUTCSeconds();
  return hasTime ? base + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) : base;
}

// النص الخام الذي يظهر في شريط الصيغ
export function rawText(cell) {
  if (!cell) return '';
  if (cell.f != null) return '=' + cell.f;
  const v = cell.v;
  if (v == null) return '';
  if (v instanceof Date) return fmtDate(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

// النص المعروض داخل الخلية (تنسيق أساسي فقط في المرحلة 1)
export function displayText(cell) {
  if (!cell) return '';
  let v = cell.v;
  if (cell.f != null && v === undefined) return '=' + cell.f; // صيغة جديدة لم تُحسب بعد
  if (v == null) return '';
  if (v instanceof Date) return fmtDate(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') {
    const nf = cell.s && cell.s.nf;
    if (nf) {
      const dec = (/0\.(0+)/.exec(nf) || [, ''])[1].length;
      if (nf.includes('%')) return (v * 100).toFixed(dec) + '%';
      if (/[#0],[#0]/.test(nf)) return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      if (/0\.0/.test(nf)) return v.toFixed(dec);
    }
    if (Number.isInteger(v)) return String(v);
    return String(Number(v.toPrecision(11)));
  }
  return String(v);
}

export const isNumCell = (cell) => cell && (typeof cell.v === 'number' || cell.v instanceof Date) ;

// إزاحة المراجع النسبية في الصيغة عند النسخ (مثل Excel)
export function shiftFormula(f, dr, dc) {
  if (!dr && !dc) return f;
  return f.replace(/("(?:[^"]|"")*")|((?:'[^']+'|[A-Za-z_؀-ۿ][\w.؀-ۿ]*)!)?(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?![\w(])/g,
    (m, str, sheet, d1, col, d2, row, off, whole) => {
      if (str) return str;
      const prev = whole[off - 1];
      if (prev && /[\w.]/.test(prev)) return m;
      let c = colIndex(col), r = +row - 1;
      if (!d1) c += dc;
      if (!d2) r += dr;
      if (c < 0 || r < 0) return (sheet || '') + '#REF!';
      return (sheet || '') + d1 + colName(c) + d2 + (r + 1);
    });
}

// نص مفصول بعلامات Tab (للحافظة)
export function toTSV(grid) {
  return grid.map((row) => row.map((cell) => {
    const s = rawText(cell);
    return /[\t\n"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join('\t')).join('\n');
}

// محلل CSV/TSV يدعم علامات الاقتباس والأسطر داخل الخلايا
export function parseDelimited(text, sep) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  if (!sep) {
    const first = text.split(/\r?\n/, 1)[0] || '';
    const counts = [',', ';', '\t'].map((s) => [s, first.split(s).length]);
    counts.sort((a, b) => b[1] - a[1]);
    sep = counts[0][1] > 1 ? counts[0][0] : ',';
  }
  const rows = []; let row = [], field = '', q = false, i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"' && field === '') q = true;
    else if (ch === sep) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
    i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function toCSV(rows) {
  return '﻿' + rows.map((r) => r.map((s) => /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s).join(',')).join('\r\n');
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
