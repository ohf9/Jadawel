// النموذج + قراءة وكتابة XLSX/CSV
import { tr } from './i18n.js';
import { readCharts, injectCharts, stripDrawings } from './charts.js';
import { readPics, injectPics } from './pics.js';
import { readZip, txt } from './zip.js';
const hasDraw = (wb) => wb.sheets.some((s) => (s.charts && s.charts.length) || (s.pics && s.pics.length));
import { key, unkey, parseDelimited, toCSV, rawText, parseInput, uid, parseRange } from './util.js';

export function newSheet(name, rtl = true) {
  return { id: uid(), name, cells: new Map(), colW: {}, rowH: {}, rtl, origId: null, edited: new Set(), colEdited: new Set(), rowEdited: new Set(), rtlChanged: false, nrows: 1000, ncols: 40 };
}
export function newWorkbook(name, rtl = true) {
  return { id: uid(), name, kind: 'new', sheets: [newSheet(tr('ورقة') + '1', rtl)], dirty: false, orig: null, handle: null, overwriteOK: false, created: Date.now() };
}
export function fitSize(sh) {
  let mr = 0, mc = 0;
  for (const k of sh.cells.keys()) { const [r, c] = unkey(k); if (r > mr) mr = r; if (c > mc) mc = c; }
  sh.nrows = Math.max(sh.nrows || 0, 1000, mr + 200);
  sh.ncols = Math.max(sh.ncols || 0, 40, mc + 10);
}

// ألوان الثيم والمفهرسة (Excel يخزّن كثيرًا من الألوان كـ theme + tint لا كـ RGB)
let THEME = null; // [lt1, dk1, lt2, dk2, accent1..6, hlink, folHlink]
const INDEXED = '000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 800000 008000 000080 808000 800080 008080 C0C0C0 808080 9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF 000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF 00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 003366 339966 003300 333300 993300 993366 333399 333333'.split(' ');
const DEF_THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72'];
function parseTheme(xml) {
  try {
    const m = xml.match(/<a:clrScheme[\s\S]*?<\/a:clrScheme>/); if (!m) return null;
    const out = {}; for (const k of ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']) { const e = m[0].match(new RegExp(`<a:${k}>([\\s\\S]*?)</a:${k}>`)); const v = e && (e[1].match(/lastClr="([0-9A-Fa-f]{6})"/) || e[1].match(/val="([0-9A-Fa-f]{6})"/)); out[k] = v ? v[1] : null; }
    const o = [out.lt1, out.dk1, out.lt2, out.dk2, out.accent1, out.accent2, out.accent3, out.accent4, out.accent5, out.accent6, out.hlink, out.folHlink];
    return o.map((x, i) => x || DEF_THEME[i]);
  } catch (e) { return null; }
}
function tintHex(hex, tint) {
  if (!tint) return '#' + hex;
  let r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0, l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  if (s === 0) r = g = b = l; else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3); }
  const x = (v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
  return '#' + x(r) + x(g) + x(b);
}
const argb = (c) => {
  if (!c) return null;
  if (typeof c.argb === 'string' && c.argb.length >= 6) return '#' + c.argb.slice(-6);
  if (typeof c.theme === 'number') { const t = THEME || DEF_THEME; const hx = t[c.theme]; return hx ? tintHex(hx, c.tint || 0) : null; }
  if (typeof c.indexed === 'number') { const hx = INDEXED[c.indexed] || (c.indexed === 64 ? '000000' : c.indexed === 65 ? 'FFFFFF' : null); return hx ? '#' + hx : null; }
  return null;
};

