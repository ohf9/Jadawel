// التنسيق الشرطي: قواعد من الملف وقواعد جديدة، وحفظها وقراءتها
const { chromium } = require('playwright'); let fails = 0; const check = (c, m) => { console.log(c ? '  ✔' : '  ✘ FAIL', m); if (!c) fails++; };
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage(); p.on('pageerror', (e) => { console.log('E', e.stack); fails++; });
  await p.goto(process.env.URL || 'http://localhost:8765/'); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('jadawel'); }); await p.reload(); await p.waitForTimeout(500);
  await p.click('.pane[data-pane="0"] .e-new'); await p.waitForFunction(() => app.pane().sh);
  const r = await p.evaluate(async () => { const P = app.pane(); P.sh.rtl = false; P.setSheet(0);
    const set = (r, c, t) => { P.select(r, c); P.startEdit(t, 'enter'); P.commitEdit(); };
    for (let i = 0; i < 6; i++) set(i, 0, String((i + 1) * 10));
    const cfm = await import('./js/cf.js');
    P.select(0, 0, 5, 0); app.cfDialog(P, 'greaterThan'); await new Promise((r) => setTimeout(r, 200));
    const dl = [...document.querySelectorAll('dialog.dlg')].pop(); dl.querySelector('.cv1').value = '30'; dl.querySelector('.btns .primary').click(); await new Promise((r) => setTimeout(r, 200));
    P.select(0, 1, 5, 1); for (let i = 0; i < 6; i++) set(i, 1, String((i + 1) * 5)); P.select(0, 1, 5, 1); app.cfRefresh(P.sh);
    P.select(0, 1, 5, 1); const sh = P.sh; sh.cf.push({ ref: 'B1:B6', rules: [cfm.scaleRule('gyr')] }); sh.cfEdited = true; app.cfRefresh(sh);
    const bg = (r, c) => { const el = [...P.cells.querySelectorAll('.c')].find((e) => e.textContent === String(r)); return el && el.style.background; };
    const io = await import('./js/io.js'); const buf = await io.writeXlsx(P.wb); const wb2 = await io.readXlsx(buf, 'x.xlsx');
    return { n: sh.cf.length, a40: bg(40), a20: bg(20), b5: bg(5), b25: bg(25), after: (wb2.sheets[0].cf || []).map((e) => e.ref + ':' + e.rules.map((x) => x.type).join('+')) }; });
  console.log(JSON.stringify(r));
  check(r.n === 2, 'قاعدتان'); check(/rgb\(255, 199, 206\)|#ffc7ce/i.test(r.a40 || ''), 'أكبر من 30 يُلوَّن'); check(!r.a20, 'الأصغر لا يُلوَّن'); check(!!r.b5 && !!r.b25 && r.b5 !== r.b25, 'تدرج لوني مختلف'); check(r.after.length === 2 && /cellIs/.test(r.after[0]) && /colorScale/.test(r.after[1]), 'القواعد تُحفظ وتُقرأ ' + r.after.join(','));
  await b.close(); console.log(fails ? fails + ' فشل' : 'نجح التنسيق الشرطي'); process.exit(fails ? 1 : 0); })();
