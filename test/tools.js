// أوامر الشريط الجديدة: دمج، تكبير، إدراج/حذف، ترتيب، تصفية، بحث، حدود، مكتبة الدوال
const { chromium } = require('playwright'); let fails = 0; const check = (c, m) => { console.log(c ? '  ✔' : '  ✘ FAIL', m); if (!c) fails++; };
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1300, height: 800 } })).newPage(); p.on('pageerror', (e) => { console.log('E', e.message); fails++; });
  p.on('console', (m) => { if (m.type() === 'error') console.log('console.error', m.text()); });
  await p.goto(process.env.URL || 'http://localhost:8765/'); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('jadawel'); }); await p.reload(); await p.waitForTimeout(500);
  await p.click('.pane[data-pane="0"] .e-new'); await p.waitForFunction(() => app.pane().sh);
  const set = (r, c, t) => p.evaluate(([r, c, t]) => { const P = app.pane(); P.select(r, c); P.startEdit(t, 'enter'); P.commitEdit(); }, [r, c, t]);
  const get = (r, c) => p.evaluate(([r, c]) => { const x = app.pane().sh.cells.get(r + ',' + c); return x && x.v; }, [r, c]);
  const form = (r, c) => p.evaluate(([r, c]) => { const x = app.pane().sh.cells.get(r + ',' + c); return x && x.f; }, [r, c]);
  const tabs = await p.$$eval('.rtabs [data-rt]', (a) => a.map((x) => x.dataset.rt)); check(tabs.join() === 'file,home,insert,formulas,data,view', 'تبويبات الشريط ' + tabs);
  // بيانات
  const rows = [['الاسم', 'المبلغ'], ['سعد', 30], ['أحمد', 10], ['سعد', 30], ['خالد', 20]];
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < 2; c++) await set(r, c, String(rows[r][c]));
  await set(6, 1, '=SUM(B2:B5)');
  check(await get(6, 1) === 90, 'مجموع أولي');
  // ترتيب
  await p.evaluate(() => { app.pane().select(1, 1); }); await p.evaluate(() => app.act('sortAZ'));
  check([await get(1, 1), await get(2, 1), await get(3, 1), await get(4, 1)].join() === '10,20,30,30', 'ترتيب تصاعدي مع صف عناوين');
  await p.evaluate(() => app.act('sortZA'));
  check([await get(1, 1), await get(4, 1)].join() === '30,10', 'ترتيب تنازلي');
  await p.evaluate(() => app.undoRedo(false)); check(await get(1, 1) === 10, 'تراجع عن الترتيب');
  // حذف المكرر
  await p.evaluate(() => { app.pane().select(0, 0, 4, 1); }); await p.evaluate(() => { app.act('removeDup'); });
  await p.waitForSelector('dialog.dlg[open]'); await p.click('dialog.dlg .btns .primary'); await p.waitForTimeout(200);
  const ex = [await get(1, 0), await get(2, 0), await get(3, 0), await get(4, 0)];
  check(ex.filter((x) => x != null).length === 3, 'حذف المكرر يبقي 3 صفوف فريدة ' + ex.join());
  await p.evaluate(() => app.undoRedo(false)); check(await get(4, 0) != null, 'تراجع عن حذف المكرر');
  // إدراج صف
  await p.evaluate(() => { app.pane().select(2, 0); }); await p.evaluate(() => app.act('insRow'));
  check(await get(3, 0) != null && await get(2, 0) == null, 'إدراج صف يزيح البيانات');
  check(await form(7, 1) === 'SUM(B2:B6)', 'الصيغة تتحدث بعد الإدراج ' + await form(6, 1));
  check(await get(7, 1) === 90, 'القيمة صحيحة بعد الإدراج');
  await p.evaluate(() => app.undoRedo(false)); check(await form(6, 1) === 'SUM(B2:B5)' && await get(2, 0) != null, 'تراجع عن الإدراج');
  await p.evaluate(() => { app.pane().select(0, 1); }); await p.evaluate(() => app.act('insCol'));
  check(await get(0, 2) === 'المبلغ' && await form(6, 2) === 'SUM(C2:C5)', 'إدراج عمود');
  await p.evaluate(() => { app.pane().select(0, 1); }); await p.evaluate(() => app.act('delCol'));
  check(await get(0, 1) === 'المبلغ' && await form(6, 1) === 'SUM(B2:B5)', 'حذف عمود');
  await p.evaluate(() => { app.pane().select(4, 0); }); await p.evaluate(() => app.act('delRow'));
  check(await form(5, 1) === 'SUM(B2:B4)' && await get(5, 1) === 60, 'حذف صف يعدّل المجموع ' + await form(5, 1));
  // دمج
  await set(8, 0, 'عنوان طويل'); await p.evaluate(() => app.pane().select(8, 0, 8, 2)); await p.evaluate(() => app.mergeCells('center'));
  check(await p.evaluate(() => app.pane().sh.merges.length) === 1, 'دمج خلايا');
  const mw = await p.evaluate(() => { const d = [...document.querySelectorAll('.pane.active .c.mg')][0]; return d && d.getBoundingClientRect().width; }); check(mw > 250, 'الخلية المدمجة تمتد على 3 أعمدة ' + mw);
  await p.evaluate(() => app.pane().select(8, 1)); check(await p.evaluate(() => { const g = app.pane().range(); return g.c1 === 0 && g.c2 === 2; }), 'النقر داخل المدمجة يحدد كاملها');
  await p.evaluate(() => app.unmergeCells()); check(await p.evaluate(() => app.pane().sh.merges.length) === 0, 'فصل الخلايا');
  await p.evaluate(() => app.undoRedo(false)); check(await p.evaluate(() => app.pane().sh.merges.length) === 1, 'تراجع عن الفصل');
  // تكبير
  const w0 = await p.evaluate(() => app.pane().colX[1]); await p.evaluate(() => app.act('zoomIn')); const w1 = await p.evaluate(() => app.pane().colX[1]);
  check(w1 > w0 * 1.05, 'تكبير يعرّض الأعمدة ' + w0 + '→' + w1); check((await p.textContent('#zoomval')) === '110%', 'مؤشر التكبير ' + await p.textContent('#zoomval'));
  await p.evaluate(() => app.pane().setZoom(0.5)); check((await p.textContent('#zoomval')) === '50%', 'تصغير 50%');
  const fs = await p.evaluate(() => getComputedStyle(document.querySelector('.pane.active .c')).fontSize); check(parseFloat(fs) < 9, 'الخط يتصغر مع التصغير ' + fs);
  await p.evaluate(() => app.pane().setZoom(1));
  // حدود
  await p.evaluate(() => { app.pane().select(0, 0, 1, 1); app.setBorder('all'); });
  check(await p.evaluate(() => app.pane().sh.cells.get('0,0').s.bd) === 'tblr', 'حدود الخلايا');
  // تصفية
  await p.evaluate(() => { app.pane().select(0, 0); app.act('filter'); }); check(await p.locator('.pane.active .fbtn').count() >= 2, 'أسهم التصفية تظهر');
  await p.evaluate(() => { const P = app.pane(); app.filterMenu(P, 0, document.querySelector('.fbtn')); });
  await p.waitForSelector('.menu-filter'); await p.click('.menu-filter .fall'); await p.locator('.menu-filter .fv').first().check(); await p.click('.menu-filter .fok'); await p.waitForTimeout(200);
  const hid = await p.evaluate(() => app.pane().sh.hidRows ? app.pane().sh.hidRows.size : 0); check(hid >= 1, 'التصفية تخفي صفوفًا ' + hid);
  await p.evaluate(() => app.act('clearFilter')); check(await p.evaluate(() => !app.pane().sh.hidRows || app.pane().sh.hidRows.size === 0), 'مسح التصفية');
  await p.evaluate(() => app.act('filter'));
  // بحث واستبدال
  await p.evaluate(() => app.findDialog(true)); await p.fill('#fr-f', 'سعد'); await p.fill('#fr-r', 'فهد'); await p.click('#fr-rall'); await p.waitForTimeout(150);
  check([await get(1, 0), await get(3, 0)].includes('فهد') || [await get(1, 0), await get(2, 0), await get(3, 0)].includes('فهد'), 'استبدال الكل'); await p.click('#find-dlg .fx2');
  // مكتبة الدوال
  await p.evaluate(() => { app.pane().select(12, 3); app.insertFn('SUM'); }); check((await p.inputValue('.pane.active .editor')) === '=SUM()', 'إدراج دالة في الخلية'); await p.keyboard.press('Escape');
  await p.evaluate(() => { app.fnDialog('math'); }); await p.waitForSelector('dialog.dlg[open]'); await p.fill('#fd-q', 'SUMIFS'); await p.click('#fd-l .it'); await p.click('dialog.dlg .btns .primary'); await p.waitForTimeout(200);
  check((await p.inputValue('.pane.active .editor')).startsWith('=SUMIFS('), 'مربع إدراج دالة'); await p.keyboard.press('Escape');
  await p.evaluate(() => { app.pane().select(0, 3); app.act('showF'); }); check(await p.evaluate(() => app.pane().sh.showF), 'إظهار الصيغ');
  await p.evaluate(() => app.act('showF'));
  await p.evaluate(() => { app.pane().select(0, 0, 3, 1); app.pane().select(4, 1); app.autoSum('AVERAGE'); }); check(String(await form(4, 1)).startsWith('AVERAGE('), 'متوسط تلقائي');
  // كل الدوال في المكتبة مدعومة
  const unsup = await p.evaluate(async () => { const m = await import('./js/fnlib.js'); const bad = []; const P = app.pane(); const FP = window.FormulaParser; const fp = new FP({ onCell: () => 1, onRange: () => [[1, 2], [3, 4]] }); for (const f of m.ALL_FNS) { try { fp.parse(f.n + '(1)', { row: 1, col: 1, sheet: 'S' }, true); } catch (e) { if (/not implemented/i.test(e.message)) bad.push(f.n); } } return bad; });
  console.log('   دوال غير مدعومة في المحرك:', unsup.join(',') || 'لا شيء');
  await b.close(); console.log(fails ? fails + ' فشل' : 'نجحت الأوامر'); process.exit(fails ? 1 : 0); })();