function readStyle(cell) {
  const s = {}; const f = cell.font;
  if (f) { if (f.bold) s.b = 1; if (f.italic) s.i = 1; if (f.underline) s.u = 1; const col = argb(f.color); if (col && col !== '#000000') s.color = col; if (f.name && f.name !== 'Calibri') s.font = f.name; if (f.size && f.size !== 11) s.sz = f.size; }
  const fill = cell.fill;
  if (fill && fill.type === 'pattern' && fill.pattern === 'solid') { const col = argb(fill.fgColor); if (col) s.fill = col; }
  const al = cell.alignment;
  if (al && ['left', 'center', 'right'].includes(al.horizontal)) s.al = al.horizontal;
  if (al && al.wrapText) s.wrap = 1;
  if (al && al.shrinkToFit) s.fit = 1;
  if (al && (al.textRotation === 90 || al.textRotation === 'vertical' || al.textRotation === 255 || (al.textRotation > 90 && al.textRotation <= 180))) s.rot = al.textRotation === 90 ? 90 : (al.textRotation === 'vertical' || al.textRotation === 255) ? 255 : 180;
  if (cell.numFmt && cell.numFmt !== 'General') s.nf = cell.numFmt;
  const bd = cell.border;
  if (bd) { let t = ''; if (bd.top && bd.top.style) t += 't'; if (bd.bottom && bd.bottom.style) t += 'b'; if (bd.left && bd.left.style) t += 'l'; if (bd.right && bd.right.style) t += 'r'; if (t) s.bd = t; }
  return Object.keys(s).length ? s : null;
}

function readValue(cell) {
  const v = cell.value;
  const out = {};
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('formula' in v || 'sharedFormula' in v) {
      out.f = cell.formula || v.formula || v.sharedFormula;
      let r = v.result;
      if (r && typeof r === 'object' && !(r instanceof Date)) r = r.error || null;
      out.v = r === undefined ? undefined : r;
    } else if (v.richText) out.v = v.richText.map((t) => t.text).join('');
    else if ('text' in v) out.v = typeof v.text === 'object' ? (v.text.richText || []).map((t) => t.text).join('') : v.text;
    else if ('error' in v) out.v = v.error;
    else out.v = String(v);
  } else out.v = v;
  return out;
}

async function readXlsxExcelJS(buffer, name) {
  const x = new ExcelJS.Workbook();
  await x.xlsx.load(buffer);
  THEME = null; try { const z = await readZip(buffer); const tx = z.get('xl/theme/theme1.xml'); if (tx) THEME = parseTheme(txt(tx)); } catch (e) { /* الثيم الافتراضي */ }
  const wb = { id: uid(), name, kind: 'xlsx', sheets: [], dirty: false, orig: buffer, handle: null, overwriteOK: false, created: Date.now() };
  x.eachSheet((ws) => {
    const sh = newSheet(ws.name, !!(ws.views && ws.views[0] && ws.views[0].rightToLeft));
    { const v = ws.views && ws.views[0]; if (v && v.state === 'frozen' && (v.xSplit || v.ySplit)) sh.freeze = { rows: v.ySplit || 0, cols: v.xSplit || 0 }; }
    { const cfs = ws.conditionalFormattings; if (cfs && cfs.length) sh.cf = cfs.map((e) => ({ ref: e.ref, rules: (e.rules || []).map((r) => Object.assign({}, r)) })); }
    { const nt = {}; ws.eachRow({ includeEmpty: false }, (row, rn) => row.eachCell({ includeEmpty: false }, (cell, cn) => { const n = cell.note; if (!n) return; const t = typeof n === 'string' ? n : (n.texts || []).map((x) => x.text).join(''); if (t) nt[(rn - 1) + ',' + (cn - 1)] = t; })); if (Object.keys(nt).length) sh.notes = nt; }
    if (ws.sheetProtection) sh.protect = true;
    { const dvm = ws.dataValidations && ws.dataValidations.model; if (dvm) { const d = {}; let n = 0; for (const [a, v] of Object.entries(dvm)) { if (!v || v.type !== 'list' || !v.formulae || !v.formulae[0] || n > 20000) continue; const m = /^([A-Z]+)(\d+)$/.exec(a); if (!m) continue; let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; d[(+m[2] - 1) + ',' + (c - 1)] = String(v.formulae[0]); n++; } if (n) sh.dv = d; } }
    sh.origId = ws.id; sh.tabColor = argb(ws.properties && ws.properties.tabColor);
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      if (row.height) sh.rowH[rn - 1] = Math.round(row.height * 4 / 3);
      row.eachCell({ includeEmpty: false }, (cell, cn) => {
        if (cell.isMerged && cell.master !== cell) return;
        const c = readValue(cell); const s = readStyle(cell);
        if (s) c.s = s;
        if (c.v == null && c.f == null && !s) return;
        sh.cells.set(key(rn - 1, cn - 1), c);
      });
    });
    (ws.columns || []).forEach((col, i) => { if (col && col.width) sh.colW[i] = Math.round(col.width * 7 + 5); if (col && col.hidden) (sh.hidCols = sh.hidCols || new Set()).add(i); });
    ws.eachRow({ includeEmpty: false }, (row, rn) => { if (row.hidden) (sh.hidRows = sh.hidRows || new Set()).add(rn - 1); });
    const mg = (ws.model && ws.model.merges) || [];
    sh.merges = mg.map((m) => parseRange(m)).filter((g) => g && (g.r2 > g.r1 || g.c2 > g.c1)).map((g) => ({ r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2 }));
    fitSize(sh);
    wb.sheets.push(sh);
  });
  if (!wb.sheets.length) wb.sheets.push(newSheet('ورقة1'));
  return wb;
}

