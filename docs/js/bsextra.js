// شاشة الملف: القوالب في «جديد» وسجل الإصدارات
import { TEMPLATES } from './templates.js';
import { tr, lang } from './i18n.js';
import * as store from './store.js';
import { readXlsx } from './io.js';
import { esc } from './util.js';

const ICON = (d) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;

export function installBackstageExtra(app) {
  const nav = document.querySelector('#backstage .bs-nav'), main = document.querySelector('#backstage .bs-main');
  // سجل الإصدارات بعد «حفظ»
  const saveBtn = nav.querySelector('[data-p="save"]');
  const hb = document.createElement('button'); hb.dataset.p = 'history'; hb.className = 'needs';
  hb.innerHTML = `${ICON('M12 7v5l3 2M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4')}<span>${tr('السجل')}</span>`;
  (saveBtn || nav.querySelector('hr')).after(hb);
  const sec = document.createElement('section'); sec.dataset.p = 'history'; sec.hidden = true;
  sec.innerHTML = `<h2>${tr('السجل')}</h2><p class="bs-note">${tr('يحتفظ التطبيق بنسخة من الملف عند كل حفظ على هذا الجهاز، لتعود إلى أي منها.')}</p><div id="hist-list"></div>`;
  main.appendChild(sec);

  // القوالب في «جديد»
  const ns = main.querySelector('section[data-p="new"]');
  const drawNew = () => {
    ns.innerHTML = `<h2>${tr('جديد')}</h2><div class="bs-cards tpl">${TEMPLATES.map((t) => `<button class="card" data-tpl="${t.id}"><i class="ci">${ICON(t.icon)}</i><b>${esc(t.name())}</b><span>${esc(t.desc())}</span></button>`).join('')}</div>`;
  };
  drawNew(); app._drawNew = drawNew;
  ns.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tpl]'); if (!b) return; const t = TEMPLATES.find((x) => x.id === b.dataset.tpl);
    app.hideBackstage();
    if (!t.build) return app.newWb();
    const wb = t.build(); let n = 1, base = t.name(); while (app.wbs.some((w) => w.name === `${base}${n > 1 ? ' ' + n : ''}.xlsx`)) n++;
    wb.name = `${base}${n > 1 ? ' ' + n : ''}.xlsx`; app.addWorkbook(wb);
  });

  const when = (ts) => new Date(ts).toLocaleString(lang === 'ar' ? 'ar' : 'en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  app.renderHistory = async () => {
    const w = app.pane().wb, box = document.getElementById('hist-list'); if (!w) { box.innerHTML = ''; return; }
    let vs = []; try { vs = await store.listVers(w.id); } catch (e) { /* لا بأس */ }
    box.innerHTML = vs.length ? vs.map((ts, i) => `<div class="hist-row"><div><b>${esc(when(ts))}</b><small>${esc(app.ago(ts))}${i === 0 ? ' · ' + tr('آخر حفظ') : ''}</small></div><button class="mini" data-ts="${ts}">${tr('فتح كنسخة')}</button></div>`).join('') : `<div class="note">${tr('لا توجد نسخ محفوظة بعد. تظهر هنا بعد أول حفظ.')}</div>`;
  };
  sec.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ts]'); if (!b) return; const w = app.pane().wb; if (!w) return;
    const buf = await store.getVer(w.id, +b.dataset.ts); if (!buf) return app.toast('تعذر العثور على هذه النسخة');
    const base = w.name.replace(/\.\w+$/, ''); const nw = await readXlsx(buf, `${base} (${when(+b.dataset.ts)}).xlsx`);
    nw.name = `${base} (${when(+b.dataset.ts)}).xlsx`; app.hideBackstage(); app.addWorkbook(nw); app.toast('فُتحت النسخة القديمة كملف جديد، ملفك الحالي لم يتغيّر.');
  });
  const old = app.bsPage.bind(app);
  app.bsPage = function (page) { old(page); if (page === 'new') drawNew(); if (page === 'history') { const has = !!app.pane().wb; const need = document.getElementById('bs-need'); if (need) need.hidden = has; app.renderHistory(); } };
}
