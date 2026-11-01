// التنسيق الشرطي: قراءة قواعد Excel (cellIs/نص/أعلى-أدنى/متوسط/تدرج لوني/أشرطة بيانات) وعرضها وإنشاؤها
import { parseRange, key, esc, a1, rawText } from './util.js';
import { tr } from './i18n.js';

const hex = (c) => c && typeof c.argb === 'string' && c.argb.length >= 6 ? '#' + c.argb.slice(-6) : null;
const argb = (h) => ({ argb: 'FF' + h.replace('#', '').toUpperCase() });
export const CF_PRESETS = [
  ['light-red', 'تعبئة حمراء فاتحة مع نص أحمر غامق', '#FFC7CE', '#9C0006'],
  ['yellow', 'تعبئة صفراء مع نص أصفر غامق', '#FFEB9C', '#9C5700'],
  ['green', 'تعبئة خضراء مع نص أخضر غامق', '#C6EFCE', '#006100'],
  ['fill-red', 'تعبئة حمراء فاتحة', '#FFC7CE', null],
  ['text-red', 'نص أحمر', null, '#9C0006'],
];
const styleOf = (fill, font) => { const st = {}; if (fill) st.fill = { type: 'pattern', pattern: 'solid', bgColor: argb(fill), fgColor: argb(fill) }; if (font) st.font = { color: argb(font) }; return st; };
export const presetStyle = (id) => { const p = CF_PRESETS.find((x) => x[0] === id) || CF_PRESETS[0]; return styleOf(p[2], p[3]); };

export const SCALES = [
  ['gyr', 'أخضر - أصفر - أحمر', ['#63BE7B', '#FFEB84', '#F8696B']], ['ryg', 'أحمر - أصفر - أخضر', ['#F8696B', '#FFEB84', '#63BE7B']],
  ['wg', 'أبيض - أخضر', ['#FFFFFF', '#63BE7B']], ['wr', 'أبيض - أحمر', ['#FFFFFF', '#F8696B']], ['bwr', 'أزرق - أبيض - أحمر', ['#5A8AC6', '#FCFCFF', '#F8696B']],
];
export const BARS = [['blue', 'أزرق', '#638EC6'], ['green', 'أخضر', '#63C384'], ['red', 'أحمر', '#FF555A'], ['orange', 'برتقالي', '#FFB628']];
export const scaleRule = (id) => { const s = SCALES.find((x) => x[0] === id) || SCALES[0]; const c = s[2]; return { type: 'colorScale', cfvo: c.length === 3 ? [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }] : [{ type: 'min' }, { type: 'max' }], color: c.map(argb), priority: 1 }; };
export const barRule = (id) => { const b = BARS.find((x) => x[0] === id) || BARS[0]; return { type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: argb(b[2]), gradient: true, priority: 1 }; };

// ---------- تقييم ----------
const rectsOf = (ref) => String(ref || '').split(/\s+/).map((x) => parseRange(x.replace(/\$/g, ''))).filter(Boolean);
const inRects = (rs, r, c) => { for (const g of rs) if (r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2) return true; return false; };
const numv = (cell) => cell && typeof cell.v === 'number' ? cell.v : (cell && cell.v instanceof Date ? cell.v.getTime() / 864e5 + 25569 : null);
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (c1, c2, t) => { const a = rgb(c1), b = rgb(c2); return '#' + [0, 1, 2].map((i) => lerp(a[i], b[i], t).toString(16).padStart(2, '0')).join(''); };

function stats(sh, rs, cap = 60000) {
  const nums = []; let seen = 0;
  for (const g of rs) for (let r = g.r1; r <= g.r2 && seen < cap; r++) for (let c = g.c1; c <= g.c2 && seen < cap; c++) { const x = sh.cells.get(key(r, c)); seen++; const v = numv(x); if (v != null) nums.push(v); }
  nums.sort((a, b) => a - b); return nums;
}
const pctile = (sorted, p) => { if (!sorted.length) return 0; const i = (sorted.length - 1) * p / 100, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };
function cfvoVal(v, sorted) {
  const t = v.type; if (t === 'min') return sorted[0]; if (t === 'max') return sorted[sorted.length - 1];
  if (t === 'num') return +v.value; if (t === 'percent') return sorted[0] + (sorted[sorted.length - 1] - sorted[0]) * (+v.value) / 100; if (t === 'percentile') return pctile(sorted, +v.value);
  return null;
}
const fv = (f) => { const x = Array.isArray(f) ? f[0] : f; if (x == null) return null; const s = String(x).replace(/^"|"$/g, ''); return s; };

