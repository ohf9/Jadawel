// تثبيت الألواح (صفوف وأعمدة): تبقى ظاهرة أثناء التمرير، وتُحفظ في الملف
export const frz = (sh) => { const f = sh && sh.freeze; return f && (f.rows > 0 || f.cols > 0) ? { rows: f.rows || 0, cols: f.cols || 0 } : null; };

export function installFreeze(Pane, App) {
  Pane.prototype.renderFrozen = function (r0, r1, c0, c1) {
    const sh = this.sh, f = frz(sh);
    if (!this.frzEl) { this.frzEl = document.createElement('div'); this.frzEl.className = 'frz'; this.layer.prepend(this.frzEl); }
    if (!f) { this.frzEl.innerHTML = ''; return; }
    const cx = this.colX, ry = this.rowY, fr = Math.min(f.rows, sh.nrows), fc = Math.min(f.cols, sh.ncols);
    const bg = (x, y, w, h) => `<div class="fz-bg" style="inset-inline-start:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`;
    const lines = (ra, rb, ca, cb) => {
      let l = '';
      for (let c = ca; c <= cb + 1; c++) l += `<i class="vl" style="inset-inline-start:${cx[c] - 1}px;top:${ry[ra]}px;height:${ry[rb + 1] - ry[ra]}px"></i>`;
      for (let r = ra; r <= rb + 1; r++) l += `<i class="hl" style="top:${ry[r] - 1}px;inset-inline-start:${cx[ca]}px;width:${cx[cb + 1] - cx[ca]}px"></i>`;
      return `<div class="lines">${l}</div>`;
    };
    let h = '';
    if (fr) h += `<div class="fz fz-a">${bg(cx[c0], 0, cx[c1 + 1] - cx[c0], ry[fr])}${lines(0, fr - 1, c0, c1)}${this.cellHtml(0, fr - 1, c0, c1)}<i class="fz-eh" style="top:${ry[fr] - 1}px;inset-inline-start:${cx[c0]}px;width:${cx[c1 + 1] - cx[c0]}px"></i></div>`;
    if (fc) h += `<div class="fz fz-b">${bg(0, ry[r0], cx[fc], ry[r1 + 1] - ry[r0])}${lines(r0, r1, 0, fc - 1)}${this.cellHtml(r0, r1, 0, fc - 1)}<i class="fz-ev" style="inset-inline-start:${cx[fc] - 1}px;top:${ry[r0]}px;height:${ry[r1 + 1] - ry[r0]}px"></i></div>`;
    if (fr && fc) h += `<div class="fz fz-c">${bg(0, 0, cx[fc], ry[fr])}${lines(0, fr - 1, 0, fc - 1)}${this.cellHtml(0, fr - 1, 0, fc - 1)}<i class="fz-eh" style="top:${ry[fr] - 1}px;inset-inline-start:0;width:${cx[fc]}px"></i><i class="fz-ev" style="inset-inline-start:${cx[fc] - 1}px;top:0;height:${ry[fr]}px"></i></div>`;
    this.frzEl.innerHTML = h;
  };

  Object.assign(App, {
    // mode: 'sel' | 'row' | 'col' | 'off'
    freezePanes(p, mode) {
      const sh = p.sh; if (!sh) return;
      const g = p.range(); let rows = 0, cols = 0;
      if (mode === 'sel') { rows = g.r1; cols = g.c1; }
      else if (mode === 'row') rows = 1; else if (mode === 'col') cols = 1;
      if (mode === 'sel' && !rows && !cols) return this.toast('حدد خلية أسفل وإلى جانب ما تريد تثبيته (مثلًا B2 تثبّت الصف الأول والعمود الأول)');
      const before = sh.freeze ? { ...sh.freeze } : null; sh.freeze = rows || cols ? { rows, cols } : null; sh.freezeEdited = true; const after = sh.freeze ? { ...sh.freeze } : null;
      const set = (v) => () => { sh.freeze = v ? { ...v } : null; sh.freezeEdited = true; };
      this.pushUndoFn(p.wb, sh, set(before), set(after));
      this.markDirty(p.wb);
      this.panes.forEach((q) => { if (q.sh === sh) { q.block = null; q.render(true); q.updateSel(); } });
      this.toast(sh.freeze ? 'تم التثبيت' : 'أُلغي التثبيت');
    },
  });
}