export function readCsv(text, name) {
  const wb = { id: uid(), name, kind: 'csv', sheets: [], dirty: false, orig: null, handle: null, overwriteOK: false, created: Date.now() };
  const sh = newSheet(name.replace(/\.\w+$/, '').slice(0, 31) || 'ورقة1');
  parseDelimited(text, name.toLowerCase().endsWith('.tsv') ? '\t' : null).forEach((row, r) => row.forEach((t, c) => {
    const cell = parseInput(t); if (cell) sh.cells.set(key(r, c), cell);
  }));
  fitSize(sh); wb.sheets.push(sh);
  return wb;
}

function toExcelValue(cell) {
  if (!cell) return null;
  if (cell.f != null) return cell.v !== undefined && cell.v !== null && typeof cell.v !== 'object' ? { formula: cell.f, result: cell.v } : { formula: cell.f };
  return cell.v === undefined ? null : cell.v;
}
const colLetter = (n) => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = ((n - 1) / 26) | 0; } return s; };
const toArgb = (c) => 'FF' + c.replace('#', '').toUpperCase().padStart(6, '0').slice(-6);
// يطبّق فقط المفاتيح الموجودة في نمط الخلية، فلا نمسح تنسيقًا لم نفهمه من الملف الأصلي
function applyStyle(ec, s) {
  if (!s) return;
  if ('b' in s || 'i' in s || 'u' in s || 'color' in s || 'font' in s || 'sz' in s) {
    const f = Object.assign({}, ec.font);
    if ('b' in s) f.bold = !!s.b; if ('i' in s) f.italic = !!s.i; if ('u' in s) f.underline = !!s.u;
    if ('font' in s) { if (s.font) f.name = s.font; else delete f.name; }
    if ('sz' in s) { if (s.sz) f.size = s.sz; else delete f.size; }
    if ('color' in s) { if (s.color) f.color = { argb: toArgb(s.color) }; else delete f.color; }
    ec.font = f;
  }
  if ('fill' in s) ec.fill = s.fill ? { type: 'pattern', pattern: 'solid', fgColor: { argb: toArgb(s.fill) } } : { type: 'pattern', pattern: 'none' };
  if ('al' in s) ec.alignment = Object.assign({}, ec.alignment, { horizontal: s.al || undefined });
  if ('fit' in s) ec.alignment = Object.assign({}, ec.alignment, { shrinkToFit: !!s.fit });
  if ('wrap' in s) ec.alignment = Object.assign({}, ec.alignment, { wrapText: !!s.wrap });
  if (s.nf) ec.numFmt = s.nf;
  if ('bd' in s) { const b = s.bd || '', o = {}; const th = { style: 'thin', color: { argb: 'FF000000' } }; if (b.includes('t')) o.top = th; if (b.includes('b')) o.bottom = th; if (b.includes('l')) o.left = th; if (b.includes('r')) o.right = th; ec.border = o; }
}

