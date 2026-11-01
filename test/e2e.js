const { chromium } = require('playwright');
const ExcelJS = require('exceljs');
const fs = require('fs'); const path = require('path');
const OUT = path.resolve('test/out');
const F = (f) => ({ name: path.basename(f), mimeType: f.endsWith('.csv') ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: fs.readFileSync(f) });
const log = (...a) => console.log('•', ...a);
let fails = 0; const check = (cond, msg) => { console.log(cond ? '  ✔' : '  ✘ FAIL', msg); if (!cond) fails++; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 876 }, acceptDownloads: true, locale: 'ar' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8765' });
  await ctx.addInitScript(() => { window.__noFS = true; });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:8765/');
  await page.waitForFunction(() => window.app && app.panes.length === 2);

  const pt = (p, r, c) => page.evaluate(([p, r, c]) => { const q = app.panes[p]; q.scrollTo(r, c); const rc = q.layer.getBoundingClientRect(); const x = (q.colX[c] + q.colX[c + 1]) / 2, y = (q.rowY[r] + q.rowY[r + 1]) / 2; return { x: q.sh.rtl ? rc.right - x : rc.left + x, y: rc.top + y }; }, [p, r, c]);
  const click = async (p, r, c, opts) => { const { x, y } = await pt(p, r, c); if (opts) await page.keyboard.down('Shift'); await page.mouse.click(x, y); if (opts) await page.keyboard.up('Shift'); };
  const val = (p, a1) => page.evaluate(([p, a1]) => { const q = app.panes[p]; const m = /^([A-Z]+)(\d+)$/.exec(a1); let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; const cell = q.sh.cells.get((+m[2] - 1) + ',' + (c - 1)); return cell ? (cell.f != null ? '=' + cell.f : cell.v) : null; }, [p, a1]);

  log('1) فتح ملفين معًا');
  await page.setInputFiles('#file-input', [F(path.join(OUT, 'مبيعات.xlsx')), F(path.join(OUT, 'مخزون.xlsx'))]);
  await page.waitForFunction(() => app.wbs.length === 2 && app.panes[1].wb);
  const st = await page.evaluate(() => ({ layout: app.layout, p0: app.panes[0].wb.name, p1: app.panes[1].wb.name, rtl0: app.panes[0].sh.rtl, tabs: document.querySelectorAll('.ftab').length }));
  check(st.layout === 'h', 'تم تفعيل العرض جنبًا إلى جنب تلقائيًا');
  check(st.p0 === 'مبيعات.xlsx' && st.p1 === 'مخزون.xlsx', 'كل ملف في لوحة');
  check(st.rtl0 === true, 'اتجاه الورقة العربية من اليمين لليسار محفوظ من الملف');
  check(st.tabs === 2, 'تبويبان للملفين');
  check(await val(0, 'D6') === '=SUM(D2:D4)', 'الصيغة مقروءة من الملف');
  await page.screenshot({ path: path.join(OUT, '1-two-files.png') });

  log('2) تحرير مستقل في كل ملف');
  await click(0, 1, 1); await page.keyboard.type('15'); await page.keyboard.press('Enter');
  check(await val(0, 'B2') === 15, 'تعديل B2 في الملف الأول بالكتابة المباشرة');
  await click(1, 4, 0); await page.keyboard.type('A-4'); await page.keyboard.press('Tab'); await page.keyboard.type('زعفران إيراني'); await page.keyboard.press('Tab'); await page.keyboard.type('٣٠'); await page.keyboard.press('Enter');
  check(await val(1, 'A5') === 'A-4' && await val(1, 'B5') === 'زعفران إيراني' && await val(1, 'C5') === 30, 'إضافة صف في الملف الثاني (الأرقام العربية ٣٠ → 30)');
  await click(1, 1, 2); await page.click('.pane[data-pane="1"] .formula'); await page.keyboard.press('Control+A'); await page.keyboard.type('120'); await page.keyboard.press('Enter');
  check(await val(1, 'C2') === 120, 'التحرير من شريط الصيغة');
  check(await val(0, 'B2') === 15, 'الملف الأول لم يتأثر بتحرير الثاني');
  const dirty = await page.evaluate(() => app.wbs.map((w) => w.dirty));
  check(dirty[0] && dirty[1], 'الملفان معلّمان كغير محفوظين');

  log('3) نسخ ولصق من الملف الثاني إلى الأول بلوحة المفاتيح');
  await click(1, 0, 0); await click(1, 2, 2, { modifiers: ['Shift'] });
  await page.keyboard.press('Control+C');
  await click(0, 9, 0); await page.keyboard.press('Control+V');
  check(await val(0, 'A10') === 'SKU' && await val(0, 'C12') === 7 && await val(0, 'B11') === 'Cardamom', 'لصق نطاق 3×3 من ملف إلى آخر');
  const clipText = await page.evaluate(() => navigator.clipboard.readText());
  check(clipText.split('\n')[0] === 'SKU\tItem\tStock', 'الحافظة تحتوي نصًا بصيغة Tab (يُلصق في Excel وغيره)');

  log('4) نسخ صيغة مع إزاحة المراجع');
  await click(0, 5, 3); await page.keyboard.press('Control+C'); await click(0, 5, 4); await page.keyboard.press('Control+V');
  check(await val(0, 'E6') === '=SUM(E2:E4)', 'المرجع النسبي يتغير عند اللصق مثل Excel');
  await page.keyboard.press('Control+Z');
  check(await val(0, 'E6') === null, 'التراجع Ctrl+Z');
  await page.keyboard.press('Control+Y');
  check(await val(0, 'E6') === '=SUM(E2:E4)', 'الإعادة Ctrl+Y');
  await page.keyboard.press('Control+Z');

  log('5) سحب نطاق بالماوس من الملف الثاني وإفلاته في الأول');
  await click(1, 1, 1); await click(1, 3, 2, { modifiers: ['Shift'] });
  const a = await pt(1, 1, 1); const b = await pt(0, 14, 1);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(a.x + 20, a.y + 5, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.screenshot({ path: path.join(OUT, '2-dragging.png') });
  await page.mouse.up();
  check(await val(0, 'B15') === 'Cardamom' && await val(0, 'C17') === 250, 'السحب والإفلات بين الملفين ينسخ البيانات');
  check(await val(1, 'B2') === 'Cardamom', 'المصدر لم يتغير (السحب ينسخ ولا ينقل)');

  log('6) التنقل بين الملفات دون فقدان التعديلات');
  await page.click('[data-layout-btn="single"]');
  await page.click('.ftab[data-id] >> nth=1'); await page.click('.ftab[data-id] >> nth=0');
  check(await val(0, 'B2') === 15, 'التعديلات باقية بعد التبديل بين التبويبات');
  await page.click('[data-layout-btn="h"]');
  await page.waitForTimeout(800); // الحفظ التلقائي
  await page.screenshot({ path: path.join(OUT, '3-after-edits.png') });

  log('7) إعادة تحميل الصفحة (محاكاة إغلاق مفاجئ) واستعادة الملفات');
  page.removeAllListeners('dialog');
  await page.evaluate(() => { window.onbeforeunload = null; });
  await page.reload({ waitUntil: 'load' }).catch(() => {});
  await page.waitForFunction(() => window.app && app.wbs.length === 2, null, { timeout: 8000 });
  check(await page.evaluate(() => app.layout) === 'h', 'استعادة العرض جنبًا إلى جنب');
  console.log(await page.evaluate(() => JSON.stringify({p0: app.panes[0].wb.name, b2: app.panes[0].sh.cells.get('1,1'), b15: app.panes[0].sh.cells.get('14,1')})));
  check(await val(0, 'B2') === 15 && await val(0, 'B15') === 'Cardamom', 'تعديلات الملف الأول مستعادة');
  check(await val(1, 'B5') === 'زعفران إيراني' && await val(1, 'C2') === 120, 'تعديلات الملف الثاني مستعادة');
  check(await page.evaluate(() => app.wbs.every((w) => w.dirty)), 'ما زالت معلّمة كغير محفوظة');

  log('8) حفظ الملفين (لا يُستبدل الأصل: ينزّل نسخة)');
  const saved = [];
  for (const p of [0, 1]) {
    await click(p, 0, 0);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+S')]);
    const f = path.join(OUT, 'saved-' + p + '.xlsx'); await dl.saveAs(f); saved.push(f);
    log('   حُفظ:', dl.suggestedFilename());
  }
  await page.waitForTimeout(300);
  check(await page.evaluate(() => app.wbs.every((w) => !w.dirty)), 'إزالة علامة "غير محفوظ" بعد الحفظ');

  log('9) فحص الملفات المحفوظة بمكتبة مستقلة');
  const x = new ExcelJS.Workbook(); await x.xlsx.readFile(saved[0]);
  const s = x.getWorksheet('المبيعات');
  check(x.worksheets.length === 2 && x.getWorksheet('ملاحظات').getCell('A1').value === 'ورقة ثانية يجب أن تبقى', 'الورقة الثانية محفوظة');
  check(s.getCell('B2').value === 15, 'B2 = 15 محفوظة');
  check(s.getCell('D2').formula === 'B2*C2', 'الصيغة D2 محفوظة');
  check(s.getCell('D6').formula === 'SUM(D2:D4)', 'صيغة المجموع محفوظة');
  check(s.getCell('A1').font && s.getCell('A1').font.bold && s.getCell('A1').fill.fgColor.argb === 'FF1E6B41', 'تنسيق العنوان (غامق + تعبئة) لم يُفقد');
  check(s.getCell('C2').numFmt === '#,##0.00', 'تنسيق الأرقام محفوظ');
  check(s.views[0].rightToLeft === true, 'اتجاه الورقة RTL محفوظ');
  check(s.getCell('A10').value === 'SKU' && s.getCell('C17').value === 250, 'البيانات الملصوقة والمسحوبة محفوظة');
  check(s.getCell('A8').value instanceof Date, 'التاريخ محفوظ كتاريخ');
  check(require('child_process').execSync(`unzip -p '${saved[0]}' xl/workbook.xml`).toString().includes('fullCalcOnLoad="1"'), 'Excel سيعيد حساب الصيغ عند الفتح');
  const y = new ExcelJS.Workbook(); await y.xlsx.readFile(saved[1]);
  const t = y.getWorksheet('Inventory');
  check(t.getCell('B5').value === 'زعفران إيراني' && t.getCell('C5').value === 30 && t.getCell('C2').value === 120, 'الملف الثاني محفوظ بالتعديلات');
  check(t.getCell('A1').font.bold === true, 'تنسيق الملف الثاني محفوظ');
  const orig = new ExcelJS.Workbook(); await orig.xlsx.readFile(path.join(OUT, 'مبيعات.xlsx'));
  check(orig.getWorksheet('المبيعات').getCell('B2').value === 12, 'الملف الأصلي لم يُمس');

  log('10) فتح الملف المحفوظ مجددًا وCSV');
  fs.writeFileSync(path.join(OUT, 'عملاء.csv'), '﻿الاسم,المدينة,الرصيد\n"أحمد, محمد",الرياض,1500\nسارة,جدة,"2,300"\n');
  await page.setInputFiles('#file-input', [F(path.join(OUT, 'عملاء.csv'))]);
  await page.waitForFunction(() => app.wbs.length === 3);
  check(await val(await page.evaluate(() => app.active), 'A2') === 'أحمد, محمد' && await val(await page.evaluate(() => app.active), 'C3') === 2300, 'CSV عربي مع فواصل داخل الخلايا');
  await page.setInputFiles('#file-input', [F(saved[0])]);
  await page.waitForFunction(() => app.wbs.length === 4);
  check(await val(await page.evaluate(() => app.active), 'B2') === 15, 'إعادة فتح الملف المحفوظ تعرض التعديل');

  log('11) لقطات بحجم Galaxy Tab S10+ (أفقي وعمودي)');
  await page.setViewportSize({ width: 1400, height: 876 }); await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '4-tab-landscape.png') });
  await page.click('[data-layout-btn="v"]');
  await page.setViewportSize({ width: 876, height: 1400 }); await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '5-tab-portrait.png') });

  check(errors.length === 0, 'لا أخطاء في وحدة التحكم' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(fails ? `\n${fails} اختبار فشل` : '\nكل الاختبارات نجحت');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
