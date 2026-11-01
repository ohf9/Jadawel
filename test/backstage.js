// شاشة الملفات: الأخيرة، التنقل بين الصفحات، الحفظ باسم
const { chromium } = require('playwright'); let fails = 0; const check = (c, m) => { console.log(c ? '  ✔' : '  ✘ FAIL', m); if (!c) fails++; };
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1180, height: 760 } })).newPage(); p.on('pageerror', (e) => { console.log('E', e.message); fails++; });
  await p.goto(process.env.URL || 'http://localhost:8765/'); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('jadawel'); indexedDB.deleteDatabase('jadawel-recents'); }); await p.reload(); await p.waitForTimeout(600);
  await p.evaluate(async () => { const m = await import('./js/recents.js'); await m.addRecent({ name: 'ميزانية.xlsx', uri: 'content://x/1', native: true, kind: 'native' }); await m.addRecent({ name: 'data.csv', uri: 'content://x/2', native: true, kind: 'native' }); });
  await p.evaluate(()=>app.showBackstage('open')); await p.waitForTimeout(400);
  check(await p.locator('#bs-list .rec').count() === 2, 'تظهر الملفات الأخيرة');
  await p.screenshot({ path: '/tmp/claude-0/shots/backstage.png' });
  await p.click('#backstage [data-p="open"]'); check(await p.locator('#backstage section[data-p="open"]').isVisible(), 'صفحة فتح');
  await p.click('#bs-list [data-rm="0"]'); await p.waitForTimeout(200);
  check(await p.locator('#bs-list .rec').count() === 1, 'إزالة عنصر من القائمة');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); check(await p.locator('#backstage').isHidden(), 'Esc يغلق');
  await p.evaluate(()=>app.showBackstage('open')); await p.click('#backstage [data-p="new"]'); await p.click('#backstage [data-tpl]'); await p.waitForFunction(() => app.pane().sh);
  check(true, 'جديد من الشاشة'); await b.close(); console.log(fails ? fails + ' فشل' : 'نجحت شاشة الملفات'); process.exit(fails ? 1 : 0); })();
