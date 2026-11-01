// جنبًا إلى جنب: كل لوحة تعرض ملفًا مختلفًا ويمكن تغييره أو فتح ملف آخر فيها
const { chromium } = require('playwright'); let fails = 0; const check = (c, m) => { console.log(c ? '  ✔' : '  ✘ FAIL', m); if (!c) fails++; };
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1300, height: 800 } })).newPage(); p.on('pageerror', (e) => { console.log('E', e.message); fails++; });
  await p.goto(process.env.URL || 'http://localhost:8765/'); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('jadawel'); }); await p.reload(); await p.waitForTimeout(500);
  await p.click('.pane[data-pane="0"] .e-new'); await p.waitForFunction(() => app.pane().sh);
  await p.evaluate(() => app.newWb()); await p.evaluate(() => app.newWb()); await p.waitForTimeout(300);
  await p.evaluate(() => app.setLayout('h')); await p.waitForTimeout(300);
  const names = () => p.evaluate(() => app.panes.map((q) => q.wb && q.wb.name));
  console.log('  ', await names());
  await p.click('.pane[data-pane="1"] .pane-title'); await p.waitForSelector('.menu-files .it[data-i]');
  await p.click('.menu-files .it[data-i="1"]'); await p.waitForTimeout(200);
  let n = await names(); check(n[1] && n[0] !== n[1], 'اللوحة الثانية تعرض ملفًا مختلفًا ' + n);
  await p.click('.pane[data-pane="0"] .pane-title'); await p.click('.menu-files .it[data-i="2"]'); await p.waitForTimeout(200);
  n = await names(); check(/3/.test(n[0]), 'تغيير ملف اللوحة الأولى ' + n);
  await p.click('.pane[data-pane="1"] .pane-title'); await p.waitForSelector('.menu-files [data-a="open"]'); check(true, 'خيار فتح ملف آخر موجود في كل لوحة');
  await p.click('.menu-files [data-a="new"]'); await p.waitForTimeout(300);
  n = await names(); check(n[1] && /4/.test(n[1]), 'مصنف جديد في اللوحة الثانية ' + n);
  await b.close(); console.log(fails ? fails + ' فشل' : 'نجحت اللوحات'); process.exit(fails ? 1 : 0); })();
