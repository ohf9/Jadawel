const { chromium } = require('playwright'); const fs=require('fs');
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1400,height:900}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
 await p.goto('http://localhost:8765/'); await p.evaluate(()=>indexedDB.deleteDatabase('jadawel')); await p.reload(); await p.waitForTimeout(800); console.log('early errs', errs);
 const F=(f)=>({name:f.split('/').pop(), mimeType:'application/octet-stream', buffer: fs.readFileSync(f)});
 await p.setInputFiles('#file-input',[F('test/corpus/openpyxl.xlsx')]); await p.waitForTimeout(1200);
 await p.screenshot({path:'test/out/8-ui.png'});
 console.log('errors',errs, await p.evaluate(()=>app.wbs.map(w=>[w.name,w.kind,w.fallback,w.lossy,w.sheets.map(s=>s.cells.size)])));
 await b.close(); })();
