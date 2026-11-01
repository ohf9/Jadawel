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

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const isDateFmt = (nf) => !!nf && /[ymdhs]/i.test(nf.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')) && !/^[#0?,.%\s]*$/.test(nf);
function formatDate(d, nf) {
  const Y = d.getUTCFullYear(), M = d.getUTCMonth(), D = d.getUTCDate(), h = d.getUTCHours(), mi = d.getUTCMinutes(), se = d.getUTCSeconds();
  const ampm = /AM\/PM|A\/P/i.test(nf);
  let out = '', i = 0, lastH = false;
  const src = nf.replace(/\[[^\]]*\]/g, '');
  while (i < src.length) {
    const rest = src.slice(i);
    let m;
    if (src[i] === '"') { const j = src.indexOf('"', i + 1); out += src.slice(i + 1, j < 0 ? src.length : j); i = j < 0 ? src.length : j + 1; continue; }
    if (src[i] === '\\') { out += src[i + 1] || ''; i += 2; continue; }
    if ((m = /^(AM\/PM|A\/P)/i.exec(rest))) { out += h < 12 ? 'AM' : 'PM'; i += m[0].length; continue; }
    if ((m = /^y{3,4}/i.exec(rest))) { out += Y; i += m[0].length; lastH = false; continue; }
    if ((m = /^yy?/i.exec(rest))) { out += pad(Y % 100); i += m[0].length; lastH = false; continue; }
    if ((m = /^m{5}/i.exec(rest))) { out += MONTHS_EN[M][0]; i += 5; continue; }
    if ((m = /^mmmm/i.exec(rest))) { out += MONTHS_EN[M]; i += 4; continue; }
    if ((m = /^mmm/i.exec(rest))) { out += MONTHS_EN[M].slice(0, 3); i += 3; continue; }
    if ((m = /^mm?/i.exec(rest))) {
      const next = /^[^dhsy]*?([dhsy])/i.exec(src.slice(i + m[0].length));
      const minute = lastH || (next && /s/i.test(next[1]) && !/[dy]/i.test(src.slice(i + m[0].length, i + m[0].length + (next.index || 0) + 1)));
      out += minute ? (m[0].length === 2 ? pad(mi) : mi) : (m[0].length === 2 ? pad(M + 1) : M + 1); i += m[0].length; lastH = false; continue;
    }
    if ((m = /^dddd/i.exec(rest))) { out += DAYS_EN[new Date(Date.UTC(Y, M, D)).getUTCDay()]; i += 4; continue; }
    if ((m = /^ddd/i.exec(rest))) { out += DAYS_EN[new Date(Date.UTC(Y, M, D)).getUTCDay()].slice(0, 3); i += 3; continue; }
    if ((m = /^dd?/i.exec(rest))) { out += m[0].length === 2 ? pad(D) : D; i += m[0].length; continue; }
    if ((m = /^hh?/i.exec(rest))) { const hh = ampm ? (h % 12 || 12) : h; out += m[0].length === 2 ? pad(hh) : hh; i += m[0].length; lastH = true; continue; }
    if ((m = /^ss?/i.exec(rest))) { out += m[0].length === 2 ? pad(se) : se; i += m[0].length; lastH = false; continue; }
    out += src[i]; i++;
  }
  return out;
}

// تحويل رقم تسلسلي من Excel إلى تاريخ UTC
export const serialToDate = (n) => new Date(Math.round((n - 25569) * 86400000));

