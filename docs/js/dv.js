// قوائم منسدلة (التحقق من الصحة: قائمة): قراءة من XLSX، سهم على الخلية، وإنشاء قائمة جديدة
import { key, parseInput, parseRange, esc } from './util.js';
import { tr } from './i18n.js';

const colN = (s) => { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
// عناصر القائمة: "a,b,c" أو مرجع نطاق
export function dvItems(wb, sh, src) {
  if (!src) return [];
  let f = String(src).trim().replace(/^=/, '');
  if (/^".*"$/.test(f)) return f.slice(1, -1).split(',').map((x) => x.trim()).filter((x) => x !== '');
  const m = /^(?:'((?:[^']|'')+)'|([^!'$]+))?!?\$?([A-Za-z]+)\$?(\d+)(?::\$?([A-Za-z]+)\$?(\d+))?$/.exec(f); if (!m) return [];
  const nm = (m[1] || m[2] || '').replace(/''/g, "'"); const t = nm ? wb.sheets.find((s) => s.name === nm) : sh; if (!t) return [];
  const c1 = colN(m[3]), r1 = +m[4] - 1, c2 = m[5] ? colN(m[5]) : c1, r2 = m[6] ? +m[6] - 1 : r1; const out = [];
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2) && out.length < 500; r++) for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) { const x = t.cells.get(key(r, c)); if (x && x.v !== null && x.v !== undefined && x.v !== '') out.push(String(x.v instanceof Date ? x.v.toISOString().slice(0, 10) : x.v)); }
  return out;
}

export function installDV(Pane, App) {
  const P = Pane.prototype;
  const base = P.updateSel;
  P.updateSel = function () {
    base.call(this);
    const sh = this.sh; let b = this.dvBtn;
    if (!b) { b = this.dvBtn = document.createElement('button'); b.type = 'button'; b.className = 'dvbtn'; b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>'; b.title = tr('اختر من القائمة'); this.layer.appendChild(b);
      for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'touchend']) b.addEventListener(ev, (e) => e.stopPropagation(), { passive: ev.startsWith('touch') });
      b.addEventListener('click', (e) => { e.stopPropagation(); this.app.dvOpen(this, b); }); }
    const s = this.sel, g = this.range(); const src = sh && !this.editing && g.r1 === g.r2 && g.c1 === g.c2 && sh.dv && sh.dv[key(s.ar, s.ac)];
    if (!src) { b.style.display = 'none'; return; }
    const m = this.mergeAt && this.mergeAt(s.ar, s.ac); const c2 = m ? m.c2 : s.ac, r2 = m ? m.r2 : s.ar, r1 = m ? m.r1 : s.ar, c1 = m ? m.c1 : s.ac;
    const x = this.colX[c2 + 1], h = Math.min(30, this.rowY[r2 + 1] - this.rowY[r1]); const w = Math.min(26, this.colX[c2 + 1] - this.colX[c1]);
    b.style.display = 'block'; b.style.width = w + 'px'; b.style.height = h + 'px'; b.style.top = this.rowY[r1] + 'px';
    b.style.left = 'auto'; b.style.right = 'auto'; b.style.insetInlineStart = (x - w) + 'px';
  };
  Object.assign(App, {
    dvOpen(p, btn) {
      const sh = p.sh, s = p.sel, src = sh.dv && sh.dv[key(s.ar, s.ac)]; if (!src) return;
      const items = dvItems(p.wb, sh, src); if (!items.length) return this.toast('قائمة الخيارات فارغة');
      const cur = (sh.cells.get(key(s.ar, s.ac)) || {}).v;
      this.menu(btn, items.slice(0, 300).map((t) => ({ t, on: String(cur) === t, f: () => this.dvPick(p, s.ar, s.ac, t) })), 'menu-cmd dvmenu');
    },
    dvPick(p, r, c, text) {
      const old = p.sh.cells.get(key(r, c)); const nv = parseInput(text);
      const cell = nv ? { ...nv, ...(old && old.s ? { s: old.s } : {}) } : (old && old.s ? { v: null, s: old.s } : null);
      this.applyChanges(p.wb, p.sh, [{ r, c, cell }]); p.focus();
    },
    async dvDialog(p) {
      const g = p.range(); const cur = p.sh.dv && p.sh.dv[key(g.r1, g.c1)];
      const html = `<label class="fl">${tr('الخيارات (افصل بينها بفاصلة، أو اكتب نطاقًا مثل A1:A10)')}<textarea id="dv-src" rows="3" dir="auto" placeholder="${tr('نعم,لا,ربما')}">${esc(cur && /^".*"$/.test(cur) ? cur.slice(1, -1) : (cur || ''))}</textarea></label><p class="bs-note">${tr('تُطبَّق على الخلايا المحددة. اتركه فارغًا لإزالة القائمة.')}</p>`;
      const res = await this.form('قائمة منسدلة', html, [{ label: 'إلغاء', value: null }, { label: 'تطبيق', primary: true, value: true }], (d) => { setTimeout(() => d.querySelector('#dv-src').focus(), 50); });
      if (!res) return; const raw = res.el.querySelector('#dv-src').value.trim();
      const sh = p.sh; sh.dv = { ...(sh.dv || {}) };
      let fx = ''; if (raw) fx = /^=?\$?[A-Za-z]+\$?\d+(:\$?[A-Za-z]+\$?\d+)?$/.test(raw) || /!/.test(raw) ? raw.replace(/^=/, '') : '"' + raw.split(/[,،\n]/).map((x) => x.trim()).filter(Boolean).join(',').replace(/"/g, '""') + '"';
      if (fx.length > 255 && fx.startsWith('"')) return this.toast('القائمة أطول من الحد المسموح في Excel (255 حرفًا). استخدم نطاق خلايا بدلًا منها.');
      const before = { ...(sh.dv || {}) }, bn = JSON.stringify(sh.dvNew || []);
      for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { if (fx) sh.dv[key(r, c)] = fx; else delete sh.dv[key(r, c)]; }
      sh.dvNew = (sh.dvNew || []).filter((e) => !(e.r1 === g.r1 && e.c1 === g.c1 && e.r2 === g.r2 && e.c2 === g.c2)); sh.dvNew.push({ r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2, src: fx }); sh.dvEdited = true;
      const after = { ...sh.dv }, an = JSON.stringify(sh.dvNew);
      const set = (v, n) => () => { sh.dv = { ...v }; sh.dvNew = JSON.parse(n); sh.dvEdited = true; };
      this.pushUndoFn(p.wb, sh, set(before, bn), set(after, an)); this.markDirty(p.wb); p.updateSel();
      this.toast(fx ? 'تم: ستظهر سهم القائمة عند تحديد الخلية' : 'أُزيلت القائمة');
    },
  });
}
void parseRange;
