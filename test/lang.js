// تبديل اللغة فورًا ذهابًا وإيابًا دون إعادة تحميل
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage(); let bad = 0; p.on('pageerror', (e) => { console.log('E', e.message); bad++; });
  await p.goto(process.env.URL || 'http://localhost:8765/'); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('jadawel'); }); await p.reload(); await p.waitForTimeout(500);
  await p.click('.pane[data-pane="0"] .e-new'); await p.waitForFunction(() => app.pane().sh);
  const txt = () => p.evaluate(() => ({ save: document.querySelector('#btn-save').textContent.trim(), tip: document.querySelector('#btn-save').title, dir: document.documentElement.dir, tab: document.querySelector('.pane.active .sheet-tabs').textContent.trim().slice(0, 12), nf: document.querySelector('#fm-nf option').textContent }));
  const sw = async (l) => { await p.click('#btn-settings'); await p.selectOption('#set-lang', l); await p.click('#set-save'); await p.waitForTimeout(200); };
  const a0 = await txt(); await sw('en'); const e1 = await txt(); await sw('ar'); const a2 = await txt();
  console.log(JSON.stringify([a0, e1, a2]));
  if (e1.save === a0.save || e1.dir !== 'ltr') { console.log('FAIL en'); bad++; }
  if (a2.save !== a0.save || a2.dir !== 'rtl' || a2.tip !== a0.tip || a2.nf !== a0.nf) { console.log('FAIL back to ar'); bad++; }
  await b.close(); console.log(bad ? 'FAIL' : 'OK lang'); process.exit(bad ? 1 : 0); })();
