// جدول محوري (ملخص): يجمع بيانات نطاق حسب حقل صفوف (وحقل أعمدة اختياريًا) بصيغ حيّة تتحدث مع تغيّر البيانات
import { key, a1, esc, displayText, isNumCell, rawText } from './util.js';
import { newSheet } from './io.js';
import { recalc } from './calc.js';
import { tr, lang } from './i18n.js';

const FUNCS = [['SUM', 'مجموع', 'Sum'], ['COUNT', 'عدد', 'Count'], ['AVERAGE', 'متوسط', 'Average'], ['MAX', 'أكبر قيمة', 'Max'], ['MIN', 'أصغر قيمة', 'Min']];
const colL = (n) => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = ((n - 1) / 26) | 0; } return s; };
const qn = (n) => /^[A-Za-z_][\w.]*$/.test(n) ? n : "'" + n.replace(/'/g, "''") + "'";

function region(sh, g) {
  let { r1, c1, r2, c2 } = g;
  if (r1 === r2 && c1 === c2) {
    const has = (r, c) => { const x = sh.cells.get(key(r, c)); return x && (x.v != null || x.f != null) && x.v !== ''; };
    if (!has(r1, c1)) return null;
    let a = r1, b = r2, c = c1, d = c2;
    const rowAny = (r) => { if (r < 0) return false; for (let x = c; x <= d; x++) if (has(r, x)) return true; return false; };
    const colAny = (x) => { if (x < 0) return false; for (let r = a; r <= b; r++) if (has(r, x)) return true; return false; };
    for (let ch = true; ch;) { ch = false; if (rowAny(a - 1)) { a--; ch = true; } if (rowAny(b + 1) && b < r1 + 100000) { b++; ch = true; } if (colAny(c - 1)) { c--; ch = true; } if (colAny(d + 1) && d < c1 + 200) { d++; ch = true; } }
    return { r1: a, r2: b, c1: c, c2: d };
  }
  return { r1, c1, r2, c2 };
}

export function installPivot(app) {
  Object.assign(app, {
    async pivotDialog(p) {
      const sh = p.sh, g = region(sh, p.range());
      if (!g || g.r2 - g.r1 < 1 || g.c2 - g.c1 < 1) return this.toast('حدد خلية داخل جدول بياناته له صف عناوين في الأعلى');
      const heads = []; for (let c = g.c1; c <= g.c2; c++) heads.push({ c, name: displayText(sh.cells.get(key(g.r1, c))) || (lang === 'ar' ? 'عمود ' : 'Column ') + colL(c) });
      const numCol = (c) => { let n = 0, t = 0; for (let r = g.r1 + 1; r <= Math.min(g.r2, g.r1 + 200); r++) { const x = sh.cells.get(key(r, c)); if (x && x.v != null && x.v !== '') { t++; if (isNumCell(x)) n++; } } return t > 0 && n / t > 0.6; };
      const firstText = heads.find((h) => !numCol(h.c)) || heads[0], firstNum = heads.find((h) => numCol(h.c) && h !== firstText) || heads[heads.length - 1];
      const opts = (sel, none) => (none ? `<option value="">${tr('— بدون —')}</option>` : '') + heads.map((h) => `<option value="${h.c}"${sel && sel.c === h.c ? ' selected' : ''}>${esc(h.name)}</option>`).join('');
      const r = await this.form('جدول محوري', `<div class="note">${tr('المصدر')}: ${a1(g.r1, g.c1)}:${a1(g.r2, g.c2)} (${g.r2 - g.r1} ${tr('صف')})</div>
        <label class="field"><span>${tr('الصفوف')}</span><select id="pv-r">${opts(firstText)}</select></label>
        <label class="field"><span>${tr('الأعمدة (اختياري)')}</span><select id="pv-c">${opts(null, true)}</select></label>
        <label class="field"><span>${tr('القيم')}</span><select id="pv-v">${opts(firstNum)}</select></label>
        <label class="field"><span>${tr('الدالة')}</span><select id="pv-f">${FUNCS.map(([f, ar, en]) => `<option value="${f}">${lang === 'ar' ? ar : en}</option>`).join('')}</select></label>
        <label class="chk"><input type="checkbox" id="pv-t" checked><span>${tr('إظهار الإجماليات')}</span></label>`,
      [{ label: 'إنشاء', value: true, primary: true }, { label: 'إلغاء', value: null }]);
      if (!r) return; const q = (s) => r.el.querySelector(s);
      this.buildPivot(p, g, { row: +q('#pv-r').value, col: q('#pv-c').value === '' ? null : +q('#pv-c').value, val: +q('#pv-v').value, fn: q('#pv-f').value, totals: q('#pv-t').checked });
    },
    buildPivot(p, g, o) {
      const src = p.sh, wb = p.wb;
      if (o.col === o.row) return this.toast('اختر حقلين مختلفين للصفوف والأعمدة');
      const uniq = (c) => { const m = new Map(); for (let r = g.r1 + 1; r <= g.r2; r++) { const x = src.cells.get(key(r, c)); if (!x || x.v == null || x.v === '') continue; const k = typeof x.v === 'number' ? x.v : displayText(x); if (!m.has(String(k))) m.set(String(k), { k, v: x }); } return [...m.values()].sort((a, b) => (typeof a.k === 'number' && typeof b.k === 'number') ? a.k - b.k : String(a.k).localeCompare(String(b.k), lang === 'ar' ? 'ar' : 'en', { numeric: true })); };
      const rows = uniq(o.row), cols = o.col != null ? uniq(o.col) : null;
      if (!rows.length) return this.toast('لا توجد قيم في حقل الصفوف');
      if (rows.length > 2000 || (cols && cols.length > 200)) return this.toast('عدد القيم المختلفة كبير جدًا لجدول محوري واحد');
      const f1 = g.r1 + 2, f2 = g.r2 + 1; const rng = (c) => `${qn(src.name)}!$${colL(c)}$${f1}:$${colL(c)}$${f2}`;
      const V = rng(o.val), R = rng(o.row), C = o.col != null ? rng(o.col) : null;
      const cond = (extra) => extra.map(([range, ref]) => `${range},${ref}`).join(',');
      const cell = (extra) => {
        if (!extra.length) return o.fn === 'COUNT' ? `COUNTA(${V})` : `${o.fn}(${V})`;
        const c = cond(extra);
        return { SUM: `SUMIFS(${V},${c})`, COUNT: `COUNTIFS(${c},${V},"<>")`, AVERAGE: `IFERROR(AVERAGEIFS(${V},${c}),"")`, MAX: `MAXIFS(${V},${c})`, MIN: `MINIFS(${V},${c})` }[o.fn];
      };
      let n = 1; while (wb.sheets.some((s) => s.name === `${tr('محوري')}${n}`)) n++;
      const sh = newSheet(`${tr('محوري')}${n}`, src.rtl);
      const fl = FUNCS.find((x) => x[0] === o.fn); const vname = displayText(src.cells.get(key(g.r1, o.val))) || '';
      const label = `${lang === 'ar' ? fl[1] : fl[2]} ${tr('من')} ${vname}`;
      const H = { b: 1, fill: '#1e6b41', color: '#ffffff', al: 'center', bd: 'tblr' }, B = { bd: 'tblr' }, T = { b: 1, fill: '#e3f1e8', bd: 'tblr' };
      const set = (r, c, v, s) => { const x = {}; if (typeof v === 'string' && v[0] === '=') x.f = v.slice(1); else x.v = v; if (s) x.s = s; sh.cells.set(key(r, c), x); sh.edited.add(key(r, c)); };
      set(0, 0, label, { b: 1, sz: 13 });
      const hr = 2; // صف العناوين
      const rowName = displayText(src.cells.get(key(g.r1, o.row)));
      set(hr, 0, rowName, H);
      if (cols) { cols.forEach((cv, j) => set(hr, 1 + j, cv.k, H)); if (o.totals) set(hr, 1 + cols.length, tr('الإجمالي'), H); set(1, 1, displayText(src.cells.get(key(g.r1, o.col))), { b: 1, color: '#6a7077' }); }
      else set(hr, 1, label, H);
      const nc = cols ? cols.length : 1;
      rows.forEach((rv, i) => {
        const rr = hr + 1 + i, ra = `$A${rr + 1}`; set(rr, 0, rv.k, B);
        for (let j = 0; j < nc; j++) {
          const extra = [[R, ra]]; if (cols) extra.push([C, `${colL(1 + j)}$${hr + 1}`]);
          set(rr, 1 + j, '=' + cell(extra), { ...B, nf: o.fn === 'COUNT' ? '0' : '#,##0.##' });
        }
        if (cols && o.totals) set(rr, 1 + nc, '=' + cell([[R, ra]]), { ...T, nf: o.fn === 'COUNT' ? '0' : '#,##0.##' });
      });
      if (o.totals) {
        const tr_ = hr + 1 + rows.length; set(tr_, 0, tr('الإجمالي'), T);
        for (let j = 0; j < nc; j++) set(tr_, 1 + j, '=' + (cols ? cell([[C, `${colL(1 + j)}$${hr + 1}`]]) : cell([])), { ...T, nf: o.fn === 'COUNT' ? '0' : '#,##0.##' });
        if (cols) set(tr_, 1 + nc, '=' + cell([]), { ...T, nf: o.fn === 'COUNT' ? '0' : '#,##0.##' });
      }
      sh.colW[0] = 170; for (let j = 1; j <= nc + 1; j++) sh.colW[j] = 110; sh.rowH[hr] = 30;
      wb.sheets.push(sh);
      try { recalc(wb, [...sh.cells.entries()].filter(([, c]) => c.f != null).map(([k]) => { const [r, c] = k.split(',').map(Number); return { sheet: sh, r, c }; })); } catch (e) { console.warn('pivot calc', e); }
      this.markDirty(wb); this.refreshWb(wb); p.setSheet(wb.sheets.length - 1);
      this.toast('أُنشئ الجدول المحوري في ورقة جديدة، وتتحدث أرقامه تلقائيًا عند تغيّر البيانات', 5000);
    },
  });
}
