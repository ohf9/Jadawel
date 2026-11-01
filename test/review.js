const { chromium } = require('playwright');
let fails = 0; const check = (c, m) => { console.log(c ? '  ✔ ' + m : '  ✘ FAIL ' + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 990, height: 760 }, locale: 'ar' });
  await ctx.addInitScript(() => { window.__noFS = true; localStorage.clear(); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8765/'); await p.waitForFunction(() => window.app);
  await p.evaluate(() => app.newWb());
  await p.waitForFunction(() => app.pane().sh);
  // ملاحظة
  await p.evaluate(() => { const pn = app.pane(); pn.setSel && pn.setSel(1, 1); });
  const r = await p.evaluate(() => { const sh = app.pane().sh; sh.notes = sh.notes || {}; sh.notes['1,1'] = 'مرحبا'; return Object.keys(sh.notes).length; });
  check(r === 1, 'ملاحظة');
  // الإعدادات
  await p.evaluate(() => app.showBackstage('settings'));
  check(await p.locator('#backstage section[data-p="settings"] .st-row').count() > 5, 'صفحة الإعدادات فيها خيارات');
  const nav = await p.evaluate(() => { const n = document.querySelector('#backstage .bs-nav'); const r = n.getBoundingClientRect(); return n.scrollHeight > n.scrollWidth || r.width < 300; });
  check(nav, 'قائمة File عمودية');
  check(errs.length === 0, 'لا أخطاء ' + errs.join('|'));
  await b.close(); process.exit(fails ? 1 : 0);
})();
