// تثبيت العرض أثناء كتابة الأرقام في شيت RTL + فتح ملف كبير
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1000, height: 800 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); let bad = 0; p.on('pageerror', (e) => { console.log('E', e.message); bad++; });
  const url = process.env.URL || 'http://localhost:8765/';
  await p.goto(url); await p.evaluate(() => indexedDB.deleteDatabase('jadawel')); await p.reload(); await p.waitForTimeout(500);
  await p.click('.pane[data-pane="0"] .e-new'); await p.waitForFunction(() => app.pane().sh);
  await p.evaluate(() => app.pane().select(4, 0));
  for (const ch of '1234567890') { await p.keyboard.type(ch); const sl = await p.evaluate(() => app.pane().scroller.scrollLeft); if (sl !== 0) { console.log('FAIL jump', ch, sl); bad++; } }
  await p.keyboard.press('Enter');
  await b.close(); console.log(bad ? 'FAIL' : 'OK typing'); process.exit(bad ? 1 : 0); })();
