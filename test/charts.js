// الرسوم البيانية: قراءة من ملف فيه رسوم، حفظ، إعادة قراءة، وإنشاء رسم جديد
const { chromium } = require('playwright'); const fs = require('fs'); let fails = 0; const check = (c, m) => { console.log(c ? '  ✔' : '  ✘ FAIL', m); if (!c) fails++; };
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage(); p.on('pageerror', (e) => { console.log('E', e.message); fails++; });
  await p.goto(process.env.URL || 'http://localhost:8765/'); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('jadawel'); }); await p.reload(); await p.waitForTimeout(500);
  const inp = process.env.CHART_IN || '/tmp/ct/in.xlsx'; const b64 = fs.readFileSync(inp).toString('base64');
  const r = await p.evaluate(async (b64) => {
    const io = await import('./js/io.js'); const u = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const wb = await io.readXlsx(u.buffer, 'in.xlsx'); const sh = wb.sheets[0];
    const n1 = (sh.charts || []).length, types = (sh.charts || []).map((c) => c.spec.type + ':' + c.spec.series.length + ':' + c.spec.title);
    app.wbs.push(wb); app.panes[0].show(wb); await new Promise((r) => setTimeout(r, 300));
    const dom1 = document.querySelectorAll('.pane[data-pane="0"] .chart svg').length;
    const buf = await io.writeXlsx(wb);
    const wb2 = await io.readXlsx(buf, 'out.xlsx'); const n2 = (wb2.sheets[0].charts || []).length;
    // رسم جديد من التحديد
    const P = app.panes[0]; P.select(0, 0, 4, 2); app.insertChart(P, 'line'); const n3 = wb.sheets[0].charts.length;
    const buf3 = await io.writeXlsx(wb); const wb3 = await io.readXlsx(buf3, 'o3.xlsx');
    await io.rebaseAfterSave(wb, buf3); const buf4 = await io.writeXlsx(wb); const wb4 = await io.readXlsx(buf4, 'o4.xlsx'); const n5 = wb4.sheets[0].charts.length; const buf5 = buf4;
    let bin = ''; new Uint8Array(buf5).forEach((x) => bin += String.fromCharCode(x));
    return { n1, types, dom1, n2, n3, n4: wb3.sheets[0].charts.length, lossy: wb.lossy, n5, b3: btoa(bin), t4: wb3.sheets[0].charts.map((c) => c.spec.type + ':' + c.spec.series.length) };
  }, b64);
  console.log(JSON.stringify({ ...r, b3: undefined }));
  fs.writeFileSync('/tmp/ct/out.xlsx', Buffer.from(r.b3, 'base64'));
  check(r.n1 === 2, 'قراءة رسمين من الملف'); check(/col:2:Sales/.test(r.types[0]), 'نوع وسلاسل وعنوان الأول'); check(/line:1:Trend/.test(r.types[1]), 'الثاني خطي');
  check(r.dom1 === 2, 'يُرسمان في الشبكة'); check(r.n2 === 2, 'يبقيان بعد الحفظ وإعادة القراءة'); check(r.n3 === 3 && r.n4 === 3, 'رسم جديد يُحفظ'); check(r.n5 === 3, 'حفظ ثانٍ بعد إعادة الأساس يحتفظ بالرسوم'); check(!(r.lossy || []).includes('charts'), 'لا تحذير فقدان الرسوم');
  await b.close(); console.log(fails ? fails + ' فشل' : 'نجحت الرسوم'); process.exit(fails ? 1 : 0); })();
