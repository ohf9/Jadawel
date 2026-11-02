// التفاف النص: الصف يكبر بقدر الحاجة فقط ولا يتضخم، والإلغاء يرجع الارتفاع كما كان
const { chromium } = require('playwright'); let fails = 0; const check = (c, m) => { console.log(c ? '  ✔' : '  ✘ FAIL', m); if (!c) fails++; };
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage(); p.on('pageerror', (e) => { console.log('E', e.message); fails++; });
  await p.goto(process.env.URL || 'http://localhost:8765/'); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('jadawel'); }); await p.reload(); await p.waitForTimeout(500);
  await p.click('.pane[data-pane="0"] .e-new'); await p.waitForFunction(() => app.pane().sh);
  const H = () => p.evaluate(() => { const P = app.pane(); return Math.round(P.rowY[4] - P.rowY[3]); });
  await p.evaluate(() => { const P = app.pane(); P.sh.cells.set('3,0', { v: 'رصد الاختبار الأول - ثاني ب - أ علوم - ف1 وبعض النص الإضافي الطويل' }); P.sh.filter = { r1: 3, c1: 0, r2: 9, c2: 3, hide: {}, rows: [] }; P.render(true); P.select(3, 0); });
  const h0 = await H();
  await p.evaluate(() => app.toggleStyle('wrap')); await p.waitForTimeout(600);
  const h1 = await H(); await p.waitForTimeout(600); const h2 = await H();
  check(h1 > h0 && h1 < 400, 'الصف كبر باعتدال ' + h0 + '→' + h1); check(h1 === h2, 'لا يستمر بالتضخم ' + h1 + '/' + h2);
  const btn = await p.evaluate(() => { const P = app.pane(), e = document.querySelector('.pane.active .fbtn'); const t = parseFloat(e.style.top); return Math.abs(t + 19 - P.rowY[4]) < 1; });
  check(btn, 'زر القائمة يتبع حدود خليته');
  await p.evaluate(() => app.undoRedo(false)); await p.waitForTimeout(600);
  const h3 = await H(); check(h3 === h0, 'الإلغاء يرجع الارتفاع ' + h3 + '/' + h0);
  await b.close(); console.log(fails ? fails + ' فشل' : 'نجح'); process.exit(fails ? 1 : 0); })();
