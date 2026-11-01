const { chromium } = require('playwright'); const fs=require('fs'); const cp=require('child_process');
let fails=0; const check=(c,m)=>{console.log(c?'  ✔':'  ✘ FAIL',m); if(!c) fails++;};
const bytes = fs.readFileSync('test/corpus/exceljs.xlsx').toString('base64');
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1400,height:900}}); await ctx.grantPermissions(['clipboard-read','clipboard-write']);
 // ---- محاكاة تطبيق Android: فتح من مدير الملفات ثم الحفظ في نفس الملف ----
 await ctx.addInitScript((b64) => {
   window.__written = null; let taken = false;
   window.Capacitor = { isNativePlatform: () => true, Plugins: { JadawelNative: {
     takeFiles: async () => { if (taken) return { files: [] }; taken = true; return { files: [{ name: 'تقرير.xlsx', uri: 'content://x/1', data: b64 }] }; },
     pickFiles: async () => ({ files: [] }), readFile: async () => ({ data: b64 }),
     writeFile: async ({ uri, data }) => { window.__written = { uri, data }; },
     saveAs: async () => { throw new Error('cancelled'); } } } };
 }, bytes);
 const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:8765/'); await p.evaluate(()=>indexedDB.deleteDatabase('jadawel')); await p.reload();
 await p.waitForFunction(()=>window.app && app.wbs.length===1 && app.pane().sh, null, {timeout:15000});
 console.log('• فتح من مدير الملفات (محاكاة Android)');
 const o=await p.evaluate(()=>({n:app.wbs[0].name, h:app.wbs[0].handle && app.wbs[0].handle.native, c:app.pane().sh.cells.size}));
 check(o.n==='تقرير.xlsx' && o.h===true && o.c>10, 'الملف الذي أرسله النظام فُتح مع مقبض كتابة: '+JSON.stringify(o));
 await p.evaluate(()=>{const q=app.pane(); q.select(40,0); q.startEdit('SAVED-IN-PLACE','enter'); q.commitEdit();});
 await p.keyboard.press('Control+S'); await p.waitForSelector('dialog[open]'); await p.click('dialog button.danger'); await p.waitForTimeout(800);
 const w=await p.evaluate(()=>window.__written);
 check(w && w.uri==='content://x/1' && w.data.length>1000, 'Ctrl+S كتب في نفس الملف (uri الأصلي)');
 fs.writeFileSync('/tmp/inplace.xlsx', Buffer.from(w.data,'base64'));
 const r=cp.spawnSync('python3',['-c',"import openpyxl;ws=openpyxl.load_workbook('/tmp/inplace.xlsx').worksheets[0];print(ws['A41'].value, ws['B2'].value, ws['A1'].font.b)"],{encoding:'utf8'});
 check(r.stdout.includes('SAVED-IN-PLACE')&& r.stdout.includes('12 '), 'الملف المكتوب يحتوي التعديل والبيانات الأصلية: '+r.stdout.trim());
 check(await p.evaluate(()=>!app.wbs[0].dirty),'زالت علامة غير محفوظ');
 await p.close();

 // ---- ميزات التحرير ----
 const ctx2 = await b.newContext({viewport:{width:1400,height:900}}); await ctx2.grantPermissions(['clipboard-read','clipboard-write']);
 const q = await ctx2.newPage(); const errs2=[]; q.on('pageerror',e=>errs2.push(e.message));
 await q.goto('http://localhost:8765/'); await q.waitForTimeout(500); await q.click('#btn-new'); await q.waitForFunction(()=>app.pane().sh);
 const pt = (r,c)=>q.evaluate(([r,c])=>{const P=app.pane(); P.scrollTo(r,c); const rc=P.layer.getBoundingClientRect(); const x=(P.colX[c]+P.colX[c+1])/2, y=(P.rowY[r]+P.rowY[r+1])/2; return {x:P.sh.rtl?rc.right-x:rc.left+x, y:rc.top+y};},[r,c]);
 const val=(r,c)=>q.evaluate(([r,c])=>{const x=app.pane().sh.cells.get(r+','+c); return x?x.v:null;},[r,c]);
 console.log('• التعبئة والتنسيق');
 await q.evaluate(()=>{const P=app.pane(); P.select(0,0); P.startEdit('1','enter'); P.commitEdit(); P.select(1,0); P.startEdit('2','enter'); P.commitEdit(); P.select(0,0,1,0);});
 const hnd=await q.evaluate(()=>{const r=app.pane().fillh.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};});
 const t=await pt(5,0);
 await q.mouse.move(hnd.x,hnd.y); await q.mouse.down(); await q.mouse.move(t.x,t.y,{steps:8}); await q.mouse.up();
 check([2,3,4,5].every((i)=>true) && await val(2,0)===3 && await val(5,0)===6, 'السحب للتعبئة يكمل السلسلة 1،2 ← 3،4،5،6');
 await q.evaluate(()=>{const P=app.pane(); P.select(0,2); P.startEdit('بند 1','enter'); P.commitEdit(); P.select(0,2); });
 const h2=await q.evaluate(()=>{const r=app.pane().fillh.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};}); const t2=await pt(3,2);
 await q.mouse.move(h2.x,h2.y); await q.mouse.down(); await q.mouse.move(t2.x,t2.y,{steps:6}); await q.mouse.up();
 check(await val(3,2)==='بند 4', 'تعبئة نص ينتهي برقم: بند 1 ← بند 4');
 await q.evaluate(()=>{const P=app.pane(); P.select(0,0); P.startEdit('x','enter'); P.commitEdit(); P.select(0,0,4,0);}); await q.keyboard.press('Control+d');
 check(await val(4,0)==='x','Ctrl+D ينسخ الخلية العليا للأسفل');
 await q.keyboard.press('Control+b');
 check(await q.evaluate(()=>[0,1,2,3,4].every(r=>app.pane().sh.cells.get(r+',0').s.b===1)),'Ctrl+B يجعل النطاق غامقًا');
 await q.click('#fm-ac'); check(await q.evaluate(()=>app.pane().sh.cells.get('2,0').s.al==='center'),'زر التوسيط');
 await q.click('#fm-nf'); await q.click('.menu-nf .it[data-v="0.00%"]'); await q.evaluate(()=>{const P=app.pane(); P.select(10,0); P.startEdit('0.256','enter'); P.commitEdit();});
 await q.evaluate(()=>{const P=app.pane(); P.select(10,0); app.setNumFmt('0.00%');});
 check(await q.evaluate(()=>app.pane().cells.textContent.includes('25.60%')),'تنسيق النسبة المئوية يظهر 25.60%');
 // تغيير حجم عمود بالسحب
 const hc=await q.evaluate(()=>{const P=app.pane(); const rc=P.layer.getBoundingClientRect(); const x=P.sh.rtl?rc.right-P.colX[1]:rc.left+P.colX[1]; const hr=P.colcells.getBoundingClientRect(); return {x, y:hr.top+12, w:P.sh.colW[0]||96};});
 await q.mouse.move(hc.x,hc.y); await q.mouse.down(); await q.mouse.move(hc.x+(await q.evaluate(()=>app.pane().sh.rtl)?-80:80),hc.y,{steps:5}); await q.mouse.up();
 check(await q.evaluate(()=>app.pane().sh.colW[0])>hc.w+50,'سحب حافة العمود يغيّر عرضه');
 console.log('• الإعدادات واللغة');
 await q.click('#btn-settings'); await q.selectOption('#set-lang','en'); await q.click('#set-save'); await q.waitForFunction(()=>window.app && document.documentElement.lang==='en', null, {timeout:10000}); await q.waitForTimeout(800);
 const en=await q.evaluate(()=>({save:document.querySelector('#btn-save span').textContent, dir:document.dir, wbs:app.wbs.length, tab:document.querySelector('.ftab .fname').textContent}));
 check(en.save==='Save' && en.dir==='ltr' && en.wbs===1, 'الإنجليزية: '+JSON.stringify(en));
 await q.screenshot({path:'test/out/9-english.png'});
 await q.click('#btn-settings'); await q.selectOption('#set-lang','ar'); await q.click('#set-save'); await q.waitForFunction(()=>document.documentElement.lang==='ar', null, {timeout:10000});
 check(errs.length+errs2.length===0,'لا أخطاء '+errs.concat(errs2).join('|'));
 await b.close(); console.log(fails?fails+' فشل':'نجح'); })();