// يكتب XLSX: يفتح الملف الأصلي (إن وجد) ويطبّق التعديلات فقط، فتبقى التنسيقات الأصلية كما هي
export async function writeXlsx(wb) {
  const x = new ExcelJS.Workbook();
  if (wb.orig) await x.xlsx.load(wb.orig);
  else { x.creator = 'Jadawel'; x.created = new Date(); }
  const keep = new Set();
  for (const sh of wb.sheets) {
    let ws = sh.origId != null ? x.getWorksheet(sh.origId) : null;
    let all = false;
    if (ws && (sh.rewrite || sh.mergesEdited)) { for (const m of (ws.model.merges || []).slice()) { try { ws.unMergeCells(m); } catch (e) { /* تجاهل */ } } }
    if (ws && sh.rewrite) { ws.spliceRows(1, ws.rowCount + 1); all = true; }
    if (!ws) { ws = x.addWorksheet(sh.name, { views: [{ rightToLeft: sh.rtl }] }); all = true; }
    else {
      if (ws.name !== sh.name) ws.name = sh.name;
      if (sh.rtlChanged) ws.views = [Object.assign({}, ws.views && ws.views[0], { rightToLeft: sh.rtl })];
    }
    if (sh.freezeEdited) {
      const v0 = Object.assign({}, ws.views && ws.views[0]); delete v0.xSplit; delete v0.ySplit; delete v0.topLeftCell; delete v0.activePane;
      ws.views = [sh.freeze && (sh.freeze.rows || sh.freeze.cols) ? Object.assign(v0, { state: 'frozen', xSplit: sh.freeze.cols || undefined, ySplit: sh.freeze.rows || undefined, topLeftCell: (colLetter(sh.freeze.cols) + (sh.freeze.rows + 1)) }) : Object.assign(v0, { state: 'normal' })];
    }
    if (sh.cfEdited) ws.conditionalFormattings = (sh.cf || []).map((e) => ({ ref: e.ref, rules: e.rules }));
    if (sh.notesTouched && sh.notesTouched.size) for (const k of sh.notesTouched) { const [r, c] = unkey(k); const ec = ws.getCell(r + 1, c + 1); const t = (sh.notes || {})[k]; if (t) ec.note = t; else ec._comment = undefined; }
    else if (all && sh.notes) for (const [k, t] of Object.entries(sh.notes)) { const [r, c] = unkey(k); ws.getCell(r + 1, c + 1).note = t; }
    if (sh.dvEdited) for (const e of sh.dvNew || []) for (let r = e.r1; r <= e.r2; r++) for (let c = e.c1; c <= e.c2; c++) { const ec = ws.getCell(r + 1, c + 1); if (e.src) ec.dataValidation = { type: 'list', allowBlank: true, showErrorMessage: false, formulae: [e.src] }; else ec.dataValidation = undefined; }
    if (sh.protectEdited) { if (sh.protect) await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true }); else ws.unprotect(); }
    keep.add(ws.id);
    const keys = all ? sh.cells.keys() : sh.edited;
    for (const k of keys) {
      const [r, c] = unkey(k); const cell = sh.cells.get(k); const ec = ws.getCell(r + 1, c + 1);
      ec.value = toExcelValue(cell);
      if (cell && cell.s) applyStyle(ec, cell.s);
    }
    if (all) {
      const nc = Math.max(ws.columnCount || 0, ...Object.keys(sh.colW).map((c) => +c + 1));
      for (let c = 0; c < nc; c++) { const w = sh.colW[c]; ws.getColumn(c + 1).width = w ? (w - 5) / 7 : undefined; }
      for (const [r, h] of Object.entries(sh.rowH)) ws.getRow(+r + 1).height = h * 0.75;
    }
    else {
      for (const c of sh.colEdited || []) if (sh.colW[c]) ws.getColumn(c + 1).width = (sh.colW[c] - 5) / 7;
      for (const r of sh.rowEdited || []) if (sh.rowH[r]) ws.getRow(r + 1).height = sh.rowH[r] * 0.75;
    }
    if (sh.rewrite || sh.mergesEdited || all) for (const m of sh.merges || []) { try { ws.mergeCells(m.r1 + 1, m.c1 + 1, m.r2 + 1, m.c2 + 1); } catch (e) { console.warn('merge', e); } }
    if (sh.hidTouched) {
      for (const r of sh.hidTouched) ws.getRow(r + 1).hidden = !!(sh.hidRows && sh.hidRows.has(r));
      for (const c of sh.hidColsTouched || []) ws.getColumn(c + 1).hidden = !!(sh.hidCols && sh.hidCols.has(c));
    }
  }
  for (const ws of x.worksheets.slice()) if (!keep.has(ws.id)) x.removeWorksheet(ws.id);
  x.calcProperties = Object.assign({}, x.calcProperties, { fullCalcOnLoad: true });
  const out = await x.xlsx.writeBuffer();
  try { return await injectPics(await injectCharts(out, wb), wb); } catch (e) { console.error('inject charts', e); throw new Error('تعذر كتابة الرسوم البيانية في الملف: ' + e.message); }
}

