// إخفاء الشريط: كامل ← تبويبات فقط (مع إظهار مؤقت) ← مخفي تمامًا ثم استعادة
const { chromium } = require('playwright'); let fails = 0; const check = (c, m) => { console.log(c ? '  ✔' : '  ✘ FAIL', m); if (!c) fails++; };
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage(); p.on('pageerror', (e) => { console.log('E', e.message); fails++; });
  await p.goto('http://localhost:8765/'); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('jadawel'); }); await p.reload(); await p.waitForTimeout(500);
  await p.click('.pane[data-pane="0"] .e-new'); await p.waitForFunction(() => app.pane().sh);
  const vis = (s) => p.isVisible(s); const h = () => p.evaluate(() => app.pane().scroller.clientHeight);
  const h0 = await h(); check(await vis('.ribbon'), 'الشريط ظاهر');
  await p.click('#rib-toggle'); await p.waitForTimeout(300); check(!(await vis('.ribbon')) && (await vis('.rtabs')), 'تبويبات فقط'); const h1 = await h(); check(h1 > h0 + 40, 'الورقة صارت أكبر ' + h0 + '→' + h1);
  await p.click('.rtabs [data-rt=insert]'); await p.waitForTimeout(200); check(await vis('.ribbon'), 'الضغط على تبويب يُظهر الشريط مؤقتًا');
  await p.mouse.click(300, 600); await p.waitForTimeout(200); check(!(await vis('.ribbon')), 'يختفي بالضغط خارجه');
  await p.click('#rib-focus'); await p.waitForTimeout(300); check(!(await vis('.rtabs')) && (await vis('#rib-restore')), 'مخفي تمامًا مع زر استعادة'); check((await h()) > h1 + 30, 'مساحة أكبر');
  await p.click('#rib-restore'); await p.waitForTimeout(300); check((await vis('.ribbon')) && (await vis('.rtabs')), 'استعادة كاملة');
  await b.close(); console.log(fails ? fails + ' فشل' : 'نجح'); process.exit(fails ? 1 : 0); })();
