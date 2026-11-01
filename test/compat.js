// يفتح كل ملف من ملفات الاختبار (من Excel/LibreOffice/openpyxl)، يعدّله، يحفظه، ثم يتحقق منه ببرامج مستقلة
const { chromium } = require('playwright'); const fs=require('fs'); const path=require('path'); const cp=require('child_process');
const OUT = path.resolve('test/out/compat'); fs.mkdirSync(OUT,{recursive:true});
let fails=0; const check=(c,m)=>{console.log(c?'  ✔':'  ✘ FAIL',m); if(!c) fails++;};
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({acceptDownloads:true}); await ctx.addInitScript(()=>{window.__noFS=true;});
 const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:8765/'); await p.evaluate(()=>indexedDB.deleteDatabase('jadawel')); await p.reload(); await p.waitForTimeout(500);
 const files=['exceljs.xlsx','openpyxl.xlsx','openpyxl.xls','openpyxl.ods','lo/openpyxl.xlsx','wide.csv'];
 for (const f of files) {
   console.log('•', f);
   const name=f.split('/').pop(); const n0=await p.evaluate(()=>app.wbs.length);
   await p.setInputFiles('#file-input',[{name, mimeType:'application/octet-stream', buffer:fs.readFileSync('test/corpus/'+f)}]);
   await p.waitForFunction((n)=>app.wbs.length>n && app.pane().wb === app.wbs[app.wbs.length-1], n0, {timeout:20000});
   const info=await p.evaluate(()=>{const w=app.pane().wb; return {kind:w.kind, sheets:w.sheets.map(s=>s.name), cells:w.sheets.map(s=>s.cells.size), name:w.name};});
   check(info.sheets.length>=1 && info.cells[0]>0, `فُتح: ${info.sheets.join('|')} خلايا=${info.cells.join(',')} نوع=${info.kind}`);
   await p.evaluate(()=>{const q=app.pane(); q.select(30,30); q.startEdit('TESTEDIT','enter'); q.commitEdit(); q.select(30,30); app.toggleStyle('b'); app.setStyle('fill','#ffe699'); app.setStyle('color','#c00000'); app.setNumFmt('General');});
   p.keyboard.press('Control+S');
   // قد يظهر تنبيه العناصر غير المحفوظة
   const dl = p.waitForEvent('download',{timeout:20000});
   try { await p.waitForSelector('dialog[open]',{timeout:1500}); await p.click('dialog button.primary'); } catch(e) {}
   const d=await dl; const out=path.join(OUT, name.replace(/\.\w+$/,'')+'-'+path.basename(path.dirname(f))+'-saved.xlsx'); await d.saveAs(out);
   if (/\.csv$/.test(name)) { check(fs.readFileSync(out,'utf8').includes('TESTEDIT'), 'ملف CSV يُحفظ CSV ويحمل التعديل'); continue; }
   // التحقق المستقل 1: openpyxl
   const py=`import openpyxl,sys\nwb=openpyxl.load_workbook(sys.argv[1])\nws=wb.worksheets[0]\nc=ws['AE31']\nprint(wb.sheetnames, c.value, c.font.b, c.fill.fgColor.rgb)`;
   fs.writeFileSync('/tmp/chk.py',py);
   const r=cp.spawnSync('python3',['/tmp/chk.py',out],{encoding:'utf8'});
   check(r.status===0 && r.stdout.includes('TESTEDIT') && r.stdout.includes('True'), 'openpyxl يقرأ الملف المحفوظ ويرى التعديل والتنسيق: '+(r.stdout||r.stderr).trim().slice(0,160));
   // التحقق المستقل 2: LibreOffice يحوّله إلى CSV
   const lo=cp.spawnSync('soffice',['--headless','--convert-to','csv','--outdir',OUT+'/csv',out],{encoding:'utf8',timeout:120000});
   const csv=path.join(OUT,'csv',path.basename(out).replace(/\.xlsx$/,'.csv'));
   check(fs.existsSync(csv) && fs.readFileSync(csv,'utf8').includes('TESTEDIT'), 'LibreOffice يفتح الملف المحفوظ ويرى التعديل');
   await p.waitForTimeout(300);
 }
 check(errs.length===0,'لا أخطاء '+errs.join('|'));
 await b.close(); console.log(fails?fails+' فشل':'كل فحوص التوافق نجحت'); })();
