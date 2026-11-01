// مساحة العمل: الملفات المفتوحة، اللوحتان، الحافظة، السحب بين الملفات، الحفظ والاستعادة
import { key, unkey, a1, toTSV, parseDelimited, parseInput, shiftFormula, esc, isNumCell } from './util.js';
import { Pane } from './pane.js';
import { newWorkbook, newSheet, readXlsx, readSheetJS, readCsv, writeXlsx, writeCsv, rebaseAfterSave } from './io.js';
import * as store from './store.js';
import { computeFill } from './fill.js';
import { settings, saveSettings, tr, lang, setLang, translateDom } from './i18n.js';
import { isNative, takeIntentFiles, rehydrate, b64ToBytes } from './native.js';

async function claimSlot() {
  if (!navigator.locks) return 1;
  for (let n = 1; n <= 8; n++) {
    const got = await new Promise((res) => navigator.locks.request('jadawel-slot-' + n, { ifAvailable: true }, (lock) => { if (!lock) { res(false); return undefined; } res(true); return new Promise(() => {}); }));
    if (got) return n;
  }
  return 1;
}

const NF_PRESETS = [['General', 'عام'], ['0', 'رقم'], ['0.00', 'رقم بخانتين'], ['#,##0', 'آلاف'], ['#,##0.00', 'آلاف بخانتين'], ['0%', 'نسبة %'], ['0.00%', 'نسبة بخانتين'], ['$#,##0.00', 'دولار'], ['#,##0.00 "ر.س"', 'ريال سعودي'], ['yyyy-mm-dd', 'تاريخ'], ['dd/mm/yyyy', 'تاريخ يوم/شهر/سنة'], ['hh:mm', 'وقت'], ['@', 'نص']];
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FS = 'showOpenFilePicker' in window && !window.__noFS;
const $ = (s) => document.querySelector(s);

