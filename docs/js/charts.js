// الرسوم البيانية: قراءة من XLSX، رسم SVG، إنشاء/تعديل، وإعادة كتابتها داخل الملف عند الحفظ
import { readZip, writeZip, txt, bytes } from './zip.js';
import { parseRange, key, esc, a1 } from './util.js';
import { tr } from './i18n.js';

const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
export const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
export const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const NS_X = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const PALETTE = ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47', '#264478', '#9E480E'];
export const EMU = 9525;
export const DEF_W = 64, DEF_H = 20;
export const CHART_TYPES = [['col', 'عمودي'], ['bar', 'أشرطة'], ['line', 'خطي'], ['area', 'مساحة'], ['pie', 'دائري'], ['scatter', 'مبعثر']];

let _id = 0;
export const chartId = () => 'ch' + Date.now().toString(36) + (++_id);

// ---------- المراجع ----------
function parseRef(f) {
  if (!f) return null;
  f = String(f).trim().replace(/^\(|\)$/g, '');
  const m = f.match(/^(?:'((?:[^']|'')+)'|([^!']+))!(.+)$/);
  if (!m) return null;
  const rg = parseRange(m[3].replace(/\$/g, '')); if (!rg) return null;
  return Object.assign({ sheet: (m[1] || m[2]).replace(/''/g, "'") }, rg);
}
const qs = (n) => /^[A-Za-z_][\w.]*$/.test(n) ? n : "'" + n.replace(/'/g, "''") + "'";
export function refStr(sheetName, rg) {
  const c = (n) => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = ((n - 1) / 26) | 0; } return s; };
  const one = (r, cc) => '$' + c(cc) + '$' + (r + 1);
  return qs(sheetName) + '!' + one(rg.r1, rg.c1) + (rg.r1 === rg.r2 && rg.c1 === rg.c2 ? '' : ':' + one(rg.r2, rg.c2));
}
function cellVal(sh, r, c) { const x = sh.cells.get(key(r, c)); return x ? (x.v === undefined ? null : x.v) : null; }
function readRef(wb, f, cache) {
  const rf = parseRef(f); const sh = rf && wb.sheets.find((s) => s.name === rf.sheet);
  if (!sh) return cache || [];
  const out = [];
  for (let r = rf.r1; r <= rf.r2; r++) for (let c = rf.c1; c <= rf.c2; c++) out.push(cellVal(sh, r, c));
  return out;
}
const num = (v) => { if (typeof v === 'number') return isFinite(v) ? v : null; if (v instanceof Date) return v.getTime() / 864e5 + 25569; if (typeof v === 'string' && v.trim() !== '' && isFinite(+v)) return +v; return null; };
const lbl = (v) => v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(typeof v === 'number' ? +v.toPrecision(10) : v);

// يحوّل مواصفات الرسم إلى بيانات جاهزة للرسم من خلايا الورقة الحالية
export function resolveChart(wb, ch) {
  const sp = ch.spec; const series = [];
  let cats = [];
  sp.series.forEach((s, i) => {
    const vals = readRef(wb, s.val, s.valCache).map(num);
    const name = s.nameRef ? lbl(readRef(wb, s.nameRef, [s.name])[0]) : (s.name || '');
    const cv = s.cat ? readRef(wb, s.cat, s.catCache) : [];
    if (i === 0 || cv.length > cats.length) cats = cv;
    series.push({ name: name || ('Series' + (i + 1)), color: s.color || PALETTE[i % PALETTE.length], vals, cat: cv });
  });
  const n = Math.max(0, ...series.map((s) => s.vals.length));
  return { series, cats: cats.slice(0, n).concat(Array(Math.max(0, n - cats.length)).fill(null)), n };
}

// ---------- قراءة الرسوم من ملف XLSX ----------
export const dom = (s) => new DOMParser().parseFromString(s, 'application/xml');
export const kids = (el, name) => [...el.children].filter((x) => x.localName === name);
export const kid = (el, name) => kids(el, name)[0] || null;
export const desc = (el, name) => [...el.getElementsByTagName('*')].filter((x) => x.localName === name);
const val = (el) => el ? el.getAttribute('val') : null;
export function resolvePath(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/'); parts.pop();
  for (const p of target.split('/')) { if (p === '..') parts.pop(); else if (p !== '.') parts.push(p); }
  return parts.join('/');
}
export function relsOf(zip, path) {
  const dir = path.slice(0, path.lastIndexOf('/') + 1), name = path.slice(path.lastIndexOf('/') + 1);
  const rp = dir + '_rels/' + name + '.rels'; const m = new Map(); const raw = zip.get(rp); if (!raw) return m;
  for (const r of desc(dom(txt(raw)), 'Relationship')) m.set(r.getAttribute('Id'), { type: r.getAttribute('Type'), target: resolvePath(path, r.getAttribute('Target')) });
  return m;
}
const srgb = (el) => { const c = el && desc(el, 'srgbClr')[0]; return c ? '#' + c.getAttribute('val') : null; };
function cacheOf(el) { // من strRef/numRef: يعيد { f, cache }
  if (!el) return null;
  const f = desc(el, 'f')[0]; const pts = desc(el, 'pt').map((p) => { const v = desc(p, 'v')[0]; return v ? v.textContent : null; });
  const lit = !f ? desc(el, 'v')[0] : null;
  return { f: f ? f.textContent : null, cache: lit ? [lit.textContent] : pts };
}