// بعد الحفظ: الملف الجديد يصبح هو الأصل، وتُمسح قائمة التعديلات
export async function rebaseAfterSave(wb, buffer) {
  const x = new ExcelJS.Workbook();
  // الرسوم نكتبها نحن، فنمرّر للمكتبة نسخة بلا طبقة الرسم كي لا تتعثر
  if (hasDraw(wb)) buffer = await stripDrawings(buffer);
  await x.xlsx.load(buffer);
  const ids = x.worksheets.map((w) => w.id);
  wb.sheets.forEach((sh, i) => { sh.origId = ids[i]; sh.edited = new Set(); sh.colEdited = new Set(); sh.rowEdited = new Set(); sh.rtlChanged = false; sh.freezeEdited = false; sh.cfEdited = false; sh.notesTouched = null; sh.protectEdited = false; sh.dvEdited = false; sh.dvNew = null; sh.rewrite = false; sh.mergesEdited = false; sh.hidTouched = null; sh.hidColsTouched = null; });
  wb.orig = buffer; wb.kind = 'xlsx';
}

export function writeCsv(sh) {
  let mr = -1, mc = -1;
  for (const k of sh.cells.keys()) { const [r, c] = unkey(k); if (r > mr) mr = r; if (c > mc) mc = c; }
  const rows = [];
  for (let r = 0; r <= mr; r++) { const row = []; for (let c = 0; c <= mc; c++) { const cell = sh.cells.get(key(r, c)); row.push(cell && cell.f != null && cell.v != null ? String(cell.v) : rawText(cell)); } rows.push(row); }
  return toCSV(rows);
}


