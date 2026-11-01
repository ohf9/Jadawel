// واجهة الرسوم البيانية: عرضها فوق الشبكة، تحديدها وتحريكها وتغيير حجمها ونوعها وعنوانها، وإدراج رسم جديد
import { chartSvg, resolveChart, specFromSelection, chartId, CHART_TYPES } from './charts.js';
import { tr } from './i18n.js';
import { esc } from './util.js';

const TYPE_ICON = {
  col: '<path d="M5 20V10h3v10zM10.5 20V4h3v16zM16 20v-7h3v7z"/>',
  bar: '<path d="M4 5h10v3H4zM4 10.5h16v3H4zM4 16h7v3H4z"/>',
  line: '<path d="M3 17l5-6 4 3 8-9"/><circle cx="8" cy="11" r="1.3"/><circle cx="12" cy="14" r="1.3"/><circle cx="20" cy="5" r="1.3"/>',
  area: '<path d="M3 19V12l5-4 5 4 7-6v13z"/>',
  pie: '<path d="M12 3v9h9a9 9 0 11-9-9z"/><path d="M15 3.6A9 9 0 0120.4 9H15z"/>',
  scatter: '<circle cx="6" cy="16" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="15" cy="14" r="1.6"/><circle cx="19" cy="6" r="1.6"/>',
};
export const chartIcon = (t) => `<svg viewBox="0 0 24 24">${TYPE_ICON[t] || TYPE_ICON.col}</svg>`;
const MIN_W = 160, MIN_H = 110;

function fpos(arr, f) { const n = arr.length - 1; if (f <= 0) return 0; const i = Math.min(n - 1, Math.floor(f)); return arr[i] + (f - i) * (arr[i + 1] - arr[i]); }
function ffrom(arr, x) { const n = arr.length - 1; if (x <= 0) return 0; let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (arr[m] <= x) lo = m; else hi = m - 1; } if (lo >= n) return n; const w = arr[lo + 1] - arr[lo]; return lo + (w > 0 ? (x - arr[lo]) / w : 0); }

