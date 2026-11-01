// أوامر الشريط: إدراج، صيغ، بيانات، دمج، حدود، بحث واستبدال، تكبير... كلها تعمل فعليًا على الورقة
import { key, unkey, a1, colName, rawText, displayText, parseInput, shiftFormula, adjustFormula, esc, isNumCell, parseA1 } from './util.js';
import { newSheet } from './io.js';
import { recalc } from './calc.js';
import { tr, lang, translateDom } from './i18n.js';
import { openPopover, closePopover } from './ui.js';
import { FN_CATS, FNS, ALL_FNS } from './fnlib.js';

const $ = (s) => document.querySelector(s);
const ICONS = {
  insrow: '<path d="M4 5h16v5H4zM4 14h16v5H4z"/><path d="M12 11v2" opacity="0"/><path d="M3 12h4M5 10v4"/>',
  inscol: '<path d="M5 4h5v16H5zM14 4h5v16h-5z"/><path d="M12 3v4M10 5h4"/>',
  delrow: '<path d="M4 5h16v5H4zM4 14h16v5H4z"/><path d="M8 12h8"/>',
  delcol: '<path d="M5 4h5v16H5zM14 4h5v16h-5z"/><path d="M10 12h4"/>',
  sheet: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M12 12v6M9 15h6"/>',
  fx: '<path d="M10 4C8 4 7 5 7 7v10c0 2-1 3-3 3M5 11h6"/><path d="M13 10l6 8M19 10l-6 8"/>',
  date: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  time: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  sum: '<path d="M18 5H7l6 7-6 7h11"/>',
  lib: '<path d="M5 4h4v16H5zM11 4h4v16h-4zM17 6l3 .7-3.5 13.3-3-.8z"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h2M16 12h0M8 16h2M12 16h2"/>',
  showf: '<path d="M5 5h14M5 9h9M5 13h14M5 17h9"/><path d="M16 15l4 4M20 15l-4 4"/>',
  sortaz: '<path d="M6 4v14M3 15l3 3 3-3"/><path d="M13 5h3M13 9h5M13 13h7"/>',
  sortza: '<path d="M6 4v14M3 15l3 3 3-3"/><path d="M13 13h3M13 9h5M13 5h7"/>',
  sort: '<path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3"/>',
  filter: '<path d="M4 5h16l-6 8v6l-4-2v-4z"/>',
  dup: '<rect x="3" y="4" width="11" height="13" rx="1.5"/><path d="M17 8h3v13H10v-2"/><path d="M6 10l2 2 4-4"/>',
  t2c: '<path d="M4 6h16M4 18h16M12 6v12"/><path d="M7 12h3M14 12h3"/>',
  find: '<circle cx="10" cy="10" r="6"/><path d="M15 15l5 5"/>',
  merge: '<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M8 12h8M8 12l2-2M8 12l2 2M16 12l-2-2M16 12l-2 2"/>',
  border: '<rect x="4" y="4" width="16" height="16"/><path d="M4 12h16M12 4v16" stroke-dasharray="2 2"/>',
  fmt: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 10h18M9 10v9"/>',
  zin: '<circle cx="10" cy="10" r="6"/><path d="M15 15l5 5M10 7v6M7 10h6"/>',
  zout: '<circle cx="10" cy="10" r="6"/><path d="M15 15l5 5M7 10h6"/>',
  z100: '<circle cx="10" cy="10" r="6"/><path d="M15 15l5 5"/><path d="M8 8.5l1.5-1v5"/>',
  fbar: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 12h4"/>',
  clear: '<path d="M5 19l9-14 5 3-9 14H6z"/><path d="M4 21h16"/>',
  fillc: '<path d="M12 4v13M7 12l5 5 5-5"/><path d="M5 20h14"/>',
};
const NO_ICON = new Set();
export const icon = (n) => `<svg viewBox="0 0 24 24">${ICONS[n] || ''}</svg>`;
const B = (act, ic, label, tip, cls = 'big') => `<button class="rb ${cls}" data-act="${act}" title="${tip || label}">${icon(ic)}<span>${label}</span></button>`;
const G = (...b) => `<div class="rg"><div class="rg-body">${b.join('')}</div></div>`;
const C2 = (...rows) => `<div class="col2">${rows.map((r) => `<div class="row">${r}</div>`).join('')}</div>`;

const RIBBON = {
  insert: G(B('insRow', 'insrow', 'إدراج صفوف', 'إدراج صفوف فوق التحديد (بعدد الصفوف المحددة)'), B('insCol', 'inscol', 'إدراج أعمدة', 'إدراج أعمدة قبل التحديد (بعدد الأعمدة المحددة)'), B('delRow', 'delrow', 'حذف صفوف', 'حذف الصفوف المحددة'), B('delCol', 'delcol', 'حذف أعمدة', 'حذف الأعمدة المحددة'))
    + G(B('newSheet', 'sheet', 'ورقة جديدة', 'إضافة ورقة عمل جديدة'))
    + G(B('fnDialog', 'fx', 'إدراج دالة', 'اختر دالة من القائمة وأدرجها في الخلية'), B('today', 'date', 'تاريخ اليوم', 'يضع تاريخ اليوم كقيمة ثابتة (Ctrl+;)'), B('nowTime', 'time', 'الوقت الآن', 'يضع الوقت الحالي كقيمة ثابتة (Ctrl+Shift+;)')),
  formulas: G(B('fnDialog', 'fx', 'إدراج دالة', 'اختر دالة من القائمة وأدرجها في الخلية'), B('sumMenu', 'sum', 'جمع تلقائي', 'جمع / متوسط / عدد / أكبر / أصغر'))
    + G(...FN_CATS.map(([id, label]) => B('lib:' + id, 'lib', label, 'مكتبة الدوال: ' + label)))
    + G(B('showF', 'showf', 'إظهار الصيغ', 'عرض الصيغ بدل نتائجها (Ctrl+`)'), B('calcNow', 'calc', 'احسب الآن', 'إعادة حساب كل الصيغ (F9)')),
  data: G(B('sortAZ', 'sortaz', 'ترتيب أ-ي', 'ترتيب تصاعدي حسب العمود النشط'), B('sortZA', 'sortza', 'ترتيب ي-أ', 'ترتيب تنازلي حسب العمود النشط'), B('sortDlg', 'sort', 'ترتيب مخصص', 'اختر عمود الترتيب واتجاهه'))
    + G(B('filter', 'filter', 'تصفية', 'تشغيل/إيقاف التصفية (أسهم فوق الأعمدة)'), B('clearFilter', 'filter', 'مسح التصفية', 'إظهار كل الصفوف المخفية بالتصفية'))
    + G(B('removeDup', 'dup', 'حذف المكرر', 'حذف الصفوف المكررة في التحديد'), B('textToCols', 't2c', 'نص إلى أعمدة', 'تقسيم نص العمود إلى أعمدة بفاصل')),
};
const HOME_EXTRA = G(B('mergeMenu', 'merge', 'دمج الخلايا', 'دمج وتوسيط / دمج / فصل'), B('borderMenu', 'border', 'حدود', 'حدود الخلايا'))
  + G(B('fillMenu', 'fillc', 'تعبئة', 'تعبئة لأسفل / لليمين'), B('clearMenu', 'clear', 'مسح', 'مسح الكل / التنسيقات / المحتويات'), B('fmtMenu', 'fmt', 'تنسيق', 'ارتفاع الصف وعرض العمود والإخفاء'))
  + G(B('sortMenu', 'sort', 'ترتيب وتصفية', 'ترتيب وتصفية'), B('findDlg', 'find', 'بحث واستبدال', 'بحث واستبدال (Ctrl+F / Ctrl+H)'));
