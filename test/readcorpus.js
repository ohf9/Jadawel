const { chromium } = require('playwright'); const fs=require('fs'); const path=require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:8765/'); await p.evaluate(()=>indexedDB.deleteDatabase('jadawel')); await p.reload(); await p.waitForTimeout(400);
 for (const f of fs.readdirSync('test/corpus').concat(fs.readdirSync('test/corpus/lo').map(x=>'lo/'+x))) {
   if (fs.statSync('test/corpus/'+f).isDirectory()) continue;
   const buf=fs.readFileSync('test/corpus/'+f).toString('base64');
   const r = await p.evaluate(async ([name,b64]) => { const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)); const t0=performance.now();
     try { const wb = await app.readFile(new File([bytes], name.split('/').pop())); if(!wb) return 'null'; return JSON.stringify({sheets: wb.sheets.map(s=>[s.name,s.cells.size,s.rtl]), a1: [...wb.sheets[0].cells.entries()].slice(0,2), ms: Math.round(performance.now()-t0)}); } catch(e) { return 'ERR '+e.message; } }, [f,buf]);
   console.log(f, '→', r.slice(0,300));
 }
 console.log('pageerrors', errs); await b.close(); })();
