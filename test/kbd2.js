// لوحة الحروف داخل لوحة الأرقام: عربي وإنجليزي وعودة للأرقام بعد الإدخال
const { chromium } = require('playwright'); let fails = 0; const check = (c, m) => { console.log(c ? '  ✔' : '  ✘ FAIL', m); if (!c) fails++; };
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1000, height: 700 }, hasTouch: true }); const p = await ctx.newPage(); p.on('pageerror', (e) => { console.log('E', e.message); fails++; });
  await p.goto(process.env.URL || 'http://localhost:8765/'); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('jadawel'); }); await p.reload(); await p.waitForTimeout(500);
  await p.click('.pane[data-pane="0"] .e-new'); await p.waitForFunction(() => app.pane().sh); await p.waitForTimeout(700);
  const tap = async (sel) => { const e = await p.$(sel); const bb = await e.boundingBox(); await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(60); };
  check(await p.isVisible('#kbd'), 'اللوحة ظاهرة'); const w0 = (await (await p.$('#kbd')).boundingBox()).width;
  await tap('#kbd [data-k="layer"][data-c="ar"]'); check(await p.isVisible('#kbd .kk:text-is("ض")'), 'طبقة الحروف العربية');
  await tap('#kbd .kk:text-is("ض")'); await tap('#kbd .kk:text-is("ص")');
  await tap('#kbd [data-k="layer"][data-c="en"]'); await tap('#kbd .kk:text-is("q")'); await tap('#kbd [data-k="enter"]');
  const r = await p.evaluate(() => { const c = app.pane().sh.cells.get('0,0'); return { v: c && c.v, sel: app.pane().sel.ar }; });
  console.log(JSON.stringify({ r, w0 }));
  check(r.v === 'ضصq', 'الحروف تُكتب في الخلية'); check(await p.isVisible('#kbd .kk:text-is("7")'), 'العودة للأرقام بعد الإدخال');
  await b.close(); console.log(fails ? fails + ' فشل' : 'نجحت لوحة الحروف'); process.exit(fails ? 1 : 0); })();