export function installCharts(Pane, App) {
  const P = Pane.prototype;

  P.initCharts = function () {
    this.chartsEl = document.createElement('div'); this.chartsEl.className = 'charts';
    this.cells.after(this.chartsEl);
    this.selChart = null;
    this.layer.addEventListener('pointerdown', (e) => { if (this.selChart && !(e.target.closest && e.target.closest('.chart,.chtb'))) { this.selChart = null; this.renderCharts(); } }, true);
    this.el.addEventListener('keydown', (e) => {
      if (!this.selChart || this.editing || e.target.closest('input,textarea,select')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.app.deleteChart(this, this.selChart); }
      else if (e.key === 'Escape') { this.selChart = null; this.renderCharts(); }
    });
  };

  P.chartRect = function (ch) {
    const a = ch.anchor, x1 = fpos(this.colX, a.c1), x2 = fpos(this.colX, a.c2), y1 = fpos(this.rowY, a.r1), y2 = fpos(this.rowY, a.r2);
    return { x: x1, y: y1, w: Math.max(MIN_W * 0.5, x2 - x1), h: Math.max(MIN_H * 0.5, y2 - y1) };
  };
  P.setChartRect = function (ch, x, y, w, h) {
    ch.anchor = { c1: ffrom(this.colX, x), r1: ffrom(this.rowY, y), c2: ffrom(this.colX, x + w), r2: ffrom(this.rowY, y + h) };
  };

  P.renderCharts = function () {
    const el = this.chartsEl; if (!el) return;
    const sh = this.sh; if (!sh || !sh.charts || !sh.charts.length) { el.innerHTML = ''; this.selChart = null; return; }
    const rd = document.documentElement.dataset, dark = rd.theme === 'dark' && rd.sheet === 'dark';
    el.innerHTML = '';
    for (const ch of sh.charts) {
      const r = this.chartRect(ch); const on = this.selChart === ch.id;
      const d = document.createElement('div'); d.className = 'chart' + (on ? ' on' : ''); d.dataset.id = ch.id;
      d.style.cssText = `inset-inline-start:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
      let svg;
      if (ch.spec.unsupported || !ch.spec.series.length) svg = `<div class="chart-un">${esc(ch.spec.title || tr('رسم بياني'))}<br><small>${tr('رسم بياني محفوظ في الملف (لا يمكن عرضه هنا لكنه لن يضيع)')}</small></div>`;
      else { try { svg = chartSvg(ch.spec, resolveChart(this.wb, ch), Math.round(r.w), Math.round(r.h), dark); } catch (e) { console.warn('chart', e); svg = `<div class="chart-un">${tr('تعذر رسم هذا الرسم')}</div>`; } }
      d.innerHTML = svg;
      if (on) d.insertAdjacentHTML('beforeend', '<i class="chh" data-k="se"></i><i class="chh" data-k="sw"></i><i class="chh" data-k="ne"></i><i class="chh" data-k="nw"></i>');
      this.bindChart(d, ch);
      el.appendChild(d);
      if (on) el.appendChild(this.chartBar(ch, r));
    }
  };

  P.chartBar = function (ch, r) {
    const bar = document.createElement('div'); bar.className = 'chtb';
    bar.innerHTML = CHART_TYPES.map(([t, l]) => `<button type="button" class="${ch.spec.type === t ? 'on' : ''}" data-t="${t}" title="${tr(l)}">${chartIcon(t)}</button>`).join('')
      + `<span class="sep"></span><button type="button" data-a="title">${tr('العنوان')}</button><button type="button" data-a="data" title="${tr('استخدم الخلايا المحددة كبيانات للرسم')}">${tr('البيانات')}</button>`
      + (ch.spec.type === 'col' || ch.spec.type === 'bar' || ch.spec.type === 'area' ? `<button type="button" data-a="stack" class="${ch.spec.stacked ? 'on' : ''}">${tr('مكدّس')}</button>` : '')
      + `<button type="button" data-a="del" class="del" title="${tr('حذف الرسم')}">✕</button>`;
    const above = r.y > 44; bar.style.cssText = `inset-inline-start:${r.x}px;top:${above ? r.y - 40 : r.y + r.h + 4}px`;
    for (const ev of ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'click']) bar.addEventListener(ev, (e) => e.stopPropagation(), ev === 'touchstart' || ev === 'touchend' ? { passive: true } : false);
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.t) { ch.spec.type = b.dataset.t; if (b.dataset.t === 'pie' || b.dataset.t === 'scatter') ch.spec.stacked = false; this.app.chartChanged(this, ch); }
      else if (b.dataset.a === 'title') this.app.chartTitle(this, ch);
      else if (b.dataset.a === 'data') this.app.chartData(this, ch);
      else if (b.dataset.a === 'stack') { ch.spec.stacked = !ch.spec.stacked; this.app.chartChanged(this, ch); }
      else if (b.dataset.a === 'del') this.app.deleteChart(this, ch.id);
    });
    return bar;
  };

  P.bindChart = function (d, ch) {
    for (const ev of ['touchstart', 'touchend']) d.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    d.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return; e.stopPropagation();
      if (this.editing) this.commitEdit();
      this.focus && this.focus();
      const was = this.selChart === ch.id;
      const hnd = e.target.closest && e.target.closest('.chh');
      if (!was) { this.selChart = ch.id; this.renderCharts(); return; }
      e.preventDefault();
      const rtl = this.sh.rtl, sx = e.clientX, sy = e.clientY, r0 = this.chartRect(ch); let moved = false, last = null;
      const kind = hnd ? hnd.dataset.k : 'move';
      d.setPointerCapture(e.pointerId);
      const mv = (ev) => {
        let dx = ev.clientX - sx; if (rtl) dx = -dx; const dy = ev.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 4) return; moved = true;
        let { x, y, w, h } = r0;
        if (kind === 'move') { x += dx; y += dy; }
        else {
          // مقابض الزوايا بحسب اتجاه الشاشة: se = أسفل-يسار الشاشة في RTL؛ نحوّل بالإحداثيات المنطقية
          const east = kind.includes('e') !== rtl ? 1 : -1, south = kind.includes('s');
          if (kind === 'se' || kind === 'ne' || kind === 'sw' || kind === 'nw') {
            const sxr = kind.includes('e'); // شرق شاشة
            const logicalEast = rtl ? !sxr : sxr; // نحو نهاية المحور المنطقي
            if (logicalEast) w = r0.w + dx; else { x = r0.x + dx; w = r0.w - dx; }
            if (south) h = r0.h + dy; else { y = r0.y + dy; h = r0.h - dy; }
            void east;
          }
        }
        if (w < MIN_W) { if (kind !== 'move' && x !== r0.x) x -= MIN_W - w; w = MIN_W; }
        if (h < MIN_H) { if (kind !== 'move' && y !== r0.y) y -= MIN_H - h; h = MIN_H; }
        x = Math.max(0, x); y = Math.max(0, y); last = { x, y, w, h };
        d.style.insetInlineStart = x + 'px'; d.style.top = y + 'px'; d.style.width = w + 'px'; d.style.height = h + 'px';
        const tb = this.chartsEl.querySelector('.chtb'); if (tb) { tb.style.insetInlineStart = x + 'px'; tb.style.top = (y > 44 ? y - 40 : y + h + 4) + 'px'; }
      };
      const up = () => {
        d.removeEventListener('pointermove', mv); d.removeEventListener('pointerup', up); d.removeEventListener('pointercancel', up);
        if (moved && last) { this.setChartRect(ch, last.x, last.y, last.w, last.h); ch.anchorEdited = true; this.app.markDirty(this.wb); this.renderCharts(); }
      };
      d.addEventListener('pointermove', mv); d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
    });
  };

  // ---------- أوامر التطبيق ----------
  Object.assign(App, {
    insertChart(p, type) {
      const sh = p.sh, g = p.range();
      const spec = specFromSelection(sh, g, type);
      if (!spec) return this.toast('حدد أولًا بيانات الرسم (أرقام مع عناوين أو أسماء) ثم اختر نوع الرسم');
      const area = spec.area; delete spec.area;
      const vis = p.scroller; const w = 440, h = 270;
      const c1 = Math.min(p.sh.ncols - 2, area.c2 + 1), r1 = area.r1;
      const x = p.colX[c1] + 8, y = p.rowY[r1];
      const ch = { id: chartId(), spec, xml: null, anchor: { c1: 0, r1: 0, c2: 1, r2: 1 }, anchorEdited: true };
      p.setChartRect(ch, x, y, w, h);
      void vis;
      (sh.charts = sh.charts || []).push(ch);
      p.selChart = ch.id; this.markDirty(p.wb); p.renderCharts();
      this.toast('أُدرج الرسم — اسحبه لتحريكه، ومن الشريط فوقه غيّر النوع والعنوان');
      return ch;
    },
    chartChanged(p, ch) { ch.xml = null; this.markDirty(p.wb); p.renderCharts(); },
    async chartTitle(p, ch) {
      const r = await this.form('عنوان الرسم', `<label class="field"><span>${tr('العنوان')}</span><input type="text" class="ctitle" value="${esc(ch.spec.title || '')}"></label>`, [{ label: 'موافق', value: true, primary: true }, { label: 'إلغاء', value: null }], (d) => { const i = d.querySelector('input'); i.focus(); i.select(); });
      if (!r) return; ch.spec.title = r.el.querySelector('input').value.trim(); this.chartChanged(p, ch);
    },
    chartData(p, ch) {
      const sp = specFromSelection(p.sh, p.range(), ch.spec.type);
      if (!sp) return this.toast('حدد الخلايا التي تريدها كبيانات للرسم ثم اضغط «البيانات»');
      delete sp.area; sp.stacked = ch.spec.stacked; sp.doughnut = ch.spec.doughnut; ch.spec = sp; this.chartChanged(p, ch);
    },
    async deleteChart(p, id) {
      const sh = p.sh; const i = (sh.charts || []).findIndex((c) => c.id === id); if (i < 0) return;
      const r = await this.dialog('حذف الرسم البياني', 'سيُحذف الرسم من هذه الورقة. البيانات نفسها تبقى كما هي.', [{ label: 'حذف', value: true, primary: true }, { label: 'إلغاء', value: false }]);
      if (!r) return; sh.charts.splice(i, 1); p.selChart = null; this.markDirty(p.wb); this.panes.forEach((q) => { if (q.sh === sh) q.renderCharts(); });
    },
  });
}
