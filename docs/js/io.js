// النموذج + قراءة وكتابة XLSX/CSV
import { key, unkey, parseDelimited, toCSV, rawText, parseInput, uid } from './util.js';

export function newSheet(name, rtl = true) {
  return { id: uid(), name, cells: new Map(), colW: {}, rowH: {}, rtl, origId: null, edited: new Set(), rtlChanged: false, nrows: 1000, ncols: 40 };
}
export function newWorkbook(name) {
  return { id: uid(), name, kind: 'new', sheets: [newSheet('ورقة1')], dirty: false, orig: null, handle: null, overwriteOK: false, created: Date.now() };
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
      out.v = r === undefined ? null : r;
    } else if (v.richText) out.v = v.richText.map((t) => t.text).join('');
    else if ('text' in v) out.v = typeof v.text === 'object' ? (v.text.richText || []).map((t) => t.text).join('') : v.text;
    else if ('error' in v) out.v = v.error;
    else out.v = String(v);
  } else out.v = v;
  return out;
}

export async function readXlsx(buffer, name) {
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
  if (cell.f != null) return { formula: cell.f };
  return cell.v === undefined ? null : cell.v;
}

// يكتب XLSX: يفتح الملف الأصلي (إن وجد) ويطبّق التعديلات فقط، فتبقى التنسيقات الأصلية كما هي
export async function writeXlsx(wb) {
  const x = new ExcelJS.Workbook();
  if (wb.orig) await x.xlsx.load(wb.orig);
  else { x.creator = 'جداول'; x.created = new Date(); }
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
      const [r, c] = unkey(k);
      ws.getCell(r + 1, c + 1).value = toExcelValue(sh.cells.get(k));
    }
    if (all) for (const [c, w] of Object.entries(sh.colW)) ws.getColumn(+c + 1).width = (w - 5) / 7;
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
  wb.sheets.forEach((sh, i) => { sh.origId = ids[i]; sh.edited = new Set(); sh.rtlChanged = false; });
  wb.orig = buffer; wb.kind = 'xlsx';
}

export function writeCsv(sh) {
  let mr = -1, mc = -1;
  for (const k of sh.cells.keys()) { const [r, c] = unkey(k); if (r > mr) mr = r; if (c > mc) mc = c; }
  const rows = [];
  for (let r = 0; r <= mr; r++) { const row = []; for (let c = 0; c <= mc; c++) { const cell = sh.cells.get(key(r, c)); row.push(cell && cell.f != null && cell.v != null ? String(cell.v) : rawText(cell)); } rows.push(row); }
  return toCSV(rows);
}
