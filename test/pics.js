// صور جديدة + مخطط مصغّر: تُحفظ في XLSX وتُقرأ من جديد
const { chromium } = require('playwright'); let fails = 0; const check = (c, m) => { console.log(c ? '  ✔' : '  ✘ FAIL', m); if (!c) fails++; };
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage(); p.on('pageerror', (e) => { console.log('E', e.message); fails++; });
  await p.goto('http://localhost:8765/'); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('jadawel'); }); await p.reload(); await p.waitForTimeout(500);
  await p.click('.pane[data-pane="0"] .e-new'); await p.waitForFunction(() => app.pane().sh);
  const r = await p.evaluate(async () => {
    const io = await import('./js/io.js'); const pc = await import('./js/pics.js'); const P = app.pane(), sh = P.sh;
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    sh.pics = [{ id: pc.picId(), anchor: { c1: 1, r1: 1, c2: 3, r2: 4 }, xml: null, media: { rIdNew: { name: 'a.png', bytes: png } }, imgs: [{ url: 'data:image/png;base64,x', box: { x: 0, y: 0, w: 1, h: 1 } }] }];
    sh.cells.set('0,0', { v: 5 }); app.pane().wb.sheets[0].edited.add('0,0');
    const buf = await io.writeXlsx(P.wb); const back = await io.readXlsx(buf, 'x.xlsx');
    const b2 = await io.writeXlsx(back); const again = await io.readXlsx(b2, 'y.xlsx');
    return [back.sheets[0].pics.length, again.sheets[0].pics.length, Math.round(back.sheets[0].pics[0].anchor.c2)];
  });
  check(r[0] === 1 && r[1] === 1 && r[2] === 3, 'الصورة تُحفظ وتُقرأ مرتين ' + r);
  await b.close(); console.log(fails ? fails + ' فشل' : 'نجح'); process.exit(fails ? 1 : 0); })();
