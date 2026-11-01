// ألوان الثيم مع tint والنص العمودي تُقرأ كما في Excel
const { chromium } = require('playwright'); let fails = 0; const check = (c, m) => { console.log(c ? '  ✔' : '  ✘ FAIL', m); if (!c) fails++; };
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage(); p.on('pageerror', (e) => { console.log('E', e.message); fails++; });
  await p.goto('http://localhost:8765/'); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('jadawel'); }); await p.reload(); await p.waitForTimeout(500);
  const r = await p.evaluate(async () => {
    const io = await import('./js/io.js'); const x = new ExcelJS.Workbook(); const ws = x.addWorksheet('S');
    ws.getCell('A1').value = 'x'; ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { theme: 9, tint: 0.6 } };
    ws.getCell('B1').value = 'عمودي'; ws.getCell('B1').alignment = { textRotation: 90, wrapText: true };
    ws.getCell('C1').value = 'y'; ws.getCell('C1').fill = { type: 'pattern', pattern: 'solid', fgColor: { indexed: 13 } };
    const buf = await x.xlsx.writeBuffer(); const wb = await io.readXlsx(buf, 't.xlsx'); const g = (k) => wb.sheets[0].cells.get(k).s || {};
    return [g('0,0').fill, g('0,1').rot, g('0,2').fill];
  });
  check(r[0] === '#fcd5b5', 'لون ثيم مع tint (ثيم Office 2007: F79646 بدرجة 60%) ' + r[0]); check(r[1] === 90, 'دوران النص ' + r[1]); check(r[2] === '#FFFF00', 'لون مفهرس ' + r[2]);
  await b.close(); console.log(fails ? fails + ' فشل' : 'نجح'); process.exit(fails ? 1 : 0); })();
