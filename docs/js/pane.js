// لوحة عرض ملف واحد: شبكة خلايا افتراضية + شريط صيغ + تبويبات الأوراق
import { fontCss } from './fonts.js';
import { cfPrep, cfEffect } from './cf.js';
import { tr, settings } from './i18n.js';
import { key, a1, colName, rawText, displayText, isNumCell, parseInput, parseRange, esc } from './util.js';

export const HDR_W = 46, HDR_H = 24, DEF_W = 64, DEF_H = 20;

function bsearch(arr, v) { // أكبر i بحيث arr[i] <= v
  let lo = 0, hi = arr.length - 2;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (arr[m] <= v) lo = m; else hi = m - 1; }
  return Math.max(0, lo);
}

export class Pane {
  constructor(app, idx, host) {
    this.app = app; this.idx = idx; this.wb = null; this.sh = null;
    this.sel = { ar: 0, ac: 0, fr: 0, fc: 0 };
    this.editing = null; this.block = null;
    const el = this.el = document.createElement('section');
    el.className = 'pane'; el.dataset.pane = idx;
    el.innerHTML = `
      <div class="pane-head"><span class="pane-num">${idx + 1}</span><button class="pane-title file-switch" type="button"></button><span class="warn" style="display:none"></span>
        <button class="mini dir-btn" title="اتجاه الورقة (يمين لليسار / يسار لليمين)">⇄ اتجاه الورقة</button></div>
      <div class="fbar"><input class="namebox" aria-label="مرجع الخلية" spellcheck="false"><span class="fx">fx</span>
        <input class="formula" aria-label="شريط الصيغة" spellcheck="false" dir="auto"></div>
      <div class="scroller" tabindex="0">
        <div class="canvas">
          <div class="colhdr"><div class="corner" title="تحديد الكل"></div><div class="colcells"></div></div>
          <div class="rowhdr"></div>
          <div class="layer"><div class="lines"></div><div class="cells"></div>
            <div class="sel"></div><div class="act"></div><div class="marq"></div><div class="drop"></div><div class="fillbox"></div><div class="fillh" title="اسحب للتعبئة (نقرتان للتعبئة لأسفل)"></div><div class="hnd tl" title="مدّ التحديد"></div><div class="hnd br" title="مدّ التحديد"></div>
            <input class="editor" spellcheck="false" dir="auto"></div>
        </div>
      </div>
      <textarea class="sink" inputmode="none" autocomplete="off" autocapitalize="off" spellcheck="false" tabindex="-1" aria-label="الشبكة"></textarea>
      <div class="empty"><div class="empty-box"><p>اللوحة ${idx + 1} فارغة</p><button class="cta e-new">＋ مصنف جديد</button><button class="cta e-open">📂 فتح ملف</button><button class="cta e-open e-pick" hidden>🗂 اختر من الملفات المفتوحة</button><button class="cta e-open e-same" hidden>⧉ نفس الملف في اللوحتين (ورقتان)</button><p class="small">أو اختر ملفًا مفتوحًا من التبويبات بالأعلى</p></div></div>
      <div class="sheets"><button class="mini add-sheet" title="ورقة جديدة">＋</button><div class="sheet-tabs"></div></div>`;
    host.appendChild(el);
    const $ = (s) => el.querySelector(s);
    Object.assign(this, { title: $('.pane-title'), namebox: $('.namebox'), formula: $('.formula'), scroller: $('.scroller'), canvas: $('.canvas'),
      colcells: $('.colcells'), rowhdr: $('.rowhdr'), layer: $('.layer'), lines: $('.lines'), cells: $('.cells'), selEl: $('.sel'), actEl: $('.act'),
      marqEl: $('.marq'), dropEl: $('.drop'), editor: $('.editor'), tabs: $('.sheet-tabs'), corner: $('.corner'), sink: $('.sink'), warn: $('.warn'), fillh: $('.fillh'), fillbox: $('.fillbox'), hTL: $('.hnd.tl'), hBR: $('.hnd.br') });
    this.touchMode = matchMedia('(pointer:coarse)').matches;
    this.bind();
    if (this.initCharts) this.initCharts();
  }

