// لوحة عرض ملف واحد: شبكة خلايا افتراضية + شريط صيغ + تبويبات الأوراق
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
      <div class="pane-head"><span class="pane-num">${idx + 1}</span><span class="pane-title"></span><span class="warn" title="محرك حساب الصيغ يأتي في المرحلة 3. القيم المعروضة للصيغ هي آخر قيم محسوبة في الملف، وExcel يعيد حسابها تلقائيًا عند فتح الملف المحفوظ.">⚠ الصيغ لا يُعاد حسابها بعد</span>
        <button class="mini dir-btn" title="اتجاه الورقة (يمين لليسار / يسار لليمين)">⇄ اتجاه الورقة</button></div>
      <div class="fbar"><input class="namebox" aria-label="مرجع الخلية" spellcheck="false"><span class="fx">fx</span>
        <input class="formula" aria-label="شريط الصيغة" spellcheck="false" dir="auto"></div>
      <div class="scroller" tabindex="0">
        <div class="canvas">
          <div class="colhdr"><div class="corner" title="تحديد الكل"></div><div class="colcells"></div></div>
          <div class="rowhdr"></div>
          <div class="layer"><div class="lines"></div><div class="cells"></div>
            <div class="sel"></div><div class="act"></div><div class="marq"></div><div class="drop"></div>
            <input class="editor" spellcheck="false" dir="auto"></div>
        </div>
      </div>
      <textarea class="sink" inputmode="none" autocomplete="off" autocapitalize="off" spellcheck="false" tabindex="-1" aria-label="الشبكة"></textarea>
      <div class="empty"><div class="empty-box"><p>اللوحة ${idx + 1} فارغة</p><button class="big e-new">＋ مصنف جديد</button><button class="big e-open">📂 فتح ملف</button><p class="small">أو اختر ملفًا مفتوحًا من التبويبات بالأعلى</p></div></div>
      <div class="sheets"><div class="sheet-tabs"></div><button class="mini add-sheet" title="ورقة جديدة">+ ورقة</button></div>`;
    host.appendChild(el);
    const $ = (s) => el.querySelector(s);
    Object.assign(this, { title: $('.pane-title'), namebox: $('.namebox'), formula: $('.formula'), scroller: $('.scroller'), canvas: $('.canvas'),
      colcells: $('.colcells'), rowhdr: $('.rowhdr'), layer: $('.layer'), lines: $('.lines'), cells: $('.cells'), selEl: $('.sel'), actEl: $('.act'),
      marqEl: $('.marq'), dropEl: $('.drop'), editor: $('.editor'), tabs: $('.sheet-tabs'), corner: $('.corner'), sink: $('.sink'), warn: $('.warn') });
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
    const stale = this.wb.dirty && this.wb.sheets.some((sh) => { for (const c of sh.cells.values()) if (c.f != null) return true; return false; });
    this.warn.style.display = stale ? '' : 'none';
    this.title.title = this.wb.dirty ? 'توجد تعديلات غير محفوظة (محفوظة تلقائيًا للاستعادة)' : 'لا توجد تعديلات غير محفوظة';
  }
  renderTabs() {
    const si = this.wb.sheets.indexOf(this.sh);
    this.tabs.innerHTML = this.wb.sheets.map((s, i) => `<button class="stab${i === si ? ' on' : ''}" data-i="${i}">${esc(s.name)}</button>`).join('');
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
        if (!num && txt && !(s && s.al && s.al !== 'left' && !sh.rtl)) {
          let k = c + 1; while (k <= c1 + 6 && k < sh.ncols && !cells.has(key(r, k)) && k - c < 12) { w += cx[k + 1] - cx[k]; k++; }
        }
        let st2 = `inset-inline-start:${cx[c]}px;top:${ry[r]}px;width:${w}px;height:${ry[r + 1] - ry[r]}px;`;
        let cls = 'c';
        if (num) cls += ' n';
        if (cell.f != null && cell.v === undefined) cls += ' pending';
        if (s) {
          if (s.b) st2 += 'font-weight:700;'; if (s.i) st2 += 'font-style:italic;'; if (s.u) st2 += 'text-decoration:underline;';
          if (s.color) st2 += `color:${s.color};`; if (s.fill) st2 += `background:${s.fill};`;
          if (s.al) st2 += `text-align:${s.al};`;
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
    this.namebox.value = g.r1 === g.r2 && g.c1 === g.c2 ? a1(s.ar, s.ac) : a1(g.r1, g.c1) + ':' + a1(g.r2, g.c2);
    if (!this.editing) this.formula.value = rawText(this.sh.cells.get(key(s.ar, s.ac)));
    this.renderHeaders();
    this.showMarquee();
    this.app.onSelection(this);
  }
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
    ed.style.minWidth = ed.style.width; ed.style.width = 'auto';
    ed.value = initial != null ? initial : this.editing.orig;
    this.formula.value = ed.value;
    ed.focus({ preventScroll: true });
    const n = ed.value.length; ed.setSelectionRange(n, n);
  }
  commitEdit(fromFormula) {
    const e = this.editing; if (!e) return false;
    this.editing = null;
    const text = fromFormula ? this.formula.value : this.editor.value;
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
      if (t.mode === 'none') { if (Math.hypot(p.clientX - t.x, p.clientY - t.y) > 10) { t.moved = true; clearTimeout(t.timer); } return; }
      e.preventDefault();
      if (t.mode === 'sel') { const h = this.hit(p.clientX, p.clientY); this.autoScroll(p); this.select(this.sel.ar, this.sel.ac, h.r, h.c, false); }
      else this.app.dragMove(p.clientX, p.clientY);
    }, { passive: false });
    this.layer.addEventListener('touchend', (e) => {
      if (!t) return; clearTimeout(t.timer);
      if (t.mode === 'drag') this.app.dragEnd(false);
      else if (t.mode === 'none' && !t.moved) {
        e.preventDefault();
        if (this.editing) this.commitEdit();
        const { r, c } = t.h; const now = Date.now();
        if (lastTap && lastTap.r === r && lastTap.c === c && now - lastTap.t < 350) { this.select(r, c, r, c, false); this.startEdit(); lastTap = null; }
        else { this.select(r, c, r, c, false); lastTap = { r, c, t: now }; this.focus(); }
      }
      t = null;
    });
    this.layer.addEventListener('touchcancel', () => { if (t && t.mode === 'drag') this.app.dragEnd(true); t = null; });

    // العناوين
    const hdr = (e, kind) => {
      if (!this.sh) return; e.preventDefault(); if (this.editing) this.commitEdit(); this.focus();
      const h = this.hit(e.clientX, e.clientY);
      const R = this.sh.nrows - 1, C = this.sh.ncols - 1, s = this.sel;
      if (kind === 'col') { if (e.shiftKey) this.select(0, s.ac, R, h.c, false); else this.select(0, h.c, R, h.c, false); this.sel.ar = this.sel.ar; }
      else if (kind === 'row') { if (e.shiftKey) this.select(s.ar, 0, h.r, C, false); else this.select(h.r, 0, h.r, C, false); }
      else this.select(0, 0, R, C, false);
    };
    this.colcells.addEventListener('pointerdown', (e) => hdr(e, 'col'));
    this.rowhdr.addEventListener('pointerdown', (e) => hdr(e, 'row'));
    this.corner.addEventListener('pointerdown', (e) => hdr(e, 'all'));

    // مستقبل لوحة المفاتيح: حقل مخفي لا يُظهر لوحة المفاتيح الافتراضية، ويلتقط الكتابة (بما فيها العربية) والنسخ واللصق
    this.sink.addEventListener('input', () => { const v = this.sink.value; this.sink.value = ''; if (v && this.sh && !this.editing) this.startEdit(v, 'enter'); });
    this.scroller.addEventListener('focus', () => this.focus());

    // المحرر داخل الخلية
    const ed = this.editor;
    ed.addEventListener('input', () => { this.formula.value = ed.value; });
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
    this.el.querySelector('.e-new').addEventListener('click', () => this.app.newWb(this.idx));
    this.el.querySelector('.e-open').addEventListener('click', () => this.app.openDialog(this.idx));
    this.el.querySelector('.dir-btn').addEventListener('click', () => this.app.toggleDir(this));
  }
  autoScroll(p) {
    const rc = this.scroller.getBoundingClientRect(), sc = this.scroller, m = 30;
    if (p.clientY > rc.bottom - m) sc.scrollTop += 20; else if (p.clientY < rc.top + HDR_H + m) sc.scrollTop -= 20;
    const dx = p.clientX > rc.right - m ? 20 : p.clientX < rc.left + m ? -20 : 0;
    if (dx) sc.scrollLeft += dx;
  }
}
