// مساحة العمل: الملفات المفتوحة، اللوحتان، الحافظة، السحب بين الملفات، الحفظ والاستعادة
import { key, unkey, a1, toTSV, parseDelimited, parseInput, shiftFormula, esc, isNumCell } from './util.js';
import { Pane } from './pane.js';
import { newWorkbook, newSheet, readXlsx, readCsv, writeXlsx, writeCsv, rebaseAfterSave } from './io.js';
import * as store from './store.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FS = 'showOpenFilePicker' in window && !window.__noFS;
const $ = (s) => document.querySelector(s);

const app = window.app = {
  wbs: [], panes: [], active: 0, layout: 'single', clip: null, undo: new Map(), redo: new Map(), saveTimers: new Map(),

  init() {
    const ws = $('#workspace');
    this.panes = [new Pane(this, 0, ws), new Pane(this, 1, ws)];
    const div = document.createElement('div'); div.className = 'divider'; div.title = 'اسحب لتغيير حجم اللوحتين';
    ws.insertBefore(div, this.panes[1].el); this.divider = div;
    this.panes.forEach((p) => p.show(null));
    this.bindUI(); this.bindDivider();
    this.setActive(0);
    this.restore().then(() => this.handleLaunch());
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
    const p = this.panes[paneIdx], other = this.panes[1 - paneIdx];
    if (this.layout !== 'single' && other.wb === wb && p.wb) { const mine = p.wb; other.show(mine); }
    p.show(wb); this.setActive(paneIdx); this.renderTabs(); this.persistMeta();
  },
  renderTabs() {
    const bar = $('#tabs');
    bar.innerHTML = this.wbs.map((w) => {
      const where = this.panes.filter((p) => p.wb === w && (p.idx === 0 || this.layout !== 'single')).map((p) => p.idx + 1);
      const on = this.pane().wb === w;
      return `<div class="ftab${on ? ' on' : ''}${where.length ? ' shown' : ''}" data-id="${w.id}" title="${esc(w.name)}">
        ${where.length ? `<span class="badge">${where.join('،')}</span>` : ''}<span class="fname">${esc(w.name)}</span>${w.dirty ? '<span class="dot" title="غير محفوظ">●</span>' : ''}
        <button class="x" data-close="${w.id}" title="إغلاق">×</button></div>`;
    }).join('');
    $('#hint').style.display = this.wbs.length ? 'none' : '';
    document.title = (this.pane().wb ? this.pane().wb.name + ' — ' : '') + 'جداول';
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
    gh.textContent = `نسخ ${d.grid.length}×${d.grid[0].length} خلية — أفلِت في أي ملف`;
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

  // ---------- الأوراق ----------
  addSheet(p) {
    if (!p.wb) return;
    let n = p.wb.sheets.length + 1; while (p.wb.sheets.some((s) => s.name === 'ورقة' + n)) n++;
    p.wb.sheets.push(newSheet('ورقة' + n, p.sh ? p.sh.rtl : true));
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
  async openDialog() {
    if (FS) {
      try {
        const hs = await window.showOpenFilePicker({ multiple: true, types: [{ description: 'جداول بيانات', accept: { [XLSX_MIME]: ['.xlsx'], 'text/csv': ['.csv', '.tsv', '.txt'] } }] });
        await this.openFiles(hs.map((h) => ({ handle: h })));
      } catch (e) { if (e.name !== 'AbortError') this.toast('تعذر الفتح: ' + e.message); }
    } else $('#file-input').click();
  },
  async openFiles(items) {
    let first = true;
    const single = this.layout === 'single';
    if (items.length >= 2 && single) this.setLayout(this.innerWidth() < 700 ? 'v' : 'h');
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      try {
        const file = it.file || await it.handle.getFile();
        const wb = await this.readFile(file);
        if (!wb) continue;
        if (it.handle && /\.(xlsx|csv|tsv|txt)$/i.test(it.handle.name)) wb.handle = it.handle;
        let paneIdx;
        if (items.length >= 2 && i < 2) paneIdx = i; // أول ملفين: جنبًا إلى جنب
        await this.addWorkbook(wb, paneIdx);
        first = false;
      } catch (e) { console.error(e); this.toast(`تعذر فتح «${(it.file || it.handle).name}»: ${e.message}`, 6000); }
    }
    return !first;
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
    if (low.endsWith('.xls')) { this.toast('صيغة XLS القديمة غير مدعومة بعد (مخطط لها في المرحلة 4). احفظ الملف بصيغة XLSX من Excel ثم افتحه.', 7000); return null; }
    this.toast(`نوع الملف «${n}» غير مدعوم. المدعوم حاليًا: XLSX وCSV.`, 5000); return null;
  },
  async newWb() {
    let n = 1; while (this.wbs.some((w) => w.name === `مصنف${n}.xlsx`)) n++;
    const wb = newWorkbook(`مصنف${n}.xlsx`);
    await this.addWorkbook(wb);
  },
  async handleLaunch() {
    // فتح الملفات من مدير الملفات (سطح المكتب/ChromeOS) عبر file_handlers
    if ('launchQueue' in window) window.launchQueue.setConsumer((p) => { if (p.files && p.files.length) this.openFiles(p.files.map((h) => ({ handle: h }))); });
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
    const base = wb.name.replace(/\.(xlsx|xlsm|csv|tsv|txt)$/i, '');
    const suggested = base + '.' + fmt;
    try {
      let data;
      if (fmt === 'xlsx') data = await writeXlsx(wb);
      else { const p = this.panes.find((q) => q.wb === wb); data = writeCsv(p ? p.sh : wb.sheets[0]); }
      const blob = new Blob([data], { type: fmt === 'xlsx' ? XLSX_MIME : 'text/csv;charset=utf-8' });
      let handle = !as && wb.handle && wb.handle.name.toLowerCase().endsWith('.' + fmt) ? wb.handle : null;
      if (handle && !wb.overwriteOK) {
        const r = await this.dialog('استبدال الملف الأصلي؟', `سيتم استبدال الملف «${esc(handle.name)}» على جهازك بالنسخة المعدّلة.`, [
          { label: 'استبدال الأصلي', value: 'over', danger: true }, { label: 'حفظ كنسخة جديدة', value: 'copy', primary: true }, { label: 'إلغاء', value: null }]);
        if (!r) return false;
        if (r === 'copy') { handle = null; as = true; } else wb.overwriteOK = true;
      }
      let savedAs = suggested, how;
      if (handle) {
        if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('لم يُمنح إذن الكتابة');
        await this.writeHandle(handle, blob); savedAs = handle.name; how = 'تم الحفظ في الملف';
      } else if ('showSaveFilePicker' in window && !window.__noFS) {
        try {
          handle = await window.showSaveFilePicker({ suggestedName: as ? base + ' - نسخة.' + fmt : suggested, types: [fmt === 'xlsx' ? { description: 'Excel', accept: { [XLSX_MIME]: ['.xlsx'] } } : { description: 'CSV', accept: { 'text/csv': ['.csv'] } }] });
        } catch (e) { if (e.name === 'AbortError') return false; throw e; }
        await this.writeHandle(handle, blob); savedAs = handle.name; how = 'تم الحفظ باسم';
        wb.handle = handle; wb.overwriteOK = true; // المستخدم اختار هذا الملف بنفسه
      } else {
        savedAs = as ? base + ' - نسخة.' + fmt : suggested;
        this.download(blob, savedAs); how = 'تم تنزيل الملف إلى مجلد التنزيلات';
      }
      if (fmt === 'xlsx') { await rebaseAfterSave(wb, data); await store.putOrig(wb.id, wb.orig); }
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
  download(blob, name) {
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
    try { await store.putWb(wb, this.wbs.indexOf(wb)); $('#autosave').textContent = 'حُفظ تلقائيًا ' + new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }); }
    catch (e) { console.error(e); $('#autosave').textContent = '⚠ تعذر الحفظ التلقائي'; }
  },
  async flushAll() { await Promise.all([...this.saveTimers.keys()].map((id) => { const w = this.wbs.find((x) => x.id === id); return w && this.persist(w); })); },
  persistMeta() {
    store.putMeta('layout', { layout: this.layout, panes: this.panes.map((p) => p.wb && p.wb.id), active: this.active, order: this.wbs.map((w) => w.id) }).catch(() => {});
  },
  async restore() {
    try {
      const docs = await store.loadAll();
      if (!docs.length) return;
      for (const d of docs) { d.sheets.forEach((s) => { s.edited = s.edited || new Set(); }); this.wbs.push(d); this.undo.set(d.id, []); this.redo.set(d.id, []); }
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
  onSelection(p) { if (p === this.pane()) this.updateStatus(); },
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
    st.textContent = n ? `المتوسط: ${f(sum / n)}   العدد: ${cnt}   المجموع: ${f(sum)}` : (cnt ? `العدد: ${cnt}` : '');
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
    if (tgt.matches('input, textarea') && !tgt.classList.contains('sink')) return;
    const p = this.pane(), ctrl = e.ctrlKey || e.metaKey, k = e.key, lk = k.toLowerCase();
    if (ctrl && lk === 's') { e.preventDefault(); this.save(null, e.shiftKey); return; }
    if (k === 'F12') { e.preventDefault(); this.save(null, true); return; }
    if (ctrl && lk === 'o') { e.preventDefault(); this.openDialog(); return; }
    if (ctrl && lk === 'n' && e.altKey) { e.preventDefault(); this.newWb(); return; }
    if (k === 'F6' && this.layout !== 'single') { e.preventDefault(); this.setActive(1 - this.active); this.pane().focus(); return; }
    if (!p.sh || p.editing) return;
    if (ctrl && lk === 'z') { e.preventDefault(); this.undoRedo(false); return; }
    if (ctrl && lk === 'y') { e.preventDefault(); this.undoRedo(true); return; }
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
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    $('#toasts').appendChild(t); setTimeout(() => t.remove(), ms);
  },
  dialog(title, body, buttons, withInput) {
    const dlg = $('#dialog');
    dlg.querySelector('h2').textContent = title;
    dlg.querySelector('.body').innerHTML = body;
    const inp = dlg.querySelector('input'); inp.style.display = withInput != null ? '' : 'none'; inp.value = withInput || '';
    const bar = dlg.querySelector('.btns');
    bar.innerHTML = buttons.map((b, i) => `<button data-i="${i}" class="${b.primary ? 'primary' : ''}${b.danger ? ' danger' : ''}">${b.label}</button>`).join('');
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