export function parseChartXml(xml) {
  const d = dom(xml); const cs = d.documentElement; const chart = kid(cs, 'chart'); if (!chart) return null;
  const plot = kid(chart, 'plotArea'); if (!plot) return null;
  const grp = [...plot.children].find((x) => /^(bar|bar3D|line|line3D|area|area3D|pie|pie3D|doughnut|scatter|ofPie)Chart$/.test(x.localName));
  if (!grp) return null;
  const kind = grp.localName.replace('3D', '').replace('Chart', '');
  const sp = { type: 'col', stacked: false, pct: false, doughnut: kind === 'doughnut', title: '', legend: !!kid(chart, 'legend'), series: [], combo: [...plot.children].filter((x) => /Chart$/.test(x.localName)).length > 1 };
  if (kind === 'bar') sp.type = val(kid(grp, 'barDir')) === 'bar' ? 'bar' : 'col';
  else if (kind === 'line') sp.type = 'line'; else if (kind === 'area') sp.type = 'area';
  else if (kind === 'scatter') sp.type = 'scatter'; else sp.type = 'pie';
  const g = val(kid(grp, 'grouping')); sp.stacked = g === 'stacked' || g === 'percentStacked'; sp.pct = g === 'percentStacked';
  const t = kid(chart, 'title'); if (t) sp.title = desc(t, 't').map((x) => x.textContent).join('');
  kids(grp, 'ser').forEach((s, i) => {
    const o = {};
    const tx = cacheOf(kid(s, 'tx')); if (tx) { if (tx.f) { o.nameRef = tx.f; o.name = tx.cache[0] || ''; } else o.name = tx.cache[0] || ''; }
    const cat = cacheOf(kid(s, sp.type === 'scatter' ? 'xVal' : 'cat')); if (cat) { o.cat = cat.f; o.catCache = cat.cache; }
    const vl = cacheOf(kid(s, sp.type === 'scatter' ? 'yVal' : 'val')); if (vl) { o.val = vl.f; o.valCache = vl.cache.map(num); }
    const spPr = kid(s, 'spPr'); o.color = srgb(spPr) || null;
    sp.series.push(o);
  });
  return sp;
}