  // ---------- ربط الملف ----------
  show(wb, view) {
    if (this.editing) this.commitEdit();
    this.saveView();
    this.wb = wb;
    this.el.classList.toggle('is-empty', !wb);
    if (!wb) { this.sh = null; this.title.textContent = ''; this.tabs.innerHTML = ''; this.selChart = null; if (this.chartsEl) this.chartsEl.innerHTML = ''; return; }
    wb._views = wb._views || {};
    const v = view || wb._views[this.idx] || { si: 0, sel: { ar: 0, ac: 0, fr: 0, fc: 0 }, st: 0, sl: 0 };
    this.setSheet(Math.min(v.si, wb.sheets.length - 1), v);
  }
  saveView() {
    if (!this.wb || !this.sh) return;
    this.wb._views[this.idx] = { si: this.wb.sheets.indexOf(this.sh), sel: { ...this.sel }, st: this.scroller.scrollTop, sl: Math.abs(this.scroller.scrollLeft) };
  }
  setSheet(si, v) {
    if (this.editing) this.commitEdit();
    this.sh = this.wb.sheets[si];
    this.sel = v && v.sel ? { ...v.sel } : { ar: 0, ac: 0, fr: 0, fc: 0 };
    this.scroller.dir = this.sh.rtl ? 'rtl' : 'ltr';
    this.autoH = null; this.domH = null; this.axes(); this.block = null;
    this.scroller.scrollTop = v ? v.st || 0 : 0;
    this.setScrollX(v ? v.sl || 0 : 0);
    this.refreshHead(); this.renderTabs(); this.render(true); this.updateSel();
  }
  refreshHead() {
    if (!this.wb) return;
    this.title.textContent = this.wb.name + (this.wb.dirty ? ' •' : '');
    const un = ''; // لا نزعج المستخدم: الدوال غير المدعومة تحتفظ بنتائجها المخزنة في الملف
    this.warn.style.display = un ? '' : 'none';
    if (un) { this.warn.textContent = 'ⓘ ' + un; this.warn.title = tr('اضغط للتفاصيل'); }
    this.title.title = tr(this.wb.dirty ? 'توجد تعديلات غير محفوظة (محفوظة تلقائيًا للاستعادة)' : 'لا توجد تعديلات غير محفوظة');
  }
  renderTabs() {
    const si = this.wb.sheets.indexOf(this.sh);
    // شريط الأوراق يتبع اتجاه الورقة كما في Excel: الورقة الأولى عند بداية الاتجاه وزر الإضافة قبلها
    this.el.querySelector('.sheets').dir = this.sh && this.sh.rtl ? 'rtl' : 'ltr';
    this.tabs.innerHTML = this.wb.sheets.map((s, i) => `<button class="stab${i === si ? ' on' : ''}" data-i="${i}"${s.tabColor ? ` style="--tc:${s.tabColor}"` : ''}>${esc(s.name)}</button>`).join('');
    const on = this.tabs.querySelector('.stab.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  setScrollX(x) { this.scroller.scrollLeft = this.sh && this.sh.rtl ? -x : x; }

  // ---------- التكبير والتصغير ----------
  setZoom(z, focus) {
    if (!this.sh) return; z = Math.max(0.25, Math.min(4, Math.round(z * 100) / 100));
    const old = this.z || 1; if (Math.abs(z - old) < 0.005) return;
    const sc = this.scroller, k = z / old, fx = focus ? focus.x : sc.clientWidth / 2, fy = focus ? focus.y : sc.clientHeight / 2;
    const sl = Math.abs(sc.scrollLeft), st = sc.scrollTop;
    this.sh.zoom = z; this.axes(); this.block = null;
    this.scroller.scrollTop = Math.max(0, (st + fy - HDR_H) * k - (fy - HDR_H));
    this.setScrollX(Math.max(0, (sl + fx - HDR_W) * k - (fx - HDR_W)));
    this.render(true); this.updateSel(); this.app.zoomChanged(this);
  }
  // ---------- المحاور والرسم ----------
  // ارتفاع الصفوف التلقائي: الخط الكبير أو النص الملتفّ يكبّر الصف (كما في Excel) بدل تصغير الخط
  calcAuto() {
    const sh = this.sh, out = new Map(); if (!sh || !sh.cells.size) return out;
    const mt = new Map(), cov = new Set();
    for (const m of sh.merges || []) { mt.set(key(m.r1, m.c1), m); for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) cov.add(key(r, c)); }
    const hr = sh.hidRows;
    for (const [k, cell] of sh.cells) {
      if (cov.has(k)) continue;
      const s = cell.s; const txt = displayText(cell); if (!txt || (s && s.rot)) continue;
      const [r, c] = k.split(',').map(Number); if (hr && hr.has(r)) continue;
      const px = ((s && s.sz) || 11) * 4 / 3, lh = px * 1.3;
      const m = mt.get(k);
      let w = sh.colW[c] || sh.defW || DEF_W, base = sh.rowH[r] || sh.defH || DEF_H, rEnd = r;
      if (m) { w = 0; base = 0; for (let x = m.c1; x <= m.c2; x++) w += sh.colW[x] || sh.defW || DEF_W; for (let y = m.r1; y <= m.r2; y++) base += sh.rowH[y] || sh.defH || DEF_H; rEnd = m.r2; }
      let need = lh + 4;
      const avail = Math.max(8, w - 18);
      if (!(s && s.fit) && (s && s.wrap || m) && txt.length * px * 0.3 > avail * 0.8) {
        let n = 0; for (const para of String(txt).split('\n')) { let cur = 0, l = 1; for (const word of para.split(/\s+/)) { const ww = this.measure(word, s, px), sp = this.measure(' ', s, px); if (cur && cur + sp + ww > avail) { l++; cur = ww; } else cur += (cur ? sp : 0) + ww; if (ww > avail) l += Math.floor(ww / avail); } n += l; }
        if (n > 1 && (s && s.wrap || this.measure(txt, s, px) > avail)) { need = n * lh + 10; if (m && !(s && s.wrap)) m.autoWrap = true; }
      }
      if (s && s.fit) need = Math.min(need, base);
      if (need > base + 1) { const last = rEnd; out.set(last, Math.max(out.get(last) || 0, (sh.rowH[last] || sh.defH || DEF_H) + (need - base))); }
    }
    if (this.domH) for (const [r, v] of this.domH) out.set(r, Math.max(out.get(r) || 0, v));
    return out;
  }
  // يعيد حساب الارتفاع التلقائي بعد تغيير المحتوى أو التنسيق
  reflow() {
    if (!this.sh) return false;
    const nu = this.calcAuto(), old = this.autoH || new Map(); let same = nu.size === old.size;
    if (same) for (const [k, v] of nu) if (Math.abs((old.get(k) || 0) - v) > 0.5) { same = false; break; }
    if (same) return false;
    this.autoH = nu; this.axes(); this.block = null; return true;
  }
  axesFull() { this.autoH = null; this.axes(); }
  axes() {
    const sh = this.sh;
    const cx = this.colX = new Float64Array(sh.ncols + 1);
    const z = this.z = sh.zoom || 1, hc = sh.hidCols, hr = sh.hidRows;
    this.layer.style.setProperty('--z', z);
    for (let c = 0; c < sh.ncols; c++) cx[c + 1] = cx[c] + (hc && hc.has(c) ? 0 : (sh.colW[c] || sh.defW || DEF_W) * z);
    const ry = this.rowY = new Float64Array(sh.nrows + 1);
    const au = this.autoH || (this.autoH = this.calcAuto());
    for (let r = 0; r < sh.nrows; r++) ry[r + 1] = ry[r] + (hr && hr.has(r) ? 0 : Math.max(sh.rowH[r] || sh.defH || DEF_H, au.get(r) || 0) * z);
    const W = cx[sh.ncols], H = ry[sh.nrows];
    this.canvas.style.width = (W + HDR_W) + 'px'; this.canvas.style.height = (H + HDR_H) + 'px';
    this.layer.style.width = W + 'px'; this.layer.style.height = H + 'px';
    this.rowhdr.style.height = H + 'px';
  }
  grow(rows, cols) {
    const sh = this.sh; let ch = false;
    if (rows > sh.nrows) { sh.nrows = rows; ch = true; }
    if (cols > sh.ncols) { sh.ncols = cols; ch = true; }
    if (ch) { this.axes(); this.block = null; }
  }
  cellHtml(r0, r1, c0, c1) {
    const sh = this.sh, cx = this.colX, ry = this.rowY;
    let html = '';
    const cells = sh.cells, z = this.z || 1, mg = sh.merges && sh.merges.length ? sh.merges : null;
    const cfi = sh.cf && sh.cf.length ? cfPrep(sh) : null;
    const cover = new Set();
    const fs = (px) => z === 1 ? `${px}px` : `${(px * z).toFixed(2)}px`;
    const rotSpan = (rot, inner) => `<span class="rt" style="writing-mode:vertical-rl;${rot === 90 ? 'transform:rotate(180deg);' : ''}${rot === 255 ? 'text-orientation:upright;' : ''}">${inner}</span>`;
    const style = (s, cls, num) => {
      let o = '';
      if (s) {
        if (s.b) o += 'font-weight:700;'; if (s.i) o += 'font-style:italic;'; if (s.u) o += 'text-decoration:underline;';
        if (s.color) o += `color:${s.color};`; if (s.fill) o += `background:${s.fill};`;
        if (s.font) o += `font-family:${fontCss(s.font)};`; if (s.sz) o += `font-size:${fs(s.sz * 4 / 3)};`;
        if (s.al) o += `text-align:${s.al};`;
        if (s.bd) { for (const [ch, side] of [['t', 'top'], ['b', 'bottom'], ['l', 'left'], ['r', 'right']]) if (s.bd.includes(ch)) o += `border-${side}:${Math.max(1, Math.round(z))}px solid ${s.bdc || 'var(--s-text)'};`; }
      }
      return o;
    };
    if (mg) for (const m of mg) {
      if (m.r2 < r0 || m.r1 > r1 || m.c2 < c0 || m.c1 > c1) continue;
      for (let r = Math.max(r0, m.r1); r <= Math.min(r1, m.r2); r++) for (let c = Math.max(c0, m.c1); c <= Math.min(c1, m.c2); c++) cover.add(key(r, c));
      const cell = cells.get(key(m.r1, m.c1)); const s = cell && cell.s; const txt = cell ? displayText(cell) : '';
      const w = cx[m.c2 + 1] - cx[m.c1], h = ry[m.r2 + 1] - ry[m.r1]; if (w <= 0 || h <= 0) continue;
      const num = cell && (isNumCell(cell) || typeof cell.v === 'boolean');
      let cls = 'c mg' + (num ? ' n' : ''); if (s && s.fill && !s.color) cls += ' f';
      let st2 = `inset-inline-start:${cx[m.c1]}px;top:${ry[m.r1]}px;width:${w}px;height:${h}px;line-height:${Math.min(h - 1, 22 * z)}px;background:${s && s.fill ? s.fill : 'var(--s-bg)'};` + style(s, cls, num);
      if (h > 30 * z) st2 += `display:flex;align-items:center;`;
      if (s && s.wrap) { st2 += 'white-space:normal;line-height:1.3;'; cls += ' wr'; }
      else if (txt && s && s.fit) { st2 += this.shrink(txt, s, w, z); cls += ' fitchk'; }
      else if (txt && this.measure(txt, s, ((s && s.sz) || 11) * 4 / 3 * z) > w - 10 * z) { st2 += 'white-space:normal;line-height:1.3;'; cls += ' wr'; }
      else if (txt && !(s && s.rot)) cls += ' cmpchk';
      html += `<div class="${cls}${s && s.rot ? ' rot' : ''}" data-rl="${m.r2}" style="${st2}">${s && s.rot ? rotSpan(s.rot, esc(txt)) : `<span>${esc(txt)}</span>`}</div>`;
    }
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = cells.get(key(r, c)); if (!cell) continue;
        if (cover.size && cover.has(key(r, c))) continue;
        const txt = displayText(cell); const fx = cfi && cfi.length ? cfEffect(cfi, sh, r, c, cell) : null; const s = fx && fx.s && Object.keys(fx.s).length ? Object.assign({}, cell.s, fx.s) : cell.s;
        if (!txt && !(s && (s.fill || s.bd)) && !(fx && fx.css)) continue;
        const num = isNumCell(cell) || typeof cell.v === 'boolean';
        let w = cx[c + 1] - cx[c];
        if (w <= 0) continue;
        // النص يمتد إلى الخلايا الفارغة المجاورة كما في Excel
        if (!num && txt && !(s && (s.al || s.fill || s.wrap || s.fit))) {
          let k = c + 1; while (k <= c1 + 6 && k < sh.ncols && !cells.has(key(r, k)) && !(mg && this.mergeAt(r, k)) && k - c < 12) { w += cx[k + 1] - cx[k]; k++; }
        }
        const hh = ry[r + 1] - ry[r]; if (hh <= 0) continue;
        let st2 = `inset-inline-start:${cx[c]}px;top:${ry[r]}px;width:${w}px;height:${hh}px;line-height:${hh - 1}px;`;
        let cls = 'c';
        if (num) cls += ' n';
        if (cell.f != null && cell.v === undefined) cls += ' pending';
        if (s) {
          st2 += style(s, cls, num);
          if (s.fill && !s.color) cls += ' f';
          if (s.wrap) { st2 += 'white-space:normal;line-height:1.3;padding-top:2px;'; cls += ' wr'; }
        }
        let sEff = s;
        if (!(s && s.wrap) && txt && (w === cx[c + 1] - cx[c])) { if (s && s.fit) { st2 += this.shrink(txt, sEff, w, z); cls += ' fitchk'; } else cls += ' cmpchk'; }
        if (fx && fx.css) st2 += fx.css;
        const inner = esc(this.sh.showF && cell.f != null ? '=' + cell.f : txt);
        html += `<div class="${cls}${s && s.rot ? ' rot' : ''}" data-rl="${r}" style="${st2}">${s && s.rot ? rotSpan(s.rot, inner) : inner}</div>`;
      }
    }
    const fl = sh.filter;
    if (fl && fl.r1 >= r0 && fl.r1 <= r1) {
      const hh = ry[fl.r1 + 1] - ry[fl.r1];
      for (let c = Math.max(c0, fl.c1); c <= Math.min(c1, fl.c2); c++) {
        const w = cx[c + 1] - cx[c]; if (w < 22 || hh < 14) continue;
        html += `<button class="fbtn${fl.hide[c] && fl.hide[c].size ? ' on' : ''}" data-c="${c}" style="inset-inline-end:auto;inset-inline-start:${cx[c + 1] - 19}px;top:${ry[fl.r1 + 1] - 19}px" title="${tr('تصفية')}">▾</button>`;
      }
    }
    return html;
  }
  render(force) {
    if (!this.sh) return;
    const sc = this.scroller, st = sc.scrollTop, sl = Math.abs(sc.scrollLeft);
    const vh = sc.clientHeight, vw = sc.clientWidth;
    const sh = this.sh;
    // توسيع الشبكة تلقائيًا عند الاقتراب من النهاية
    if (st + vh > this.rowY[sh.nrows] - 200) this.grow(sh.nrows + 500, 0);
    if (sl + vw > this.colX[sh.ncols] - 200) this.grow(0, sh.ncols + 20);
    const r0 = Math.max(0, bsearch(this.rowY, st) - 4 & ~7), r1 = Math.min(sh.nrows - 1, bsearch(this.rowY, st + vh) + 12 | 7);
    const c0 = Math.max(0, bsearch(this.colX, sl) - 2 & ~3), c1 = Math.min(sh.ncols - 1, bsearch(this.colX, sl + vw) + 6 | 3);
    const b = this.block;
    if (!force && b && b.r0 === r0 && b.r1 === r1 && b.c0 === c0 && b.c1 === c1) return;
    this.block = { r0, r1, c0, c1 };
    const cx = this.colX, ry = this.rowY;
    let lines = '';
    for (let c = c0; c <= c1 + 1; c++) lines += `<i class="vl" style="inset-inline-start:${cx[c] - 1}px;top:${ry[r0]}px;height:${ry[r1 + 1] - ry[r0]}px"></i>`;
    for (let r = r0; r <= r1 + 1; r++) lines += `<i class="hl" style="top:${ry[r] - 1}px;inset-inline-start:${cx[c0]}px;width:${cx[c1 + 1] - cx[c0]}px"></i>`;
    this.lines.innerHTML = lines;
    this.cells.innerHTML = this.cellHtml(r0, r1, c0, c1);
    this.renderFrozen(r0, r1, c0, c1);
    this.fitPass(this.el); clearTimeout(this._ft); this._ft = setTimeout(() => { if (this.sh) this.fitPass(this.el); }, 400); // الخطوط تُحمَّل متأخرة فيتغير العرض
    this.renderHeaders();
    if (this.renderCharts) this.renderCharts();
    if (this.renderExtras) this.renderExtras();
  }
  // قياس حقيقي من المتصفح: أي نص ما زال أعرض من خليته (اختلاف الخط عن القياس التقريبي) يُصغَّر ليتسع
  fitPass(root) {
    const els = [...root.querySelectorAll('.fitchk')]; const cm = [...root.querySelectorAll('.cmpchk')];
    if (!els.length && !cm.length) return;
    const jobs = [], rtl = !!(this.sh && this.sh.rtl);
    for (const el of els) {
      const t = el.firstElementChild && el.firstElementChild.tagName === 'SPAN' ? el.firstElementChild : null;
      const avail = el.clientWidth - 6; if (avail < 6) continue;
      const rg = document.createRange(); rg.selectNodeContents(t || el); const need = rg.getBoundingClientRect().width; // scrollWidth لا يحسب الفائض نحو اليسار في RTL
      if (need > avail + 1) jobs.push([el, avail / need]);
    }
    for (const [el, k] of jobs) { const fs = parseFloat(getComputedStyle(el).fontSize) || 14; el.style.fontSize = Math.max(5, fs * k * 0.97).toFixed(2) + 'px'; }
    // نص أعرض من خليته ولا يمكنه التمدد: نضغطه أفقيًا (الارتفاع كما هو) بدل أن يُقطع
    const cj = [];
    for (const el of cm) {
      const host = el.classList.contains('mg') && el.firstElementChild && el.firstElementChild.tagName === 'SPAN' && !el.firstElementChild.classList.contains('cmp') ? el.firstElementChild : el;
      const old = host.firstElementChild; if (old && old.classList.contains('cmp')) { host.innerHTML = old.innerHTML; }
      const avail = host.clientWidth - 8; if (avail < 6) continue;
      const rg = document.createRange(); rg.selectNodeContents(host); const need = rg.getBoundingClientRect().width;
      if (need > avail + 1) cj.push([host, avail / need, el]);
    }
    for (const [el, k, outer] of cj) {
      const sx = Math.max(0.72, k), al = getComputedStyle(outer).textAlign;
      const fk = k < 0.72 ? k / 0.72 : 1; // أضيق من 72%: نصغّر الخط قليلًا أيضًا كي لا يُقطع
      el.innerHTML = `<span class="cmp" style="display:inline-block;transform-origin:left top;transform:scaleX(${sx.toFixed(3)})${fk < 1 ? `;font-size:${(fk * 100).toFixed(1)}%` : ''}">${el.innerHTML}</span>`;
      // المحاذاة الفعلية: نقيس موضع النص بعد الضغط ونزيحه إلى حيث تضعه المحاذاة (وسط/بداية/نهاية)
      const sp = el.firstElementChild, a = sp.getBoundingClientRect(), c = el.getBoundingClientRect();
      const rtlCell = getComputedStyle(el).direction === 'rtl'; const side = al === 'center' ? 'c' : al === 'left' ? 'l' : al === 'right' ? 'r' : (rtlCell ? 'r' : 'l');
      const want = side === 'c' ? c.left + (c.width - a.width) / 2 : side === 'l' ? c.left + 4 : c.right - 4 - a.width;
      sp.style.transform = `translateX(${(want - a.left).toFixed(1)}px) ` + sp.style.transform;
    }
    // نص ملتفّ ما زال أطول من خليته (قياس المتصفح الحقيقي): نكبّر الصف بدل أن يُقطع
    const z = this.z || 1; let grew = false; this.domH = this.domH || new Map();
    for (const el of root.querySelectorAll('.wr[data-rl]')) {
      const rg = document.createRange(); rg.selectNodeContents(el); const ex = rg.getBoundingClientRect().height - el.clientHeight + 4; if (ex <= 1) continue; // قياس حقيقي (scrollHeight لا يحسب الفائض للأعلى)
      const r = +el.dataset.rl, cur = Math.max(this.sh.rowH[r] || sh.defH || DEF_H, (this.autoH && this.autoH.get(r)) || 0, this.domH.get(r) || 0), nv = cur + ex / z + 2;
      if (nv > cur + 0.5) { this.domH.set(r, nv); grew = true; }
    }
    if (grew && !this._rg) { this._rg = true; requestAnimationFrame(() => { this._rg = false; this.autoH = null; this.axes(); this.block = null; this.render(true); this.updateSel(); }); }
  }
  // يقيس عرض النص بالبكسل (لتصغير الخط تلقائيًا عندما لا تتسع الخلية كي لا يتداخل النص)
  measure(txt, s, px) {
    const m = this._fm || (this._fm = document.createElement('canvas').getContext('2d'));
    m.font = `${s && s.i ? 'italic ' : ''}${s && s.b ? '700 ' : ''}${px}px ${fontCss((s && s.font) || 'Calibri')}`;
    return m.measureText(txt).width;
  }
  shrink(txt, s, w, z) {
    const px = ((s && s.sz) || 11) * 4 / 3 * z, avail = w - 10 * z;
    if (!txt || avail <= 4 || txt.length * px * 0.42 < avail) return '';
    const tw = this.measure(txt, s, px); if (tw <= avail * 0.97) return '';
    return `font-size:${(px * Math.max(0.4, avail * 0.94 / tw)).toFixed(2)}px;`;
  }
  // نص ملتفّ: يصغَّر الخط حتى يتسع في ارتفاع الخلية بدل أن يُقطع
  fitWrap(txt, s, w, h, z) {
    const base = ((s && s.sz) || 11) * 4 / 3 * z, avail = Math.max(8, w - 10 * z), maxH = h - 6 * z;
    const lines = (px) => { let n = 0; for (const para of String(txt).split('\n')) { let cur = 0, l = 1; for (const word of para.split(/\s+/)) { const ww = this.measure(word, s, px), sp = this.measure(' ', s, px); if (cur && cur + sp + ww > avail) { l++; cur = ww; } else cur += (cur ? sp : 0) + ww; if (ww > avail) l += Math.floor(ww / avail); } n += l; } return n; };
    for (let k = 1; k >= 0.4; k -= 0.06) { const px = base * k; if (lines(px) * px * 1.3 <= maxH) return k < 1 ? `font-size:${px.toFixed(2)}px;` : ''; }
    return `font-size:${(base * 0.4).toFixed(2)}px;`;
  }
  renderHeaders() {
    if (!this.block) return;
    const { r0, r1, c0, c1 } = this.block, cx = this.colX, ry = this.rowY, g = this.range();
    let h = '';
    for (let c = c0; c <= c1; c++) h += `<div class="ch${c >= g.c1 && c <= g.c2 ? ' on' : ''}" style="inset-inline-start:${cx[c]}px;width:${cx[c + 1] - cx[c]}px">${colName(c)}</div>`;
    this.colcells.innerHTML = h; h = '';
    for (let r = r0; r <= r1; r++) h += `<div class="rh${r >= g.r1 && r <= g.r2 ? ' on' : ''}" style="top:${ry[r]}px;height:${ry[r + 1] - ry[r]}px">${r + 1}</div>`;
    this.rowhdr.innerHTML = h;
  }
  box(el, r1, c1, r2, c2) {
    const cx = this.colX, ry = this.rowY;
    el.style.cssText = `display:block;inset-inline-start:${cx[c1]}px;top:${ry[r1]}px;width:${cx[c2 + 1] - cx[c1]}px;height:${ry[r2 + 1] - ry[r1]}px`;
    const f = this.sh.freeze; // الخلايا المثبتة تتحرك مع التمرير فيجب أن يتبعها التحديد
    if (f && (f.rows || f.cols)) { const sc = this.scroller; const ty = r2 < f.rows ? sc.scrollTop : 0, tx = c2 < f.cols ? sc.scrollLeft : 0; if (ty || tx) el.style.transform = `translate(${tx}px,${ty}px)`; }
  }

  // ---------- التحديد ----------
  range() { const s = this.sel; return { r1: Math.min(s.ar, s.fr), r2: Math.max(s.ar, s.fr), c1: Math.min(s.ac, s.fc), c2: Math.max(s.ac, s.fc) }; }
  select(ar, ac, fr = ar, fc = ac, scroll = true) {
    const sh = this.sh;
    const cl = (v, m) => Math.max(0, Math.min(m - 1, v));
    this.grow(Math.max(ar, fr) + 50, Math.max(ac, fc) + 5);
    this.sel = { ar: cl(ar, sh.nrows), ac: cl(ac, sh.ncols), fr: cl(fr, sh.nrows), fc: cl(fc, sh.ncols) };
    if (sh.merges && sh.merges.length) this.expandMerges();
    if (scroll) this.scrollTo(this.sel.fr, this.sel.fc);
    this.updateSel();
  }
  mergeAt(r, c) { const mg = this.sh.merges; if (mg) for (const m of mg) if (r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2) return m; return null; }
  // التحديد يشمل الخلايا المدمجة كاملة (كما في Excel)
  expandMerges() {
    const g = this.range(), s = this.sel; let { r1, r2, c1, c2 } = g, ch = true;
    while (ch) {
      ch = false;
      for (const m of this.sh.merges) if (m.r1 <= r2 && m.r2 >= r1 && m.c1 <= c2 && m.c2 >= c1 && (m.r1 < r1 || m.r2 > r2 || m.c1 < c1 || m.c2 > c2)) { r1 = Math.min(r1, m.r1); r2 = Math.max(r2, m.r2); c1 = Math.min(c1, m.c1); c2 = Math.max(c2, m.c2); ch = true; }
    }
    if (r1 !== g.r1 || r2 !== g.r2 || c1 !== g.c1 || c2 !== g.c2) this.sel = { ar: r1, ac: c1, fr: r2, fc: c2 };
    else if (s.ar === s.fr && s.ac === s.fc) { /* خلية عادية */ }
  }
  // الخلية النشطة (مع امتدادها إن كانت مدمجة)
  actBox() { const s = this.sel, m = this.sh.merges && this.mergeAt(s.ar, s.ac); return m && m.r1 === s.ar && m.c1 === s.ac ? m : { r1: s.ar, c1: s.ac, r2: s.ar, c2: s.ac }; }
  updateSel() {
    if (!this.sh) return;
    if (this.showNoteBubble && this.noteEl) this.showNoteBubble();
    const g = this.range(), s = this.sel;
    this.box(this.selEl, g.r1, g.c1, g.r2, g.c2);
    this.selEl.classList.toggle('multi', g.r1 !== g.r2 || g.c1 !== g.c2);
    { const a = this.actBox(); this.box(this.actEl, a.r1, a.c1, a.r2, a.c2); }
    const cx = this.colX, ry = this.rowY, th = this.handlesOn() && !this.editing;
    if (this.editing) this.fillh.style.cssText = 'display:none';
    else if (th) this.fillh.style.cssText = `display:block;inset-inline-start:${(cx[g.c1] + cx[g.c2 + 1]) / 2}px;top:${ry[g.r2 + 1]}px`;
    else this.fillh.style.cssText = `display:block;inset-inline-start:${cx[g.c2 + 1] - 5}px;top:${ry[g.r2 + 1] - 5}px`;
    this.fillh.classList.toggle('bar', th);
    this.hTL.style.cssText = th ? `display:block;inset-inline-start:${cx[g.c1]}px;top:${ry[g.r1]}px` : 'display:none';
    this.hBR.style.cssText = th ? `display:block;inset-inline-start:${cx[g.c2 + 1]}px;top:${ry[g.r2 + 1]}px` : 'display:none';
    this.namebox.value = g.r1 === g.r2 && g.c1 === g.c2 ? a1(s.ar, s.ac) : a1(g.r1, g.c1) + ':' + a1(g.r2, g.c2);
    if (!this.editing) this.formula.value = rawText(this.sh.cells.get(key(s.ar, s.ac)));
    this.renderHeaders();
    this.showMarquee();
    this.app.onSelection(this);
  }
  handlesOn() { return this.touchMode && settings.handles !== false; }
  applyPrefs() { this.updateSel(); }
  setTouchMode(b) { if (this.touchMode !== b) { this.touchMode = b; if (this.sh) this.updateSel(); } }
  showMarquee() {
    const cl = this.app.clip;
    if (cl && cl.cut && cl.wbId === this.wb.id && cl.sheetId === this.sh.id) this.box(this.marqEl, cl.r1, cl.c1, cl.r2, cl.c2);
    else this.marqEl.style.display = 'none';
  }
  scrollTo(r, c) {
    const sc = this.scroller, cx = this.colX, ry = this.rowY;
    const vh = sc.clientHeight - HDR_H, vw = sc.clientWidth - HDR_W;
    const fz = this.sh.freeze, fh = fz && fz.rows ? ry[Math.min(fz.rows, this.sh.nrows)] : 0, fw = fz && fz.cols ? cx[Math.min(fz.cols, this.sh.ncols)] : 0;
    if (!(fz && r < fz.rows)) { if (ry[r] < sc.scrollTop + fh) sc.scrollTop = Math.max(0, ry[r] - fh); else if (ry[r + 1] > sc.scrollTop + vh) sc.scrollTop = ry[r + 1] - vh; }
    const sl = Math.abs(sc.scrollLeft);
    if (!(fz && c < fz.cols)) { if (cx[c] < sl + fw) this.setScrollX(Math.max(0, cx[c] - fw)); else if (cx[c + 1] > sl + vw) this.setScrollX(cx[c + 1] - vw); }
    this.render();
  }
  hit(clientX, clientY, clamp = true) {
    if (!this.sh) return null;
    const rc = this.layer.getBoundingClientRect();
    let x = this.sh.rtl ? rc.right - clientX : clientX - rc.left, y = clientY - rc.top;
    const f = this.sh.freeze;
    if (f && (f.rows || f.cols)) { // المنطقة المثبتة تبقى في مكانها على الشاشة مهما كان التمرير
      const sr = this.scroller.getBoundingClientRect();
      if (f.rows) { const vy = clientY - sr.top - HDR_H; if (vy >= 0 && vy < this.rowY[Math.min(f.rows, this.sh.nrows)]) y = vy; }
      if (f.cols) { const vx = this.sh.rtl ? sr.right - clientX - HDR_W : clientX - sr.left - HDR_W; if (vx >= 0 && vx < this.colX[Math.min(f.cols, this.sh.ncols)]) x = vx; }
    }
    if (!clamp && (x < 0 || y < 0)) return null;
    return { r: bsearch(this.rowY, Math.max(0, y)), c: bsearch(this.colX, Math.max(0, x)) };
  }
  inSel(r, c) { const g = this.range(); return r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2 && (g.r1 !== g.r2 || g.c1 !== g.c2); }

  // ---------- التحرير ----------
  startEdit(initial, mode = 'edit') {
    if (!this.sh || this.editing) return;
    if (this.sh.protect) { this.app.toast('الورقة محمية. ألغِ الحماية من تبويب مراجعة لتعديلها.'); return; }
    const s = this.sel; this.select(s.ar, s.ac, s.ar, s.ac);
    const cell = this.sh.cells.get(key(s.ar, s.ac));
    this.editing = { r: s.ar, c: s.ac, mode, orig: rawText(cell) };
    const ed = this.editor;
    const ab = this.actBox(); this.box(ed, ab.r1, ab.c1, ab.r2, ab.c2);
    const st = (cell && cell.s) || {};
    ed.inputMode = this.app.kpActive && this.app.kpActive() && !this.app.sysKb ? 'none' : 'text';
    ed.style.overflow = 'hidden'; ed.style.boxSizing = 'border-box';
    ed.style.fontFamily = st.font ? fontCss(st.font) : ''; ed.style.fontSize = st.sz ? `calc(${st.sz * 4 / 3}px * var(--z,1))` : '';
    ed.style.fontWeight = st.b ? '700' : ''; ed.style.fontStyle = st.i ? 'italic' : '';
    // نفس لون الخلية وتعبئتها، كي لا يختفي النص الأبيض على الخلفية البنفسجية داخل المحرر
    ed.style.background = st.fill || ''; ed.style.color = st.color || '';
    // الموضع بخصائص فيزيائية كي لا يتأثر بتغيّر اتجاه النص داخل المحرر
    const rtl = this.sh.rtl, x0 = this.colX[s.ac];
    ed.style.insetInlineStart = 'auto'; ed.style.left = rtl ? 'auto' : x0 + 'px'; ed.style.right = rtl ? x0 + 'px' : 'auto';
    this.editing.w = this.colX[ab.c2 + 1] - x0; this.editing.x0 = x0;
    ed.value = initial != null ? initial : this.editing.orig;
    this.fitEditor();
    this.formula.value = ed.value;
    ed.focus({ preventScroll: true });
    const n = ed.value.length; ed.setSelectionRange(n, n);
  }
  // الصيغ والأرقام تُكتب من اليسار لليمين (كما في Excel)، والنص بحسب اتجاه الورقة؛ والمحرر يتسع مع النص دون أن يخرج من الشاشة
  fitEditor() {
    const ed = this.editor, v = ed.value, e = this.editing; if (!e) return;
    const ltr = /^[=+\-@]/.test(v) || /^[\d.,\-+%$ ]*$/.test(v) && v !== '';
    ed.dir = ltr ? 'ltr' : (this.sh.rtl ? 'rtl' : 'ltr'); ed.style.textAlign = ltr ? 'left' : '';
    const m = this._m || (this._m = document.createElement('canvas').getContext('2d'));
    const cs = getComputedStyle(ed); m.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const need = Math.ceil(m.measureText(v).width) + 28;
    const sc = this.scroller, vis = sc.clientWidth - HDR_W - 8;
    const startVis = this.sh.rtl ? Math.abs(sc.scrollLeft) : sc.scrollLeft;
    const room = Math.max(e.w, vis - Math.max(0, e.x0 - startVis));
    ed.style.width = Math.min(Math.max(e.w, need), room) + 'px';
  }
  commitEdit(fromFormula) {
    const e = this.editing; if (!e) return false;
    this.editing = null; this.app.sysKb = false;
    const text = fromFormula ? this.formula.value : this.editor.value;
    if (document.activeElement === this.editor) this.sink.focus({ preventScroll: true });
    this.editor.style.display = 'none';
    if (text !== e.orig) {
      const old = this.sh.cells.get(key(e.r, e.c));
      const nv = parseInput(text);
      const cell = nv ? { ...nv, ...(old && old.s ? { s: old.s } : {}) } : (old && old.s ? { v: null, s: old.s } : null);
      this.app.applyChanges(this.wb, this.sh, [{ r: e.r, c: e.c, cell }]);
    }
    this.updateSel();
    return true;
  }
  cancelEdit() {
    if (!this.editing) return; this.editing = null; this.app.sysKb = false;
    this.editor.style.display = 'none'; this.updateSel(); this.focus();
  }
  focus() { this.sink.focus({ preventScroll: true }); }

  move(dr, dc, extend) {
    const s = this.sel;
    if (extend) this.select(s.ar, s.ac, s.fr + dr, s.fc + dc);
    else {
      const a = this.sh.merges && this.sh.merges.length ? this.actBox() : null;
      let r = s.ar, c = s.ac;
      if (a) { r = dr > 0 ? a.r2 : a.r1; c = dc > 0 ? a.c2 : a.c1; }
      this.select(r + dr, c + dc);
    }
  }
  jump(dr, dc) { // Ctrl+سهم: حافة البيانات
    const s = this.sel, has = (r, c) => this.sh.cells.has(key(r, c));
    let r = s.fr, c = s.fc;
    const maxR = this.sh.nrows - 1, maxC = this.sh.ncols - 1;
    const step = () => { r += dr; c += dc; return r >= 0 && c >= 0 && r <= maxR && c <= maxC; };
    if (has(r, c) && has(r + dr, c + dc)) { while (step() && has(r + dr, c + dc)); }
    else { while (step() && !has(r, c)); if (r < 0 || c < 0 || r > maxR || c > maxC) { r = Math.max(0, Math.min(maxR, r)); c = Math.max(0, Math.min(maxC, c)); } }
    return { r, c };
  }

  // ---------- الأحداث ----------
  bind() {
    const sc = this.scroller;
    let raf = 0;
    sc.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; this.render(); if (this.sh && this.sh.freeze) this.updateSel(); }); }, { passive: true });
    this.el.addEventListener('pointerdown', () => this.app.setActive(this.idx), true);
    this.el.addEventListener('touchstart', () => this.app.setActive(this.idx), { capture: true, passive: true });

    // التكبير: قرصة بإصبعين أو Ctrl+عجلة الفأرة
    let pz = null;
    sc.addEventListener('touchstart', (e) => { if (e.touches.length === 2 && this.sh) { const [a, b] = e.touches; pz = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: this.z || 1 }; if (this.editing) this.commitEdit(); } else pz = null; }, { passive: true });
    sc.addEventListener('touchmove', (e) => {
      if (!pz || e.touches.length !== 2) return; e.preventDefault();
      const [a, b] = e.touches, d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), r = sc.getBoundingClientRect();
      const z = pz.z * d / pz.d; if (!pz.raf) pz.raf = requestAnimationFrame(() => { pz && (pz.raf = 0); this.setZoom(z, { x: (a.clientX + b.clientX) / 2 - r.left, y: (a.clientY + b.clientY) / 2 - r.top }); });
    }, { passive: false });
    sc.addEventListener('touchend', () => { pz = null; }, { passive: true });
    sc.addEventListener('wheel', (e) => { if (!(e.ctrlKey || e.metaKey) || !this.sh) return; e.preventDefault(); const r = sc.getBoundingClientRect(); this.setZoom((this.z || 1) * (e.deltaY < 0 ? 1.1 : 1 / 1.1), { x: e.clientX - r.left, y: e.clientY - r.top }); }, { passive: false });

    // الماوس والقلم
    let drag = null;
    this.layer.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') this.setTouchMode(e.pointerType === 'pen' ? this.touchMode : false);
      this.app.hideMini();
      if (e.pointerType === 'touch' || e.button > 0 || e.target === this.editor || (e.target.closest && e.target.closest('.fbtn'))) return;
      if (this.editing) this.commitEdit();
      e.preventDefault(); this.focus();
      const h = this.hit(e.clientX, e.clientY);
      if (e.shiftKey) { this.select(this.sel.ar, this.sel.ac, h.r, h.c, false); drag = { mode: 'sel' }; }
      else if (this.inSel(h.r, h.c)) drag = { mode: 'maybe', x: e.clientX, y: e.clientY, h };
      else { this.select(h.r, h.c, h.r, h.c, false); drag = { mode: 'sel' }; }
      this.layer.setPointerCapture(e.pointerId);
    });
    this.layer.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (drag.mode === 'sel') { this.autoScroll(e); const h = this.hit(e.clientX, e.clientY); if (h.r !== this.sel.fr || h.c !== this.sel.fc) this.select(this.sel.ar, this.sel.ac, h.r, h.c, false); }
      else if (drag.mode === 'maybe' && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) { drag.mode = 'drag'; this.app.dragStart(this, drag.h, e); }
      else if (drag.mode === 'drag') this.app.dragMove(e.clientX, e.clientY);
    });
    const up = (e) => {
      if (!drag) return;
      if (drag.mode === 'maybe') this.select(drag.h.r, drag.h.c, drag.h.r, drag.h.c, false);
      if (drag.mode === 'drag') this.app.dragEnd(e.type === 'pointercancel');
      drag = null;
    };
    this.layer.addEventListener('pointerup', up); this.layer.addEventListener('pointercancel', up);
    this.cells.addEventListener('click', (e) => { const b = e.target.closest('.fbtn'); if (b) { e.stopPropagation(); this.app.filterMenu(this, +b.dataset.c, b); } });
    this.layer.addEventListener('dblclick', (e) => { if (e.target !== this.editor) this.startEdit(); });

    // اللمس: نقرة = تحديد، نقرتان = تحرير، ضغطة مطوّلة ثم سحب = تحديد نطاق، ضغطة مطوّلة على نطاق محدد ثم سحب = نقل نسخة إلى الملف الآخر
    let t = null, lastTap = null;
    this.layer.addEventListener('touchstart', (e) => {
      this.setTouchMode(true); this.app.hideMini();
      if (e.touches.length !== 1 || e.target === this.editor || (e.target.closest && e.target.closest('.fbtn'))) { t = null; return; }
      const p = e.touches[0]; const h = this.hit(p.clientX, p.clientY);
      t = { x: p.clientX, y: p.clientY, h, mode: 'none', moved: false };
      t.timer = setTimeout(() => {
        if (!t || t.moved) return;
        if (this.editing) this.commitEdit();
        if (this.inSel(h.r, h.c)) { t.mode = 'drag'; this.app.dragStart(this, h, { clientX: t.x, clientY: t.y }); }
        else { t.mode = 'sel'; this.select(h.r, h.c, h.r, h.c, false); }
        if (navigator.vibrate) navigator.vibrate(15);
      }, 420);
    }, { passive: true });
    this.layer.addEventListener('touchmove', (e) => {
      if (!t) return; const p = e.touches[0];
      if (t.mode !== 'none' && Math.hypot(p.clientX - t.x, p.clientY - t.y) > 10) t.dragMoved = true;
      if (t.mode === 'none') { if (Math.hypot(p.clientX - t.x, p.clientY - t.y) > 10) { t.moved = true; clearTimeout(t.timer); } return; }
      e.preventDefault();
      if (t.mode === 'sel') { const h = this.hit(p.clientX, p.clientY); this.autoScroll(p); this.select(this.sel.ar, this.sel.ac, h.r, h.c, false); }
      else this.app.dragMove(p.clientX, p.clientY);
    }, { passive: false });
    this.layer.addEventListener('touchend', (e) => {
      if (!t) return; clearTimeout(t.timer);
      if (t.mode === 'drag') { if (!t.dragMoved && settings.miniBar !== false) { this.app.dragEnd(true); this.app.showMini(this); } else this.app.dragEnd(!t.dragMoved); }
      else if (t.mode === 'sel' && !t.dragMoved && settings.miniBar !== false) this.app.showMini(this);
      else if (t.mode === 'none' && !t.moved) {
        const { r, c } = t.h; const now = Date.now();
        const same = !!(lastTap && lastTap.r === r && lastTap.c === c && now - lastTap.t < 350);
        const n = same ? Math.min(3, (lastTap.n || 1) + 1) : 1;
        // الضغطة الثانية والثالثة: لا نمنع حدث click، لأن أندرويد لا يُظهر كيبورد الجهاز إلا من click حقيقي
        if (n >= 2) { const go = () => { document.removeEventListener('click', go, true); clearTimeout(tm); if (this.app.openSysKeyboard) this.app.openSysKeyboard(this); }; const tm = setTimeout(go, 450); document.addEventListener('click', go, true); }
        else e.preventDefault();
        if (this.editing && n < 3) this.commitEdit();
        if (same) {
          clearTimeout(lastTap.mt);
          if (n === 2) { // الضغطة الثانية: تعديل القيمة بكيبورد الجهاز
            this.select(r, c, r, c, false); const cell = this.sh.cells.get(key(r, c));
            this.startEdit(cell ? displayText(cell) : ''); if (this.editing) this.editor.select();
          } else { // الضغطة الثالثة: الفورميلا
            if (!this.editing) { this.select(r, c, r, c, false); this.startEdit(); }
            const cell = this.sh.cells.get(key(r, c)); const raw = cell ? rawText(cell) : '';
            if (this.editing) { this.editor.value = raw; this.formula.value = raw; this.fitEditor(); const L = raw.length; this.editor.setSelectionRange(L, L); }
          }
          lastTap = n === 3 ? null : { r, c, t: now, n };
        }
        else {
          const was = this.inSel(r, c) || (this.sel.ar === r && this.sel.ac === c && this.sel.fr === r && this.sel.fc === c);
          if (!was) this.select(r, c, r, c, false);
          lastTap = { r, c, t: now, n: 1 }; this.focus();
          // لمسة على خلية محددة أصلًا تُظهر شريط الأدوات العائم (إن لم تأتِ لمسة ثانية)
          if (was && settings.miniBar !== false) lastTap.mt = setTimeout(() => { if (lastTap && !this.editing) this.app.showMini(this); }, 330);
        }
      }
      t = null;
    });
    this.layer.addEventListener('touchcancel', () => { if (t && t.mode === 'drag') this.app.dragEnd(true); t = null; });

    // العناوين: تحديد الصفوف/الأعمدة، وتغيير الحجم بسحب الحافة (نقرتان = ملاءمة تلقائية)
    const edge = (e, kind) => {
      if (!this.sh) return null;
      const rc = this.layer.getBoundingClientRect(), th = e.pointerType === 'touch' ? 12 : 4;
      if (kind === 'col') {
        const x = this.sh.rtl ? rc.right - e.clientX : e.clientX - rc.left, c = bsearch(this.colX, Math.max(0, x));
        if (c > 0 && x - this.colX[c] <= th) return c - 1;
        if (this.colX[c + 1] - x <= th) return c;
      } else {
        const y = e.clientY - rc.top, r = bsearch(this.rowY, Math.max(0, y));
        if (r > 0 && y - this.rowY[r] <= th) return r - 1;
        if (this.rowY[r + 1] - y <= th) return r;
      }
      return null;
    };
    const hdr = (e, kind) => {
      if (!this.sh) return; e.preventDefault(); if (this.editing) this.commitEdit(); this.focus();
      const ed = kind === 'all' ? null : edge(e, kind);
      if (ed != null) return this.startResize(e, kind, ed);
      const h = this.hit(e.clientX, e.clientY);
      const R = this.sh.nrows - 1, C = this.sh.ncols - 1, s = this.sel;
      if (kind === 'col') { if (e.shiftKey) this.select(0, s.ac, R, h.c, false); else this.select(0, h.c, R, h.c, false); }
      else if (kind === 'row') { if (e.shiftKey) this.select(s.ar, 0, h.r, C, false); else this.select(h.r, 0, h.r, C, false); }
      else this.select(0, 0, R, C, false);
    };
    this.colcells.addEventListener('pointerdown', (e) => hdr(e, 'col'));
    this.rowhdr.addEventListener('pointerdown', (e) => hdr(e, 'row'));
    this.corner.addEventListener('pointerdown', (e) => hdr(e, 'all'));
    const hover = (el, kind) => el.addEventListener('pointermove', (e) => { if (e.buttons || !this.sh) return; el.style.cursor = edge(e, kind) != null ? (kind === 'col' ? 'col-resize' : 'row-resize') : ''; });
    hover(this.colcells, 'col'); hover(this.rowhdr, 'row');
    this.colcells.addEventListener('dblclick', (e) => { const c = edge(e, 'col'); if (c != null) this.autofit('col', c); });
    this.rowhdr.addEventListener('dblclick', (e) => { const r = edge(e, 'row'); if (r != null) this.autofit('row', r); });

    // مقابض التحديد (دوائر الزوايا): تمدّ النطاق مع بقاء الزاوية المقابلة ثابتة
    const bindHandle = (el, which) => {
      el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation(); this.focus(); this.app.hideMini(); el.setPointerCapture(e.pointerId);
        const g = this.range(), anc = which === 'br' ? { r: g.r1, c: g.c1 } : { r: g.r2, c: g.c2 };
        const hr = el.getBoundingClientRect(), sr = this.selEl.getBoundingClientRect();
        const ox = hr.left + hr.width / 2 - e.clientX, oy = hr.top + hr.height / 2 - e.clientY;
        const ix = Math.sign(sr.left + sr.width / 2 - (hr.left + hr.width / 2)) * 4 || 4, iy = Math.sign(sr.top + sr.height / 2 - (hr.top + hr.height / 2)) * 4 || 4;
        const mv = (ev) => { this.autoScroll(ev); const h = this.hit(ev.clientX + ox + ix, ev.clientY + oy + iy, true); this.select(anc.r, anc.c, h.r, h.c, false); };
        const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
        el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      });
    };
    bindHandle(this.hTL, 'tl'); bindHandle(this.hBR, 'br');
    this.layer.addEventListener('contextmenu', (e) => { if (!this.sh) return; e.preventDefault(); const h = this.hit(e.clientX, e.clientY); if (h && !this.inSel(h.r, h.c)) this.select(h.r, h.c, h.r, h.c, false); this.app.showMini(this, { x: e.clientX, y: e.clientY }); });
    sc.addEventListener('scroll', () => this.app.hideMini(), { passive: true });

    // مقبض التعبئة
    const fh = this.fillh;
    fh.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    fh.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.focus(); this.startFill(e); });
    fh.addEventListener('dblclick', (e) => { e.stopPropagation(); this.app.fillDownToData(this); });

    // مستقبل لوحة المفاتيح: حقل مخفي لا يُظهر لوحة المفاتيح الافتراضية، ويلتقط الكتابة (بما فيها العربية) والنسخ واللصق
    this.sink.addEventListener('input', () => { const v = this.sink.value; this.sink.value = ''; if (v && this.sh && !this.editing) this.startEdit(v, 'enter'); });
    this.scroller.addEventListener('focus', () => this.focus());

    // المحرر داخل الخلية
    const ed = this.editor;
    // المتصفح قد يمرّر الشيت ليُظهر المؤشر أثناء الكتابة؛ نثبّت العرض على الخلية المحررة
    let lock = null;
    const relock = () => { if (lock) { const sc = this.scroller; if (sc.scrollLeft !== lock.l) sc.scrollLeft = lock.l; if (sc.scrollTop !== lock.t) sc.scrollTop = lock.t; } };
    ed.addEventListener('keydown', () => { lock = { l: this.scroller.scrollLeft, t: this.scroller.scrollTop }; setTimeout(() => { relock(); lock = null; }, 0); }, true);
    this.scroller.addEventListener('scroll', () => { if (lock) relock(); });
    ed.addEventListener('input', () => { this.formula.value = ed.value; this.fitEditor(); relock(); });
    ed.addEventListener('keydown', (e) => {
      e.stopPropagation();
      const k = e.key;
      if (k === 'Enter') { e.preventDefault(); this.commitEdit(); this.move(e.shiftKey ? -1 : 1, 0); this.focus(); }
      else if (k === 'Tab') { e.preventDefault(); this.commitEdit(); this.move(0, e.shiftKey ? -1 : 1); this.focus(); }
      else if (k === 'Escape') { e.preventDefault(); this.cancelEdit(); }
      else if (k === 'F2') { e.preventDefault(); this.editing.mode = 'edit'; }
      else if (this.editing && this.editing.mode === 'enter' && k.startsWith('Arrow')) {
        e.preventDefault(); this.commitEdit(); this.app.keyNav(this, e); this.focus();
      }
    });
    ed.addEventListener('blur', () => { if (this.editing && !this.editing.fbar && !this.editing.keep) this.commitEdit(); });

    // شريط الصيغة
    const fx = this.formula;
    fx.addEventListener('focus', () => {
      if (!this.sh) return;
      if (!this.editing) { const s = this.sel; this.editing = { r: s.ar, c: s.ac, mode: 'edit', fbar: true, orig: rawText(this.sh.cells.get(key(s.ar, s.ac))) }; }
      else this.editing.fbar = true;
    });
    fx.addEventListener('input', () => { if (this.editing && this.editor.style.display === 'block') this.editor.value = fx.value; });
    fx.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); this.commitEdit(true); this.move(1, 0); this.focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.cancelEdit(); }
    });
    fx.addEventListener('blur', () => { if (this.editing && this.editing.fbar) this.commitEdit(true); });

    // مربع الاسم: الانتقال إلى مرجع مثل B12 أو A1:C5
    this.namebox.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault(); const g = parseRange(this.namebox.value);
        if (g) { this.select(g.r1, g.c1, g.r2, g.c2); } else this.app.toast('مرجع غير صالح');
        this.focus();
      } else if (e.key === 'Escape') { this.updateSel(); this.focus(); }
    });
    this.namebox.addEventListener('focus', () => this.namebox.select());

    // تبويبات الأوراق
    this.tabs.addEventListener('click', (e) => {
      const b = e.target.closest('.stab'); if (!b) return;
      const i = +b.dataset.i;
      if (this.wb.sheets[i] === this.sh) return;
      this.saveView(); const v = this.wb._views[this.idx + ':' + i];
      this.wb._views[this.idx + ':' + this.wb.sheets.indexOf(this.sh)] = this.wb._views[this.idx];
      this.setSheet(i, v); this.focus();
    });
    this.tabs.addEventListener('dblclick', (e) => { const b = e.target.closest('.stab'); if (b) this.app.renameSheet(this, +b.dataset.i); });
    this.tabs.addEventListener('contextmenu', (e) => { const b = e.target.closest('.stab'); if (b) { e.preventDefault(); this.app.sheetMenu(this, +b.dataset.i); } });
    this.el.querySelector('.add-sheet').addEventListener('click', () => this.app.addSheet(this));
    this.warn.addEventListener('click', () => this.app.explainUnsup(this));
    this.title.addEventListener('click', () => this.app.openFileMenu(this, this.title));
    this.el.querySelector('.e-new').addEventListener('click', () => this.app.newWb(this.idx));
    this.el.querySelector('.e-open:not(.e-pick)').addEventListener('click', () => this.app.openDialog(this.idx));
    this.el.querySelector('.e-pick').addEventListener('click', (e) => { this.app.setActive(this.idx); this.app.openFileMenu(this, e.currentTarget); });
    this.el.querySelector('.e-same').addEventListener('click', () => this.app.sameInto(this.idx));
    this.el.querySelector('.dir-btn').addEventListener('click', () => this.app.toggleDir(this));
  }
  // ---------- تغيير حجم الأعمدة والصفوف ----------
  startResize(e, kind, idx) {
    const sh = this.sh, g = this.range(); const col = kind === 'col';
    const inSel = col ? (idx >= g.c1 && idx <= g.c2 && g.r1 === 0 && g.r2 >= sh.nrows - 1) : (idx >= g.r1 && idx <= g.r2 && g.c1 === 0 && g.c2 >= sh.ncols - 1);
    const list = []; const a = inSel ? (col ? g.c1 : g.r1) : idx, b = inSel ? (col ? g.c2 : g.r2) : idx;
    for (let i = a; i <= b; i++) list.push(i);
    const map = col ? sh.colW : sh.rowH, def = col ? (sh.defW || DEF_W) : (sh.defH || DEF_H);
    const zz = this.z || 1, start = (map[idx] || def) * zz, x0 = col ? e.clientX : e.clientY;
    const tgt = e.currentTarget; tgt.setPointerCapture(e.pointerId);
    const move = (ev) => {
      let d = (col ? ev.clientX : ev.clientY) - x0; if (col && sh.rtl) d = -d;
      const v = Math.max(col ? 18 : 12, Math.round((start + d) / zz));
      list.forEach((i) => { map[i] = v; });
      this.autoH = null; this.axes(); this.block = null; this.render(true); this.updateSel();
    };
    const up = () => {
      tgt.removeEventListener('pointermove', move); tgt.removeEventListener('pointerup', up); tgt.removeEventListener('pointercancel', up);
      this.app.dimsChanged(this, col ? 'col' : 'row', list);
    };
    tgt.addEventListener('pointermove', move); tgt.addEventListener('pointerup', up); tgt.addEventListener('pointercancel', up);
  }
  autofit(kind, idx) {
    const sh = this.sh, g = this.range(); const col = kind === 'col';
    const inSel = col ? (idx >= g.c1 && idx <= g.c2) : (idx >= g.r1 && idx <= g.r2);
    const a = inSel ? (col ? g.c1 : g.r1) : idx, b = inSel ? (col ? g.c2 : g.r2) : idx, list = [];
    for (let i = a; i <= b; i++) list.push(i);
    const cv = this._cv || (this._cv = document.createElement('canvas').getContext('2d'));
    cv.font = '14px "Segoe UI", Tahoma, sans-serif';
    for (const i of list) {
      if (!col) { sh.rowH[i] = sh.defH || DEF_H; continue; }
      let w = 0;
      for (const [k, cell] of sh.cells) { const [r, c] = k.split(',').map(Number); if (c !== i) continue; const t = displayText(cell); if (t) { cv.font = `${cell.s && cell.s.i ? 'italic ' : ''}${cell.s && cell.s.b ? 'bold ' : ''}14px "Segoe UI", Tahoma, sans-serif`; w = Math.max(w, cv.measureText(t).width); } }
      sh.colW[i] = Math.max(40, Math.min(600, Math.ceil(w) + 16));
    }
    this.autoH = null; this.axes(); this.block = null; this.render(true); this.updateSel();
    this.app.dimsChanged(this, kind, list);
  }

  // ---------- مقبض التعبئة ----------
  startFill(e) {
    const src = this.range(); const fh = this.fillh; fh.setPointerCapture(e.pointerId);
    const st = { src, dir: null, target: null };
    const move = (ev) => {
      this.autoScroll(ev);
      const h = this.hit(ev.clientX, ev.clientY);
      const dr = h.r > src.r2 ? h.r - src.r2 : h.r < src.r1 ? h.r - src.r1 : 0;
      const dc = h.c > src.c2 ? h.c - src.c2 : h.c < src.c1 ? h.c - src.c1 : 0;
      st.dir = null; st.target = null;
      if (dr || dc) {
        if (Math.abs(dr) >= Math.abs(dc)) { st.dir = dr > 0 ? 'down' : 'up'; st.target = dr > 0 ? { r1: src.r2 + 1, r2: src.r2 + dr, c1: src.c1, c2: src.c2 } : { r1: src.r1 + dr, r2: src.r1 - 1, c1: src.c1, c2: src.c2 }; }
        else { st.dir = dc > 0 ? 'right' : 'left'; st.target = dc > 0 ? { c1: src.c2 + 1, c2: src.c2 + dc, r1: src.r1, r2: src.r2 } : { c1: src.c1 + dc, c2: src.c1 - 1, r1: src.r1, r2: src.r2 }; }
      }
      if (st.target) { this.grow(st.target.r2 + 50, st.target.c2 + 5); const t = st.target; this.box(this.fillbox, Math.min(src.r1, t.r1), Math.min(src.c1, t.c1), Math.max(src.r2, t.r2), Math.max(src.c2, t.c2)); }
      else this.fillbox.style.display = 'none';
    };
    const up = (ev) => {
      fh.removeEventListener('pointermove', move); fh.removeEventListener('pointerup', up); fh.removeEventListener('pointercancel', up);
      this.fillbox.style.display = 'none';
      if (st.target && ev.type === 'pointerup') this.app.fill(this, src, st.target, st.dir, ev.ctrlKey || ev.metaKey);
    };
    fh.addEventListener('pointermove', move); fh.addEventListener('pointerup', up); fh.addEventListener('pointercancel', up);
  }

  autoScroll(p) {
    const rc = this.scroller.getBoundingClientRect(), sc = this.scroller, m = 30;
    if (p.clientY > rc.bottom - m) sc.scrollTop += 20; else if (p.clientY < rc.top + HDR_H + m) sc.scrollTop -= 20;
    const dx = p.clientX > rc.right - m ? 20 : p.clientX < rc.left + m ? -20 : 0;
    if (dx) sc.scrollLeft += dx;
  }
}
