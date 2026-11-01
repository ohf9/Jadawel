// قائمة منسدلة: إنشاء، اختيار قيمة، حفظ وقراءة من جديد
const { chromium } = require('playwright'); let fails = 0; const check = (c, m) => { console.log(c ? '  ✔' : '  ✘ FAIL', m); if (!c) fails++; };
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage(); p.on('pageerror', (e) => { console.log('E', e.message); fails++; });
  await p.goto('http://localhost:8765/'); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('jadawel'); }); await p.reload(); await p.waitForTimeout(500);
  await p.click('.pane[data-pane="0"] .e-new'); await p.waitForFunction(() => app.pane().sh);
  const r = await p.evaluate(async () => {
    const io = await import('./js/io.js'); const P = app.pane(), sh = P.sh;
    P.select(1, 1, 1, 1); app.dvDialog(P); await new Promise((r) => setTimeout(r, 300));
    const dlg = [...document.querySelectorAll('dialog.dlg')].pop(); dlg.querySelector('#dv-src').value = 'نعم, لا, ربما'; dlg.querySelector('.btns .primary').click(); await new Promise((r) => setTimeout(r, 300));
    P.select(1, 1, 1, 1); P.updateSel(); const shown = getComputedStyle(P.dvBtn).display;
    app.dvPick(P, 1, 1, 'لا'); const v = sh.cells.get('1,1').v;
    const buf = await io.writeXlsx(P.wb); const back = await io.readXlsx(buf, 'x.xlsx');
    return [shown, v, JSON.stringify(back.sheets[0].dv)];
  });
  check(r[0] === 'block', 'السهم يظهر على الخلية'); check(r[1] === 'لا', 'اختيار قيمة من القائمة'); check(/نعم,لا,ربما/.test(r[2]), 'القائمة تُحفظ وتُقرأ ' + r[2]);
  await b.close(); console.log(fails ? fails + ' فشل' : 'نجح'); process.exit(fails ? 1 : 0); })();
