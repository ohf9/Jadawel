// الجدول المحوري: صفوف × أعمدة بالمجموع، وإجماليات، ويتحدث مع البيانات
const { chromium } = require('playwright'); let fails = 0; const check = (c, m) => { console.log(c ? '  ✔' : '  ✘ FAIL', m); if (!c) fails++; };
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage(); p.on('pageerror', (e) => { console.log('E', e.stack); fails++; });
  await p.goto(process.env.URL || 'http://localhost:8765/'); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('jadawel'); }); await p.reload(); await p.waitForTimeout(500);
  await p.click('.pane[data-pane="0"] .e-new'); await p.waitForFunction(() => app.pane().sh);
  const r = await p.evaluate(async () => { const P = app.pane(); P.sh.rtl = false; P.setSheet(0); const set = (r, c, t) => { P.select(r, c); P.startEdit(t, 'enter'); P.commitEdit(); };
    const data = [['Region', 'Month', 'Sales'], ['N', 'Jan', 10], ['S', 'Jan', 20], ['N', 'Feb', 5], ['N', 'Jan', 7], ['S', 'Feb', 8]];
    data.forEach((row, i) => row.forEach((v, j) => set(i, j, String(v)))); P.select(2, 1);
    app.pivotDialog(P); await new Promise((r) => setTimeout(r, 300));
    const dl = [...document.querySelectorAll('dialog.dlg')].pop(); dl.querySelector('#pv-c').value = '1'; dl.querySelector('.btns .primary').click(); await new Promise((r) => setTimeout(r, 600));
    const sh = app.pane().sh; const g = (r, c) => { const x = sh.cells.get(r + ',' + c); return x && x.v; };
    const out = { name: sh.name, hdr: [g(2, 0), g(2, 1), g(2, 2), g(2, 3)], nN: [g(3, 0), g(3, 1), g(3, 2), g(3, 3)], nS: [g(4, 0), g(4, 1), g(4, 2), g(4, 3)], tot: [g(5, 0), g(5, 1), g(5, 2), g(5, 3)] };
    // تحديث البيانات: الصيغ حيّة
    app.pane().setSheet(0); P.select(1, 2); P.startEdit('100', 'enter'); P.commitEdit(); app.pane().setSheet(1); out.after = g(3, 2); return out; });
  console.log(JSON.stringify(r));
  check(r.hdr.join() === 'Region,Feb,Jan,Grand Total' || r.hdr.join() === 'Region,Feb,Jan,الإجمالي', 'العناوين: ' + r.hdr);
  check(r.nN[1] === 5 && r.nN[2] === 17 && r.nN[3] === 22, 'صف N: ' + r.nN); check(r.nS[1] === 8 && r.nS[2] === 20 && r.nS[3] === 28, 'صف S: ' + r.nS); check(r.tot[3] === 50, 'الإجمالي الكلي: ' + r.tot[3]); check(r.after === 107, 'يتحدث مع البيانات: ' + r.after);
  await b.close(); console.log(fails ? fails + ' فشل' : 'نجح المحوري'); process.exit(fails ? 1 : 0); })();
