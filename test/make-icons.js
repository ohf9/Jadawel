const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage();
 for (const s of [192,512]) { await p.setViewportSize({width:s,height:s}); await p.goto('http://localhost:8765/icons/icon.svg'); await p.screenshot({path:`docs/icons/icon-${s}.png`}); }
 await b.close(); })();