const app = window.app = {
  wbs: [], panes: [], active: 0, layout: 'single', clip: null, undo: new Map(), redo: new Map(), saveTimers: new Map(),

  init() {
    const ws = $('#workspace');
    this.panes = [new Pane(this, 0, ws), new Pane(this, 1, ws)];
    this.panes.forEach((q) => translateDom(q.el));
    const div = document.createElement('div'); div.className = 'divider'; div.title = 'اسحب لتغيير حجم اللوحتين';
    ws.insertBefore(div, this.panes[1].el); this.divider = div;
    this.panes.forEach((p) => p.show(null));
    translateDom(document.body);
    this.bindUI(); this.bindDivider();
    this.setActive(0);
    claimSlot().then((n) => { this.slot = n; store.setSlot(n); if (n > 1) document.body.dataset.slot = n; return this.restore(); }).then(() => { this.handleLaunch(); });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  },

  // ---------- اللوحات والتبويبات ----------
  pane() { return this.panes[this.active]; },
  setActive(i) {
    if (this.layout === 'single') i = 0;
    if (this.active !== i && this.panes[this.active].editing) this.panes[this.active].commitEdit();
    this.active = i;
    this.panes.forEach((p) => p.el.classList.toggle('active', p.idx === i));
    this.renderTabs(); this.updateStatus();
  },
  setLayout(l) {
    this.layout = l;
    const ws = $('#workspace'); ws.dataset.layout = l;
    document.querySelectorAll('[data-layout-btn]').forEach((b) => b.classList.toggle('on', b.dataset.layoutBtn === l));
    if (l === 'single') { this.setActive(0); }
    else if (!this.panes[1].wb) {
      const other = this.wbs.find((w) => w !== this.panes[0].wb);
      if (other) this.panes[1].show(other);
    }
    this.panes.forEach((p) => p.render(true));
    this.renderTabs(); this.persistMeta();
  },
  showIn(paneIdx, wb) {
    const p = this.panes[paneIdx];
    p.show(wb); this.setActive(paneIdx); this.renderTabs(); this.persistMeta();
  },
  renderTabs() {
    const bar = $('#tabs');
    bar.innerHTML = this.wbs.map((w) => {
      const where = this.panes.filter((p) => p.wb === w && (p.idx === 0 || this.layout !== 'single')).map((p) => p.idx + 1);
      const on = this.pane().wb === w;
      return `<div class="ftab${on ? ' on' : ''}${where.length ? ' shown' : ''}" data-id="${w.id}" title="${esc(w.name)}">
        ${where.length ? `<span class="badge">${where.join('،')}</span>` : ''}<span class="fname">${esc(w.name)}</span>${w.dirty ? `<span class="dot" title="${tr('غير محفوظ')}">●</span>` : ''}
        <button class="x" data-close="${w.id}" title="${tr('إغلاق')}">×</button></div>`;
    }).join('');
    
    document.title = (this.pane().wb ? this.pane().wb.name + ' — ' : '') + 'جداول' + (this.slot > 1 ? ' (نافذة ' + this.slot + ')' : '');
  },
  async addWorkbook(wb, paneIdx) {
    this.wbs.push(wb);
    this.undo.set(wb.id, []); this.redo.set(wb.id, []);
    await store.putOrig(wb.id, wb.orig);
    await this.persist(wb);
    if (paneIdx == null) paneIdx = this.layout !== 'single' && !this.panes[1].wb && this.panes[0].wb ? 1 : this.active;
    this.showIn(paneIdx, wb);
  },
  async closeWb(id) {
    const wb = this.wbs.find((w) => w.id === id); if (!wb) return;
    if (wb.dirty) {
      const r = await this.dialog('إغلاق الملف', `يوجد في «${esc(wb.name)}» تعديلات غير محفوظة.`, [
        { label: 'حفظ ثم إغلاق', value: 'save', primary: true }, { label: 'إغلاق دون حفظ', value: 'discard', danger: true }, { label: 'إلغاء', value: null }]);
      if (!r) return;
      if (r === 'save' && !(await this.save(wb))) return;
    }
    this.wbs = this.wbs.filter((w) => w !== wb);
    this.panes.forEach((p) => { if (p.wb === wb) p.show(this.wbs.find((w) => !this.panes.some((q) => q.wb === w)) || null); });
    if (this.clip && this.clip.wbId === id) this.clip.cut = false;
    await store.delWb(id);
    this.renderTabs(); this.persistMeta(); this.updateStatus();
  },

  // ---------- التعديلات والتراجع ----------
  applyChanges(wb, sh, changes, record = true) {
    const before = [];
    let mr = 0, mc = 0;
    for (const ch of changes) {
      const k = key(ch.r, ch.c);
      before.push({ r: ch.r, c: ch.c, cell: sh.cells.get(k) || null });
      if (ch.cell && (ch.cell.v != null || ch.cell.f != null || ch.cell.s)) sh.cells.set(k, ch.cell); else sh.cells.delete(k);
      sh.edited.add(k);
      mr = Math.max(mr, ch.r); mc = Math.max(mc, ch.c);
    }
    if (record) { this.undo.get(wb.id).push({ sheetId: sh.id, before, after: changes }); if (this.undo.get(wb.id).length > 500) this.undo.get(wb.id).shift(); this.redo.set(wb.id, []); }
    this.markDirty(wb);
    this.panes.forEach((p) => { if (p.sh === sh) { p.grow(mr + 50, mc + 5); p.render(true); p.updateSel(); } });
    return before;
  },
  markDirty(wb, v = true) {
    wb.dirty = v;
    this.panes.forEach((p) => { if (p.wb === wb) p.refreshHead(); });
    this.renderTabs(); this.scheduleSave(wb);
  },
  undoRedo(redo) {
    const p = this.pane(); if (!p.wb) return;
    if (p.editing) p.commitEdit();
    const from = (redo ? this.redo : this.undo).get(p.wb.id), to = (redo ? this.undo : this.redo).get(p.wb.id);
    const op = from.pop(); if (!op) return this.toast(redo ? 'لا يوجد ما يُعاد' : 'لا يوجد ما يُتراجع عنه');
    const sh = p.wb.sheets.find((s) => s.id === op.sheetId);
    if (!sh) return this.toast('الورقة المرتبطة بهذا التعديل حُذفت');
    const list = redo ? op.after : op.before;
    this.applyChanges(p.wb, sh, list, false);
    to.push(op);
    if (p.sh !== sh) p.setSheet(p.wb.sheets.indexOf(sh));
    const rs = list.map((x) => x.r), cs = list.map((x) => x.c);
    p.select(Math.min(...rs), Math.min(...cs), Math.max(...rs), Math.max(...cs));
  },

  // ---------- الحافظة ----------
  grabRange(p) {
    const g = p.range(), grid = [];
    // تجنّب نسخ ملايين الخلايا الفارغة عند تحديد أعمدة/صفوف كاملة
    let mr = g.r1 - 1, mc = g.c1 - 1;
    for (const k of p.sh.cells.keys()) { const [r, c] = unkey(k); if (r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2) { if (r > mr) mr = r; if (c > mc) mc = c; } }
    const r2 = Math.min(g.r2, Math.max(mr, g.r1)), c2 = Math.min(g.c2, Math.max(mc, g.c1));
    for (let r = g.r1; r <= r2; r++) { const row = []; for (let c = g.c1; c <= c2; c++) row.push(p.sh.cells.get(key(r, c)) || null); grid.push(row); }
    return { grid, r1: g.r1, c1: g.c1, r2, c2 };
  },
  copy(cut, evt) {
    const p = this.pane(); if (!p.sh) return;
    const d = this.grabRange(p); const tsv = toTSV(d.grid);
    this.clip = { ...d, tsv, cut, wbId: p.wb.id, sheetId: p.sh.id };
    if (evt) { evt.clipboardData.setData('text/plain', tsv); evt.preventDefault(); }
    else if (navigator.clipboard) navigator.clipboard.writeText(tsv).catch(() => {});
    this.panes.forEach((q) => q.wb && q.showMarquee());
    this.toast(`${cut ? 'قص' : 'نسخ'} ${d.grid.length}×${d.grid[0].length} — الصق في أي ملف مفتوح`);
  },
  async pasteFromButton() {
    let text = null;
    try { text = await navigator.clipboard.readText(); } catch (e) { /* لا إذن: نستخدم الحافظة الداخلية */ }
    this.paste(text);
  },
  paste(text) {
    const p = this.pane(); if (!p.sh) return;
    const cl = this.clip;
    let block;
    if (cl && (text == null || text.replace(/\r/g, '') === cl.tsv)) block = { grid: cl.grid, src: cl };
    else if (text != null && text !== '') block = { grid: parseDelimited(text.replace(/\r?\n$/, ''), '\t').map((row) => row.map((t) => parseInput(t))) };
    else return this.toast('الحافظة فارغة');
    const g = p.range();
    this.pasteBlock(p, g.r1, g.c1, block);
  },
  pasteBlock(p, r0, c0, block) {
    const { grid, src } = block, changes = [];
    const dr = src ? r0 - src.r1 : 0, dc = src ? c0 - src.c1 : 0;
    const srcSh = src && this.findSheet(src.wbId, src.sheetId);
    // القص داخل الملف نفسه أو بين ملفين: نمسح المصدر أولًا ثم نكتب الهدف
    if (src && src.cut && srcSh) {
      const srcWb = this.wbs.find((w) => w.id === src.wbId);
      const clear = [];
      grid.forEach((row, i) => row.forEach((_, j) => { const old = srcSh.cells.get(key(src.r1 + i, src.c1 + j)); if (old) clear.push({ r: src.r1 + i, c: src.c1 + j, cell: old.s ? { v: null, s: old.s } : null }); }));
      if (srcSh !== p.sh) this.applyChanges(srcWb, srcSh, clear); else changes.push(...clear);
    }
    grid.forEach((row, i) => row.forEach((cell, j) => {
      const r = r0 + i, c = c0 + j;
      const old = p.sh.cells.get(key(r, c));
      let nc = null;
      if (cell && (cell.v != null || cell.f != null)) {
        nc = cell.f != null ? { f: shiftFormula(cell.f, dr, dc), v: undefined } : { v: cell.v };
        if (cell.f != null && !dr && !dc && p.sh === srcSh) nc.v = cell.v;
        if (cell.s && cell.s.nf) nc.s = { ...(old && old.s), nf: cell.s.nf };
        else if (old && old.s) nc.s = old.s;
      } else if (old && old.s) nc = { v: null, s: old.s };
      changes.push({ r, c, cell: nc });
    }));
    // نزيل التكرار (القص فوق المصدر نفسه): آخر قيمة تفوز
    const m = new Map(); changes.forEach((ch) => m.set(key(ch.r, ch.c), ch));
    this.applyChanges(p.wb, p.sh, [...m.values()]);
    if (src && src.cut) { this.clip = null; this.panes.forEach((q) => q.wb && q.showMarquee()); }
    p.select(r0, c0, r0 + grid.length - 1, c0 + grid[0].length - 1);
    p.focus();
  },
  findSheet(wbId, sheetId) { const w = this.wbs.find((x) => x.id === wbId); return w && w.sheets.find((s) => s.id === sheetId); },
  clearRange(p) {
    const g = p.range(), ch = [];
    for (const [k, old] of p.sh.cells) { const [r, c] = unkey(k); if (r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2 && (old.v != null || old.f != null)) ch.push({ r, c, cell: old.s ? { v: null, s: old.s } : null }); }
    if (ch.length) this.applyChanges(p.wb, p.sh, ch);
  },

  // ---------- السحب بين الملفين (ماوس / قلم / لمس) ----------
  dragStart(src, h, e) {
    const d = this.grabRange(src);
    const g = src.range();
    this.drag = { src, data: { grid: d.grid, src: { ...d, wbId: src.wb.id, sheetId: src.sh.id, cut: false } }, off: { r: h.r - g.r1, c: h.c - g.c1 }, target: null };
    const gh = this.ghost = document.createElement('div'); gh.className = 'ghost';
    gh.textContent = tr(`نسخ ${d.grid.length}×${d.grid[0].length} خلية — أفلِت في أي ملف`);
    document.body.appendChild(gh); document.body.classList.add('dragging');
    this.dragMove(e.clientX, e.clientY);
  },
  dragMove(x, y) {
    const d = this.drag; if (!d) return;
    this.ghost.style.left = x + 14 + 'px'; this.ghost.style.top = y + 14 + 'px';
    const el = document.elementFromPoint(x, y);
    const pe = el && el.closest('.pane');
    const p = pe && this.panes[+pe.dataset.pane];
    this.panes.forEach((q) => { q.dropEl.style.display = 'none'; });
    d.target = null;
    if (!p || !p.sh || !el.closest('.layer')) return;
    p.autoScroll({ clientX: x, clientY: y });
    const h = p.hit(x, y);
    const r = Math.max(0, h.r - d.off.r), c = Math.max(0, h.c - d.off.c);
    p.grow(r + d.data.grid.length + 50, c + d.data.grid[0].length + 5);
    p.box(p.dropEl, r, c, r + d.data.grid.length - 1, c + d.data.grid[0].length - 1);
    d.target = { p, r, c };
  },
  dragEnd(cancel) {
    const d = this.drag; if (!d) return;
    this.drag = null; this.ghost.remove(); document.body.classList.remove('dragging');
    this.panes.forEach((q) => { q.dropEl.style.display = 'none'; });
    if (cancel || !d.target) return;
    const { p, r, c } = d.target;
    if (p === d.src && r === d.data.src.r1 && c === d.data.src.c1) return;
    this.setActive(p.idx);
    this.pasteBlock(p, r, c, d.data);
    this.toast(`تم نسخ البيانات إلى «${p.wb.name}» عند ${a1(r, c)}`);
  },

  // عرض الملف الحالي في اللوحة الأخرى (ورقتان من نفس الملف جنبًا إلى جنب)
  secondView() {
    const p = this.pane(); if (!p.wb) return this.toast('افتح ملفًا أولًا');
    if (this.layout === 'single') this.setLayout(window.innerWidth < 700 ? 'v' : 'h');
    const q = this.panes[1 - p.idx], wb = p.wb, si = wb.sheets.indexOf(p.sh);
    q.show(wb, { si: wb.sheets.length > 1 ? (si + 1) % wb.sheets.length : si, sel: { ar: 0, ac: 0, fr: 0, fc: 0 }, st: 0, sl: 0 });
    this.renderTabs(); this.persistMeta();
    this.toast(wb.sheets.length > 1 ? 'اللوحتان تعرضان ورقتين من نفس الملف، وأي تعديل يظهر في الاثنتين' : 'اللوحتان تعرضان نفس الورقة. أضف ورقة جديدة لتتحكم بورقتين');
  },

  // ---------- التعبئة التلقائية ----------
  fill(p, src, target, dir, copy) {
    const ch = computeFill(src, target, (r, c) => p.sh.cells.get(key(r, c)), dir, copy);
    if (!ch.length) return;
    this.applyChanges(p.wb, p.sh, ch);
    p.select(Math.min(src.r1, target.r1), Math.min(src.c1, target.c1), Math.max(src.r2, target.r2), Math.max(src.c2, target.c2));
  },
  fillDownToData(p) {
    const src = p.range(); const has = (r, c) => c >= 0 && p.sh.cells.has(key(r, c));
    let nc = src.c1 - 1; if (!has(src.r2 + 1, nc)) nc = src.c2 + 1;
    let r = src.r2 + 1; while (has(r, nc)) r++;
    if (r === src.r2 + 1) return this.toast('لا توجد بيانات مجاورة لتحديد نهاية التعبئة');
    this.fill(p, src, { r1: src.r2 + 1, r2: r - 1, c1: src.c1, c2: src.c2 }, 'down', false);
  },
  fillEdge(dir) { // Ctrl+D / Ctrl+R
    const p = this.pane(); if (!p.sh) return; const g = p.range();
    if (dir === 'down') { if (g.r1 === g.r2) return; this.fill(p, { r1: g.r1, r2: g.r1, c1: g.c1, c2: g.c2 }, { r1: g.r1 + 1, r2: g.r2, c1: g.c1, c2: g.c2 }, 'down', true); }
    else { if (g.c1 === g.c2) return; this.fill(p, { r1: g.r1, r2: g.r2, c1: g.c1, c2: g.c1 }, { r1: g.r1, r2: g.r2, c1: g.c1 + 1, c2: g.c2 }, 'right', true); }
  },
  dimsChanged(p, kind, list) {
    const sh = p.sh; const set = kind === 'col' ? (sh.colEdited = sh.colEdited || new Set()) : (sh.rowEdited = sh.rowEdited || new Set());
    list.forEach((i) => set.add(i));
    this.markDirty(p.wb);
    this.panes.forEach((q) => { if (q !== p && q.sh === sh) { q.axes(); q.block = null; q.render(true); q.updateSel(); } });
  },

  // ---------- التنسيق ----------
  formatSel(p, mutate) {
    p = p || this.pane(); if (!p.sh) return;
    if (p.editing) p.commitEdit();
    const g = p.range();
    if ((g.r2 - g.r1 + 1) * (g.c2 - g.c1 + 1) > 60000) return this.toast('النطاق كبير جدًا للتنسيق دفعة واحدة. حدد نطاقًا أصغر.');
    const ch = [];
    for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) {
      const old = p.sh.cells.get(key(r, c)); const st = { ...((old && old.s) || {}) };
      mutate(st, old);
      const cell = { ...(old || { v: null }) }; if (Object.keys(st).length) cell.s = st; else delete cell.s;
      ch.push({ r, c, cell: cell.v == null && cell.f == null && !cell.s ? null : cell });
    }
    this.applyChanges(p.wb, p.sh, ch); p.focus();
  },
  toggleStyle(k) {
    const p = this.pane(); if (!p.sh) return; const g = p.range(); let all = true;
    for (let r = g.r1; r <= g.r2 && all; r++) for (let c = g.c1; c <= g.c2; c++) { const cell = p.sh.cells.get(key(r, c)); if (!(cell && cell.s && cell.s[k])) { all = false; break; } }
    this.formatSel(p, (st) => { if (all) delete st[k]; else st[k] = 1; });
  },
  setStyle(k, v) { this.formatSel(null, (st) => { if (v == null && k !== 'fill' && k !== 'color') delete st[k]; else st[k] = v; }); },
  setNumFmt(nf) { this.formatSel(null, (st) => { if (nf === 'General') st.nf = 'General'; else st.nf = nf; }); },
  decimals(delta) {
    const p = this.pane(); if (!p.sh) return; const a = p.sh.cells.get(key(p.sel.ar, p.sel.ac)); let nf = a && a.s && a.s.nf; if (!nf || nf === 'General') nf = '0';
    const m = /([0#]+)(?:\.([0#]*))?/.exec(nf); if (!m) return;
    let d = (m[2] || '').length + delta; if (d < 0) d = 0; if (d > 15) d = 15;
    const nn = nf.replace(m[0], m[1] + (d ? '.' + '0'.repeat(d) : ''));
    this.formatSel(null, (st) => { st.nf = nn; });
  },
  syncToolbar() {
    const p = this.pane(); const q = (id) => $(id);
    const cell = p.sh && p.sh.cells.get(key(p.sel.ar, p.sel.ac)); const st = (cell && cell.s) || {};
    [['#fm-b', 'b'], ['#fm-i', 'i'], ['#fm-u', 'u']].forEach(([id, k]) => q(id).classList.toggle('on', !!st[k]));
    [['left', '#fm-al'], ['center', '#fm-ac'], ['right', '#fm-ar']].forEach(([k, id]) => q(id).classList.toggle('on', st.al === k));
    q('#fm-nf').value = NF_PRESETS.some((x) => x[0] === st.nf) ? st.nf : (st.nf ? '__custom' : 'General');
    q('#fm-color-bar').style.background = st.color || '#000000'; q('#fm-fill-bar').style.background = st.fill || 'transparent';
  },

  // ---------- الأوراق ----------
  addSheet(p) {
    if (!p.wb) return;
    let n = p.wb.sheets.length + 1; while (p.wb.sheets.some((s) => s.name === tr('ورقة') + n)) n++;
    p.wb.sheets.push(newSheet(tr('ورقة') + n, p.sh ? p.sh.rtl : settings.newRtl));
    this.markDirty(p.wb); p.setSheet(p.wb.sheets.length - 1); this.refreshWb(p.wb);
  },
  async renameSheet(p, i) {
    const sh = p.wb.sheets[i];
    const name = await this.prompt('إعادة تسمية الورقة', sh.name);
    if (name == null) return;
    const n = name.trim();
    if (!n || n.length > 31 || /[\\/?*[\]:]/.test(n)) return this.toast('اسم غير صالح (حتى 31 حرفًا، بدون \\ / ? * [ ] :)');
    if (p.wb.sheets.some((s, j) => j !== i && s.name.toLowerCase() === n.toLowerCase())) return this.toast('يوجد ورقة بهذا الاسم');
    sh.name = n; this.markDirty(p.wb); this.refreshWb(p.wb);
  },
  async sheetMenu(p, i) {
    const r = await this.dialog(`الورقة «${esc(p.wb.sheets[i].name)}»`, '', [{ label: 'إعادة تسمية', value: 'ren', primary: true }, { label: 'حذف الورقة', value: 'del', danger: true }, { label: 'إلغاء', value: null }]);
    if (r === 'ren') this.renameSheet(p, i);
    if (r === 'del') {
      if (p.wb.sheets.length === 1) return this.toast('لا يمكن حذف الورقة الوحيدة');
      const ok = await this.dialog('حذف الورقة', `سيتم حذف «${esc(p.wb.sheets[i].name)}» وكل بياناتها. لا يمكن التراجع عن هذا الإجراء.`, [{ label: 'حذف', value: true, danger: true }, { label: 'إلغاء', value: false }]);
      if (!ok) return;
      const del = p.wb.sheets[i]; p.wb.sheets.splice(i, 1);
      this.markDirty(p.wb);
      this.panes.forEach((q) => { if (q.wb === p.wb) { q.setSheet(q.sh === del ? Math.max(0, i - 1) : q.wb.sheets.indexOf(q.sh)); } });
    }
  },
  toggleDir(p) {
    if (!p.sh) return; p.sh.rtl = !p.sh.rtl; p.sh.rtlChanged = true; this.markDirty(p.wb);
    this.panes.forEach((q) => { if (q.sh === p.sh) { q.saveView(); q.setSheet(q.wb.sheets.indexOf(q.sh), q.wb._views[q.idx]); } });
  },
  refreshWb(wb) { this.panes.forEach((q) => { if (q.wb === wb) { q.renderTabs(); q.refreshHead(); } }); },

  // ---------- فتح الملفات ----------
  async openDialog(paneIdx) {
    if (paneIdx != null) this.setActive(paneIdx);
    if (FS) {
      try {
        const hs = await window.showOpenFilePicker({ multiple: true, types: [{ description: 'جداول بيانات', accept: { [XLSX_MIME]: ['.xlsx'], 'text/csv': ['.csv', '.tsv', '.txt'] } }] });
        await this.openFiles(hs.map((h) => ({ handle: h })));
      } catch (e) { if (e.name !== 'AbortError') this.toast('تعذر الفتح: ' + e.message); }
    } else $('#file-input').click();
  },
  async openFiles(items) {
    let any = false;
    for (const it of items) {
      try {
        const file = it.file || await it.handle.getFile();
        const wb = await this.readFile(file);
        if (!wb) continue;
        const nm = file.name || (it.handle && it.handle.name) || '';
        // نحفظ في نفس الملف فقط عندما يكون xlsx أو csv، أما XLS وODS فيُحفظ عملك كملف XLSX جديد
        if (it.handle && /\.(xlsx|csv|tsv|txt)$/i.test(nm) && wb.kind !== 'imported' && !wb.fallback) wb.handle = it.handle;
        await this.addWorkbook(wb, this.active);
        if (wb.kind === 'imported') this.toast('تم فتح ' + nm + '. سيُحفظ عملك كملف XLSX جديد، والملف الأصلي لن يتغير.', 6000);
        else if (wb.fallback) this.toast('فُتح الملف بالقراءة المبسطة (تنسيقه معقد). سيُحفظ عملك كنسخة جديدة.', 6000);
        any = true;
      } catch (e) { console.error(e); this.toast(`تعذر فتح «${(it.file || it.handle).name}»: ${e.message}`, 6000); }
    }
    return any;
  },
  innerWidth() { return window.innerWidth; },
  async readFile(file) {
    const n = file.name, low = n.toLowerCase();
    if (low.endsWith('.xlsx') || low.endsWith('.xlsm')) {
      const wb = await readXlsx(await file.arrayBuffer(), n);
      if (low.endsWith('.xlsm')) { wb.name = n.replace(/\.xlsm$/i, '.xlsx'); this.toast('ملاحظة: وحدات الماكرو في ملفات XLSM لا تُحفظ. سيُحفظ الملف بصيغة XLSX.', 6000); }
      return wb;
    }
    if (/\.(csv|tsv|txt)$/.test(low)) return readCsv(await file.text(), n);
    if (/\.(xls|ods|xlsb|fods)$/.test(low)) { const wb = readSheetJS(await file.arrayBuffer(), n.replace(/\.\w+$/, '') + '.xlsx'); wb.lossy = ['styles']; return wb; }
    try { return readSheetJS(await file.arrayBuffer(), n); } catch (e) { this.toast(`نوع الملف «${n}» غير مدعوم.`, 5000); return null; }
  },
  async newWb(paneIdx) {
    if (paneIdx != null) this.setActive(paneIdx);
    let n = 1; while (this.wbs.some((w) => w.name === `${tr('مصنف')}${n}.xlsx`)) n++;
    const wb = newWorkbook(`${tr('مصنف')}${n}.xlsx`, settings.newRtl);
    await this.addWorkbook(wb);
  },
  async handleLaunch() {
    // فتح الملفات من مدير الملفات (سطح المكتب/ChromeOS) عبر file_handlers
    if ('launchQueue' in window) window.launchQueue.setConsumer((p) => { if (p.files && p.files.length) this.openFiles(p.files.map((h) => ({ handle: h }))); });
    if (isNative) {
      const drain = async () => { try { const hs = await takeIntentFiles(); if (hs.length) await this.openFiles(hs.map((h) => ({ handle: h }))); } catch (e) { this.toast('تعذر فتح الملف: ' + e.message, 6000); } };
      window.addEventListener('jadawelFiles', drain); await drain();
    }
    // استقبال الملفات عبر "مشاركة" من Android (share_target)
    if (new URLSearchParams(location.search).has('shared') && 'caches' in window) {
      try {
        const c = await caches.open('jadawel-share'); const keys = await c.keys(); const items = [];
        for (const k of keys) { const res = await c.match(k); const blob = await res.blob(); items.push({ file: new File([blob], decodeURIComponent(res.headers.get('x-name') || 'shared.xlsx')) }); await c.delete(k); }
        if (items.length) await this.openFiles(items);
      } catch (e) { this.toast('تعذر استقبال الملفات المشاركة: ' + e.message); }
      history.replaceState(null, '', location.pathname);
    }
  },

  // ---------- الحفظ ----------
  async save(wb, as) {
    wb = wb || this.pane().wb; if (!wb) return false;
    this.panes.forEach((p) => { if (p.editing && p.wb === wb) p.commitEdit(); });
    const isCsv = /\.(csv|tsv|txt)$/i.test(wb.name);
    let fmt = isCsv ? 'csv' : 'xlsx';
    if (as) {
      const r = await this.dialog('حفظ باسم', 'اختر صيغة النسخة الجديدة. الملف الأصلي لن يتغير.', [
        { label: 'XLSX (Excel)', value: 'xlsx', primary: true }, { label: 'CSV (الورقة الحالية فقط)', value: 'csv' }, { label: 'إلغاء', value: null }]);
      if (!r) return false; fmt = r;
    }
    if (fmt === 'csv' && (wb.sheets.length > 1 || wb.kind === 'xlsx')) {
      const ok = await this.dialog('الحفظ بصيغة CSV', 'صيغة CSV تحفظ القيم فقط للورقة الظاهرة. التنسيقات والصيغ والأوراق الأخرى لن تُحفظ فيها.', [{ label: 'متابعة', value: true, primary: true }, { label: 'إلغاء', value: false }]);
      if (!ok) return false;
    }
    // ملف فيه عناصر لا نستطيع الحفاظ عليها (رسوم بيانية، جداول محورية...): لا نكتب فوق الأصل أبدًا
    if (fmt === 'xlsx' && wb.lossy && wb.lossy.length && !wb.lossyAck) {
      const names = { charts: 'رسوم بيانية', pivots: 'جداول محورية', slicers: 'شرائح تصفية', macros: 'وحدات ماكرو', styles: 'بعض التنسيقات' };
      const r = await this.dialog('تنبيه قبل الحفظ', `هذا الملف يحتوي على: ${wb.lossy.map((k) => names[k] || k).join('، ')}. هذه العناصر لا يحتفظ بها التطبيق عند الحفظ، لذلك سيُحفظ عملك كنسخة جديدة ويبقى ملفك الأصلي كما هو.`, [
        { label: 'حفظ كنسخة جديدة', value: true, primary: true }, { label: 'إلغاء', value: false }]);
      if (!r) return false;
      wb.lossyAck = true; wb.handle = null; as = true;
    }
    const base = wb.name.replace(/\.(xlsx|xlsm|xls|ods|csv|tsv|txt)$/i, '');
    const suggested = base + '.' + fmt;
    try {
      let data;
      if (fmt === 'xlsx') data = await writeXlsx(wb);
      else { const p = this.panes.find((q) => q.wb === wb); data = writeCsv(p ? p.sh : wb.sheets[0]); }
      const blob = new Blob([data], { type: fmt === 'xlsx' ? XLSX_MIME : 'text/csv;charset=utf-8' });
      let handle = !as && wb.handle && wb.handle.name.toLowerCase().endsWith('.' + fmt) ? wb.handle : null;
      if (handle && !wb.overwriteOK) {
        const r = await this.dialog('استبدال الملف الأصلي؟', `سيتم حفظ التعديلات داخل الملف «${esc(handle.name)}» نفسه، مثل Excel.`, [
          { label: 'حفظ في نفس الملف', value: 'over', danger: true }, { label: 'حفظ كنسخة جديدة', value: 'copy', primary: true }, { label: 'إلغاء', value: null }]);
        if (!r) return false;
        if (r === 'copy') { handle = null; as = true; } else wb.overwriteOK = true;
      }
      let savedAs = suggested, how;
      const pickNew = async () => {
        const h = await window.showSaveFilePicker({ suggestedName: as ? base + ' - نسخة.' + fmt : suggested, types: [fmt === 'xlsx' ? { description: 'Excel', accept: { [XLSX_MIME]: ['.xlsx'] } } : { description: 'CSV', accept: { 'text/csv': ['.csv'] } }] });
        await this.writeHandle(h, blob); wb.handle = h; wb.overwriteOK = true; return h; // المستخدم اختار هذا الملف بنفسه
      };
      if (handle) {
        try {
          if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('لم يُمنح إذن الكتابة');
          await this.writeHandle(handle, blob); savedAs = handle.name; how = 'تم الحفظ في الملف';
        } catch (e) {
          // تعذرت الكتابة على الملف الأصلي (مثلًا فُتح بصلاحية قراءة فقط): نعرض مكان حفظ بديل ولا نفقد شيئًا
          if (!('showSaveFilePicker' in window)) throw e;
          console.warn('write to original failed', e);
          const ok = await this.dialog('تعذر الحفظ في الملف الأصلي', 'لا يسمح النظام بالكتابة في هذا الملف. ملفك الأصلي لم يتغير. اختر مكانًا لحفظ نسخة تحمل تعديلاتك.', [{ label: 'اختيار مكان الحفظ', value: true, primary: true }, { label: 'إلغاء', value: false }]);
          if (!ok) return false;
          wb.handle = null; as = true;
          try { handle = await pickNew(); } catch (e2) { if (e2.name === 'AbortError') return false; throw e2; }
          savedAs = handle.name; how = 'تم الحفظ باسم';
        }
      } else if ('showSaveFilePicker' in window && !window.__noFS) {
        try { handle = await pickNew(); } catch (e) { if (e.name === 'AbortError') return false; throw e; }
        savedAs = handle.name; how = 'تم الحفظ باسم';
      } else {
        savedAs = as ? base + ' - نسخة.' + fmt : suggested;
        await this.download(blob, savedAs); how = 'تم حفظ الملف';
      }
      if (fmt === 'xlsx') { await rebaseAfterSave(wb, data); await store.putOrig(wb.id, wb.orig); wb.fallback = false; wb.kind = 'xlsx'; }
      else wb.sheets.forEach((s) => { s.edited = new Set(); });
      if (savedAs !== wb.name) wb.name = savedAs;
      this.markDirty(wb, false); this.refreshWb(wb);
      await this.persist(wb);
      this.toast(`${how}: ${savedAs}`);
      return true;
    } catch (e) {
      console.error(e); this.toast('فشل الحفظ — بياناتك ما زالت محفوظة تلقائيًا: ' + e.message, 7000); return false;
    }
  },
  async writeHandle(handle, blob) {
    // createWritable يكتب في ملف مؤقت ولا يستبدل الأصلي إلا بعد اكتمال الكتابة بنجاح
    const w = await handle.createWritable();
    try { await w.write(blob); await w.close(); } catch (e) { try { await w.abort(); } catch (_) {} throw e; }
  },
  async download(blob, name) {
    const cap = window.Capacitor, fsx = cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.Filesystem;
    if (fsx) { // داخل تطبيق Android: تنزيلات المتصفح غير متاحة، فنكتب الملف في مجلد المستندات
      const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
      const r = await fsx.writeFile({ path: 'Jadawel/' + name, data, directory: 'DOCUMENTS', recursive: true });
      this.toast('حُفظ في المستندات/Jadawel: ' + name, 5000); return r;
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  },

  // ---------- الحفظ التلقائي والاستعادة ----------
  scheduleSave(wb) {
    clearTimeout(this.saveTimers.get(wb.id));
    this.saveTimers.set(wb.id, setTimeout(() => this.persist(wb), 500));
  },
  async persist(wb) {
    clearTimeout(this.saveTimers.get(wb.id)); this.saveTimers.delete(wb.id);
    if (!this.wbs.includes(wb)) return;
    try { await store.putWb(wb, this.wbs.indexOf(wb)); $('#autosave').textContent = tr('حُفظ تلقائيًا ') + new Date().toLocaleTimeString(lang === 'ar' ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit' }); }
    catch (e) { console.error(e); $('#autosave').textContent = tr('⚠ تعذر الحفظ التلقائي'); }
  },
  async flushAll() { await Promise.all([...this.saveTimers.keys()].map((id) => { const w = this.wbs.find((x) => x.id === id); return w && this.persist(w); })); },
  persistMeta() {
    store.putMeta('layout', { layout: this.layout, panes: this.panes.map((p) => p.wb && p.wb.id), active: this.active, order: this.wbs.map((w) => w.id) }).catch(() => {});
  },
  async restore() {
    try {
      const docs = await store.loadAll();
      if (!docs.length) return;
      for (const d of docs) { d.handle = rehydrate(d.handle); d.sheets.forEach((s) => { s.edited = s.edited || new Set(); }); this.wbs.push(d); this.undo.set(d.id, []); this.redo.set(d.id, []); }
      const m = (await store.getMeta('layout')) || {};
      const byId = (id) => this.wbs.find((w) => w.id === id);
      this.layout = m.layout || 'single'; this.setLayout(this.layout);
      this.panes[0].show(byId(m.panes && m.panes[0]) || this.wbs[0]);
      if (this.layout !== 'single') this.panes[1].show(byId(m.panes && m.panes[1]) || this.wbs.find((w) => w !== this.panes[0].wb) || null);
      this.setActive(m.active || 0);
      const dirty = docs.filter((d) => d.dirty).length;
      this.toast(`تمت استعادة ${docs.length} ملف${dirty ? `، منها ${dirty} بتعديلات غير محفوظة` : ''}`, 5000);
    } catch (e) { console.error(e); this.toast('تعذرت استعادة الجلسة السابقة: ' + e.message); }
  },

  // ---------- شريط الحالة ----------
  onSelection(p) { if (p === this.pane()) { this.updateStatus(); this.syncToolbar(); } },
  openSettings() {
    $('#set-lang').value = settings.lang; $('#set-dir').value = settings.newRtl ? 'rtl' : 'ltr';
    $('#settings').showModal();
  },
  async saveSettings() {
    const nl = $('#set-lang').value; const changed = nl !== settings.lang;
    saveSettings({ lang: nl, newRtl: $('#set-dir').value === 'rtl' });
    $('#settings').close();
    if (changed) this.applyLang(nl);
    this.toast('تم حفظ الإعدادات');
  },
  // تبديل اللغة فورًا دون إعادة تحميل
  applyLang(nl) {
    setLang(nl);
    translateDom(document.body);
    this.panes.forEach((q) => { translateDom(q.el); if (q.sh) { q.refreshHead(); q.renderTabs(); } });
    $('#fm-nf').innerHTML = NF_PRESETS.map(([v, l]) => `<option value="${esc(v)}">${tr(l)}</option>`).join('') + `<option value="__custom" hidden>${tr('مخصص')}</option>`;
    this.renderTabs(); this.updateStatus(); this.syncToolbar();
    this.panes.forEach((q) => { if (q.sh) { q.render(true); q.updateSel(); } else q.show(q.wb || null); });
  },
  updateStatus() {
    const p = this.pane(), st = $('#status');
    if (!p.sh) { st.textContent = ''; return; }
    const g = p.range();
    if (g.r1 === g.r2 && g.c1 === g.c2) { st.textContent = ''; return; }
    let n = 0, cnt = 0, sum = 0;
    for (const [k, cell] of p.sh.cells) {
      const [r, c] = unkey(k); if (r < g.r1 || r > g.r2 || c < g.c1 || c > g.c2) continue;
      if (cell.v != null && cell.v !== '') cnt++;
      if (typeof cell.v === 'number') { n++; sum += cell.v; }
    }
    const f = (x) => Number(x.toPrecision(12)).toLocaleString('en-US', { maximumFractionDigits: 10 });
    st.textContent = tr(n ? `المتوسط: ${f(sum / n)}   العدد: ${cnt}   المجموع: ${f(sum)}` : (cnt ? `العدد: ${cnt}` : ''));
  },

  // ---------- لوحة المفاتيح ----------
  keyNav(p, e) {
    const k = e.key, rtl = p.sh.rtl, ctrl = e.ctrlKey || e.metaKey;
    let dr = 0, dc = 0;
    if (k === 'ArrowUp') dr = -1; else if (k === 'ArrowDown') dr = 1;
    else if (k === 'ArrowLeft') dc = rtl ? 1 : -1; else if (k === 'ArrowRight') dc = rtl ? -1 : 1;
    if (ctrl) { const t = p.jump(dr, dc); if (e.shiftKey) p.select(p.sel.ar, p.sel.ac, t.r, t.c); else p.select(t.r, t.c); }
    else p.move(dr, dc, e.shiftKey);
  },
  onKey(e) {
    if ($('#dialog').open) return;
    const tgt = e.target;
    if (tgt.matches('input, textarea, select') && !tgt.classList.contains('sink') && tgt.offsetParent !== null) return;
    const p = this.pane(), ctrl = e.ctrlKey || e.metaKey, k = e.key, lk = k.toLowerCase();
    if (ctrl && lk === 's') { e.preventDefault(); this.save(null, e.shiftKey); return; }
    if (k === 'F12') { e.preventDefault(); this.save(null, true); return; }
    if (ctrl && lk === 'o') { e.preventDefault(); this.openDialog(); return; }
    if (ctrl && lk === 'n') { e.preventDefault(); this.newWb(); return; }
    if (k === 'F6' && this.layout !== 'single') { e.preventDefault(); this.setActive(1 - this.active); this.pane().focus(); return; }
    if (!p.sh || p.editing) return;
    if (ctrl && lk === 'z') { e.preventDefault(); this.undoRedo(false); return; }
    if (ctrl && lk === 'y') { e.preventDefault(); this.undoRedo(true); return; }
    if (ctrl && lk === 'd') { e.preventDefault(); this.fillEdge('down'); return; }
    if (ctrl && lk === 'r') { e.preventDefault(); this.fillEdge('right'); return; }
    if (ctrl && lk === 'b') { e.preventDefault(); this.toggleStyle('b'); return; }
    if (ctrl && lk === 'i') { e.preventDefault(); this.toggleStyle('i'); return; }
    if (ctrl && lk === 'u') { e.preventDefault(); this.toggleStyle('u'); return; }
    if (ctrl && lk === 'a') { e.preventDefault(); p.select(0, 0, p.sh.nrows - 1, p.sh.ncols - 1, false); return; }
    if (ctrl && k === 'Home') { e.preventDefault(); p.select(0, 0); return; }
    if (ctrl && (k === 'PageDown' || k === 'PageUp')) {
      e.preventDefault(); const i = p.wb.sheets.indexOf(p.sh) + (k === 'PageDown' ? 1 : -1);
      if (i >= 0 && i < p.wb.sheets.length) p.setSheet(i); return;
    }
    if (k.startsWith('Arrow')) { e.preventDefault(); this.keyNav(p, e); return; }
    if (k === 'Enter') { e.preventDefault(); p.move(e.shiftKey ? -1 : 1, 0); return; }
    if (k === 'Tab') { e.preventDefault(); p.move(0, e.shiftKey ? -1 : 1); return; }
    if (k === 'Home') { e.preventDefault(); p.select(p.sel.ar, 0); return; }
    if (k === 'PageDown' || k === 'PageUp') { e.preventDefault(); const n = Math.max(1, Math.floor(p.scroller.clientHeight / 26) - 1); p.move(k === 'PageDown' ? n : -n, 0, e.shiftKey); return; }
    if (k === 'F2') { e.preventDefault(); p.startEdit(); return; }
    if (k === 'Delete') { e.preventDefault(); this.clearRange(p); return; }
    if (k === 'Backspace') { e.preventDefault(); p.startEdit('', 'enter'); return; }
    if (k === 'Escape') { if (this.clip && this.clip.cut) { this.clip = null; this.panes.forEach((q) => q.wb && q.showMarquee()); } return; }
    if (k.length === 1 && !ctrl && !e.altKey) { e.preventDefault(); p.startEdit(k, 'enter'); }
  },

  // ---------- واجهة ----------
  bindUI() {
    const on = (id, fn) => $(id).addEventListener('click', fn);
    on('#btn-new', () => this.newWb());
    on('#btn-second', () => this.secondView());
    on('#fm-b', () => this.toggleStyle('b')); on('#fm-i', () => this.toggleStyle('i')); on('#fm-u', () => this.toggleStyle('u'));
    on('#fm-al', () => this.setStyle('al', 'left')); on('#fm-ac', () => this.setStyle('al', 'center')); on('#fm-ar', () => this.setStyle('al', 'right'));
    on('#fm-decp', () => this.decimals(1)); on('#fm-decm', () => this.decimals(-1));
    $('#fm-nf').innerHTML = NF_PRESETS.map(([v, l]) => `<option value="${esc(v)}">${tr(l)}</option>`).join('') + `<option value="__custom" hidden>${tr('مخصص')}</option>`;
    $('#fm-nf').addEventListener('change', (e) => { if (e.target.value !== '__custom') this.setNumFmt(e.target.value); this.pane().focus(); });
    $('#fm-color').addEventListener('input', (e) => this.setStyle('color', e.target.value));
    $('#fm-fill').addEventListener('input', (e) => this.setStyle('fill', e.target.value));
    on('#fm-nofill', () => this.setStyle('fill', null));
    on('#btn-settings', () => this.openSettings());
    $('#set-save').addEventListener('click', () => this.saveSettings());
    $('#set-cancel').addEventListener('click', () => $('#settings').close());
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) $('#btn-win').hidden = true;
    on('#btn-win', () => { if (!window.open(location.pathname, '_blank')) this.toast('اسمح بالنوافذ المنبثقة، أو افتح التطبيق مرة ثانية من أيقونته'); });
    on('#btn-open', () => this.openDialog());
    on('#btn-save', () => this.save());
    on('#btn-saveas', () => this.save(null, true));
    on('#btn-undo', () => this.undoRedo(false));
    on('#btn-redo', () => this.undoRedo(true));
    on('#btn-cut', () => this.copy(true));
    on('#btn-copy', () => this.copy(false));
    on('#btn-paste', () => this.pasteFromButton());
    document.querySelectorAll('[data-layout-btn]').forEach((b) => b.addEventListener('click', () => this.setLayout(b.dataset.layoutBtn)));
    $('#file-input').addEventListener('change', async (e) => { const fs = [...e.target.files]; e.target.value = ''; await this.openFiles(fs.map((f) => ({ file: f }))); });
    $('#tabs').addEventListener('click', (e) => {
      const x = e.target.closest('[data-close]'); if (x) { e.stopPropagation(); this.closeWb(x.dataset.close); return; }
      const t = e.target.closest('.ftab'); if (t) { const wb = this.wbs.find((w) => w.id === t.dataset.id); this.showIn(this.active, wb); this.pane().focus(); }
    });
    $('#tabs').addEventListener('auxclick', (e) => { const t = e.target.closest('.ftab'); if (t && e.button === 1) this.closeWb(t.dataset.id); });
    document.addEventListener('keydown', (e) => this.onKey(e));
    const inGrid = () => { const a = document.activeElement; return a && a.classList.contains('sink'); };
    document.addEventListener('copy', (e) => { if (inGrid()) this.copy(false, e); });
    document.addEventListener('cut', (e) => { if (inGrid()) this.copy(true, e); });
    document.addEventListener('paste', (e) => { if (inGrid()) { e.preventDefault(); this.paste(e.clipboardData.getData('text/plain')); } });
    window.addEventListener('resize', () => this.panes.forEach((p) => p.render(true)));
    window.addEventListener('beforeunload', (e) => { this.flushAll(); if (this.wbs.some((w) => w.dirty)) { e.preventDefault(); e.returnValue = ''; } });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.flushAll(); });
    // سحب ملفات من سطح المكتب إلى النافذة
    document.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    document.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); this.openFiles([...e.dataTransfer.files].map((f) => ({ file: f }))); } });
  },
  bindDivider() {
    const d = this.divider, ws = $('#workspace');
    d.addEventListener('pointerdown', (e) => {
      e.preventDefault(); d.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const rc = ws.getBoundingClientRect(); let f;
        if (this.layout === 'h') { f = (rc.right - ev.clientX) / rc.width; } else f = (ev.clientY - rc.top) / rc.height;
        f = Math.max(0.15, Math.min(0.85, f));
        ws.style.setProperty('--split', (f * 100).toFixed(1) + '%');
        this.panes.forEach((p) => p.render(true));
      };
      const up = () => { d.removeEventListener('pointermove', move); d.removeEventListener('pointerup', up); };
      d.addEventListener('pointermove', move); d.addEventListener('pointerup', up);
    });
  },
  toast(msg, ms = 3000) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = tr(msg);
    $('#toasts').appendChild(t); setTimeout(() => t.remove(), ms);
  },
  dialog(title, body, buttons, withInput) {
    const dlg = $('#dialog');
    dlg.querySelector('h2').textContent = tr(title);
    dlg.querySelector('.body').innerHTML = tr(body);
    const inp = dlg.querySelector('input'); inp.style.display = withInput != null ? '' : 'none'; inp.value = withInput || '';
    const bar = dlg.querySelector('.btns');
    bar.innerHTML = buttons.map((b, i) => `<button data-i="${i}" class="${b.primary ? 'primary' : ''}${b.danger ? ' danger' : ''}">${tr(b.label)}</button>`).join('');
    return new Promise((res) => {
      const done = (v) => { dlg.close(); bar.onclick = null; dlg.oncancel = null; res(v); };
      bar.onclick = (e) => { const b = e.target.closest('button'); if (b) { const v = buttons[+b.dataset.i].value; done(withInput != null && v === true ? inp.value : (withInput != null && !v ? null : v)); } };
      dlg.oncancel = (e) => { e.preventDefault(); done(withInput != null ? null : buttons[buttons.length - 1].value); };
      inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); done(inp.value); } };
      dlg.showModal(); if (withInput != null) { inp.focus(); inp.select(); }
    });
  },
  prompt(title, value) { return this.dialog(title, '', [{ label: 'موافق', value: true, primary: true }, { label: 'إلغاء', value: false }], value); },
};

app.init();