export function cfPrep(sh) {
  const items = [];
  (sh.cf || []).forEach((e) => {
    const rs = rectsOf(e.ref); if (!rs.length) return;
    for (const rule of e.rules || []) {
      const it = { rs, rule, t: rule.type };
      if (rule.type === 'colorScale' || rule.type === 'dataBar') {
        const sorted = stats(sh, rs); if (!sorted.length) continue; it.sorted = sorted;
        it.pts = (rule.cfvo || []).map((v) => cfvoVal(v, sorted));
        if (it.pts.some((x) => x == null || isNaN(x))) continue;
        it.cols = rule.type === 'colorScale' ? (rule.color || []).map(hex) : [hex(rule.color)]; if (it.cols.some((x) => !x)) continue;
      } else if (rule.type === 'top10') {
        const sorted = stats(sh, rs); if (!sorted.length) continue; const n = rule.percent ? Math.max(1, Math.round(sorted.length * (rule.rank || 10) / 100)) : Math.max(1, rule.rank || 10);
        it.th = rule.bottom ? sorted[Math.min(n, sorted.length) - 1] : sorted[Math.max(0, sorted.length - n)];
      } else if (rule.type === 'aboveAverage') {
        const sorted = stats(sh, rs); if (!sorted.length) continue; it.avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      } else if (!['cellIs', 'containsText'].includes(rule.type)) continue;
      items.push(it);
    }
  });
  items.sort((a, b) => (a.rule.priority || 99) - (b.rule.priority || 99));
  return items;
}

const OPS = {
  greaterThan: (a, b) => a > b, lessThan: (a, b) => a < b, equal: (a, b) => a === b, notEqual: (a, b) => a !== b,
  greaterThanOrEqual: (a, b) => a >= b, lessThanOrEqual: (a, b) => a <= b,
};
function styleToFx(st) {
  const s = {}; if (!st) return s;
  const fill = st.fill && (hex(st.fill.bgColor) || hex(st.fill.fgColor)); if (fill) s.fill = fill;
  const col = st.font && hex(st.font.color); if (col) s.color = col; if (st.font && st.font.bold) s.b = 1; if (st.font && st.font.italic) s.i = 1;
  return s;
}
export function cfEffect(items, sh, r, c, cell) {
  let out = null; const rtl = sh.rtl;
  for (const it of items) {
    if (!inRects(it.rs, r, c)) continue;
    const rule = it.rule; let hit = false; const v = numv(cell);
    if (it.t === 'colorScale') {
      if (v == null) continue; const p = it.pts, cl = it.cols; let col;
      if (cl.length === 2) { const t = p[1] === p[0] ? 1 : Math.min(1, Math.max(0, (v - p[0]) / (p[1] - p[0]))); col = mix(cl[0], cl[1], t); }
      else { col = v <= p[1] ? mix(cl[0], cl[1], p[1] === p[0] ? 1 : Math.min(1, Math.max(0, (v - p[0]) / (p[1] - p[0])))) : mix(cl[1], cl[2], p[2] === p[1] ? 1 : Math.min(1, Math.max(0, (v - p[1]) / (p[2] - p[1])))); }
      out = out || { s: {} }; if (!out.s.fill) out.s.fill = col; continue;
    }
    if (it.t === 'dataBar') {
      if (v == null) continue; const [lo, hi] = it.pts; const t = hi === lo ? 1 : Math.min(1, Math.max(0.04, (v - lo) / (hi - lo)));
      out = out || { s: {} }; out.css = `background:linear-gradient(to ${rtl ? 'left' : 'right'},${it.cols[0]} ${(t * 100).toFixed(1)}%,transparent ${(t * 100).toFixed(1)}%);`; continue;
    }
    if (it.t === 'cellIs') {
      const f1 = fv(rule.formulae), op = rule.operator;
      const a = v != null ? v : (cell && typeof cell.v === 'string' ? cell.v : null); if (a == null) continue;
      const n1 = isFinite(+f1) && f1 !== '' ? +f1 : f1;
      if (op === 'between' || op === 'notBetween') { const f2 = rule.formulae && rule.formulae[1] != null ? +String(rule.formulae[1]).replace(/^"|"$/g, '') : NaN; if (typeof a !== 'number' || isNaN(+n1) || isNaN(f2)) continue; const inb = a >= Math.min(+n1, f2) && a <= Math.max(+n1, f2); hit = op === 'between' ? inb : !inb; }
      else if (OPS[op]) { if (typeof a !== typeof n1) { if (op !== 'notEqual') continue; hit = true; } else hit = OPS[op](typeof a === 'string' ? a.toLowerCase() : a, typeof n1 === 'string' ? n1.toLowerCase() : n1); }
      else continue;
    } else if (it.t === 'containsText') {
      const txt = String(rule.text != null ? rule.text : fv(rule.formulae) || '').toLowerCase(), hay = rawText(cell).toLowerCase(); if (!txt) continue;
      const op = rule.operator;
      hit = op === 'notContains' ? !hay.includes(txt) : op === 'beginsWith' ? hay.startsWith(txt) : op === 'endsWith' ? hay.endsWith(txt) : hay.includes(txt);
    } else if (it.t === 'top10') { if (v == null) continue; hit = rule.bottom ? v <= it.th : v >= it.th; }
    else if (it.t === 'aboveAverage') { if (v == null) continue; hit = rule.aboveAverage === false ? v < it.avg : v > it.avg; }
    if (hit) { out = out || { s: {} }; const fx = styleToFx(rule.style); for (const k of Object.keys(fx)) if (!(k in out.s)) out.s[k] = fx[k]; if (rule.stopIfTrue) break; }
  }
  return out;
}