// ---------- قراءة بمكتبة SheetJS: XLS القديمة وODS وأي XLSX تعذّرت قراءته بالمكتبة الأولى ----------
const AR = /[\u0600-\u06FF]/;
export function readSheetJS(buffer, name) {
  const x = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true, cellFormula: true, cellNF: true, cellText: false, sheetStubs: true });
  const wb = { id: uid(), name, kind: 'imported', sheets: [], dirty: false, orig: null, handle: null, overwriteOK: false, created: Date.now() };
  for (const sn of x.SheetNames) {
    const ws = x.Sheets[sn]; const sh = newSheet(sn.slice(0, 31));
    let arabic = false;
    for (const addr of Object.keys(ws)) {
      if (addr[0] === '!') continue;
      const c = ws[addr]; const pos = XLSX.utils.decode_cell(addr);
      const out = {};
      if (c.f) out.f = c.f;
      if (c.t === 'z') { if (!c.f) continue; out.v = undefined; sh.cells.set(key(pos.r, pos.c), out); continue; }
      let v = c.v;
      if (c.t === 'd' && v instanceof Date) v = new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds()));
      else if (c.t === 'e') v = c.w || ({ 0: '#NULL!', 7: '#DIV/0!', 15: '#VALUE!', 23: '#REF!', 29: '#NAME?', 36: '#NUM!', 42: '#N/A' }[v] || '#ERROR!');
      out.v = v === undefined ? null : v;
      if (typeof v === 'string' && !arabic && AR.test(v)) arabic = true;
      if (c.z && c.z !== 'General' && (c.t === 'n' || c.t === 'd')) out.s = { nf: c.z };
      if (out.v == null && out.f == null) continue;
      sh.cells.set(key(pos.r, pos.c), out);
    }
    (ws['!cols'] || []).forEach((col, i) => { if (col && (col.wpx || col.wch)) sh.colW[i] = Math.round(col.wpx || col.wch * 7 + 5); });
    (ws['!rows'] || []).forEach((row, i) => { if (row && (row.hpx || row.hpt)) sh.rowH[i] = Math.round(row.hpx || row.hpt * 4 / 3); });
    sh.merges = (ws['!merges'] || []).map((m) => ({ r1: m.s.r, c1: m.s.c, r2: m.e.r, c2: m.e.c }));
    sh.rtl = arabic; fitSize(sh); wb.sheets.push(sh);
  }
  if (!wb.sheets.length) wb.sheets.push(newSheet('Sheet1'));
  return wb;
}

// ملاحظة للمستخدم: ما الذي سيضيع عند حفظ الملف بالمكتبة المستخدمة
export function lossyFeatures(buffer) {
  // latin1 يحوّل كل بايت إلى حرف دون تجاوز حد الاستدعاءات (كان الخطأ هنا مع الملفات الكبيرة)
  const txt = new TextDecoder('latin1').decode(new Uint8Array(buffer));
  const f = [];
  if (/xl\/charts\/chart/.test(txt)) f.push('charts');
  if (/xl\/pivotTables\//.test(txt)) f.push('pivots');
  if (/xl\/slicers\//.test(txt)) f.push('slicers');
  if (/xl\/vbaProject\.bin/.test(txt)) f.push('macros');
  return f;
}

export async function readXlsx(buffer, name) {
  const lossy = lossyFeatures(buffer);
  try {
    let wb;
    // الرسوم والصور نقرؤها ونكتبها بأنفسنا؛ نمرّر للمكتبة نسخة بلا طبقة الرسم كي لا تتعثر ولا تُكرّر الصور
    if (/xl\/drawings\/drawing/.test(new TextDecoder('latin1').decode(new Uint8Array(buffer)))) { const stripped = await stripDrawings(buffer); wb = await readXlsxExcelJS(stripped, name); wb.orig = stripped; }
    else wb = await readXlsxExcelJS(buffer, name);
    let nch = 0;
    try { await readCharts(buffer, wb); nch = wb.sheets.reduce((a, s) => a + (s.charts ? s.charts.length : 0), 0); } catch (e) { console.warn('charts', e); }
    try { await readPics(buffer, wb); } catch (e) { console.warn('pics', e); }
    wb.lossy = nch ? lossy.filter((k) => k !== 'charts') : lossy; return wb;
  } catch (e) {
    console.warn('ExcelJS failed, falling back to SheetJS:', e);
    const wb = readSheetJS(buffer, name);
    wb.name = name.replace(/\.(xlsx|xlsm)$/i, '') + '.xlsx'; wb.fallback = true; wb.lossy = lossy.concat('styles');
    return wb;
  }
}
