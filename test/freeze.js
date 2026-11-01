// تثبيت الألواح: يبقى الصف/العمود ظاهرًا عند التمرير، النقر يصيب الخلية الصحيحة، ويُحفظ في الملف
const { chromium } = require('playwright'); let fails = 0; const check = (c, m) => { console.log(c ? '  ✔' : '  ✘ FAIL', m); if (!c) fails++; };
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage(); p.on('pageerror', (e) => { console.log('E', e.message); fails++; });
  await p.goto(process.env.URL || 'http://localhost:8765/'); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('jadawel'); }); await p.reload(); await p.waitForTimeout(500);
  await p.click('.pane[data-pane="0"] .e-new'); await p.waitForFunction(() => app.pane().sh);
  await p.evaluate(() => { const P = app.pane(); P.sh.rtl = false; P.setSheet(0); const set = (r, c, t) => { P.select(r, c); P.startEdit(t, 'enter'); P.commitEdit(); };
    set(0, 0, 'HEAD'); set(0, 1, 'H2'); for (let r = 1; r < 80; r++) { set(r, 0, 'R' + r); set(r, 1, String(r)); } P.select(1, 1); app.freezePanes(P, 'sel'); });
  await p.waitForTimeout(200);
  await p.evaluate(() => { app.pane().scroller.scrollTop = 600; }); await p.waitForTimeout(300);
  const r = await p.evaluate(() => { const P = app.pane(); const fz = P.el.querySelector('.fz-a'); const txt = [...fz.querySelectorAll('.c')].map((e) => e.textContent); const rc = fz.getBoundingClientRect(); const sc = P.scroller.getBoundingClientRect();
    const first = [...P.cells.querySelectorAll('.c')].map((e) => e.textContent);
    // نقرة على الصف المثبت تحدد الصف 0
    const h = P.hit(sc.left + 46 + 150, sc.top + 24 + 10); return { txt, dy: Math.round(rc.top - sc.top), first: first.slice(0, 3), hit: h, fr: P.sh.freeze }; });
  console.log(JSON.stringify(r));
  check(r.txt.includes('HEAD'), 'الصف المثبت يُرسم'); check(r.dy === 24, 'يبقى الصف المثبت أعلى الشاشة بعد التمرير'); check(r.hit && r.hit.r === 0, 'النقر على المنطقة المثبتة يصيب الصف الأول');
  const buf = await p.evaluate(async () => { const io = await import('./js/io.js'); const P = app.pane(); const b = await io.writeXlsx(P.wb); const wb2 = await io.readXlsx(b, 'x.xlsx'); return wb2.sheets[0].freeze; });
  check(buf && buf.rows === 1 && buf.cols === 1, 'يُحفظ ويُقرأ من الملف ' + JSON.stringify(buf));
  await p.evaluate(() => app.freezePanes(app.pane(), 'off')); await p.waitForTimeout(100);
  check(await p.evaluate(() => !app.pane().sh.freeze && !app.pane().el.querySelector('.fz')), 'إلغاء التثبيت');
  await b.close(); console.log(fails ? fails + ' فشل' : 'نجح التثبيت'); process.exit(fails ? 1 : 0); })();
