// كتابة XLSX بعد الدمج والإدراج ثم قراءته من جديد
const { chromium } = require('playwright'); let fails = 0; const check = (c, m) => { console.log(c ? '  ✔' : '  ✘ FAIL', m); if (!c) fails++; };
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage(); p.on('pageerror', (e) => { console.log('E', e.message); fails++; });
  await p.goto(process.env.URL || 'http://localhost:8765/'); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('jadawel'); }); await p.reload(); await p.waitForTimeout(500);
  await p.click('.pane[data-pane="0"] .e-new'); await p.waitForFunction(() => app.pane().sh);
  const r = await p.evaluate(async () => {
    const io = await import('./js/io.js'); const P = app.pane(); const set = (r, c, t) => { P.select(r, c); P.startEdit(t, 'enter'); P.commitEdit(); };
    set(0, 0, 'عنوان'); set(1, 0, '1'); set(2, 0, '2'); set(3, 0, '=SUM(A2:A3)');
    P.select(0, 0, 0, 2); app.mergeCells('center'); P.select(1, 0, 1, 1); app.setBorder('all');
    P.select(2, 0); app.act('insRow'); P.select(2, 0); P.startEdit('9', 'enter'); P.commitEdit();
    const buf1 = await io.writeXlsx(P.wb);
    const wb2 = await io.readXlsx(buf1, 'x.xlsx'); const s2 = wb2.sheets[0];
    // ثم حفظ ثانٍ فوق الملف الأصلي (مسار إعادة الكتابة)
    await io.rebaseAfterSave(P.wb, buf1); P.select(0, 5); app.act('insCol'); const buf2 = await io.writeXlsx(P.wb); const wb3 = await io.readXlsx(buf2, 'y.xlsx'); const s3 = wb3.sheets[0];
    return { merges: s2.merges, a4: s2.cells.get('3,0') && s2.cells.get('3,0').v, f: s2.cells.get('4,0') && s2.cells.get('4,0').f, bd: s2.cells.get('1,0') && s2.cells.get('1,0').s && s2.cells.get('1,0').s.bd, al: s2.cells.get('0,0').s && s2.cells.get('0,0').s.al, merges3: s3.merges, f3: s3.cells.get('4,0') && s3.cells.get('4,0').f };
  });
  console.log(JSON.stringify(r));
  check(r.merges.length === 1 && r.merges[0].c2 === 2, 'الدمج يُكتب ويُقرأ'); check(r.al === 'center', 'توسيط المدمجة'); check(r.a4 === 2, 'قيمة بعد الإدراج'); check(r.f === 'SUM(A2:A4)', 'الصيغة بعد الإدراج ' + r.f); check(r.bd && r.bd.includes('t'), 'الحدود تُكتب'); check(r.merges3.length === 1 && r.f3 === 'SUM(A2:A4)', 'حفظ ثانٍ بعد الإدراج يحافظ على الدمج والصيغ');
  await b.close(); console.log(fails ? fails + ' فشل' : 'نجح الحفظ'); process.exit(fails ? 1 : 0); })();
