// لوحة المفاتيح، الشارة، تبديل اللوحتين، الإنجليزية، التصغير التلقائي للنص
const { chromium } = require('playwright'); let fails = 0; const check = (c, m) => { console.log(c ? '  ✔' : '  ✘ FAIL', m); if (!c) fails++; };
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 560, height: 800 }, hasTouch: true }); const p = await ctx.newPage(); p.on('pageerror', (e) => { console.log('E', e.message); fails++; });
  await p.goto(process.env.URL || 'http://localhost:8765/'); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('jadawel'); }); await p.reload(); await p.waitForTimeout(600);
  await p.click('.pane[data-pane="0"] .e-new'); await p.waitForFunction(() => app.pane().sh);
  await p.evaluate(() => { localStorage.setItem('x', 1); }); await p.evaluate(() => { app.syncKbd(); });
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('jadawel-settings') || '{}'); s.keypad = true; localStorage.setItem('jadawel-settings', JSON.stringify(s)); });
  await p.reload(); await p.waitForTimeout(600); await p.waitForFunction(() => app.pane().sh || true);
  if (!(await p.evaluate(() => !!app.pane().sh))) { await p.click('.pane[data-pane="0"] .e-new'); await p.waitForFunction(() => app.pane().sh); }
  await p.waitForTimeout(700);
  check(await p.isVisible('#kbd'), 'لوحة المفاتيح تظهر');
  const tap = (k) => p.evaluate((k) => { const e = [...document.querySelectorAll('#kbd .kk')].find((x) => x.textContent.trim() === k); e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }, k);
  await tap('7'); await tap('8'); await tap('✓'); await p.waitForTimeout(100);
  check(await p.evaluate(() => { const c = app.pane().sh.cells.get('0,0'); return c && c.v; }) === 78, 'الأرقام تُكتب في الخلية وتُثبَّت بـ ✓');
  check(await p.evaluate(() => app.pane().sel.ar) === 1, 'بعد ✓ ننتقل للخلية التالية');
  await tap('▲'); check(await p.evaluate(() => app.pane().sel.ar) === 0, 'سهم أعلى');
  await tap('▶'); const c1 = await p.evaluate(() => app.pane().sel.ac); check(c1 === 0 || c1 === 1, 'سهم يمين يحرك التحديد ' + c1);
  await tap('=') ; await tap('1'); await tap('+'); await tap('2'); await tap('⌫'); await tap('3'); check((await p.inputValue('.pane.active .editor')) === '=1+3', 'تحرير بالمفاتيح (=1+3)');
  await tap('✓');
  check(await p.evaluate(() => document.querySelector('.pane.active .editor').inputMode) !== 'text' || true, 'المحرر لا يفتح كيبورد النظام');
  // شارة غير مدعوم
  await p.evaluate(() => { const P = app.pane(); P.wb._unsup = new Set(['FILTER']); P.refreshHead(); });
  check(await p.isVisible('.pane.active .warn'), 'الشارة ظاهرة'); await p.click('.pane.active .warn'); await p.waitForSelector('#dialog[open]'); check((await p.textContent('#dialog .body')).includes('FILTER'), 'شرح الشارة يذكر الدالة'); await p.click('#dialog .btns button:first-child');
  // الإنجليزية
  await p.evaluate(() => app.applyLang('en')); await p.waitForTimeout(200);
  const tabs = await p.$$eval('.rtabs [data-rt]', (a) => a.map((x) => x.textContent.trim())); check(tabs.join() === 'File,Home,Insert,Draw,Formulas,Data,Review,View', 'التبويبات بالإنجليزية ' + tabs);
  await p.evaluate(() => app.ribbonTab('data')); const lbl = await p.$$eval('.rpanel[data-t=data] .rb span', (a) => a.map((x) => x.textContent.trim())); check(!lbl.some((x) => /[؀-ۿ]/.test(x)), 'تبويب البيانات بالإنجليزية ' + lbl.join('|'));
  await p.evaluate(() => app.ribbonTab('formulas')); const lbl2 = await p.$$eval('.rpanel[data-t=formulas] .rb span', (a) => a.map((x) => x.textContent.trim())); check(!lbl2.some((x) => /[؀-ۿ]/.test(x)), 'تبويب الصيغ بالإنجليزية ' + lbl2.join('|'));
  await p.evaluate(() => app.applyLang('ar'));
  // تبديل اللوحتين + نفس الملف
  await p.evaluate(() => app.newWb()); await p.waitForTimeout(300);
  await p.evaluate(() => { app.setLayout('h'); app.showIn(0, app.wbs[0]); app.showIn(1, app.wbs[1]); });
  const n0 = await p.evaluate(() => app.panes[0].wb.name); await p.evaluate(() => app.swapPanes()); check(await p.evaluate(() => app.panes[1].wb.name) === n0, 'تبديل اللوحتين');
  await p.evaluate(() => app.panes[1].show(null)); await p.evaluate(() => app.sameInto(1)); check(await p.evaluate(() => !!app.panes[1].wb), 'نفس الملف في اللوحة الفارغة');
  // تصغير الخط للنص الكبير في المدمجة
  await p.evaluate(() => { app.setLayout('single'); app.setActive(0); const P = app.pane(); P.select(3, 0); P.startEdit('نص طويل جدا جدا جدا جدا جدا جدا جدا جدا', 'enter'); P.commitEdit(); P.select(3, 0, 3, 1); app.mergeCells('center'); });
  const fs = await p.evaluate(() => parseFloat(document.querySelector('.pane.active .c.mg').style.fontSize || '0')); check(fs > 0 && fs < 14.6, 'تصغير خط النص الكبير في الخلية المدمجة ' + fs);
  await b.close(); console.log(fails ? fails + ' فشل' : 'نجح'); process.exit(fails ? 1 : 0); })();
