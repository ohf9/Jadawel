// لوحة عرض ملف واحد: شبكة خلايا افتراضية + شريط صيغ + تبويبات الأوراق
import { fontCss } from './fonts.js';
import { tr, settings } from './i18n.js';
import { key, a1, colName, rawText, displayText, isNumCell, parseInput, parseRange, esc } from './util.js';

export const HDR_W = 46, HDR_H = 24, DEF_W = 96, DEF_H = 26;

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
      <div class="empty"><div class="empty-box"><p>اللوحة ${idx + 1} فارغة</p><button class="cta e-new">＋ مصنف جديد</button><button class="cta e-open">📂 فتح ملف</button><button class="cta e-open e-pick" hidden>🗂 اختر من الملفات المفتوحة</button><p class="small">أو اختر ملفًا مفتوحًا من التبويبات بالأعلى</p></div></div>
      <div class="sheets"><button class="mini add-sheet" title="ورقة جديدة">＋</button><div class="sheet-tabs"></div></div>`;
    host.appendChild(el);
    const $ = (s) => el.querySelector(s);
    Object.assign(this, { title: $('.pane-title'), namebox: $('.namebox'), formula: $('.formula'), scroller: $('.scroller'), canvas: $('.canvas'),
      colcells: $('.colcells'), rowhdr: $('.rowhdr'), layer: $('.layer'), lines: $('.lines'), cells: $('.cells'), selEl: $('.sel'), actEl: $('.act'),
      marqEl: $('.marq'), dropEl: $('.drop'), editor: $('.editor'), tabs: $('.sheet-tabs'), corner: $('.corner'), sink: $('.sink'), warn: $('.warn'), fillh: $('.fillh'), fillbox: $('.fillbox'), hTL: $('.hnd.tl'), hBR: $('.hnd.br') });
    this.touchMode = matchMedia('(pointer:coarse)').matches;
    this.bind();
  }

  // ---------- ربط الملف ----------
  show(wb, view) {
    if (this.editing) this.commitEdit();
    this.saveView();
    this.wb = wb;
    this.el.classList.toggle('is-empty', !wb);
    if (!wb) { this.sh = null; this.title.textContent = ''; this.tabs.innerHTML = ''; return; }
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
    this.axes(); this.block = null;
    this.scroller.scrollTop = v ? v.st || 0 : 0;
    this.setScrollX(v ? v.sl || 0 : 0);
    this.refreshHead(); this.renderTabs(); this.render(true); this.updateSel();
  }
  refreshHead() {
    if (!this.wb) return;
    this.title.textContent = this.wb.name + (this.wb.dirty ? ' •' : '');
    const un = this.wb._unsup && this.wb._unsup.size ? [...this.wb._unsup].slice(0, 4).join('، ') : '';
    this.warn.style.display = un ? '' : 'none';
    if (un) { this.warn.textContent = tr('⚠ دوال غير مدعومة: ') + un; this.warn.title = tr('هذه الدوال لا يحسبها التطبيق بعد، فتبقى قيمها كما حُفظت في الملف، وExcel يعيد حسابها عند فتح الملف.'); }
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

  // ---------- المحاور والرسم ----------
  axes() {
    const sh = this.sh;
    const cx = this.colX = new Float64Array(sh.ncols + 1);
    for (let c = 0; c < sh.ncols; c++) cx[c + 1] = cx[c] + (sh.colW[c] || DEF_W);
    const ry = this.rowY = new Float64Array(sh.nrows + 1);
    for (let r = 0; r < sh.nrows; r++) ry[r + 1] = ry[r] + (sh.rowH[r] || DEF_H);
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
    let html = '';
    const cells = sh.cells;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = cells.get(key(r, c)); if (!cell) continue;
        const txt = displayText(cell); const s = cell.s;
        if (!txt && !(s && s.fill)) continue;
        const num = isNumCell(cell) || typeof cell.v === 'boolean';
        let w = cx[c + 1] - cx[c];
        // النص يمتد إلى الخلايا الفارغة المجاورة كما في Excel
        if (!num && txt && !(s && (s.al || s.fill))) {
          let k = c + 1; while (k <= c1 + 6 && k < sh.ncols && !cells.has(key(r, k)) && k - c < 12) { w += cx[k + 1] - cx[k]; k++; }
        }
        let st2 = `inset-inline-start:${cx[c]}px;top:${ry[r]}px;width:${w}px;height:${ry[r + 1] - ry[r]}px;line-height:${ry[r + 1] - ry[r] - 1}px;`;
        let cls = 'c';
        if (num) cls += ' n';
        if (cell.f != null && cell.v === undefined) cls += ' pending';
        if (s) {
          if (s.b) st2 += 'font-weight:700;'; if (s.i) st2 += 'font-style:italic;'; if (s.u) st2 += 'text-decoration:underline;';
          if (s.color) st2 += `color:${s.color};`; if (s.fill) { st2 += `background:${s.fill};`; if (!s.color) cls += ' f'; }
          if (s.font) st2 += `font-family:${fontCss(s.font)};`; if (s.sz) st2 += `font-size:${s.sz * 4 / 3}px;`;
          if (s.al) st2 += `text-align:${s.al};`;
          if (s.wrap) { st2 += 'white-space:normal;line-height:1.25;padding-top:2px;'; cls += ' wr'; }
        }
        html += `<div class="${cls}" style="${st2}">${esc(txt)}</div>`;
      }
    }
    this.cells.innerHTML = html;
    this.renderHeaders();
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
  }

  // ---------- التحديد ----------
  range() { const s = this.sel; return { r1: Math.min(s.ar, s.fr), r2: Math.max(s.ar, s.fr), c1: Math.min(s.ac, s.fc), c2: Math.max(s.ac, s.fc) }; }
  select(ar, ac, fr = ar, fc = ac, scroll = true) {
    const sh = this.sh;
    const cl = (v, m) => Math.max(0, Math.min(m - 1, v));
    this.grow(Math.max(ar, fr) + 50, Math.max(ac, fc) + 5);
    this.sel = { ar: cl(ar, sh.nrows), ac: cl(ac, sh.ncols), fr: cl(fr, sh.nrows), fc: cl(fc, sh.ncols) };
    if (scroll) this.scrollTo(this.sel.fr, this.sel.fc);
    this.updateSel();
  }
  updateSel() {
    if (!this.sh) return;
    const g = this.range(), s = this.sel;
    this.box(this.selEl, g.r1, g.c1, g.r2, g.c2);
    this.selEl.classList.toggle('multi', g.r1 !== g.r2 || g.c1 !== g.c2);
    this.box(this.actEl, s.ar, s.ac, s.ar, s.ac);
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
    if (ry[r] < sc.scrollTop) sc.scrollTop = ry[r];
    else if (ry[r + 1] > sc.scrollTop + vh) sc.scrollTop = ry[r + 1] - vh;
    const sl = Math.abs(sc.scrollLeft);
    if (cx[c] < sl) this.setScrollX(cx[c]);
    else if (cx[c + 1] > sl + vw) this.setScrollX(cx[c + 1] - vw);
    this.render();
  }
  hit(clientX, clientY, clamp = true) {
    if (!this.sh) return null;
    const rc = this.layer.getBoundingClientRect();
    const x = this.sh.rtl ? rc.right - clientX : clientX - rc.left, y = clientY - rc.top;
    if (!clamp && (x < 0 || y < 0)) return null;
    return { r: bsearch(this.rowY, Math.max(0, y)), c: bsearch(this.colX, Math.max(0, x)) };
  }
  inSel(r, c) { const g = this.range(); return r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2 && (g.r1 !== g.r2 || g.c1 !== g.c2); }

  // ---------- التحرير ----------
  startEdit(initial, mode = 'edit') {
    if (!this.sh || this.editing) return;
    const s = this.sel; this.select(s.ar, s.ac, s.ar, s.ac);
    const cell = this.sh.cells.get(key(s.ar, s.ac));
    this.editing = { r: s.ar, c: s.ac, mode, orig: rawText(cell) };
    const ed = this.editor;
    this.box(ed, s.ar, s.ac, s.ar, s.ac);
    const st = (cell && cell.s) || {};
    ed.style.overflow = 'hidden'; ed.style.boxSizing = 'border-box';
    ed.style.fontFamily = st.font ? fontCss(st.font) : ''; ed.style.fontSize = st.sz ? `${st.sz * 4 / 3}px` : '';
    ed.style.fontWeight = st.b ? '700' : ''; ed.style.fontStyle = st.i ? 'italic' : '';
    // الموضع بخصائص فيزيائية كي لا يتأثر بتغيّر اتجاه النص داخل المحرر
    const rtl = this.sh.rtl, x0 = this.colX[s.ac];
    ed.style.insetInlineStart = 'auto'; ed.style.left = rtl ? 'auto' : x0 + 'px'; ed.style.right = rtl ? x0 + 'px' : 'auto';
    this.editing.w = this.colX[s.ac + 1] - x0; this.editing.x0 = x0;
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
    this.editing = null;
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
    if (!this.editing) return; this.editing = null;
    this.editor.style.display = 'none'; this.updateSel(); this.focus();
  }
  focus() { this.sink.focus({ preventScroll: true }); }

  move(dr, dc, extend) {
    const s = this.sel;
    if (extend) this.select(s.ar, s.ac, s.fr + dr, s.fc + dc);
    else this.select(s.ar + dr, s.ac + dc);
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
    sc.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; this.render(); }); }, { passive: true });
    this.el.addEventListener('pointerdown', () => this.app.setActive(this.idx), true);
    this.el.addEventListener('touchstart', () => this.app.setActive(this.idx), { capture: true, passive: true });

    // الماوس والقلم
    let drag = null;
    this.layer.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') this.setTouchMode(e.pointerType === 'pen' ? this.touchMode : false);
      this.app.hideMini();
      if (e.pointerType === 'touch' || e.button > 0 || e.target === this.editor) return;
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
    this.layer.addEventListener('dblclick', (e) => { if (e.target !== this.editor) this.startEdit(); });

    // اللمس: نقرة = تحديد، نقرتان = تحرير، ضغطة مطوّلة ثم سحب = تحديد نطاق، ضغطة مطوّلة على نطاق محدد ثم سحب = نقل نسخة إلى الملف الآخر
    let t = null, lastTap = null;
    this.layer.addEventListener('touchstart', (e) => {
      this.setTouchMode(true); this.app.hideMini();
      if (e.touches.length !== 1 || e.target === this.editor) { t = null; return; }
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
        e.preventDefault();
        if (this.editing) this.commitEdit();
        const { r, c } = t.h; const now = Date.now();
        if (lastTap && lastTap.r === r && lastTap.c === c && now - lastTap.t < 350) { clearTimeout(lastTap.mt); this.select(r, c, r, c, false); this.startEdit(); lastTap = null; }
        else {
          const was = this.inSel(r, c) || (this.sel.ar === r && this.sel.ac === c && this.sel.fr === r && this.sel.fc === c);
          if (!was) this.select(r, c, r, c, false);
          lastTap = { r, c, t: now }; this.focus();
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
    ed.addEventListener('blur', () => { if (this.editing && !this.editing.fbar) this.commitEdit(); });

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
    this.title.addEventListener('click', () => this.app.openFileMenu(this, this.title));
    this.el.querySelector('.e-new').addEventListener('click', () => this.app.newWb(this.idx));
    this.el.querySelector('.e-open:not(.e-pick)').addEventListener('click', () => this.app.openDialog(this.idx));
    this.el.querySelector('.e-pick').addEventListener('click', (e) => { this.app.setActive(this.idx); this.app.openFileMenu(this, e.currentTarget); });
    this.el.querySelector('.dir-btn').addEventListener('click', () => this.app.toggleDir(this));
  }
  // ---------- تغيير حجم الأعمدة والصفوف ----------
  startResize(e, kind, idx) {
    const sh = this.sh, g = this.range(); const col = kind === 'col';
    const inSel = col ? (idx >= g.c1 && idx <= g.c2 && g.r1 === 0 && g.r2 >= sh.nrows - 1) : (idx >= g.r1 && idx <= g.r2 && g.c1 === 0 && g.c2 >= sh.ncols - 1);
    const list = []; const a = inSel ? (col ? g.c1 : g.r1) : idx, b = inSel ? (col ? g.c2 : g.r2) : idx;
    for (let i = a; i <= b; i++) list.push(i);
    const map = col ? sh.colW : sh.rowH, def = col ? DEF_W : DEF_H;
    const start = map[idx] || def, x0 = col ? e.clientX : e.clientY;
    const tgt = e.currentTarget; tgt.setPointerCapture(e.pointerId);
    const move = (ev) => {
      let d = (col ? ev.clientX : ev.clientY) - x0; if (col && sh.rtl) d = -d;
      const v = Math.max(col ? 18 : 12, Math.round(start + d));
      list.forEach((i) => { map[i] = v; });
      this.axes(); this.block = null; this.render(true); this.updateSel();
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
      if (!col) { sh.rowH[i] = DEF_H; continue; }
      let w = 0;
      for (const [k, cell] of sh.cells) { const [r, c] = k.split(',').map(Number); if (c !== i) continue; const t = displayText(cell); if (t) { cv.font = `${cell.s && cell.s.i ? 'italic ' : ''}${cell.s && cell.s.b ? 'bold ' : ''}14px "Segoe UI", Tahoma, sans-serif`; w = Math.max(w, cv.measureText(t).width); } }
      sh.colW[i] = Math.max(40, Math.min(600, Math.ceil(w) + 16));
    }
    this.axes(); this.block = null; this.render(true); this.updateSel();
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