function splitSections(nf) {
  const out = []; let cur = '', q = false;
  for (const ch of nf) { if (ch === '"') q = !q; if (ch === ';' && !q) { out.push(cur); cur = ''; } else cur += ch; }
  out.push(cur); return out;
}
export function formatNumber(v, nf) {
  const secs = splitSections(nf);
  let sec = secs[0], neg = v < 0, val = v;
  if (secs.length > 1 && neg) { sec = secs[1]; val = -v; }
  else if (secs.length > 2 && v === 0) sec = secs[2];
  sec = sec.replace(/\[(?:Red|Black|Blue|Green|Color\d+|White|Cyan|Magenta|Yellow)\]/gi, '').replace(/\[\$([^\]\-]*)(?:-[^\]]*)?\]/g, '"$1"').replace(/\[[^\]]*\]/g, '');
  const pct = (sec.replace(/"[^"]*"/g, '').match(/%/g) || []).length;
  if (pct) val = val * Math.pow(100, pct);
  // أجزاء النمط: نص قبل الرقم، نمط الرقم، نص بعده
  let pre = '', post = '', pat = '', seen = false, i = 0;
  while (i < sec.length) {
    const ch = sec[i];
    if (ch === '"') { const j = sec.indexOf('"', i + 1); const t = sec.slice(i + 1, j < 0 ? sec.length : j); (seen ? (post += t) : (pre += t)); i = j < 0 ? sec.length : j + 1; continue; }
    if (ch === '\\') { (seen ? (post += sec[i + 1] || '') : (pre += sec[i + 1] || '')); i += 2; continue; }
    if (ch === '_' || ch === '*') { i += 2; continue; }
    if (/[#0?,.]/.test(ch) && !(seen && post)) { pat += ch; seen = true; i++; continue; }
    if (ch === '%') { (seen ? (post += '%') : (pre += '%')); i++; continue; }
    if (/[Ee]/.test(ch) && /^[Ee][+-]/.test(sec.slice(i))) { pat += 'E'; i += 2; while (sec[i] === '0') i++; continue; }
    if (ch === '@') { i++; continue; }
    (seen ? (post += ch) : (pre += ch)); i++;
  }
  if (!pat) return (neg && secs.length < 2 ? '-' : '') + pre + post || String(v);
  const dec = (pat.split('.')[1] || '').replace(/E.*/, '').length;
  let body;
  if (/E/.test(pat)) body = val.toExponential(dec).replace('e', 'E').replace(/E([+-])(\d)$/, 'E$10$2');
  else {
    const grouping = /,/.test(pat.replace(/,+$/, '').replace(/\.[#0?,]*/, ''));
    const trailing = (pat.match(/,+$/) || [''])[0].length;
    if (trailing) val = val / Math.pow(1000, trailing);
    const minInt = ((pat.split('.')[0] || '').match(/0/g) || []).length;
    const minDec = ((pat.split('.')[1] || '').match(/0/g) || []).length;
    body = Math.abs(val).toLocaleString('en-US', { useGrouping: grouping, minimumFractionDigits: minDec, maximumFractionDigits: dec });
    const ip = body.split('.')[0].replace(/,/g, '');
    if (minInt > ip.length) { const padded = ip.padStart(minInt, '0'); body = (grouping ? Number(padded).toLocaleString('en-US') .padStart(0) : padded) + (body.includes('.') ? '.' + body.split('.')[1] : ''); if (grouping && minInt > 3) body = padded.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (body.includes('.') ? '.' + body.split('.')[1] : ''); }
    if (minInt === 0 && /^0\./.test(body)) body = body.slice(1);
    if (neg && secs.length < 2 && Number(body.replace(/,/g, '')) !== 0) body = '-' + body;
  }
  return pre + body + post;
}

// النص المعروض داخل الخلية
export function displayText(cell) {
  if (!cell) return '';
  let v = cell.v;
  if (cell.f != null && v === undefined) return '=' + cell.f; // صيغة جديدة لم تُحسب بعد
  if (v == null) return '';
  const nf = cell.s && cell.s.nf;
  if (v instanceof Date) return nf && isDateFmt(nf) ? formatDate(v, nf) : fmtDate(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') {
    if (nf && nf !== 'General') {
      if (isDateFmt(nf)) return formatDate(serialToDate(v), nf);
      try { return formatNumber(v, nf); } catch (e) { /* تنسيق غير مفهوم: نعرض الرقم كما هو */ }
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