export async function readCharts(buffer, wb) {
  const zip = await readZip(buffer);
  if (!zip.has('xl/workbook.xml')) return;
  const wbRels = relsOf(zip, 'xl/workbook.xml');
  const sheetsEl = desc(dom(txt(zip.get('xl/workbook.xml'))), 'sheet');
  for (const se of sheetsEl) {
    const name = se.getAttribute('name'); const sh = wb.sheets.find((s) => s.name === name); if (!sh) continue;
    const rid = [...se.attributes].find((a) => a.localName === 'id'); const rel = rid && wbRels.get(rid.value); if (!rel) continue;
    const sx = zip.get(rel.target); if (!sx) continue;
    const m = txt(sx).match(/<drawing\b[^>]*\br:id="([^"]+)"/); if (!m) continue;
    const dp = relsOf(zip, rel.target).get(m[1]); if (!dp || !zip.has(dp.target)) continue;
    const drels = relsOf(zip, dp.target);
    const dd = dom(txt(zip.get(dp.target)));
    const colPx = (c) => (sh.colW[c] || sh.defW || DEF_W), rowPx = (r) => (sh.rowH[r] || sh.defH || DEF_H);
    const pt = (el) => { // from/to -> {c,r} كسرية
      const g = (n) => +((kid(el, n) || {}).textContent || 0);
      return { c: g('col') + g('colOff') / EMU / colPx(g('col')), r: g('row') + g('rowOff') / EMU / rowPx(g('row')) };
    };
    for (const an of [...dd.documentElement.children]) {
      const gf = kid(an, 'graphicFrame'); if (!gf) continue;
      const cr = desc(gf, 'chart')[0]; if (!cr) continue;
      const ra = [...cr.attributes].find((a) => a.localName === 'id'); const cp = ra && drels.get(ra.value); if (!cp || !zip.has(cp.target)) continue;
      let a1p, a2p;
      if (an.localName === 'twoCellAnchor') { a1p = pt(kid(an, 'from')); a2p = pt(kid(an, 'to')); }
      else if (an.localName === 'oneCellAnchor') {
        a1p = pt(kid(an, 'from')); const ex = kid(an, 'ext'); let w = (+ex.getAttribute('cx')) / EMU, h = (+ex.getAttribute('cy')) / EMU;
        let c = a1p.c, r = a1p.r; while (w > 0 && c < 5000) { const left = colPx(Math.floor(c)) * (1 - (c % 1)); if (w <= left) { c += w / colPx(Math.floor(c)); w = 0; } else { w -= left; c = Math.floor(c) + 1; } }
        while (h > 0 && r < 100000) { const left = rowPx(Math.floor(r)) * (1 - (r % 1)); if (h <= left) { r += h / rowPx(Math.floor(r)); h = 0; } else { h -= left; r = Math.floor(r) + 1; } }
        a2p = { c, r };
      } else continue;
      const xml = txt(zip.get(cp.target));
      let spec = null; try { spec = parseChartXml(xml); } catch (e) { console.warn('chart parse', e); }
      (sh.charts = sh.charts || []).push({ id: chartId(), anchor: { c1: a1p.c, r1: a1p.r, c2: a2p.c, r2: a2p.r }, xml, spec: spec || { type: 'col', title: '', series: [], unsupported: true } });
    }
  }
}

// ---------- الرسم SVG ----------
function niceScale(min, max, n = 5) {
  if (min === max) { max = min + 1; }
  const span = max - min, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step;
  const t = []; for (let v = lo; v <= hi + step / 2; v += step) t.push(+v.toPrecision(12));
  return { lo, hi, t };
}
const fmtN = (v) => Math.abs(v) >= 1e6 ? +(v / 1e6).toPrecision(3) + 'M' : Math.abs(v) >= 1e4 ? +(v / 1e3).toPrecision(3) + 'K' : String(+v.toPrecision(6));
const fit = (s, px, fs) => { s = String(s); const max = Math.max(2, Math.floor(px / (fs * 0.56))); return s.length > max ? s.slice(0, max - 1) + '…' : s; };

