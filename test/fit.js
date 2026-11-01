// النص الكبير يتسع داخل الخلايا المدمجة والملتفّة بدل أن يُقطع
const { chromium } = require('playwright'); let fails = 0; const check = (c, m) => { console.log(c ? '  ✔' : '  ✘ FAIL', m); if (!c) fails++; };
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage(); p.on('pageerror', (e) => { console.log('E', e.message); fails++; });
  await p.goto(process.env.URL || 'http://localhost:8765/'); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('jadawel'); }); await p.reload(); await p.waitForTimeout(500);
  await p.click('.pane[data-pane="0"] .e-new'); await p.waitForFunction(() => app.pane().sh);
  const r = await p.evaluate(() => { const P = app.pane(), sh = P.sh;
    const T = 'صفحة التعليمات الخاصة بالامتحان التشخيصي الأول لمادة العلوم للصف الثاني';
    sh.cells.set('0,0', { v: T, s: { sz: 28, b: 1 } }); sh.merges = [{ r1: 0, c1: 0, r2: 2, c2: 5 }];
    sh.cells.set('4,0', { v: T + ' ' + T, s: { sz: 20, wrap: 1 } }); sh.merges.push({ r1: 4, c1: 0, r2: 4, c2: 5 }); sh.rowH[4] = 90;
    sh.cells.set('6,6', { v: T, s: { sz: 20, wrap: 1 } }); sh.rowH[6] = 60; sh.colW[6] = 300; P.axesFull(); P.render(true);
    return [...P.cells.querySelectorAll('.c')].map((e) => { const sp = e.querySelector('span') || e; return { st: e.getAttribute('style').slice(-120), t: e.textContent.slice(0, 8), over: sp.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1, sw: sp.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight }; }); });
  console.log(JSON.stringify(r));
  check(r.length >= 3 && r.every((x) => !x.over), 'لا قطع في المدمجة ولا الملتفّة');
  await b.close(); console.log(fails ? fails + ' فشل' : 'نجح'); process.exit(fails ? 1 : 0); })();
