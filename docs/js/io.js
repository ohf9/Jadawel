// النموذج + قراءة وكتابة XLSX/CSV
import { tr } from './i18n.js';
import { key, unkey, parseDelimited, toCSV, rawText, parseInput, uid } from './util.js';

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

const argb = (c) => (c && typeof c.argb === 'string' && c.argb.length >= 6) ? '#' + c.argb.slice(-6) : null;

function readStyle(cell) {
  const s = {}; const f = cell.font;
  if (f) { if (f.bold) s.b = 1; if (f.italic) s.i = 1; if (f.underline) s.u = 1; const col = argb(f.color); if (col && col !== '#000000') s.color = col; }
  const fill = cell.fill;
  if (fill && fill.type === 'pattern' && fill.pattern === 'solid') { const col = argb(fill.fgColor); if (col) s.fill = col; }
  const al = cell.alignment;
  if (al && ['left', 'center', 'right'].includes(al.horizontal)) s.al = al.horizontal;
  if (cell.numFmt && cell.numFmt !== 'General') s.nf = cell.numFmt;
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
  const wb = { id: uid(), name, kind: 'xlsx', sheets: [], dirty: false, orig: buffer, handle: null, overwriteOK: false, created: Date.now() };
  x.eachSheet((ws) => {
    const sh = newSheet(ws.name, !!(ws.views && ws.views[0] && ws.views[0].rightToLeft));
    sh.origId = ws.id;
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
    (ws.columns || []).forEach((col, i) => { if (col && col.width) sh.colW[i] = Math.round(col.width * 7 + 5); });
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
const toArgb = (c) => 'FF' + c.replace('#', '').toUpperCase().padStart(6, '0').slice(-6);
// يطبّق فقط المفاتيح الموجودة في نمط الخلية، فلا نمسح تنسيقًا لم نفهمه من الملف الأصلي
function applyStyle(ec, s) {
  if (!s) return;
  if ('b' in s || 'i' in s || 'u' in s || 'color' in s) {
    const f = Object.assign({}, ec.font);
    if ('b' in s) f.bold = !!s.b; if ('i' in s) f.italic = !!s.i; if ('u' in s) f.underline = !!s.u;
    if ('color' in s) { if (s.color) f.color = { argb: toArgb(s.color) }; else delete f.color; }
    ec.font = f;
  }
  if ('fill' in s) ec.fill = s.fill ? { type: 'pattern', pattern: 'solid', fgColor: { argb: toArgb(s.fill) } } : { type: 'pattern', pattern: 'none' };
  if (s.al) ec.alignment = Object.assign({}, ec.alignment, { horizontal: s.al });
  if (s.nf) ec.numFmt = s.nf;
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
    if (!ws) { ws = x.addWorksheet(sh.name, { views: [{ rightToLeft: sh.rtl }] }); all = true; }
    else {
      if (ws.name !== sh.name) ws.name = sh.name;
      if (sh.rtlChanged) ws.views = [Object.assign({}, ws.views && ws.views[0], { rightToLeft: sh.rtl })];
    }
    keep.add(ws.id);
    const keys = all ? sh.cells.keys() : sh.edited;
    for (const k of keys) {
      const [r, c] = unkey(k); const cell = sh.cells.get(k); const ec = ws.getCell(r + 1, c + 1);
      ec.value = toExcelValue(cell);
      if (cell && cell.s) applyStyle(ec, cell.s);
    }
    if (all) { for (const [c, w] of Object.entries(sh.colW)) ws.getColumn(+c + 1).width = (w - 5) / 7; for (const [r, h] of Object.entries(sh.rowH)) ws.getRow(+r + 1).height = h * 0.75; }
    else {
      for (const c of sh.colEdited || []) if (sh.colW[c]) ws.getColumn(c + 1).width = (sh.colW[c] - 5) / 7;
      for (const r of sh.rowEdited || []) if (sh.rowH[r]) ws.getRow(r + 1).height = sh.rowH[r] * 0.75;
    }
  }
  for (const ws of x.worksheets.slice()) if (!keep.has(ws.id)) x.removeWorksheet(ws.id);
  x.calcProperties = Object.assign({}, x.calcProperties, { fullCalcOnLoad: true });
  return await x.xlsx.writeBuffer();
}

// بعد الحفظ: الملف الجديد يصبح هو الأصل، وتُمسح قائمة التعديلات
export async function rebaseAfterSave(wb, buffer) {
  const x = new ExcelJS.Workbook();
  await x.xlsx.load(buffer);
  const ids = x.worksheets.map((w) => w.id);
  wb.sheets.forEach((sh, i) => { sh.origId = ids[i]; sh.edited = new Set(); sh.colEdited = new Set(); sh.rowEdited = new Set(); sh.rtlChanged = false; });
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
    sh.rtl = arabic; fitSize(sh); wb.sheets.push(sh);
  }
  if (!wb.sheets.length) wb.sheets.push(newSheet('Sheet1'));
  return wb;
}

// ملاحظة للمستخدم: ما الذي سيضيع عند حفظ الملف بالمكتبة المستخدمة
export function lossyFeatures(buffer) {
  const u8 = new Uint8Array(buffer); let txt = '';
  for (let i = 0; i < u8.length; i += 1 << 20) txt += String.fromCharCode.apply(null, u8.subarray(i, Math.min(u8.length, i + (1 << 20))));
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
    const wb = await readXlsxExcelJS(buffer, name);
    wb.lossy = lossy; return wb;
  } catch (e) {
    console.warn('ExcelJS failed, falling back to SheetJS:', e);
    const wb = readSheetJS(buffer, name);
    wb.name = name.replace(/\.(xlsx|xlsm)$/i, '') + '.xlsx'; wb.fallback = true; wb.lossy = lossy.concat('styles');
    return wb;
  }
}
