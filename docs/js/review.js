// تبويبا «مراجعة» و«رسم»: ملاحظات الخلايا، حماية الورقة، والرسم اليدوي (قلم / تمييز / ممحاة)
import { key, a1, esc } from './util.js';
import { tr } from './i18n.js';

const INK_COLORS = [['#111111', 'أسود'], ['#d32f2f', 'أحمر'], ['#1565c0', 'أزرق'], ['#2e7d32', 'أخضر']];
const dot = (c) => `<i class="dotc" style="background:${c}"></i>`;
const cl = (x) => structuredClone(x || []);

export const REVIEW_RIBBON = (B, G) =>
  G(B('noteNew', 'note', 'ملاحظة جديدة', 'إضافة ملاحظة للخلية النشطة أو تعديلها'), B('noteDel', 'notedel', 'حذف الملاحظة', 'حذف ملاحظة الخلية النشطة'), B('noteShow', 'noteshow', 'إظهار كل الملاحظات', 'عرض نص كل الملاحظات في الورقة'))
  + G(B('protect', 'lock', 'حماية الورقة', 'منع تعديل الخلايا في هذه الورقة (بدون كلمة مرور)'));
export const DRAW_RIBBON = (B, G) =>
  G(`<button class="rb big" data-act="ink:off" title="${tr('إيقاف الرسم والعودة للتحديد')}"><svg viewBox="0 0 24 24"><path d="M5 3l14 9-6 1.5L10 20z"/></svg><span>${tr('تحديد')}</span></button>`)
  + `<div class="rg"><div class="rg-body">${INK_COLORS.map(([c, n]) => `<button class="rb big" data-act="ink:pen:${c}" title="${tr('قلم')} ${tr(n)}"><svg viewBox="0 0 24 24"><path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3" /></svg><span>${dot(c)}</span></button>`).join('')}</div></div>`
  + G(`<button class="rb big" data-act="ink:hl:#ffeb3b" title="${tr('قلم تمييز')}"><svg viewBox="0 0 24 24"><path d="M5 17l8-10 5 4-8 10H6z"/><path d="M4 21h8"/></svg><span>${tr('تمييز')}</span></button>`, `<button class="rb big" data-act="ink:erase" title="${tr('ممحاة')}"><svg viewBox="0 0 24 24"><path d="M5 15l8-9 6 5-6 8H8z"/><path d="M9 19h11"/></svg><span>${tr('ممحاة')}</span></button>`, `<button class="rb big" data-act="inkClear" title="${tr('مسح كل الرسم اليدوي في هذه الورقة')}"><svg viewBox="0 0 24 24"><path d="M6 7h12M9 7V4h6v3M8 7l1 13h6l1-13"/></svg><span>${tr('مسح الكل')}</span></button>`)
  + `<div class="rg"><div class="rg-body"><div class="rg-note">${tr('الرسم اليدوي يُحفظ داخل التطبيق مع ملفك ويظهر هنا، ولا يدخل ملف XLSX.')}</div></div></div>`;

