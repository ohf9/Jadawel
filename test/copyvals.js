// النسخ للخارج يعطي القيم كما تظهر (لا صيغ)، واللصق الداخلي يحتفظ بالصيغ
const { chromium } = require('playwright'); let fails = 0; const check = (c, m) => { console.log(c ? '  ✔' : '  ✘ FAIL', m); if (!c) fails++; };
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage(); p.on('pageerror', (e) => { console.log('E', e.message); fails++; });
  await p.goto(process.env.URL || 'http://localhost:8765/'); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('jadawel'); }); await p.reload(); await p.waitForTimeout(500);
  await p.click('.pane[data-pane="0"] .e-new'); await p.waitForFunction(() => app.pane().sh);
  const r = await p.evaluate(() => { const P = app.pane(); P.sh.cells.set('0,0', { v: 2 }); P.sh.cells.set('0,1', { v: 3 }); P.sh.cells.set('0,2', { f: 'SUM(A1:B1)', v: 5 }); P.select(0, 2); let out = ''; app.copy(false, { clipboardData: { setData: (t, v) => { out = v; } }, preventDefault() {} }); P.select(2, 2); app.paste(out); return { out, f: P.sh.cells.get('2,2').f }; });
  check(r.out === '5', 'النص المنسوخ قيمة: ' + r.out); check(r.f && /SUM/.test(r.f), 'اللصق الداخلي يبقي الصيغة');
  await b.close(); console.log(fails ? fails + ' فشل' : 'نجح'); process.exit(fails ? 1 : 0); })();