export function chartSvg(sp, data, W, H, dark) {
  const fg = dark ? '#d8dee9' : '#404040', grid = dark ? '#3a4150' : '#d9d9d9', fs = 11;
  let g = '';
  const T = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${o.fs || fs}" fill="${o.fill || fg}" text-anchor="${o.a || 'middle'}"${o.b ? ' font-weight="700"' : ''}${o.rot ? ` transform="rotate(${o.rot} ${x} ${y})"` : ''}>${esc(s)}</text>`;
  let top = 8, bottom = 8;
  if (sp.title) { g += T(W / 2, 22, fit(sp.title, W - 20, 15), { fs: 15, b: 1 }); top = 34; }
  const S = data.series.filter((s) => s.vals.length); const showLeg = sp.legend !== false && (S.length > 1 || sp.type === 'pie');
  const legItems = sp.type === 'pie' ? data.cats.map((c, i) => ({ name: lbl(c) || String(i + 1), color: PALETTE[i % PALETTE.length] })) : S.map((s) => ({ name: s.name, color: s.color }));
  if (showLeg && legItems.length) {
    let x = 10, y = H - 12, rows = [[]]; const wI = (it) => 22 + Math.min(it.name.length, 18) * 6.2;
    let cur = 0; for (const it of legItems) { const w = wI(it); if (cur + w > W - 16 && rows[rows.length - 1].length) { rows.push([]); cur = 0; } rows[rows.length - 1].push(it); cur += w; }
    rows = rows.slice(0, 3); bottom += rows.length * 16;
    rows.forEach((row, ri) => { const tw = row.reduce((a, it) => a + wI(it), 0); x = (W - tw) / 2; y = H - 8 - (rows.length - 1 - ri) * 16 - 3;
      row.forEach((it) => { g += `<rect x="${x}" y="${y - 8}" width="9" height="9" fill="${it.color}"/>` + T(x + 13, y, fit(it.name, 18 * 6.2, fs), { a: 'start' }); x += wI(it); }); });
  }
  if (!S.length) return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}${T(W / 2, H / 2, tr('لا توجد بيانات'), { fill: '#999' })}</svg>`;
  const n = data.n;
  if (sp.type === 'pie') {
    const vals = S[0].vals.map((v) => Math.max(0, v || 0)); const tot = vals.reduce((a, b) => a + b, 0) || 1;
    const cx = W / 2, cy = top + (H - top - bottom) / 2, R = Math.max(10, Math.min(W - 24, H - top - bottom - 8) / 2);
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      const a1_ = a0 + v / tot * Math.PI * 2, big = a1_ - a0 > Math.PI ? 1 : 0; const col = PALETTE[i % PALETTE.length];
      if (v > 0) {
        const p = (a, r) => `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
        const r0 = sp.doughnut ? R * 0.5 : 0;
        g += v / tot > 0.9999 ? `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${col}" stroke="#fff"/>` : `<path d="M${p(a0, r0)}L${p(a0, R)}A${R},${R} 0 ${big} 1 ${p(a1_, R)}L${p(a1_, r0)}${sp.doughnut ? `A${r0},${r0} 0 ${big} 0 ${p(a0, r0)}` : ''}Z" fill="${col}" stroke="#fff" stroke-width="1"/>`;
        if (v / tot > 0.04) { const am = (a0 + a1_) / 2, rr = sp.doughnut ? R * 0.75 : R * 0.65; g += T((cx + Math.cos(am) * rr).toFixed(1), (cy + Math.sin(am) * rr + 4).toFixed(1), Math.round(v / tot * 100) + '%', { fill: '#fff', b: 1 }); }
      }
      a0 = a1_;
    });
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}</svg>`;
  }
  const horiz = sp.type === 'bar', sc = sp.type === 'scatter';
  // نطاق القيم
  let mn = 0, mx = 0;
  if (sc) { /* محوران رقميان */ }
  const stackedMode = sp.stacked && (sp.type === 'col' || sp.type === 'bar' || sp.type === 'area');
  const vsMin = [], vsMax = [];
  if (stackedMode) {
    for (let i = 0; i < n; i++) { let p = 0, q = 0; for (const s of S) { const v = s.vals[i] || 0; if (v >= 0) p += v; else q += v; } vsMax.push(sp.pct ? 100 : p); vsMin.push(sp.pct ? 0 : q); }
    mx = Math.max(0, ...vsMax); mn = Math.min(0, ...vsMin);
  } else {
    const all = S.flatMap((s) => s.vals).filter((v) => v != null);
    mx = Math.max(...all, sp.type === 'line' || sc ? -Infinity : 0); mn = Math.min(...all, sp.type === 'line' || sc ? Infinity : 0);
    if (!isFinite(mx)) { mx = 1; mn = 0; }
  }
  const ys = niceScale(mn, mx);
  let xs = null;
  if (sc) { const xv = S.flatMap((s) => s.cat.map(num)).filter((v) => v != null); xs = xv.length ? niceScale(Math.min(...xv), Math.max(...xv)) : niceScale(0, n); }
  const maxLbl = Math.max(...ys.t.map((v) => fmtN(v).length));
  const L = horiz ? 10 : 12 + maxLbl * 6.4, R = 14;
  // مساحة تسميات الفئات
  const catLabels = data.cats.map(lbl);
  const maxCat = Math.max(1, ...catLabels.map((s) => s.length));
  const Lh = horiz ? 14 + Math.min(maxCat, 14) * 6.2 : L;
  const bot = bottom + 20, P = { l: Lh, r: R, t: top, b: bot };
  const pw = W - P.l - P.r, ph = H - P.t - P.b; if (pw < 20 || ph < 20) return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}</svg>`;
  const vy = (v) => P.t + ph - (v - ys.lo) / (ys.hi - ys.lo) * ph, vx = (v) => P.l + (v - ys.lo) / (ys.hi - ys.lo) * pw;
  // الشبكة وتسميات القيم
  for (const t of ys.t) {
    if (horiz) { const x = vx(t); g += `<line x1="${x}" y1="${P.t}" x2="${x}" y2="${P.t + ph}" stroke="${grid}"/>` + T(x, P.t + ph + 14, fmtN(t) + (sp.pct ? '%' : '')); }
    else { const y = vy(t); g += `<line x1="${P.l}" y1="${y}" x2="${P.l + pw}" y2="${y}" stroke="${grid}"/>` + T(P.l - 5, y + 4, fmtN(t) + (sp.pct ? '%' : ''), { a: 'end' }); }
  }
  if (sc) {
    const sx = (v) => P.l + (v - xs.lo) / (xs.hi - xs.lo) * pw;
    for (const t of xs.t) { const x = sx(t); g += `<line x1="${x}" y1="${P.t}" x2="${x}" y2="${P.t + ph}" stroke="${grid}" stroke-opacity=".5"/>` + T(x, P.t + ph + 14, fmtN(t)); }
    S.forEach((s) => { s.vals.forEach((v, i) => { const xv = num(s.cat[i]); if (v == null) return; g += `<circle cx="${sx(xv == null ? i + 1 : xv).toFixed(1)}" cy="${vy(v).toFixed(1)}" r="4" fill="${s.color}"/>`; }); });
    g += `<line x1="${P.l}" y1="${P.t + ph}" x2="${P.l + pw}" y2="${P.t + ph}" stroke="${fg}" stroke-opacity=".6"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="inherit">${g}</svg>`;
  }
  const band = (horiz ? ph : pw) / Math.max(1, n);
  const every = Math.max(1, Math.ceil((horiz ? 14 : Math.min(maxCat, 10) * 6.4 + 6) / (horiz ? band : band)));
  const zero = horiz ? vx(0) : vy(0);
  if (sp.type === 'col' || sp.type === 'bar') {
    const k = stackedMode ? 1 : S.length, gap = band * 0.2, bw = (band - gap) / k;
    for (let i = 0; i < n; i++) {
      let pos = 0, neg = 0;
      S.forEach((s, j) => {
        let v = s.vals[i]; if (v == null) return;
        let a, b;
        if (stackedMode) { if (sp.pct) v = v / (vsMax[i] ? (S.reduce((q, z) => q + Math.abs(z.vals[i] || 0), 0) / 100) : 1); if (v >= 0) { a = pos; pos += v; b = pos; } else { a = neg; neg += v; b = neg; } }
        else { a = 0; b = v; }
        const off = gap / 2 + (stackedMode ? 0 : j * bw);
        if (horiz) { const x1 = vx(Math.min(a, b)), x2 = vx(Math.max(a, b)); g += `<rect x="${x1.toFixed(1)}" y="${(P.t + i * band + off).toFixed(1)}" width="${Math.max(0.5, x2 - x1).toFixed(1)}" height="${bw.toFixed(1)}" fill="${s.color}"/>`; }
        else { const y1 = vy(Math.max(a, b)), y2 = vy(Math.min(a, b)); g += `<rect x="${(P.l + i * band + off).toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, y2 - y1).toFixed(1)}" fill="${s.color}"/>`; }
      });
      if (i % every === 0) { const t = fit(catLabels[i], horiz ? Lh - 12 : band * every, fs); g += horiz ? T(P.l - 5, P.t + i * band + band / 2 + 4, t, { a: 'end' }) : T(P.l + i * band + band / 2, P.t + ph + 14, t); }
    }
    g += horiz ? `<line x1="${zero}" y1="${P.t}" x2="${zero}" y2="${P.t + ph}" stroke="${fg}" stroke-opacity=".6"/>` : `<line x1="${P.l}" y1="${zero}" x2="${P.l + pw}" y2="${zero}" stroke="${fg}" stroke-opacity=".6"/>`;
  } else { // line / area
    const px = (i) => P.l + (n > 1 ? (sp.type === 'area' ? i / (n - 1) * pw : (i + 0.5) * band) : pw / 2);
    const base = Array(n).fill(0);
    S.forEach((s) => {
      const top_ = [], bot_ = [];
      for (let i = 0; i < n; i++) { const v = s.vals[i]; if (v == null) { top_.push(null); bot_.push(null); continue; } let vv = v; if (stackedMode) { if (sp.pct) vv = v / ((vsMax[i] && S.reduce((q, z) => q + Math.abs(z.vals[i] || 0), 0) / 100) || 1); bot_.push(vy(base[i])); base[i] += vv; vv = base[i]; } else bot_.push(vy(0)); top_.push(vy(vv)); }
      const pts = top_.map((y, i) => y == null ? null : [px(i), y]);
      if (sp.type === 'area') { const ok = pts.filter(Boolean); if (ok.length) { const bl = ok.map((p) => [p[0], bot_[pts.indexOf(p)]]).reverse(); g += `<path d="M${ok.map((p) => p.map((q) => q.toFixed(1)).join(',')).join('L')}L${bl.map((p) => p.map((q) => q.toFixed(1)).join(',')).join('L')}Z" fill="${s.color}" fill-opacity=".75" stroke="${s.color}"/>`; } }
      else {
        let d = '', pen = false; pts.forEach((p) => { if (!p) { pen = false; return; } d += (pen ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); pen = true; });
        g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.25" stroke-linejoin="round"/>`;
        pts.forEach((p) => { if (p) g += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2" fill="${s.color}"/>`; });
      }
    });
    for (let i = 0; i < n; i += every) g += T(px(i), P.t + ph + 14, fit(catLabels[i], band * every, fs));
    g += `<line x1="${P.l}" y1="${vy(0)}" x2="${P.l + pw}" y2="${vy(0)}" stroke="${fg}" stroke-opacity=".6"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="inherit">${g}</svg>`;
}

// ---------- إنشاء رسم من تحديد ----------
export function specFromSelection(sh, g, type) {
  let { r1, c1, r2, c2 } = g;
  // تحديد خلية واحدة: نوسّعه إلى المنطقة المحيطة
  if (r1 === r2 && c1 === c2) {
    const has = (r, c) => { const x = sh.cells.get(key(r, c)); return x && (x.v != null || x.f != null) && x.v !== ''; };
    if (!has(r1, c1)) return null;
    let a = r1, b = r2, c = c1, d = c2; const rowAny = (r) => { for (let x = c; x <= d; x++) if (has(r, x)) return true; return false; }, colAny = (x) => { for (let r = a; r <= b; r++) if (has(r, x)) return true; return false; };
    for (let ch = true; ch;) { ch = false; if (a > 0 && rowAny(a - 1)) { a--; ch = true; } if (rowAny(b + 1) && b < r1 + 5000) { b++; ch = true; } if (c > 0 && colAny(c - 1)) { c--; ch = true; } if (colAny(d + 1) && d < c1 + 200) { d++; ch = true; } }
    r1 = a; r2 = b; c1 = c; c2 = d;
  }
  const isNum = (r, c) => { const x = sh.cells.get(key(r, c)); return x && num(x.v) != null && typeof x.v !== 'string'; };
  const rows = r2 - r1 + 1, cols = c2 - c1 + 1;
  if (rows < 1 || cols < 1 || (rows === 1 && cols === 1)) return null;
  // هل الصف الأول عناوين؟ (نصوص فوق أرقام)
  let hdrRow = rows > 1; for (let c = c1; c <= c2; c++) if (isNum(r1, c)) { hdrRow = false; break; }
  // العمود الأول فئات إذا لم يكن كله أرقامًا
  let catCol = cols > 1; { let nn = 0, tot = 0; for (let r = r1 + (hdrRow ? 1 : 0); r <= r2; r++) { tot++; if (isNum(r, c1)) nn++; } if (tot && nn === tot) catCol = false; }
  if (type === 'scatter' && cols > 1) catCol = true;
  const d0 = r1 + (hdrRow ? 1 : 0); if (d0 > r2) return null;
  const vc0 = c1 + (catCol ? 1 : 0); if (vc0 > c2) return null;
  const series = [];
  for (let c = vc0; c <= c2; c++) {
    const s = { val: refStr(sh.name, { r1: d0, c1: c, r2, c2: c }) };
    if (hdrRow) { s.nameRef = refStr(sh.name, { r1, c1: c, r2: r1, c2: c }); const hv = cellVal(sh, r1, c); s.name = hv == null ? '' : String(hv); }
    if (catCol) s.cat = refStr(sh.name, { r1: d0, c1, r2, c2: c1 });
    series.push(s);
    if (type === 'pie') break;
  }
  const title = series.length === 1 && series[0].name ? series[0].name : '';
  return { type, stacked: false, pct: false, doughnut: false, title, legend: true, series, area: { r1, c1, r2, c2 } };
}

// ---------- كتابة XML ----------
const X = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function fillXml(c, line) { const h = (c || '#4472C4').replace('#', '').toUpperCase(); return line ? `<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${h}"/></a:solidFill><a:round/></a:ln></c:spPr>` : `<c:spPr><a:solidFill><a:srgbClr val="${h}"/></a:solidFill></c:spPr>`; }
export function buildChartXml(sp, wb) {
  const t = sp.type; const pal = (i) => PALETTE[i % PALETTE.length];
  const sers = sp.series.map((s, i) => {
    let x = `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>`;
    if (s.nameRef) x += `<c:tx><c:strRef><c:f>${X(s.nameRef)}</c:f></c:strRef></c:tx>`; else if (s.name) x += `<c:tx><c:v>${X(s.name)}</c:v></c:tx>`;
    if (t !== 'pie') x += fillXml(s.color || pal(i), t === 'line' || t === 'scatter');
    if (t === 'line') x += '<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>';
    if (t === 'scatter') x += '<c:marker><c:symbol val="circle"/><c:size val="6"/></c:marker>';
    const catNum = (t === 'scatter');
    if (s.cat) x += t === 'scatter' ? `<c:xVal><c:numRef><c:f>${X(s.cat)}</c:f></c:numRef></c:xVal>` : `<c:cat><c:strRef><c:f>${X(s.cat)}</c:f></c:strRef></c:cat>`;
    x += t === 'scatter' ? `<c:yVal><c:numRef><c:f>${X(s.val)}</c:f></c:numRef></c:yVal>` : `<c:val><c:numRef><c:f>${X(s.val)}</c:f></c:numRef></c:val>`;
    if (t === 'line' || t === 'scatter') x += '<c:smooth val="0"/>';
    void catNum; return x + '</c:ser>';
  }).join('');
  const grouping = sp.pct ? 'percentStacked' : sp.stacked ? 'stacked' : (t === 'col' || t === 'bar') ? 'clustered' : 'standard';
  let plot;
  if (t === 'col' || t === 'bar') plot = `<c:barChart><c:barDir val="${t === 'bar' ? 'bar' : 'col'}"/><c:grouping val="${grouping}"/><c:varyColors val="0"/>${sers}<c:gapWidth val="150"/>${sp.stacked ? '<c:overlap val="100"/>' : ''}<c:axId val="111111"/><c:axId val="222222"/></c:barChart>`;
  else if (t === 'line') plot = `<c:lineChart><c:grouping val="${grouping}"/><c:varyColors val="0"/>${sers}<c:marker val="1"/><c:axId val="111111"/><c:axId val="222222"/></c:lineChart>`;
  else if (t === 'area') plot = `<c:areaChart><c:grouping val="${grouping}"/><c:varyColors val="0"/>${sers}<c:axId val="111111"/><c:axId val="222222"/></c:areaChart>`;
  else if (t === 'scatter') plot = `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${sers}<c:axId val="111111"/><c:axId val="222222"/></c:scatterChart>`;
  else plot = `<c:${sp.doughnut ? 'doughnutChart' : 'pieChart'}><c:varyColors val="1"/>${sers}${sp.doughnut ? '<c:firstSliceAng val="0"/><c:holeSize val="50"/>' : '<c:firstSliceAng val="0"/>'}</c:${sp.doughnut ? 'doughnutChart' : 'pieChart'}>`;
  let axes = '';
  const ax = (id, cross, pos, kind, grid) => `<c:${kind}><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${pos}"/>${grid ? '<c:majorGridlines/>' : ''}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${cross}"/><c:crosses val="autoZero"/>${kind === 'catAx' ? '<c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/>' : '<c:crossBetween val="' + (t === 'area' || t === 'scatter' ? 'midCat' : 'between') + '"/>'}</c:${kind}>`;
  if (t === 'scatter') axes = ax(111111, 222222, 'b', 'valAx', false) + ax(222222, 111111, 'l', 'valAx', true);
  else if (t !== 'pie') axes = ax(111111, 222222, t === 'bar' ? 'l' : 'b', 'catAx', false) + ax(222222, 111111, t === 'bar' ? 'b' : 'l', 'valAx', true);
  const title = sp.title ? `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>${X(sp.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` : '';
  void wb;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:roundedCorners val="0"/><c:chart>${title}<c:autoTitleDeleted val="${sp.title ? 0 : 1}"/><c:plotArea><c:layout/>${plot}${axes}</c:plotArea>${sp.legend !== false && (sp.series.length > 1 || t === 'pie') ? '<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>' : ''}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}
const cleanChartXml = (x) => x.replace(/<(\w+:)?externalData\b[^>]*?(\/>|>[\s\S]*?<\/\1?externalData>)/g, '').replace(/<(\w+:)?userShapes\b[^>]*\/>/g, '');

// ---------- حقن الرسوم في الملف المحفوظ ----------
export async function injectCharts(buffer, wb) {
  if (!wb.sheets.some((s) => s.charts && s.charts.length)) return buffer;
  const zip = await readZip(buffer);
  const wbRels = relsOf(zip, 'xl/workbook.xml');
  const sheetEls = desc(dom(txt(zip.get('xl/workbook.xml'))), 'sheet');
  let ct = txt(zip.get('[Content_Types].xml')); let ctAdd = '';
  const nextN = (re) => { let m = 0; for (const k of zip.keys()) { const x = k.match(re); if (x) m = Math.max(m, +x[1]); } return m; };
  let chN = nextN(/^xl\/charts\/chart(\d+)\.xml$/), drN = nextN(/^xl\/drawings\/drawing(\d+)\.xml$/);
  const addRel = (path, id, type, target) => {
    const dir = path.slice(0, path.lastIndexOf('/') + 1), name = path.slice(path.lastIndexOf('/') + 1), rp = dir + '_rels/' + name + '.rels';
    let r = zip.has(rp) ? txt(zip.get(rp)) : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
    r = r.replace('</Relationships>', `<Relationship Id="${id}" Type="${NS_R}/${type}" Target="${target}"/></Relationships>`); zip.set(rp, bytes(r));
  };
  for (const sh of wb.sheets) {
    if (!sh.charts || !sh.charts.length) continue;
    const se = sheetEls.find((e) => e.getAttribute('name') === sh.name); if (!se) continue;
    const rid = [...se.attributes].find((a) => a.localName === 'id'); const rel = rid && wbRels.get(rid.value); if (!rel || !zip.has(rel.target)) continue;
    let sx = txt(zip.get(rel.target)); let drPath, drXml, existing = false;
    const dm = sx.match(/<drawing\b[^>]*\br:id="([^"]+)"/);
    if (dm) { const dp = relsOf(zip, rel.target).get(dm[1]); if (dp && zip.has(dp.target)) { drPath = dp.target; drXml = txt(zip.get(drPath)); existing = true; } }
    if (!existing) {
      drN++; drPath = `xl/drawings/drawing${drN}.xml`;
      drXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="${NS_X}" xmlns:a="${NS_A}"></xdr:wsDr>`;
      ctAdd += `<Override PartName="/${drPath}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`;
      const tag = `<drawing xmlns:r="${NS_R}" r:id="rIdJd1"/>`;
      const at = sx.search(/<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/);
      sx = at >= 0 ? sx.slice(0, at) + tag + sx.slice(at) : sx.replace('</worksheet>', tag + '</worksheet>');
      zip.set(rel.target, bytes(sx)); addRel(rel.target, 'rIdJd1', 'drawing', '../drawings/' + drPath.split('/').pop());
    }
    const ms = existing ? (drXml.match(/\bid="(\d+)"/g) || []).map((x) => +x.slice(4, -1)) : [];
    let oid = Math.max(1000, ...ms) + 1; let anchors = '';
    for (const ch of sh.charts) {
      chN++; const cpath = `xl/charts/chart${chN}.xml`;
      const xml = ch.xml ? cleanChartXml(ch.xml) : buildChartXml(ch.spec, wb);
      zip.set(cpath, bytes(xml));
      ctAdd += `<Override PartName="/${cpath}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`;
      const rId = 'rIdJc' + chN; addRel(drPath, rId, 'chart', '../charts/chart' + chN + '.xml');
      const cp = (c, r) => { const ci = Math.floor(c), ri = Math.floor(r); return `<xdr:col>${ci}</xdr:col><xdr:colOff>${Math.round((c - ci) * (sh.colW[ci] || sh.defW || DEF_W) * EMU)}</xdr:colOff><xdr:row>${ri}</xdr:row><xdr:rowOff>${Math.round((r - ri) * (sh.rowH[ri] || sh.defH || DEF_H) * EMU)}</xdr:rowOff>`; };
      const an = ch.anchor;
      anchors += `<xdr:twoCellAnchor><xdr:from>${cp(an.c1, an.r1)}</xdr:from><xdr:to>${cp(an.c2, an.r2)}</xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${oid++}" name="Chart ${chN}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="${rId}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
    }
    drXml = drXml.replace(/<\/(\w+:)?wsDr>\s*$/, anchors + '</$1wsDr>');
    zip.set(drPath, bytes(drXml));
  }
  if (ctAdd) { ct = ct.replace('</Types>', ctAdd + '</Types>'); zip.set('[Content_Types].xml', bytes(ct)); }
  return await writeZip(zip);
}

void a1;

// نسخة من الملف بلا طبقات الرسم (تُمرَّر لـ ExcelJS إن تعثّر مع ملف فيه رسوم)
export async function stripDrawings(buffer) {
  const zip = await readZip(buffer);
  for (const [k, v] of [...zip]) {
    if (/^xl\/worksheets\/sheet[^/]*\.xml$/.test(k)) zip.set(k, bytes(txt(v).replace(/<drawing\b[^>]*\/>/g, '')));
    else if (/^xl\/(drawings|charts|media)\//.test(k)) zip.delete(k);
    else if (/^xl\/worksheets\/_rels\/.*\.rels$/.test(k)) zip.set(k, bytes(txt(v).replace(/<Relationship\b[^>]*relationships\/drawing"[^>]*\/>/g, '').replace(/<Relationship\b[^>]*Type="[^"]*\/drawing"[^>]*\/>/g, '')));
  }
  return await writeZip(zip);
}
