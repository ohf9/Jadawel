// شاشة الملف: القوالب في «جديد» وسجل الإصدارات
import { TEMPLATES } from './templates.js';
import { tr, lang, settings, saveSettings } from './i18n.js';
import { applyTheme } from './theme.js';
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
    const COL = { blank: '#9aa5a0', grades: '#2f7d4f', budget: '#2b6cb0', invoice: '#b7791f', attend: '#2c7a7b', weekly: '#6b46c1', todo: '#c05621' };
    ns.innerHTML = `<h2>${tr('جديد')}</h2><div class="tgrid">${TEMPLATES.map((t) => `<button class="tcard" data-tpl="${t.id}" title="${esc(t.desc())}"><div class="pv" style="--h:${COL[t.id] || '#2f7d4f'}"><i class="pv-h"></i><i class="pv-c"></i><span class="pv-ic">${ICON(t.icon)}</span></div><b>${esc(t.name())}</b><small>${esc(t.desc())}</small></button>`).join('')}</div>`;
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

// ===== صفحة الإعدادات داخل شاشة الملف (تُطبَّق فورًا بلا زر حفظ) =====

export function installSettingsPage(app) {
  const nav = document.querySelector('#backstage .bs-nav'), main = document.querySelector('#backstage .bs-main');
  const old = nav.querySelector('[data-act="settings"]'); if (old) { old.removeAttribute('data-act'); old.dataset.p = 'settings'; }
  const sec = document.createElement('section'); sec.dataset.p = 'settings'; sec.hidden = true; main.appendChild(sec);
  const seg = (id, opts, cur) => `<div class="seg" data-id="${id}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${tr(l)}</button>`).join('')}</div>`;
  const tog = (id, title, sub, on) => `<label class="st-row"><span><b>${tr(title)}</b>${sub ? `<small>${tr(sub)}</small>` : ''}</span><input type="checkbox" class="sw" data-id="${id}"${on ? ' checked' : ''}></label>`;
  const row = (title, ctl, sub) => `<div class="st-row"><span><b>${tr(title)}</b>${sub ? `<small>${tr(sub)}</small>` : ''}</span>${ctl}</div>`;
  const draw = () => {
    const kp = app.kpActive ? app.kpActive() : false;
    sec.innerHTML = `<h2>${tr('الإعدادات')}</h2>
    <h4>${tr('اللغة والاتجاه')}</h4>
    ${row('لغة الواجهة', seg('lang', [['ar', 'العربية'], ['en', 'English']], settings.lang))}
    ${row('اتجاه الأوراق الجديدة', seg('newRtl', [['1', 'من اليمين إلى اليسار'], ['0', 'من اليسار إلى اليمين']], settings.newRtl ? 1 : 0))}
    <h4>${tr('المظهر')}</h4>
    ${row('المظهر', seg('theme', [['light', '☀ فاتح'], ['dark', '🌙 داكن'], ['system', '⚙ حسب الجهاز']], settings.theme || 'system'))}
    ${row('الوضع الداكن يشمل', seg('darkSheet', [['1', 'الشيت كله'], ['0', 'القوائم والواجهة فقط']], settings.darkSheet ? 1 : 0), '«القوائم والواجهة فقط» تُبقي ورقة العمل بيضاء كما في الورق، والباقي داكن.')}
    ${tog('grid', 'خطوط الشبكة', 'إظهار خطوط الخلايا في الورقة', settings.grid !== false)}
    <h4>${tr('الكتابة ولوحة المفاتيح')}</h4>
    ${tog('keypad', 'لوحة الأرقام المخصصة', 'تظهر عند تحديد خلية بدل كيبورد الجهاز، وفيها حروف عربية وإنجليزية', kp)}
    ${row('مكان لوحة الأرقام', seg('kpSide', [['right', 'يمين'], ['left', 'يسار']], settings.kpSide === 'left' ? 'left' : 'right'), 'على الشاشات العريضة تظهر كصندوق صغير على جانب الشاشة')}
    ${tog('handles', 'مقابض التحديد', 'دوائر الزوايا وشريط التعبئة', settings.handles !== false)}
    ${tog('miniBar', 'شريط النسخ واللصق العائم', 'ضغطة مطولة أو لمسة على التحديد', settings.miniBar !== false)}
    <h4>${tr('الحفظ')}</h4>
    ${tog('autoFile', 'الحفظ التلقائي في الملف', 'يحفظ تلقائيًا داخل الملف نفسه بعد كل تعديل (للملفات المفتوحة من الجهاز)', settings.autoFile === true)}
    <h4>${tr('البيانات')}</h4>
    <div class="st-row"><span><b>${tr('مسح قائمة الملفات الأخيرة')}</b></span><button class="mini" data-do="recents">${tr('مسح')}</button></div>
    <div class="st-row"><span><b>${tr('إعادة الإعدادات للافتراضي')}</b><small>${tr('لا تمس ملفاتك')}</small></span><button class="mini" data-do="reset">${tr('إعادة')}</button></div>
    <h4>${tr('حول')}</h4>
    <div class="st-row"><span><b>${tr('جداول')} · Jadawel</b><small>${tr('بديل Excel يعمل على الجهاز، ملفاتك لا تغادر جهازك')}</small></span></div>`;
  };
  draw();
  const apply = () => { applyTheme(); app.applyGrid(); app.panes.forEach((q) => q.applyPrefs && q.applyPrefs()); app.syncKbd && app.syncKbd(); };
  sec.addEventListener('click', async (e) => {
    const b = e.target.closest('.seg button');
    if (b) {
      const id = b.parentElement.dataset.id, v = b.dataset.v;
      if (id === 'lang') { app.applyLang(v); draw(); return; }
      if (id === 'newRtl') saveSettings({ newRtl: v === '1' });
      else if (id === 'darkSheet') saveSettings({ darkSheet: v === '1' });
      else saveSettings({ [id]: v });
      draw(); apply(); return;
    }
    const d = e.target.closest('[data-do]');
    if (d && d.dataset.do === 'recents') { const m = await import('./recents.js'); await m.clearRecents(); app.toast('تم المسح'); }
    if (d && d.dataset.do === 'reset') { try { localStorage.removeItem('jadawel-settings'); } catch (er) { /* لا بأس */ } Object.keys(settings).forEach((k) => { if (k !== 'lang') delete settings[k]; }); settings.newRtl = true; apply(); draw(); app.toast('أُعيدت الإعدادات'); }
  });
  sec.addEventListener('change', (e) => {
    const c = e.target.closest('.sw'); if (!c) return; const id = c.dataset.id, v = c.checked;
    if (id === 'grid') saveSettings({ grid: v }); else if (id === 'keypad') saveSettings({ keypad: v }); else saveSettings({ [id]: v });
    apply();
  });
  const prev = app.bsPage.bind(app);
  app.bsPage = function (page) { prev(page); if (page === 'settings') draw(); };
}
