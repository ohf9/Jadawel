const { chromium } = require('playwright');
let fails=0; const check=(c,m)=>{console.log(c?'  ✔':'  ✘ FAIL',m); if(!c) fails++;};
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1400,height:876}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:8765/'); await p.evaluate(()=>indexedDB.deleteDatabase('jadawel')); await p.reload(); await p.waitForTimeout(500);
 check(await p.evaluate(()=>app.layout)==='h','يبدأ التطبيق بنافذتين فارغتين');
 await p.click('.pane[data-pane="0"] .e-new'); await p.waitForFunction(()=>app.panes[0].wb);
 await p.click('.pane[data-pane="1"] .e-new'); await p.waitForFunction(()=>app.panes[1].wb);
 check(await p.evaluate(()=>app.wbs.length)===2,'زر "مصنف جديد" في كل لوحة');
 await p.click('.pane[data-pane="0"] .add-sheet'); // ورقة2 في الملف 1
 await p.click('#btn-second');
 const st=await p.evaluate(()=>({same:app.panes[0].wb===app.panes[1].wb, s0:app.panes[0].sh.name, s1:app.panes[1].sh.name}));
 check(st.same && st.s0!==st.s1, 'اللوحتان تعرضان ورقتين مختلفتين من نفس الملف: '+st.s0+' / '+st.s1);
 await p.evaluate(()=>{const q=app.panes[0]; q.select(0,0); q.startEdit('hello','enter'); q.commitEdit();});
 await p.evaluate(()=>{const q=app.panes[1]; app.setActive(1); q.select(2,2); q.startEdit('42','enter'); q.commitEdit();});
 const r=await p.evaluate(()=>({a:app.panes[0].sh.cells.get('0,0').v,b:app.panes[1].sh.cells.get('2,2').v,tabs:document.querySelectorAll('.ftab').length}));
 check(r.a==='hello'&&r.b===42,'التحرير في كل لوحة يذهب لورقته');
 // نفس الورقة في اللوحتين: تزامن فوري
 await p.evaluate(()=>app.panes[1].setSheet(app.panes[1].wb.sheets.indexOf(app.panes[0].sh)));
 await p.evaluate(()=>{app.setActive(0); const q=app.panes[0]; q.select(5,5); q.startEdit('sync','enter'); q.commitEdit();});
 check(await p.evaluate(()=>app.panes[1].cells.textContent.includes('sync')),'نفس الورقة في اللوحتين تتزامن فورًا');
 await p.screenshot({path:'test/out/7-two-views.png'});
 check(errs.length===0,'لا أخطاء '+errs.join('|'));
 await b.close(); console.log(fails?fails+' فشل':'نجح'); })();
