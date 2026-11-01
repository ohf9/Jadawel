// قوالب «جديد» وسجل الإصدارات
const { chromium } = require('playwright'); let fails = 0; const check = (c, m) => { console.log(c ? '  ✔' : '  ✘ FAIL', m); if (!c) fails++; };
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage(); p.on('pageerror', (e) => { console.log('E', e.stack); fails++; });
  await p.goto(process.env.URL || 'http://localhost:8765/'); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('jadawel'); }); await p.reload(); await p.waitForTimeout(500);
  await p.click('.pane[data-pane="0"] .e-new'); await p.waitForFunction(() => app.pane().sh);
  const r = await p.evaluate(async () => { app.showBackstage('new'); await new Promise((r) => setTimeout(r, 300)); const n = document.querySelectorAll('[data-tpl]').length;
    document.querySelector('[data-tpl="grades"]').click(); await new Promise((r) => setTimeout(r, 600));
    const P = app.pane(); const sh = P.sh; P.select(1, 2); P.startEdit('8', 'enter'); P.commitEdit(); P.select(1, 3); P.startEdit('9', 'enter'); P.commitEdit();
    const g = sh.cells.get('1,6'); const nm = P.wb.name;
    for (const id of ['budget', 'invoice', 'attendance', 'schedule', 'tasks']) { const t = (await import('./js/templates.js')).TEMPLATES.find((x) => x.id === id).build(); if (!t.sheets[0].cells.size) return { bad: id }; }
    return { n, total: g && g.v, nm, name: P.wb.name }; });
  console.log(JSON.stringify(r));
  check(r.n === 7, 'سبعة قوالب'); check(r.total === 17, 'صيغ سجل الدرجات تعمل (المجموع) ' + r.total); check(!r.bad, 'كل القوالب تُبنى');
  // سجل الإصدارات
  await p.evaluate(async () => { const s = await import('./js/store.js'); const w = app.pane().wb; await s.putVer(w.id, 1000, new Uint8Array([1, 2, 3]).buffer); await s.putVer(w.id, 2000, new Uint8Array([1]).buffer); app.showBackstage('history'); await new Promise((r) => setTimeout(r, 400)); });
  check(await p.locator('#hist-list .hist-row').count() === 2, 'السجل يعرض النسختين');
  await b.close(); console.log(fails ? fails + ' فشل' : 'نجحت القوالب والسجل'); process.exit(fails ? 1 : 0); })();
