const { chromium } = require('playwright'); const fs=require('fs');
let fails=0; const check=(c,m)=>{console.log(c?'  ✔':'  ✘ FAIL',m); if(!c) fails++;};
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1400,height:876}, hasTouch:true, isMobile:true, deviceScaleFactor:2});
 const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
 await p.goto('http://localhost:8765/'); await p.evaluate(()=>indexedDB.deleteDatabase('jadawel')); await p.reload(); await p.waitForTimeout(400);
 await p.setInputFiles('#file-input', ['inv.xlsx','inv2.xlsx'].map(n=>({name:n,mimeType:'x',buffer:fs.readFileSync('test/out/inv.xlsx')}))); await p.waitForFunction(()=>app.panes[1].wb);
 const pt = (q,r,c)=>p.evaluate(([q,r,c])=>{const P=app.panes[q]; const rc=P.layer.getBoundingClientRect(); const x=(P.colX[c]+P.colX[c+1])/2, y=(P.rowY[r]+P.rowY[r+1])/2; return {x:P.sh.rtl?rc.right-x:rc.left+x, y:rc.top+y};},[q,r,c]);
 const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: type==='touchEnd'?[]:[{x, y}]});
 console.log('• لمس');
 let a = await pt(0,2,1); await p.touchscreen.tap(a.x,a.y); await p.waitForTimeout(400);
 check(await p.evaluate(()=>app.panes[0].namebox.value)==='B3', 'نقرة تحدد الخلية');
 await p.touchscreen.tap(a.x,a.y); await p.waitForTimeout(60); await p.touchscreen.tap(a.x,a.y); await p.waitForTimeout(200);
 check(await p.evaluate(()=>!!app.panes[0].editing && document.activeElement.classList.contains('editor')), 'نقرتان تفتحان التحرير (تظهر لوحة المفاتيح)');
 await p.keyboard.type('Cumin'); await p.keyboard.press('Enter');
check(await p.evaluate(()=>app.panes[0].sh.cells.get('2,1').v)==='SaffronCumin', 'الكتابة بعد النقر المزدوج (تُضاف للنص كما في Excel)');
 // ضغطة مطولة ثم سحب = تحديد نطاق
 a = await pt(0,1,0); let b2 = await pt(0,3,2);
 await touch('touchStart', a.x, a.y); await p.waitForTimeout(600); await touch('touchMove', (a.x+b2.x)/2, (a.y+b2.y)/2); await touch('touchMove', b2.x, b2.y); await touch('touchEnd');
 check(await p.evaluate(()=>app.panes[0].namebox.value)==='A2:C4', 'ضغطة مطولة + سحب تحدد نطاقًا');
 // ضغطة مطولة على النطاق ثم سحب إلى الملف الآخر
 a = await pt(0,1,0); const t = await pt(1,7,0);
 await touch('touchStart', a.x, a.y); await p.waitForTimeout(600); for (let i=1;i<=8;i++) await touch('touchMove', a.x+(t.x-a.x)*i/8, a.y+(t.y-a.y)*i/8); await touch('touchEnd');
 await p.waitForTimeout(200);
 check(await p.evaluate(()=>{const s=app.panes[1].sh.cells; return s.get('7,0').v==='A-1' && s.get('8,1').v==='SaffronCumin' && s.get('9,2').v===250;}), 'سحب النطاق باللمس إلى الملف الثاني');
 // تمرير عادي لا يحدد
 const st0 = await p.evaluate(()=>app.panes[1].scroller.scrollTop);
 a = await pt(1,12,1); await touch('touchStart', a.x, a.y); for (let i=1;i<=6;i++) await touch('touchMove', a.x, a.y-40*i); await touch('touchEnd'); await p.waitForTimeout(300);
 check(await p.evaluate(()=>app.panes[1].scroller.scrollTop) > st0, 'السحب السريع يمرّر الشبكة ولا يحدد');
 await p.screenshot({path:'test/out/6-touch.png'});
 await b.close(); console.log(fails?fails+' فشل':'كل اختبارات اللمس نجحت'); })();
