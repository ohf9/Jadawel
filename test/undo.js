// التراجع والإعادة في العمليات المختلفة
const { chromium } = require('playwright'); let fails = 0; const check = (c, m) => { console.log(c ? '  ✔' : '  ✘ FAIL', m); if (!c) fails++; };
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage(); p.on('pageerror', (e) => { console.log('E', e.stack); fails++; });
  await p.goto(process.env.URL || 'http://localhost:8765/'); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('jadawel'); }); await p.reload(); await p.waitForTimeout(500);
  await p.click('.pane[data-pane="0"] .e-new'); await p.waitForFunction(() => app.pane().sh);
  const r = await p.evaluate(async () => { const P = app.pane(); P.sh.rtl = false; P.setSheet(0); const sh = P.sh; const out = {};
    const set = (r, c, t) => { P.select(r, c); P.startEdit(t, 'enter'); P.commitEdit(); };
    const v = (r, c) => { const x = sh.cells.get(r + ',' + c); return x && x.v; };
    set(0, 0, '5'); set(0, 0, '7'); app.undoRedo(false); out.u1 = v(0, 0); app.undoRedo(true); out.r1 = v(0, 0);
    document.getElementById('btn-undo') && 0; const ub = document.querySelector('[data-act=undo],#btn-undo,#undo'); out.btn = !!ub;
    set(1, 0, '3'); set(2, 0, '1'); set(3, 0, '2'); P.select(1, 0, 3, 0); app.act('sortAZ'); out.sorted = [v(1, 0), v(2, 0), v(3, 0)].join(); app.undoRedo(false); out.unsorted = [v(1, 0), v(2, 0), v(3, 0)].join();
    P.select(5, 0); set(5, 0, 'x'); P.select(5, 0); app.act('insRow'); out.ins = v(6, 0); app.undoRedo(false); out.insU = v(5, 0);
    P.select(1, 0); app.toggleStyle && app.toggleStyle('b'); const b1 = sh.cells.get('1,0').s && sh.cells.get('1,0').s.b; app.undoRedo(false); out.bold = [b1, sh.cells.get('1,0').s && sh.cells.get('1,0').s.b];
    // كائنات: رسم، تنسيق شرطي، تثبيت
    P.select(0, 0, 3, 0); app.insertChart(P, 'col'); out.ch1 = (sh.charts || []).length; app.undoRedo(false); out.ch2 = sh.charts.length; app.undoRedo(true); out.ch3 = sh.charts.length;
    P.select(1, 0); app.freezePanes(P, 'row'); out.f1 = !!sh.freeze; app.undoRedo(false); out.f2 = !!sh.freeze;
    const cfm = await import('./js/cf.js'); P.select(0, 0, 3, 0); app.cfMenu; sh.cf = []; app.cfClear(P, null);
    return out; });
  console.log(JSON.stringify(r));
  check(r.u1 === 5 && r.r1 === 7, 'تراجع/إعادة قيمة'); check(r.sorted === '1,2,3' && r.unsorted === '3,1,2', 'تراجع الترتيب'); check(r.ins === 'x' && r.insU === 'x', 'تراجع إدراج صف'); check(r.bold[0] && !r.bold[1], 'تراجع غامق');
  check(r.ch1 === 1 && r.ch2 === 0 && r.ch3 === 1, 'تراجع الرسم البياني'); check(r.f1 && !r.f2, 'تراجع التثبيت');
  await b.close(); console.log(fails ? fails + ' فشل' : 'نجح التراجع'); process.exit(fails ? 1 : 0); })();