// ---------- واجهة ----------
const refOf = (g) => a1(g.r1, g.c1) + (g.r1 === g.r2 && g.c1 === g.c2 ? '' : ':' + a1(g.r2, g.c2));
function addRule(app, p, rule, g) {
  const sh = p.sh; const rg = g || p.range();
  sh.cf = sh.cf || []; rule.priority = 1 + Math.max(0, ...sh.cf.flatMap((e) => e.rules.map((r) => r.priority || 0)));
  sh.cf.push({ ref: refOf(rg), rules: [rule] }); sh.cfEdited = true; app.markDirty(p.wb); app.cfRefresh(sh);
}
const OPLABEL = { greaterThan: 'أكبر من', lessThan: 'أصغر من', between: 'بين', equal: 'يساوي', containsText: 'يحتوي النص' };

export function installCF(app) {
  Object.assign(app, {
    cfRefresh(sh) { this.panes.forEach((q) => { if (q.sh === sh) { q.block = null; q.render(true); } }); },
    cfMenu(btn) {
      const p = this.pane(); const g = p.range();
      const hl = (op) => () => this.cfDialog(p, op);
      const tp = (o) => () => { addRule(this, p, Object.assign({ type: 'top10', rank: 10, style: presetStyle('light-red') }, o)); };
      this.menu(btn, [
        { h: 'قواعد تمييز الخلايا' },
        { t: 'أكبر من…', f: hl('greaterThan') }, { t: 'أصغر من…', f: hl('lessThan') }, { t: 'بين…', f: hl('between') }, { t: 'يساوي…', f: hl('equal') }, { t: 'نص يحتوي…', f: hl('containsText') },
        { h: 'قواعد الأعلى/الأدنى' },
        { t: 'أعلى 10 عناصر', f: tp({}) }, { t: 'أدنى 10 عناصر', f: tp({ bottom: true }) },
        { t: 'أعلى من المتوسط', f: () => addRule(this, p, { type: 'aboveAverage', aboveAverage: true, style: presetStyle('green') }) }, { t: 'أقل من المتوسط', f: () => addRule(this, p, { type: 'aboveAverage', aboveAverage: false, style: presetStyle('light-red') }) },
        { h: 'أشرطة البيانات' }, ...BARS.map(([id, l]) => ({ t: 'شريط ' + l, f: () => addRule(this, p, barRule(id)) })),
        { h: 'تدرجات الألوان' }, ...SCALES.map(([id, l]) => ({ t: l, f: () => addRule(this, p, scaleRule(id)) })),
        '-', { t: 'مسح القواعد من الخلايا المحددة', f: () => this.cfClear(p, g) }, { t: 'مسح كل قواعد الورقة', f: () => this.cfClear(p, null) }, { t: 'إدارة القواعد…', f: () => this.cfManage(p) },
      ]);
    },
    async cfDialog(p, op) {
      const two = op === 'between', txt = op === 'containsText';
      const r = await this.form(OPLABEL[op] ? 'تنسيق الخلايا ' + OPLABEL[op] : 'تنسيق شرطي', `<label class="field"><span>${tr(txt ? 'النص' : 'القيمة')}</span><input type="${txt ? 'text' : 'number'}" step="any" class="cv1" inputmode="${txt ? 'text' : 'decimal'}"></label>${two ? `<label class="field"><span>${tr('والقيمة الثانية')}</span><input type="number" step="any" class="cv2" inputmode="decimal"></label>` : ''}
        <label class="field"><span>${tr('التنسيق')}</span><select class="cps">${CF_PRESETS.map(([id, l, f, c]) => `<option value="${id}">${tr(l)}</option>`).join('')}</select></label>`,
      [{ label: 'موافق', value: true, primary: true }, { label: 'إلغاء', value: null }], (d) => d.querySelector('.cv1').focus());
      if (!r) return; const q = (s) => r.el.querySelector(s); const v1 = q('.cv1').value.trim(); if (v1 === '') return this.toast('اكتب قيمة');
      const style = presetStyle(q('.cps').value);
      if (txt) addRule(this, p, { type: 'containsText', operator: 'containsText', text: v1, formulae: ['NOT(ISERROR(SEARCH("' + v1.replace(/"/g, '""') + '",' + a1(p.range().r1, p.range().c1) + ')))'], style });
      else { const fm = [+v1]; if (two) { const v2 = q('.cv2').value.trim(); if (v2 === '') return this.toast('اكتب القيمة الثانية'); fm.push(+v2); } addRule(this, p, { type: 'cellIs', operator: op, formulae: fm, style }); }
    },
    cfClear(p, g) {
      const sh = p.sh; if (!sh.cf || !sh.cf.length) return this.toast('لا توجد قواعد تنسيق شرطي');
      if (!g) sh.cf = [];
      else sh.cf = sh.cf.filter((e) => { const rs = rectsOf(e.ref); return !rs.some((x) => !(x.r2 < g.r1 || x.r1 > g.r2 || x.c2 < g.c1 || x.c1 > g.c2)); });
      sh.cfEdited = true; this.markDirty(p.wb); this.cfRefresh(sh);
    },
    async cfManage(p) {
      const sh = p.sh; const list = () => (sh.cf || []).flatMap((e, i) => e.rules.map((r, j) => ({ e, i, j, r })));
      const label = (r) => ({ cellIs: OPLABEL[r.operator] || r.operator, containsText: 'نص يحتوي', top10: r.bottom ? 'الأدنى' : 'الأعلى', aboveAverage: r.aboveAverage === false ? 'أقل من المتوسط' : 'أعلى من المتوسط', colorScale: 'تدرج لوني', dataBar: 'شريط بيانات', expression: 'صيغة (محفوظة، لا تُعرض هنا)' }[r.type] || r.type);
      const html = () => list().length ? list().map((x, n) => `<div class="cfrow"><span class="cfr">${esc(x.e.ref)}</span><span class="cfl">${esc(tr(label(x.r)))}${x.r.formulae && x.r.type === 'cellIs' ? ' ' + esc(x.r.formulae.join(' – ')) : ''}</span><button type="button" data-n="${n}" class="cfx">✕</button></div>`).join('') : `<div class="note">${tr('لا توجد قواعد')}</div>`;
      await this.form('إدارة قواعد التنسيق الشرطي', `<div class="cflist">${html()}</div>`, [{ label: 'تم', value: true, primary: true }], (d) => {
        d.addEventListener('click', (ev) => { const b = ev.target.closest('.cfx'); if (!b) return; const x = list()[+b.dataset.n]; x.e.rules.splice(x.j, 1); if (!x.e.rules.length) sh.cf.splice(x.i, 1); sh.cfEdited = true; this.markDirty(p.wb); this.cfRefresh(sh); d.querySelector('.cflist').innerHTML = html(); });
      });
    },
  });
}