export function installReview(app, Pane) {
  const P = Pane.prototype;
  // ---------------- ملاحظات ----------------
  P.renderExtras = function () {
    const sh = this.sh; if (!this.noteEl) { this.noteEl = document.createElement('div'); this.noteEl.className = 'notes'; this.layer.appendChild(this.noteEl); this.inkEl = document.createElement('div'); this.inkEl.className = 'ink'; this.layer.appendChild(this.inkEl); this.initInk(); }
    if (!sh) { this.noteEl.innerHTML = ''; this.inkEl.innerHTML = ''; return; }
    let h = '';
    const b = this.block; const notes = sh.notes || {};
    for (const k of Object.keys(notes)) {
      const [r, c] = k.split(',').map(Number); if (b && (r < b.r0 || r > b.r1 || c < b.c0 || c > b.c1)) continue;
      const x = this.colX[c + 1] - 9, y = this.rowY[r];
      h += `<i class="ntri" style="inset-inline-start:${x}px;top:${y}px"></i>`;
      if (sh.showNotes) h += `<div class="nbub" style="inset-inline-start:${this.colX[c + 1] + 4}px;top:${y}px">${esc(notes[k])}</div>`;
    }
    this.noteEl.innerHTML = h; this.showNoteBubble();
    this.renderInk();
  };
  P.showNoteBubble = function () {
    let el = this.noteBub; if (!el) { el = this.noteBub = document.createElement('div'); el.className = 'nbub live'; this.layer.appendChild(el); }
    const sh = this.sh, n = sh && sh.notes && sh.notes[key(this.sel.ar, this.sel.ac)];
    if (!n || sh.showNotes || this.editing) { el.style.display = 'none'; return; }
    el.textContent = n; el.style.display = 'block'; el.style.insetInlineStart = this.colX[this.sel.ac + 1] + 4 + 'px'; el.style.top = this.rowY[this.sel.ar] + 'px';
  };
  // ---------------- رسم يدوي ----------------
  P.renderInk = function () {
    const sh = this.sh; const z = this.z || 1; const W = this.colX[this.sh.ncols], H = this.rowY[this.sh.nrows];
    const strokes = sh.ink || [];
    let paths = '';
    for (const s of strokes) { const d = s.p.map((q, i) => (i ? 'L' : 'M') + (q[0] * z).toFixed(1) + ',' + (q[1] * z).toFixed(1)).join(''); paths += `<path d="${d}" stroke="${s.c}" stroke-width="${(s.w * z).toFixed(1)}" stroke-opacity="${s.t === 'hl' ? 0.38 : 1}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`; }
    this.inkEl.innerHTML = `<svg width="${W}" height="${H}" style="${sh.rtl ? 'transform:scaleX(-1)' : ''}">${paths}</svg>`;
    this.inkEl.classList.toggle('on', !!app.inkTool);
  };
  P.initInk = function () {
    const el = this.inkEl; let cur = null;
    const pos = (e) => { const rc = this.layer.getBoundingClientRect(); const z = this.z || 1; return [(this.sh.rtl ? rc.right - e.clientX : e.clientX - rc.left) / z, (e.clientY - rc.top) / z]; };
    el.addEventListener('pointerdown', (e) => {
      const t = app.inkTool; if (!t || !this.sh) return; e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId);
      const sh = this.sh, before = cl(sh.ink);
      if (t.k === 'erase') { cur = { erase: true, before }; this.eraseAt(pos(e)); return; }
      cur = { s: { t: t.k, c: t.c, w: t.k === 'hl' ? 16 : 2.5, p: [pos(e)] }, before }; (sh.ink = sh.ink || []).push(cur.s); this.renderInk();
    });
    el.addEventListener('pointermove', (e) => {
      if (!cur) return; e.preventDefault();
      if (cur.erase) { this.eraseAt(pos(e)); return; }
      const q = pos(e), l = cur.s.p[cur.s.p.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) < 1.2) return; cur.s.p.push(q); this.renderInk();
    });
    const end = () => {
      if (!cur) return; const sh = this.sh, before = cur.before, after = cl(sh.ink);
      const changed = JSON.stringify(before) !== JSON.stringify(after); cur = null;
      if (changed) { const set = (v) => () => { sh.ink = cl(v); }; app.pushUndoFn(this.wb, sh, set(before), set(after)); app.markDirty(this.wb); }
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    for (const ev of ['touchstart', 'touchend']) el.addEventListener(ev, (e) => { if (app.inkTool) e.stopPropagation(); }, { passive: true });
  };
  P.eraseAt = function (q) {
    const sh = this.sh; const before = (sh.ink || []).length; const r = 14 / (this.z || 1);
    sh.ink = (sh.ink || []).filter((s) => !s.p.some((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) < r + s.w / 2));
    if (sh.ink.length !== before) this.renderInk();
  };

  Object.assign(app, {
    inkTool: null,
    setInk(k, c) {
      this.inkTool = k === 'off' ? null : { k, c };
      document.querySelectorAll('[data-act^="ink:"]').forEach((b) => { const [, kk, cc] = b.dataset.act.split(':'); b.classList.toggle('on', (kk === 'off' && !this.inkTool) || (this.inkTool && kk === this.inkTool.k && (kk === 'erase' || cc === this.inkTool.c))); });
      this.panes.forEach((p) => p.inkEl && p.inkEl.classList.toggle('on', !!this.inkTool));
      if (this.inkTool) this.toast(k === 'erase' ? 'مرّر على الرسم لمسحه' : 'ارسم بإصبعك أو القلم. اضغط «تحديد» للعودة.', 2500);
    },
    inkClear(p) {
      const sh = p.sh; if (!sh || !(sh.ink || []).length) return this.toast('لا يوجد رسم يدوي في هذه الورقة');
      const before = cl(sh.ink); sh.ink = []; p.renderInk(); const set = (v) => () => { sh.ink = cl(v); }; this.pushUndoFn(p.wb, sh, set(before), set([])); this.markDirty(p.wb);
    },
    // ملاحظات
    async noteNew(p) {
      const sh = p.sh, k = key(p.sel.ar, p.sel.ac), cur = (sh.notes || {})[k] || '';
      const r = await this.form('ملاحظة ' + a1(p.sel.ar, p.sel.ac), `<label class="field"><span>${tr('نص الملاحظة')}</span><textarea class="ntxt" rows="4" style="width:100%">${esc(cur)}</textarea></label>`, [{ label: 'موافق', value: true, primary: true }, { label: 'إلغاء', value: null }], (d) => d.querySelector('textarea').focus());
      if (!r) return; const v = r.el.querySelector('textarea').value.trim(); const before = { ...(sh.notes || {}) };
      sh.notes = { ...(sh.notes || {}) }; if (v) sh.notes[k] = v; else delete sh.notes[k]; this.noteCommit(p, before);
    },
    noteDel(p) { const sh = p.sh, k = key(p.sel.ar, p.sel.ac); if (!sh.notes || !sh.notes[k]) return this.toast('لا توجد ملاحظة في هذه الخلية'); const before = { ...sh.notes }; delete sh.notes[k]; this.noteCommit(p, before); },
    noteShow(p) { p.sh.showNotes = !p.sh.showNotes; this.panes.forEach((q) => { if (q.sh === p.sh) q.renderExtras(); }); },
    noteCommit(p, before) {
      const sh = p.sh, after = { ...(sh.notes || {}) }; (sh.notesTouched = sh.notesTouched || new Set()); [...Object.keys(before), ...Object.keys(after)].forEach((k) => sh.notesTouched.add(k));
      const set = (v) => () => { sh.notes = { ...v }; }; this.pushUndoFn(p.wb, sh, set(before), set(after)); this.markDirty(p.wb); this.panes.forEach((q) => { if (q.sh === sh) q.renderExtras(); });
    },
    toggleProtect(p) {
      const sh = p.sh; const before = !!sh.protect; sh.protect = !before; sh.protectEdited = true; const set = (v) => () => { sh.protect = v; sh.protectEdited = true; };
      this.pushUndoFn(p.wb, sh, set(before), set(!before)); this.markDirty(p.wb);
      document.querySelectorAll('[data-act=protect]').forEach((b) => b.classList.toggle('on', sh.protect));
      this.toast(sh.protect ? 'الورقة محمية: لا يمكن تعديل خلاياها حتى تلغي الحماية' : 'أُلغيت حماية الورقة');
    },
  });
}