const VIEW_EXTRA = G(B('zoomIn', 'zin', 'تكبير', 'تكبير العرض'), B('zoomOut', 'zout', 'تصغير', 'تصغير العرض'), B('zoom100', 'z100', '100%', 'حجم 100%'), B('zoomSel', 'zin', 'تكبير للتحديد', 'يملأ الشاشة بالتحديد'))
  + G(B('toggleFbar', 'fbar', 'شريط الصيغة', 'إظهار/إخفاء شريط الصيغة'), B('showF', 'showf', 'إظهار الصيغ', 'عرض الصيغ بدل نتائجها (Ctrl+`)'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const snapOf = (sh) => ({
  cells: new Map(sh.cells), colW: { ...sh.colW }, rowH: { ...sh.rowH }, merges: (sh.merges || []).map((m) => ({ ...m })),
  hidRows: sh.hidRows ? new Set(sh.hidRows) : null, hidCols: sh.hidCols ? new Set(sh.hidCols) : null, nrows: sh.nrows, ncols: sh.ncols,
  filter: sh.filter ? { ...sh.filter, hide: Object.fromEntries(Object.entries(sh.filter.hide || {}).map(([k, v]) => [k, new Set(v)])), rows: new Set(sh.filter.rows || []) } : null,
});

export function install(app) {
  // ----- بناء الأشرطة -----
  const build = () => {
    const rt = document.querySelector('.rtabs');
    rt.innerHTML = '<button data-rt="file" role="tab">ملف</button><button data-rt="home" role="tab" class="on">الرئيسية</button><button data-rt="insert" role="tab">إدراج</button><button data-rt="formulas" role="tab">صيغ</button><button data-rt="data" role="tab">بيانات</button><button data-rt="view" role="tab">عرض</button>';
    const rib = document.querySelector('.ribbon');
    for (const t of ['insert', 'formulas', 'data']) { const d = document.createElement('div'); d.className = 'rpanel'; d.dataset.t = t; d.hidden = true; d.innerHTML = RIBBON[t]; rib.insertBefore(d, rib.querySelector('[data-t=view]')); }
    rib.querySelector('[data-t=home]').insertAdjacentHTML('beforeend', HOME_EXTRA);
    rib.querySelector('[data-t=view]').insertAdjacentHTML('beforeend', VIEW_EXTRA);
    // الأيقونات تُحقن في الأزرار الأساسية الموجودة أصلًا في الصفحة
    const sb = document.querySelector('.statusbar');
    sb.insertAdjacentHTML('beforeend', `<span id="zoomctl" class="zoomctl" dir="ltr"><button data-act="zoomOut" title="تصغير" aria-label="تصغير">−</button><input id="zoomrng" type="range" min="25" max="400" step="5" value="100" aria-label="التكبير"><button data-act="zoomIn" title="تكبير" aria-label="تكبير">+</button><button id="zoomval" data-act="zoomMenu" title="مستوى التكبير">100%</button></span>`);
    // استبدال زر المسح القديم بقائمة «مسح» الكاملة
    const oc = document.getElementById('btn-clear'); if (oc) oc.remove();
    const fx = document.getElementById('btn-autosum'); if (fx) { fx.removeAttribute('id'); fx.dataset.act = 'sumMenu'; fx.title = 'جمع تلقائي ▾ (Alt+=)'; }
  };
  build();

  Object.assign(app, {
    // ======== توزيع الأوامر ========
    act(name, btn) {
      const p = this.pane();
      const need = () => { if (!p.sh) { this.toast('افتح ملفًا أولًا'); return false; } if (p.editing) p.commitEdit(); return true; };
      const [a, arg] = name.split(':');
      const noNeed = ['zoomMenu'];
      if (!noNeed.includes(a) && !need()) return;
      switch (a) {
        case 'insRow': return this.insertLines(p, 'r');
        case 'insCol': return this.insertLines(p, 'c');
        case 'delRow': return this.deleteLines(p, 'r');
        case 'delCol': return this.deleteLines(p, 'c');
        case 'newSheet': return this.addSheet(p);
        case 'fnDialog': return this.fnDialog();
        case 'today': return this.putNow(p, 'date');
        case 'nowTime': return this.putNow(p, 'time');
        case 'sumMenu': return this.sumMenu(btn);
        case 'lib': return this.libMenu(btn, arg);
        case 'showF': return this.toggleShowF();
        case 'calcNow': return this.calcNow(true);
        case 'sortAZ': return this.sortSel(p, 'asc');
        case 'sortZA': return this.sortSel(p, 'desc');
        case 'sortDlg': return this.sortDialog(p);
        case 'filter': return this.toggleFilter(p);
        case 'clearFilter': return this.clearFilter(p);
        case 'removeDup': return this.removeDuplicates(p);
        case 'textToCols': return this.textToColumns(p);
        case 'mergeMenu': return this.mergeMenu(btn);
        case 'borderMenu': return this.borderMenu(btn);
        case 'fillMenu': return this.fillMenu(btn);
        case 'clearMenu': return this.clearMenu(btn);
        case 'fmtMenu': return this.fmtMenu(btn);
        case 'sortMenu': return this.sortMenu(btn);
        case 'findDlg': return this.findDialog();
        case 'zoomIn': return p.setZoom((p.z || 1) + 0.1);
        case 'zoomOut': return p.setZoom((p.z || 1) - 0.1);
        case 'zoom100': return p.setZoom(1);
        case 'zoomSel': return this.zoomToSelection(p);
        case 'zoomMenu': return this.zoomMenu(btn);
        case 'toggleFbar': return this.toggleFbar();
      }
    },
    menu(anchor, items, cls = 'menu-cmd') {
      const el = document.createElement('div'); el.className = cls;
      el.innerHTML = items.map((it, i) => it === '-' ? '<div class="sep"></div>' : it.h ? `<div class="mh">${tr(it.h)}</div>` : `<button class="it${it.on ? ' on' : ''}${it.off ? ' off' : ''}" data-i="${i}"><span class="ck">✓</span><span class="nl">${tr(it.t)}</span>${it.k ? `<span class="ns">${it.k}</span>` : ''}</button>`).join('');
      el.addEventListener('click', (e) => { const b = e.target.closest('.it'); if (!b || b.classList.contains('off')) return; closePopover(); const f = items[+b.dataset.i].f; if (f) setTimeout(f, 0); });
      return openPopover(anchor, el);
    },
    // ======== نوافذ إدخال ========
    form(title, html, buttons, init) {
      const dlg = document.createElement('dialog'); dlg.className = 'dlg';
      dlg.innerHTML = `<h2>${tr(title)}</h2><div class="dbody">${html}</div><div class="btns">${buttons.map((b, i) => `<button data-i="${i}" class="${b.primary ? 'primary' : ''}">${tr(b.label)}</button>`).join('')}</div>`;
      document.body.appendChild(dlg);
      return new Promise((res) => {
        const done = (v) => { dlg.close(); setTimeout(() => dlg.remove(), 50); res(v); };
        dlg.addEventListener('click', (e) => { const b = e.target.closest('.btns button'); if (!b) return; const x = buttons[+b.dataset.i]; done(x.value === true ? { el: dlg } : (x.value ?? null)); if (x.value === true) { /* العنصر ما زال متاحًا للقراءة قبل الحذف */ } });
        dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
        dlg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT' && e.target.type !== 'button') { e.preventDefault(); const p = dlg.querySelector('.btns .primary'); p && p.click(); } });
        dlg.showModal(); if (init) init(dlg);
      });
    },
    async askNumber(title, label, value, min, max) {
      const r = await this.form(title, `<label class="field"><span>${tr(label)}</span><input type="number" class="num" min="${min}" max="${max}" step="any" value="${value}" inputmode="decimal"></label>`, [{ label: 'موافق', value: true, primary: true }, { label: 'إلغاء', value: null }], (d) => { const i = d.querySelector('input'); i.focus(); i.select(); });
      if (!r) return null; const v = parseFloat(r.el.querySelector('input').value); return isNaN(v) ? null : Math.max(min, Math.min(max, v));
    },
    // ======== لقطات للتراجع في العمليات البنيوية ========
    structOp(p, fn, flags = {}) {
      const sh = p.sh, wb = p.wb, before = snapOf(sh);
      fn(sh);
      const after = snapOf(sh);
      const { hid, ...fl } = flags; Object.assign(sh, fl);
      if (hid || sh.hidRows || before.hidRows) { sh.hidTouched = new Set([...(sh.hidTouched || []), ...(before.hidRows || []), ...(sh.hidRows || [])]); sh.hidColsTouched = new Set([...(sh.hidColsTouched || []), ...(before.hidCols || []), ...(sh.hidCols || [])]); }
      this.undo.get(wb.id).push({ sheetId: sh.id, snap: { before, after } }); this.redo.set(wb.id, []);
      this.markDirty(wb); this.afterStruct(wb, sh);
    },
    restoreSnap(wb, sh, s) {
      sh.cells = new Map(s.cells); sh.colW = { ...s.colW }; sh.rowH = { ...s.rowH }; sh.merges = s.merges.map((m) => ({ ...m }));
      sh.hidRows = s.hidRows ? new Set(s.hidRows) : null; sh.hidCols = s.hidCols ? new Set(s.hidCols) : null; sh.nrows = s.nrows; sh.ncols = s.ncols;
      sh.filter = s.filter ? { ...s.filter, hide: Object.fromEntries(Object.entries(s.filter.hide).map(([k, v]) => [k, new Set(v)])), rows: new Set(s.filter.rows) } : null;
      sh.rewrite = true; sh.mergesEdited = true; sh.hidTouched = new Set([...(sh.hidTouched || []), ...(sh.hidRows || [])]);
      for (const k of sh.cells.keys()) sh.edited.add(k);
      this.markDirty(wb); this.afterStruct(wb, sh);
    },
    afterStruct(wb, sh) {
      try { const t = recalc(wb, null); void t; } catch (e) { console.error(e); }
      this.panes.forEach((q) => { if (q.wb === wb && q.sh === sh) { q.axes(); q.block = null; q.render(true); q.updateSel(); } else if (q.wb === wb && q.sh) { q.render(true); } });
    },
    fullRecalc(wb) {
      const old = new Map();
      for (const sh of wb.sheets) for (const [k, c] of sh.cells) if (c.f != null) { old.set(sh.id + '|' + k, c.v); c.v = undefined; }
      wb._unsup = new Set(); recalc(wb, null);
      for (const sh of wb.sheets) for (const [k, c] of sh.cells) if (c.f != null) { const o = old.get(sh.id + '|' + k); if (c.v === '#NAME?' && o !== undefined && o !== '#NAME?') c.v = o; }
    },
    calcNow(toast) {
      const p = this.pane(); if (!p.wb) return;
      this.fullRecalc(p.wb); this.panes.forEach((q) => { if (q.wb === p.wb && q.sh) { q.render(true); q.updateSel(); q.refreshHead(); } });
      if (toast) this.toast('تمت إعادة حساب كل الصيغ');
    },

    // ======== إدراج وحذف صفوف/أعمدة ========
    shiftAxis(sh, axis, at, n) {
      const k = Math.abs(n), mp = (i, end) => (n > 0 ? (i >= at ? i + n : i) : i < at ? i : i >= at + k ? i - k : -1);
      const nc = new Map();
      for (const [kk, cell] of sh.cells) {
        const [r, c] = unkey(kk); const i = axis === 'r' ? r : c; const j = mp(i); if (j < 0) continue;
        nc.set(axis === 'r' ? key(j, c) : key(r, j), cell);
      }
      sh.cells = nc;
      const sz = axis === 'r' ? 'rowH' : 'colW', old = sh[sz], nw = {};
      for (const [i, v] of Object.entries(old)) { const j = mp(+i); if (j >= 0) nw[j] = v; }
      sh[sz] = nw;
      const hk = axis === 'r' ? 'hidRows' : 'hidCols';
      if (sh[hk]) { const s = new Set(); for (const i of sh[hk]) { const j = mp(i); if (j >= 0) s.add(j); } sh[hk] = s; }
      sh.merges = (sh.merges || []).map((m) => {
        const a = axis === 'r' ? ['r1', 'r2'] : ['c1', 'c2']; const o = { ...m };
        if (n > 0) { if (o[a[0]] >= at) o[a[0]] += n; if (o[a[1]] >= at) o[a[1]] += n; }
        else { for (const t of a) { const i = o[t]; o[t] = i < at ? i : i >= at + k ? i - k : (t === a[0] ? at : at - 1); } }
        return o;
      }).filter((m) => m.r2 >= m.r1 && m.c2 >= m.c1 && (m.r2 > m.r1 || m.c2 > m.c1));
      if (axis === 'r') sh.nrows = Math.max(1000, sh.nrows + Math.max(0, n)); else sh.ncols = Math.max(40, sh.ncols + Math.max(0, n));
      if (sh.filter) { sh.filter = null; }
    },
    fixFormulas(wb, sh, axis, at, n) {
      for (const s2 of wb.sheets) for (const [kk, cell] of s2.cells) {
        if (cell.f == null) continue;
        const f2 = adjustFormula(cell.f, axis, at, n, sh.name, s2.name);
        if (f2 !== cell.f) { s2.cells.set(kk, { ...cell, f: f2, v: undefined }); s2.edited.add(kk); }
      }
    },
    insertLines(p, axis) {
      const g = p.range(), at = axis === 'r' ? g.r1 : g.c1, n = axis === 'r' ? g.r2 - g.r1 + 1 : g.c2 - g.c1 + 1;
      this.structNotice(p);
      this.structOp(p, (sh) => { this.shiftAxis(sh, axis, at, n); this.fixFormulas(p.wb, sh, axis, at, n); }, { rewrite: true, hid: 1, mergesEdited: true });
      p.select(g.r1, g.c1, g.r2, g.c2, false); this.flash(p, g);
      this.toast(axis === 'r' ? `أُدرج ${n} ${n > 1 ? 'صفوف' : 'صف'}` : `أُدرج ${n} ${n > 1 ? 'أعمدة' : 'عمود'}`);
    },
    deleteLines(p, axis) {
      const g = p.range(), at = axis === 'r' ? g.r1 : g.c1, n = axis === 'r' ? g.r2 - g.r1 + 1 : g.c2 - g.c1 + 1;
      this.structNotice(p);
      this.structOp(p, (sh) => { this.shiftAxis(sh, axis, at, -n); this.fixFormulas(p.wb, sh, axis, at, -n); }, { rewrite: true, hid: 1, mergesEdited: true });
      p.select(g.r1, g.c1, g.r1, g.c1, false);
      this.toast(axis === 'r' ? `حُذف ${n} ${n > 1 ? 'صفوف' : 'صف'}` : `حُذف ${n} ${n > 1 ? 'أعمدة' : 'عمود'}`);
    },
    structNotice(p) {
      if (p.wb._structToast || p.wb.kind === 'new' || p.wb.kind === 'csv') return; p.wb._structToast = true;
      this.toast('ملاحظة: بعد الإدراج/الحذف تُعاد كتابة الورقة عند الحفظ، وقد تتغير تنسيقات متقدمة لا يدعمها التطبيق.', 6000);
    },
    putNow(p, kind) {
      const d = new Date(); let cell;
      if (kind === 'date') cell = { v: new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), s: { nf: 'yyyy-mm-dd' } };
      else cell = { v: (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400, s: { nf: 'hh:mm' } };
      const g = p.range(), ch = []; for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { const old = p.sh.cells.get(key(r, c)); ch.push({ r, c, cell: { ...cell, s: { ...((old && old.s) || {}), ...cell.s } } }); }
      this.applyChanges(p.wb, p.sh, ch); this.flash(p, g); p.focus();
    },

    // ======== دمج الخلايا ========
    mergeMenu(btn) {
      this.menu(btn, [{ t: 'دمج وتوسيط', f: () => this.mergeCells('center') }, { t: 'دمج الخلايا', f: () => this.mergeCells('plain') }, { t: 'دمج عبر الصفوف', f: () => this.mergeCells('across') }, '-', { t: 'فصل الخلايا', f: () => this.unmergeCells() }]);
    },
    mergeCells(mode) {
      const p = this.pane(); if (!p.sh) return this.toast('افتح ملفًا أولًا'); if (p.editing) p.commitEdit();
      const g = p.range(), sh = p.sh;
      if (g.r1 === g.r2 && g.c1 === g.c2) {
        const m = p.mergeAt(g.r1, g.c1); if (m) return this.unmergeCells(); return this.toast('حدد خليتين أو أكثر لدمجها');
      }
      const exact = (sh.merges || []).find((m) => m.r1 === g.r1 && m.r2 === g.r2 && m.c1 === g.c1 && m.c2 === g.c2);
      if (exact) return this.unmergeCells();
      const rects = mode === 'across' ? Array.from({ length: g.r2 - g.r1 + 1 }, (_, i) => ({ r1: g.r1 + i, r2: g.r1 + i, c1: g.c1, c2: g.c2 })) : [{ ...g }];
      if (mode === 'across' && g.c1 === g.c2) return this.toast('حدد أكثر من عمود للدمج عبر الصفوف');
      let lost = 0; for (const rc of rects) for (let r = rc.r1; r <= rc.r2; r++) for (let c = rc.c1; c <= rc.c2; c++) { if (r === rc.r1 && c === rc.c1) continue; const x = sh.cells.get(key(r, c)); if (x && (x.v != null || x.f != null)) lost++; }
      const go = () => {
        this.structOp(p, (s) => {
          for (const rc of rects) {
            s.merges = (s.merges || []).filter((m) => !(m.r1 <= rc.r2 && m.r2 >= rc.r1 && m.c1 <= rc.c2 && m.c2 >= rc.c1));
            for (let r = rc.r1; r <= rc.r2; r++) for (let c = rc.c1; c <= rc.c2; c++) { if (r === rc.r1 && c === rc.c1) continue; const k = key(r, c); if (s.cells.has(k)) { s.cells.delete(k); s.edited.add(k); } }
            s.merges.push({ ...rc });
            if (mode === 'center') { const k = key(rc.r1, rc.c1), old = s.cells.get(k) || { v: null }; s.cells.set(k, { ...old, s: { ...(old.s || {}), al: 'center' } }); s.edited.add(k); }
          }
        }, { mergesEdited: true });
        p.select(g.r1, g.c1, g.r2, g.c2, false); this.flash(p, g);
      };
      if (lost) this.dialog('دمج الخلايا', 'الدمج يُبقي قيمة الخلية العلوية اليمنى/اليسرى فقط ويحذف قيم باقي الخلايا. هل تريد المتابعة؟', [{ label: 'دمج', value: true, primary: true }, { label: 'إلغاء', value: false }]).then((ok) => ok && go()); else go();
    },
    unmergeCells() {
      const p = this.pane(); if (!p.sh) return; const g = p.range();
      const hit = (p.sh.merges || []).filter((m) => m.r1 <= g.r2 && m.r2 >= g.r1 && m.c1 <= g.c2 && m.c2 >= g.c1);
      if (!hit.length) return this.toast('لا توجد خلايا مدمجة في التحديد');
      this.structOp(p, (s) => { s.merges = s.merges.filter((m) => !hit.includes(m)); }, { mergesEdited: true });
      p.select(g.r1, g.c1, g.r2, g.c2, false);
    },

    // ======== حدود الخلايا ========
    borderMenu(btn) {
      const set = (kind) => () => this.setBorder(kind);
      this.menu(btn, [{ t: 'كل الحدود', f: set('all') }, { t: 'حدود خارجية', f: set('outer') }, '-', { t: 'حد علوي', f: set('top') }, { t: 'حد سفلي', f: set('bottom') }, { t: 'حد أيسر', f: set('left') }, { t: 'حد أيمن', f: set('right') }, '-', { t: 'بلا حدود', f: set('none') }]);
    },
    setBorder(kind) {
      const p = this.pane(); if (!p.sh) return; if (p.editing) p.commitEdit(); const g = p.range(), ch = [];
      for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) {
        const old = p.sh.cells.get(key(r, c)) || { v: null }; const st = { ...(old.s || {}) }; let bd = new Set((st.bd || '').split(''));
        const edge = { t: r === g.r1, b: r === g.r2, l: c === g.c1, r: c === g.c2 };
        if (kind === 'all') ['t', 'b', 'l', 'r'].forEach((x) => bd.add(x));
        else if (kind === 'none') bd = new Set();
        else if (kind === 'outer') ['t', 'b', 'l', 'r'].forEach((x) => edge[x] && bd.add(x));
        else { const x = { top: 't', bottom: 'b', left: 'l', right: 'r' }[kind]; if (edge[x]) bd.add(x); }
        const had = old.s && old.s.bd;
        if (bd.size) st.bd = [...bd].join(''); else if (had) st.bd = ''; else delete st.bd;
        if (!had && !bd.size) continue;
        const cell = { ...old }; if (Object.keys(st).length) cell.s = st; else delete cell.s;
        ch.push({ r, c, cell: cell.v == null && cell.f == null && !cell.s ? null : cell });
      }
      if (ch.length) this.applyChanges(p.wb, p.sh, ch); p.focus(); this.flash(p, g);
    },

    // ======== تعبئة ومسح وتنسيق ========
    fillMenu(btn) {
      this.menu(btn, [{ t: 'لأسفل', k: 'Ctrl+D', f: () => this.fillEdge('down') }, { t: 'لليمين', k: 'Ctrl+R', f: () => this.fillEdge('right') }]);
    },
    clearMenu(btn) {
      this.menu(btn, [{ t: 'مسح الكل', f: () => this.clearWhat('all') }, { t: 'مسح التنسيقات', f: () => this.clearWhat('fmt') }, { t: 'مسح المحتويات', k: 'Del', f: () => this.clearWhat('val') }]);
    },
    clearWhat(w) {
      const p = this.pane(); if (!p.sh) return; if (p.editing) p.commitEdit(); const g = p.range(), ch = [];
      if (w === 'val') return this.clearRange(p);
      for (const [k, cell] of p.sh.cells) {
        const [r, c] = unkey(k); if (r < g.r1 || r > g.r2 || c < g.c1 || c > g.c2) continue;
        if (w === 'all') ch.push({ r, c, cell: null });
        else if (cell.s) ch.push({ r, c, cell: { ...cell, s: { b: 0, i: 0, u: 0, color: null, fill: null, font: null, sz: null, al: null, wrap: 0, nf: 'General', bd: '' } } });
      }
      if (w === 'all') this.unmergeIn(p, g);
      if (ch.length) this.applyChanges(p.wb, p.sh, ch); this.flash(p, g); p.focus();
    },
    unmergeIn(p, g) {
      const hit = (p.sh.merges || []).filter((m) => m.r1 <= g.r2 && m.r2 >= g.r1 && m.c1 <= g.c2 && m.c2 >= g.c1);
      if (hit.length) this.structOp(p, (s) => { s.merges = s.merges.filter((m) => !hit.includes(m)); }, { mergesEdited: true });
    },
    fmtMenu(btn) {
      this.menu(btn, [
        { t: 'ارتفاع الصف…', f: () => this.setLineSize('r') }, { t: 'عرض العمود…', f: () => this.setLineSize('c') },
        { t: 'ملاءمة ارتفاع الصف', f: () => this.autoFitSel('r') }, { t: 'ملاءمة عرض العمود', f: () => this.autoFitSel('c') }, '-',
        { t: 'إخفاء الصفوف', f: () => this.hideLines('r', true) }, { t: 'إظهار الصفوف', f: () => this.hideLines('r', false) },
        { t: 'إخفاء الأعمدة', f: () => this.hideLines('c', true) }, { t: 'إظهار الأعمدة', f: () => this.hideLines('c', false) }]);
    },
    async setLineSize(axis) {
      const p = this.pane(); if (!p.sh) return; const g = p.range(), sh = p.sh;
      const cur = axis === 'r' ? (sh.rowH[g.r1] || 26) * 0.75 : ((sh.colW[g.c1] || 96) - 5) / 7;
      const v = await this.askNumber(axis === 'r' ? 'ارتفاع الصف' : 'عرض العمود', axis === 'r' ? 'الارتفاع (بالنقاط)' : 'العرض (بعدد الأحرف)', Math.round(cur * 10) / 10, axis === 'r' ? 1 : 1, axis === 'r' ? 409 : 255);
      if (v == null) return; const px = Math.round(axis === 'r' ? v * 4 / 3 : v * 7 + 5), list = [];
      const a = axis === 'r' ? g.r1 : g.c1, b = axis === 'r' ? g.r2 : g.c2;
      for (let i = a; i <= b; i++) { (axis === 'r' ? sh.rowH : sh.colW)[i] = px; list.push(i); }
      if (axis === 'r') { sh.rowManual = sh.rowManual || new Set(); list.forEach((i) => sh.rowManual.add(i)); }
      p.axes(); p.block = null; p.render(true); p.updateSel(); this.dimsChanged(p, axis === 'r' ? 'row' : 'col', list);
    },
    autoFitSel(axis) {
      const p = this.pane(); if (!p.sh) return; const g = p.range();
      if (axis === 'c') { for (let c = g.c1; c <= g.c2; c++) p.autofit('col', c); }
      else { const sh = p.sh; const list = []; for (let r = g.r1; r <= g.r2; r++) { delete sh.rowH[r]; list.push(r); } p.axes(); p.block = null; p.render(true); p.updateSel(); this.dimsChanged(p, 'row', list); this.fitWrapRows(p, g); }
    },
    hideLines(axis, hide) {
      const p = this.pane(); if (!p.sh) return; const g = p.range(); const k = axis === 'r' ? 'hidRows' : 'hidCols';
      const a = axis === 'r' ? g.r1 : g.c1, b = axis === 'r' ? g.r2 : g.c2;
      if (hide && (b - a + 1) >= (axis === 'r' ? p.sh.nrows : p.sh.ncols)) return this.toast('لا يمكن إخفاء كل الورقة');
      this.structOp(p, (s) => {
        const set = s[k] = new Set(s[k] || []);
        if (hide) for (let i = a; i <= b; i++) set.add(i);
        else for (let i = Math.max(0, a - 1); i <= b + 1; i++) set.delete(i);
      }, { hid: 1 });
      p.select(g.r1, g.c1, g.r2, g.c2, false);
      if (!hide) this.toast('أُظهرت الصفوف/الأعمدة المخفية بجوار التحديد');
    },

    // ======== الترتيب ========
    sortMenu(btn) {
      this.menu(btn, [{ t: 'ترتيب من أ إلى ي', f: () => this.sortSel(this.pane(), 'asc') }, { t: 'ترتيب من ي إلى أ', f: () => this.sortSel(this.pane(), 'desc') }, { t: 'ترتيب مخصص…', f: () => this.sortDialog(this.pane()) }, '-', { t: 'تصفية', f: () => this.toggleFilter(this.pane()) }, { t: 'مسح التصفية', f: () => this.clearFilter(this.pane()) }]);
    },
    // نطاق البيانات المحيط بالخلية (كما في Excel عند ترتيب/تصفية خلية واحدة)
    region(p) {
      const g = p.range(); if (g.r1 !== g.r2 || g.c1 !== g.c2) return { ...g, explicit: true };
      const sh = p.sh, has = (r, c) => { const x = sh.cells.get(key(r, c)); return x && (x.v != null && x.v !== '' || x.f != null); };
      if (!has(g.r1, g.c1)) { // الخلية فارغة: جرّب المجاورة العلوية
        if (g.r1 > 0 && has(g.r1 - 1, g.c1)) return this.region({ range: () => ({ r1: g.r1 - 1, r2: g.r1 - 1, c1: g.c1, c2: g.c1 }), sh });
        return null;
      }
      let r1 = g.r1, r2 = g.r1, c1 = g.c1, c2 = g.c1, ch = true;
      const rowHas = (r, a, b) => { for (let c = a; c <= b; c++) if (has(r, c)) return true; return false; }, colHas = (c, a, b) => { for (let r = a; r <= b; r++) if (has(r, c)) return true; return false; };
      while (ch) {
        ch = false;
        if (r1 > 0 && rowHas(r1 - 1, Math.max(0, c1 - 1), c2 + 1)) { r1--; ch = true; }
        if (rowHas(r2 + 1, Math.max(0, c1 - 1), c2 + 1)) { r2++; ch = true; }
        if (c1 > 0 && colHas(c1 - 1, Math.max(0, r1 - 1), r2 + 1)) { c1--; ch = true; }
        if (colHas(c2 + 1, Math.max(0, r1 - 1), r2 + 1)) { c2++; ch = true; }
      }
      return { r1, r2, c1, c2, explicit: false };
    },
    detectHeader(sh, g) {
      if (g.r2 <= g.r1) return false;
      let hdrText = 0, bodyText = 0, n = 0;
      for (let c = g.c1; c <= g.c2; c++) {
        const h = sh.cells.get(key(g.r1, c)), b = sh.cells.get(key(g.r1 + 1, c)); n++;
        if (h && typeof h.v === 'string') hdrText++;
        if (b && typeof b.v === 'string') bodyText++;
      }
      return hdrText === n && bodyText < n;
    },
    cmpVals(a, b, dir) {
      const rank = (x) => (x == null || x === '' ? 4 : typeof x === 'number' || x instanceof Date ? 1 : typeof x === 'string' ? 2 : 3);
      const na = a == null || a === '', nb = b == null || b === ''; if (na || nb) return na && nb ? 0 : na ? 1 : -1;
      const ra = rank(a), rb = rank(b); if (ra !== rb) return (ra - rb) * dir;
      if (ra === 1) return ((a instanceof Date ? +a : a) - (b instanceof Date ? +b : b)) * dir;
      if (ra === 2) return a.localeCompare(b, lang === 'ar' ? 'ar' : 'en', { numeric: true, sensitivity: 'base' }) * dir;
      return (Number(a) - Number(b)) * dir;
    },
    doSort(p, g, hasHeader, keys) { // keys: [{c, dir}]
      const sh = p.sh, r0 = g.r1 + (hasHeader ? 1 : 0); if (r0 >= g.r2) return this.toast('لا توجد صفوف كافية للترتيب');
      if ((sh.merges || []).some((m) => m.r1 <= g.r2 && m.r2 >= r0 && m.c1 <= g.c2 && m.c2 >= g.c1)) return this.toast('لا يمكن الترتيب بوجود خلايا مدمجة في النطاق. افصلها أولًا.');
      const rows = []; for (let r = r0; r <= g.r2; r++) rows.push(r);
      const val = (r, c) => { const x = sh.cells.get(key(r, c)); return x ? x.v : null; };
      const order = rows.map((r) => r).sort((x, y) => { for (const k of keys) { const d = this.cmpVals(val(x, k.c), val(y, k.c), k.dir); if (d) return d; } return x - y; });
      if (order.every((r, i) => r === rows[i])) return this.toast('البيانات مرتبة بالفعل');
      const ch = [];
      rows.forEach((dst, i) => {
        const src = order[i];
        for (let c = g.c1; c <= g.c2; c++) {
          const x = sh.cells.get(key(src, c)); let cell = x ? { ...x } : null;
          if (cell && cell.f != null && src !== dst) { cell.f = shiftFormula(cell.f, dst - src, 0); cell.v = undefined; }
          ch.push({ r: dst, c, cell });
        }
      });
      this.applyChanges(p.wb, sh, ch); this.flash(p, { r1: r0, r2: g.r2, c1: g.c1, c2: g.c2 }); p.focus();
    },
    sortSel(p, dir) {
      if (!p.sh) return this.toast('افتح ملفًا أولًا'); if (p.editing) p.commitEdit();
      const g = this.region(p); if (!g) return this.toast('حدد خلية داخل البيانات أولًا');
      const col = p.sel.ac >= g.c1 && p.sel.ac <= g.c2 ? p.sel.ac : g.c1;
      this.doSort(p, g, this.detectHeader(p.sh, g), [{ c: col, dir: dir === 'asc' ? 1 : -1 }]);
    },
    async sortDialog(p) {
      if (!p.sh) return this.toast('افتح ملفًا أولًا'); if (p.editing) p.commitEdit();
      const g = this.region(p); if (!g) return this.toast('حدد خلية داخل البيانات أولًا');
      const hdr = this.detectHeader(p.sh, g);
      const colLabel = (c, h) => { const x = h ? p.sh.cells.get(key(g.r1, c)) : null; return `${colName(c)}${x && x.v != null ? ' — ' + esc(String(x.v)) : ''}`; };
      const opts = (h) => { let o = ''; for (let c = g.c1; c <= g.c2; c++) o += `<option value="${c}"${c === Math.min(Math.max(p.sel.ac, g.c1), g.c2) ? ' selected' : ''}>${colLabel(c, h)}</option>`; return o; };
      const r = await this.form('ترتيب', `<div class="note">${tr('النطاق')}: ${a1(g.r1, g.c1)}:${a1(g.r2, g.c2)}</div><label class="chk"><input type="checkbox" id="sd-h"${hdr ? ' checked' : ''}><span>${tr('بياناتي لها صف عناوين')}</span></label>
        <label class="field"><span>${tr('ترتيب حسب')}</span><select id="sd-c1">${opts(hdr)}</select></label><label class="field"><span>${tr('الاتجاه')}</span><select id="sd-d1"><option value="1">${tr('من أ إلى ي / الأصغر للأكبر')}</option><option value="-1">${tr('من ي إلى أ / الأكبر للأصغر')}</option></select></label>
        <label class="field"><span>${tr('ثم حسب (اختياري)')}</span><select id="sd-c2"><option value="">—</option>${opts(hdr).replace(' selected', '')}</select></label><label class="field"><span>${tr('الاتجاه')}</span><select id="sd-d2"><option value="1">${tr('من أ إلى ي / الأصغر للأكبر')}</option><option value="-1">${tr('من ي إلى أ / الأكبر للأصغر')}</option></select></label>`,
      [{ label: 'ترتيب', value: true, primary: true }, { label: 'إلغاء', value: null }], (d) => d.querySelector('#sd-h').addEventListener('change', (e) => { const h = e.target.checked; d.querySelector('#sd-c1').innerHTML = opts(h); d.querySelector('#sd-c2').innerHTML = '<option value="">—</option>' + opts(h).replace(' selected', ''); }));
      if (!r) return; const q = (s) => r.el.querySelector(s);
      const keys = [{ c: +q('#sd-c1').value, dir: +q('#sd-d1').value }]; if (q('#sd-c2').value !== '') keys.push({ c: +q('#sd-c2').value, dir: +q('#sd-d2').value });
      this.doSort(p, g, q('#sd-h').checked, keys);
    },

    // ======== حذف المكرر / نص إلى أعمدة ========
    async removeDuplicates(p) {
      if (p.editing) p.commitEdit(); const g = this.region(p); if (!g) return this.toast('حدد النطاق أو خلية داخل البيانات');
      if (g.r1 === g.r2) return this.toast('لا توجد صفوف للمقارنة');
      const hdr = this.detectHeader(p.sh, g);
      let cols = ''; for (let c = g.c1; c <= g.c2; c++) { const x = p.sh.cells.get(key(g.r1, c)); cols += `<label class="chk"><input type="checkbox" class="dc" value="${c}" checked><span>${colName(c)}${hdr && x && x.v != null ? ' — ' + esc(String(x.v)) : ''}</span></label>`; }
      const r = await this.form('حذف القيم المكررة', `<div class="note">${tr('النطاق')}: ${a1(g.r1, g.c1)}:${a1(g.r2, g.c2)}</div><label class="chk"><input type="checkbox" id="dd-h"${hdr ? ' checked' : ''}><span>${tr('بياناتي لها صف عناوين')}</span></label><div class="sh2">${tr('الأعمدة المراد المقارنة بها')}</div>${cols}`, [{ label: 'حذف المكرر', value: true, primary: true }, { label: 'إلغاء', value: null }]);
      if (!r) return; const useC = [...r.el.querySelectorAll('.dc:checked')].map((x) => +x.value); if (!useC.length) return this.toast('اختر عمودًا واحدًا على الأقل');
      const r0 = g.r1 + (r.el.querySelector('#dd-h').checked ? 1 : 0), seen = new Set(), keep = [];
      for (let rr = r0; rr <= g.r2; rr++) {
        const k = useC.map((c) => { const x = p.sh.cells.get(key(rr, c)); return x ? String(x.v instanceof Date ? +x.v : x.v).toLowerCase() : ''; }).join('\u0001');
        if (!seen.has(k)) { seen.add(k); keep.push(rr); }
      }
      const removed = g.r2 - r0 + 1 - keep.length; if (!removed) return this.toast('لا توجد قيم مكررة');
      const ch = []; let dst = r0;
      for (const src of keep) { for (let c = g.c1; c <= g.c2; c++) { const x = p.sh.cells.get(key(src, c)); let cell = x ? { ...x } : null; if (cell && cell.f != null && src !== dst) { cell.f = shiftFormula(cell.f, dst - src, 0); cell.v = undefined; } ch.push({ r: dst, c, cell }); } dst++; }
      for (let rr = dst; rr <= g.r2; rr++) for (let c = g.c1; c <= g.c2; c++) ch.push({ r: rr, c, cell: null });
      this.applyChanges(p.wb, p.sh, ch); this.toast(`حُذف ${removed} صف مكرر، وبقي ${keep.length} صف فريد`);
    },
    async textToColumns(p) {
      if (p.editing) p.commitEdit(); const g = p.range(); if (g.c1 !== g.c2) return this.toast('حدد عمودًا واحدًا (أو جزءًا منه) لتقسيمه');
      const r = await this.form('نص إلى أعمدة', `<div class="note">${tr('سيُقسَّم نص كل خلية في التحديد إلى خلايا متجاورة، وتُستبدل الخلايا المجاورة التي على اليمين/اليسار.')}</div>
        <label class="field"><span>${tr('الفاصل')}</span><select id="tc-s"><option value=",">${tr('فاصلة ,')}</option><option value=";">${tr('فاصلة منقوطة ;')}</option><option value="\t">Tab</option><option value=" ">${tr('مسافة')}</option><option value="|">|</option><option value="-">-</option><option value="/">/</option><option value="*">${tr('آخر…')}</option></select></label><label class="field" id="tc-o" hidden><span>${tr('الفاصل المخصص')}</span><input id="tc-oi" maxlength="5"></label>`,
      [{ label: 'تقسيم', value: true, primary: true }, { label: 'إلغاء', value: null }], (d) => d.querySelector('#tc-s').addEventListener('change', (e) => { d.querySelector('#tc-o').hidden = e.target.value !== '*'; }));
      if (!r) return; let sep = r.el.querySelector('#tc-s').value; if (sep === '*') sep = r.el.querySelector('#tc-oi').value; if (!sep) return this.toast('أدخل الفاصل');
      const ch = []; let maxc = 0;
      for (let rr = g.r1; rr <= g.r2; rr++) {
        const x = p.sh.cells.get(key(rr, g.c1)); if (!x || x.f != null || x.v == null) continue;
        const parts = String(typeof x.v === 'string' ? x.v : rawText(x)).split(sep).map((t) => t.trim());
        parts.forEach((t, i) => { const old = i === 0 ? x : p.sh.cells.get(key(rr, g.c1 + i)); const nv = parseInput(t); ch.push({ r: rr, c: g.c1 + i, cell: nv ? { ...nv, ...(old && old.s ? { s: old.s } : {}) } : (old && old.s ? { v: null, s: old.s } : null) }); });
        maxc = Math.max(maxc, parts.length);
      }
      if (!ch.length) return this.toast('لا يوجد نص لتقسيمه');
      this.applyChanges(p.wb, p.sh, ch); p.select(g.r1, g.c1, g.r2, g.c1 + maxc - 1); this.toast(`قُسّم النص إلى ${maxc} أعمدة`);
    },

    // ======== التصفية ========
    toggleFilter(p) {
      if (p.editing) p.commitEdit(); const sh = p.sh;
      if (sh.filter) return this.clearFilter(p, true);
      const g = this.region(p); if (!g) return this.toast('حدد خلية داخل البيانات أولًا');
      this.structOp(p, (s) => { s.filter = { r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2, hide: {}, rows: new Set() }; }, {});
      this.toast('التصفية مفعّلة: اضغط على السهم فوق العمود لاختيار القيم');
    },
    clearFilter(p, off) {
      const sh = p.sh; if (!sh.filter) return off ? undefined : this.toast('لا توجد تصفية مفعّلة');
      this.structOp(p, (s) => { if (s.hidRows) for (const r of s.filter.rows) s.hidRows.delete(r); if (off) s.filter = null; else { s.filter.hide = {}; s.filter.rows = new Set(); } }, { hid: 1 });
    },
    applyFilter(p) {
      const f = p.sh.filter; const sh = p.sh;
      this.structOp(p, (s) => {
        const hr = s.hidRows = new Set(s.hidRows || []); for (const r of f.rows) hr.delete(r); f.rows = new Set();
        const act = Object.entries(f.hide).filter(([, v]) => v.size);
        for (let r = f.r1 + 1; r <= f.r2; r++) {
          for (const [c, set] of act) { const x = s.cells.get(key(r, +c)); if (set.has(x ? displayText(x) : '')) { f.rows.add(r); hr.add(r); break; } }
        }
      }, { hid: 1 });
    },
    filterMenu(p, c, anchor) {
      const sh = p.sh, f = sh.filter; if (!f) return;
      const counts = new Map(); for (let r = f.r1 + 1; r <= f.r2; r++) { const x = sh.cells.get(key(r, c)); const t = x ? displayText(x) : ''; counts.set(t, (counts.get(t) || 0) + 1); }
      const vals = [...counts.keys()].sort((a, b) => this.cmpVals(a, b, 1));
      const hid = new Set((f.hide[c] && [...f.hide[c]]) || []);
      const el = document.createElement('div'); el.className = 'menu-filter';
      el.innerHTML = `<button class="it" data-s="asc"><span class="nl">${tr('ترتيب من أ إلى ي')}</span></button><button class="it" data-s="desc"><span class="nl">${tr('ترتيب من ي إلى أ')}</span></button><div class="sep"></div>
        <input class="fsearch" placeholder="${tr('بحث…')}" aria-label="${tr('بحث')}"><label class="it fl"><input type="checkbox" class="fall"><span class="nl">${tr('(تحديد الكل)')}</span></label><div class="flist">${vals.map((v) => `<label class="it fl"><input type="checkbox" class="fv" data-v="${esc(v)}"${hid.has(v) ? '' : ' checked'}><span class="nl">${v === '' ? tr('(فارغ)') : esc(v)}</span><span class="ns">${counts.get(v)}</span></label>`).join('')}</div>
        <div class="fbtns"><button class="fok primary">${tr('موافق')}</button><button class="fclr">${tr('مسح عن هذا العمود')}</button></div>`;
      const o = openPopover(anchor, el, { cls: 'menu-filter' }); if (!o) return;
      const all = el.querySelector('.fall'), upd = () => { const bx = [...el.querySelectorAll('.fv')].filter((b) => !b.closest('.fl').hidden); all.checked = bx.every((b) => b.checked); };
      upd();
      all.addEventListener('change', () => el.querySelectorAll('.fv').forEach((b) => { if (!b.closest('.fl').hidden) b.checked = all.checked; }));
      el.querySelector('.flist').addEventListener('change', upd);
      el.querySelector('.fsearch').addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); el.querySelectorAll('.flist .fl').forEach((l) => { l.hidden = q && !l.textContent.toLowerCase().includes(q); }); upd(); });
      el.addEventListener('click', (e) => {
        const s = e.target.closest('[data-s]'); if (s) { closePopover(); const rr = { ...f }; this.doSort(p, { r1: f.r1, r2: f.r2, c1: f.c1, c2: f.c2 }, true, [{ c, dir: s.dataset.s === 'asc' ? 1 : -1 }]); return; }
        if (e.target.closest('.fok')) { closePopover(); const h = new Set(); el.querySelectorAll('.fv').forEach((b) => { if (!b.checked) h.add(b.dataset.v); }); f.hide[c] = h; this.applyFilter(p); }
        if (e.target.closest('.fclr')) { closePopover(); delete f.hide[c]; this.applyFilter(p); }
      });
    },

    // ======== الصيغ ========
    sumMenu(btn) {
      const f = (n) => () => this.autoSum(n);
      this.menu(btn, [{ t: 'مجموع (SUM)', k: 'Alt+=', f: f('SUM') }, { t: 'متوسط (AVERAGE)', f: f('AVERAGE') }, { t: 'عدد الأرقام (COUNT)', f: f('COUNT') }, { t: 'أكبر قيمة (MAX)', f: f('MAX') }, { t: 'أصغر قيمة (MIN)', f: f('MIN') }, '-', { t: 'المزيد من الدوال…', f: () => this.fnDialog() }]);
    },
    libMenu(btn, cat) {
      const list = FNS[cat] || [];
      const el = document.createElement('div'); el.className = 'menu-lib';
      el.innerHTML = list.map(([n, d]) => `<button class="it" data-n="${n}"><span class="fnn">${n}</span><span class="nl">${tr(d)}</span></button>`).join('') + `<div class="sep"></div><button class="it" data-m="1"><span class="nl">${tr('إدراج دالة…')}</span></button>`;
      el.addEventListener('click', (e) => { const b = e.target.closest('.it'); if (!b) return; closePopover(); if (b.dataset.m) this.fnDialog(cat); else this.insertFn(b.dataset.n); });
      openPopover(btn, el);
    },
    insertFn(name) {
      const p = this.pane(); if (!p.sh) return; const txt = name + '()';
      if (!p.editing) { p.startEdit('=' + txt, 'edit'); }
      else { const ed = p.editor.style.display === 'block' && !(document.activeElement === p.formula) ? p.editor : (document.activeElement === p.formula ? p.formula : p.editor); const s = ed.selectionStart ?? ed.value.length, e2 = ed.selectionEnd ?? s; const pre = ed.value.slice(0, s), post = ed.value.slice(e2); const ins = (pre === '' ? '=' : '') + txt; ed.value = pre + ins + post; p.formula.value = ed.value; if (ed === p.editor) { p.editor.value = ed.value; } ed.setSelectionRange(pre.length + ins.length - 1, pre.length + ins.length - 1); ed.focus(); p.fitEditor && p.fitEditor(); return; }
      const ed = p.editor; const n = ed.value.length - 1; ed.setSelectionRange(n, n);
    },
    async fnDialog(cat) {
      const p = this.pane(); if (!p.sh) return this.toast('افتح ملفًا أولًا'); if (p.editing && !p.editing.fbar) { /* نحافظ على الإدخال الجاري */ }
      const r = await this.form('إدراج دالة', `<input class="fsearch" id="fd-q" placeholder="${tr('ابحث عن دالة بالاسم أو الوصف')}" autocomplete="off"><label class="field"><span>${tr('الفئة')}</span><select id="fd-c"><option value="">${tr('الكل')}</option>${FN_CATS.map(([i, l]) => `<option value="${i}"${i === cat ? ' selected' : ''}>${tr(l)}</option>`).join('')}</select></label><div class="fd-list" id="fd-l" role="listbox"></div><div class="fd-info" id="fd-i"></div>`,
        [{ label: 'إدراج', value: true, primary: true }, { label: 'إلغاء', value: null }], (d) => {
          let sel = null; const L = d.querySelector('#fd-l'), I = d.querySelector('#fd-i');
          const draw = () => {
            const q = d.querySelector('#fd-q').value.trim().toLowerCase(), c = d.querySelector('#fd-c').value;
            const l = ALL_FNS.filter((f) => (!c || f.cat === c) && (!q || f.n.toLowerCase().includes(q) || tr(f.d).toLowerCase().includes(q) || f.d.includes(q)));
            L.innerHTML = l.map((f) => `<button class="it${sel === f.n ? ' on' : ''}" data-n="${f.n}" role="option"><span class="fnn">${f.n}</span><span class="nl">${tr(f.d)}</span></button>`).join('') || `<div class="note">${tr('لا توجد نتائج')}</div>`;
            const f = ALL_FNS.find((x) => x.n === sel); I.innerHTML = f ? `<b dir="ltr">${f.s}</b><div>${tr(f.d)}</div>` : '';
          };
          d.querySelector('#fd-q').addEventListener('input', draw); d.querySelector('#fd-c').addEventListener('change', draw);
          L.addEventListener('click', (e) => { const b = e.target.closest('.it'); if (b) { sel = b.dataset.n; d.dataset.sel = sel; draw(); } });
          L.addEventListener('dblclick', (e) => { const b = e.target.closest('.it'); if (b) { sel = b.dataset.n; d.dataset.sel = sel; d.querySelector('.btns .primary').click(); } });
          draw(); d.querySelector('#fd-q').focus();
        });
      if (!r) return; const n = r.el.dataset.sel; if (!n) return this.toast('اختر دالة من القائمة'); this.insertFn(n);
    },
    toggleShowF() {
      const p = this.pane(); if (!p.sh) return this.toast('افتح ملفًا أولًا'); p.sh.showF = !p.sh.showF;
      this.panes.forEach((q) => { if (q.sh === p.sh) q.render(true); });
      document.querySelectorAll('[data-act=showF]').forEach((b) => b.classList.toggle('on', !!p.sh.showF));
      this.toast(p.sh.showF ? 'عرض الصيغ مفعّل' : 'عرض النتائج');
    },

    // ======== بحث واستبدال ========
    findDialog(replaceMode) {
      let d = $('#find-dlg');
      if (d) { d.hidden = false; d.querySelector('.fd-rep').hidden = !replaceMode && d.dataset.rep !== '1'; const i = d.querySelector('#fr-f'); i.focus(); i.select(); if (replaceMode) { d.dataset.rep = '1'; d.querySelector('.fd-rep').hidden = false; } return; }
      d = document.createElement('div'); d.id = 'find-dlg'; d.className = 'finddlg'; d.dataset.rep = replaceMode ? '1' : '0';
      d.innerHTML = `<div class="fh"><b>${tr('بحث واستبدال')}</b><button class="fx2" aria-label="${tr('إغلاق')}">✕</button></div>
        <label class="field"><span>${tr('البحث عن')}</span><input id="fr-f" autocomplete="off"></label>
        <label class="field fd-rep"${replaceMode ? '' : ' hidden'}><span>${tr('استبدال بـ')}</span><input id="fr-r" autocomplete="off"></label>
        <div class="opts"><label class="chk"><input type="checkbox" id="fr-case"><span>${tr('مطابقة الحالة')}</span></label><label class="chk"><input type="checkbox" id="fr-whole"><span>${tr('مطابقة محتوى الخلية بالكامل')}</span></label><label class="chk"><input type="checkbox" id="fr-form"><span>${tr('البحث داخل الصيغ')}</span></label><label class="chk"><input type="checkbox" id="fr-all"><span>${tr('كل الأوراق')}</span></label></div>
        <div class="fr-st" id="fr-st"></div>
        <div class="btns"><button class="primary" id="fr-next">${tr('بحث عن التالي')}</button><button id="fr-cnt">${tr('عدّ الكل')}</button><button id="fr-show" class="fd-rep-b">${tr('استبدال')}</button><button id="fr-rall" class="fd-rep-b">${tr('استبدال الكل')}</button><button id="fr-rm">${tr('إظهار الاستبدال')}</button></div>`;
      document.body.appendChild(d); translateDom(d);
      const q = (s) => d.querySelector(s), st = (t) => { q('#fr-st').textContent = tr(t); };
      const showRep = (on) => { d.dataset.rep = on ? '1' : '0'; q('.fd-rep').hidden = !on; d.querySelectorAll('.fd-rep-b').forEach((b) => { b.hidden = !on; }); q('#fr-rm').hidden = on; };
      showRep(!!replaceMode);
      const opts = () => ({ text: q('#fr-f').value, cs: q('#fr-case').checked, whole: q('#fr-whole').checked, form: q('#fr-form').checked, all: q('#fr-all').checked });
      q('.fx2').addEventListener('click', () => { d.hidden = true; const p = this.pane(); p.sh && p.focus(); });
      q('#fr-rm').addEventListener('click', () => showRep(true));
      const textOf = (cell, o) => (o.form && cell.f != null ? '=' + cell.f : (cell.f != null ? displayText(cell) : rawText(cell)));
      const test = (cell, o) => { const t = textOf(cell, o); if (!t && t !== 0) return false; const a = o.cs ? String(t) : String(t).toLowerCase(), b = o.cs ? o.text : o.text.toLowerCase(); return o.whole ? a === b : a.includes(b); };
      const list = (o) => {
        const p = this.pane(); const out = []; const shs = o.all ? p.wb.sheets : [p.sh];
        for (const sh of shs) { const arr = []; for (const [k, cell] of sh.cells) { if (test(cell, o)) { const [r, c] = unkey(k); arr.push({ sh, r, c }); } } arr.sort((x, y) => x.r - y.r || x.c - y.c); out.push(...arr); }
        return out;
      };
      const goto = (m) => { const p = this.pane(); if (p.sh !== m.sh) p.setSheet(p.wb.sheets.indexOf(m.sh)); p.select(m.r, m.c); p.focus(); };
      const next = () => {
        const o = opts(); if (!o.text) return st('اكتب نصًا للبحث'); const p = this.pane(); if (!p.sh) return;
        const l = list(o); if (!l.length) return st('لم يُعثر على نتيجة'); const cur = { sh: p.sh, r: p.sel.ar, c: p.sel.ac };
        const si = (s) => p.wb.sheets.indexOf(s);
        const after = l.find((m) => si(m.sh) > si(cur.sh) || (m.sh === cur.sh && (m.r > cur.r || (m.r === cur.r && m.c > cur.c))));
        const m = after || l[0]; goto(m); st(`${l.indexOf(m) + 1} / ${l.length}${after ? '' : ' — ' + tr('عاد البحث إلى البداية')}`);
      };
      q('#fr-next').addEventListener('click', next);
      q('#fr-cnt').addEventListener('click', () => { const o = opts(); if (!o.text) return st('اكتب نصًا للبحث'); st(lang === 'ar' ? `عدد النتائج: ${list(o).length}` : `${list(o).length} found`); });
      const repl = (cell, o, to) => {
        const src = o.form && cell.f != null ? cell.f : (cell.f != null ? null : rawText(cell)); if (src == null) return null;
        const re = new RegExp(o.whole ? '^' + escRe(o.text) + '$' : escRe(o.text), 'g' + (o.cs ? '' : 'i'));
        const out = o.form && cell.f != null ? src.replace(re, () => to) : src.replace(re, () => to);
        if (out === src) return null;
        if (o.form && cell.f != null) return { ...cell, f: out.replace(/^=/, ''), v: undefined };
        const nv = parseInput(out); return nv ? { ...nv, ...(cell.s ? { s: cell.s } : {}) } : { v: null, ...(cell.s ? { s: cell.s } : {}) };
      };
      q('#fr-show').addEventListener('click', () => { // استبدال الحالية ثم التالي
        const o = opts(); const p = this.pane(); if (!o.text || !p.sh) return st('اكتب نصًا للبحث');
        const cell = p.sh.cells.get(key(p.sel.ar, p.sel.ac)); const n = cell && test(cell, o) ? repl(cell, o, q('#fr-r').value) : null;
        if (n) { this.applyChanges(p.wb, p.sh, [{ r: p.sel.ar, c: p.sel.ac, cell: n }]); st('تم الاستبدال'); }
        next();
      });
      q('#fr-rall').addEventListener('click', () => {
        const o = opts(); const p = this.pane(); if (!o.text || !p.sh) return st('اكتب نصًا للبحث'); let n = 0;
        const bySheet = new Map(); for (const m of list(o)) { const cell = m.sh.cells.get(key(m.r, m.c)); const nc = repl(cell, o, q('#fr-r').value); if (nc) { if (!bySheet.has(m.sh)) bySheet.set(m.sh, []); bySheet.get(m.sh).push({ r: m.r, c: m.c, cell: nc }); n++; } }
        for (const [sh, ch] of bySheet) this.applyChanges(p.wb, sh, ch);
        st(n ? (lang === 'ar' ? `تم استبدال ${n} موضع` : `${n} replaced`) : 'لم يُعثر على نتيجة');
      });
      d.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); next(); } if (e.key === 'Escape') q('.fx2').click(); });
      q('#fr-f').focus();
    },

    // ======== التكبير ========
    zoomChanged(p) { if (p === this.pane()) this.syncZoom(); },
    syncZoom() {
      const p = this.pane(), z = p && p.sh ? Math.round((p.z || 1) * 100) : 100, v = $('#zoomval'), r = $('#zoomrng');
      if (v) v.textContent = z + '%'; if (r) r.value = z;
    },
    zoomMenu(btn) {
      const p = this.pane(); const cur = Math.round(((p.sh && p.z) || 1) * 100);
      this.menu(btn, [25, 50, 75, 100, 125, 150, 200, 300, 400].map((z) => ({ t: z + '%', on: z === cur, f: () => p.sh && p.setZoom(z / 100) })).concat(['-', { t: 'تكبير للتحديد', f: () => this.zoomToSelection(p) }]));
    },
    zoomToSelection(p) {
      if (!p.sh) return; const g = p.range(), sc = p.scroller, z = p.z || 1;
      const w = (p.colX[g.c2 + 1] - p.colX[g.c1]) / z, h = (p.rowY[g.r2 + 1] - p.rowY[g.r1]) / z;
      const nz = Math.max(0.25, Math.min(4, Math.min((sc.clientWidth - 46 - 20) / w, (sc.clientHeight - 24 - 20) / h)));
      p.setZoom(nz); setTimeout(() => p.scrollTo(g.r1, g.c1), 0);
    },
    toggleFbar() { document.body.classList.toggle('nofbar'); document.querySelectorAll('[data-act=toggleFbar]').forEach((b) => b.classList.toggle('on', !document.body.classList.contains('nofbar'))); },
  });

  // أزرار الشريط والحالة تمر عبر act
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (!b || b.closest('#backstage')) return; app.act(b.dataset.act, b); }, false);
  document.addEventListener('input', (e) => { if (e.target.id === 'zoomrng') { const p = app.pane(); p.sh && p.setZoom(+e.target.value / 100); } });
  // أيقونات الأزرار
  document.querySelectorAll('.rb[data-act]').forEach((b) => b.setAttribute('type', 'button'));
  const oldStatus = app.updateStatus;
  app.updateStatus = function () { oldStatus.call(this); this.syncZoom(); };

  // الأسهم فوق أعمدة التصفية (تُرسم بعد كل رسم للشبكة)
  const oldRH = null; void oldRH;
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
void NO_ICON; void sleep; void isNumCell; void parseA1; void newSheet;
