const { chromium } = require('playwright'); const fs=require('fs');
let fails=0; const check=(c,m)=>{console.log(c?'  ✔':'  ✘ FAIL',m); if(!c) fails++;};
(async () => { const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1400,height:876}});
 const buf = fs.readFileSync('test/out/inv.xlsx').toString('base64');
 await p.addInitScript((b64) => {
   const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
   window.__writes = []; window.__savePicker = 0;
   const mk = (name, data) => ({ kind:'file', name, getFile: async () => new File([data], name), queryPermission: async () => 'granted', requestPermission: async () => 'granted',
     createWritable: async () => { const parts=[]; return { write: async (x) => parts.push(x), close: async () => window.__writes.push({ name, size: (await new Blob(parts).arrayBuffer()).byteLength }), abort: async () => {} }; } });
   window.showOpenFilePicker = async () => [mk('original.xlsx', bytes)];
   window.showSaveFilePicker = async (o) => { window.__savePicker++; return mk(o.suggestedName, new Uint8Array()); };
 }, buf);
 await p.goto('http://localhost:8765/'); await p.evaluate(()=>indexedDB.deleteDatabase('jadawel')); await p.reload(); await p.waitForTimeout(400);
 console.log('• حفظ بواسطة File System Access (المتصفحات التي تدعمه)');
 await p.click('#btn-open'); await p.waitForFunction(()=>app.wbs.length===1);
 await p.evaluate(()=>app.applyChanges(app.wbs[0], app.wbs[0].sheets[0], [{r:1,c:2,cell:{v:999}}]));
 await p.keyboard.press('Control+S'); await p.waitForSelector('dialog[open]');
 check((await p.textContent('dialog h2')).includes("استبدال"), 'يطلب الموافقة قبل استبدال الملف الأصلي');
 await p.click('dialog button:has-text("حفظ كنسخة جديدة")'); await p.waitForTimeout(500);
 let w = await p.evaluate(()=>({writes: window.__writes, picker: window.__savePicker, dirty: app.wbs[0].dirty}));
 check(w.picker===1 && w.writes.length===1 && w.writes[0].name!=='original.xlsx', 'اختيار "نسخة جديدة" لا يلمس الأصل');
 // ملف آخر: استبدال الأصلي
 await p.click('#btn-open'); await p.waitForFunction(()=>app.wbs.length===2);
 await p.evaluate(()=>app.applyChanges(app.wbs[1], app.wbs[1].sheets[0], [{r:1,c:2,cell:{v:5}}]));
 await p.keyboard.press('Control+S'); await p.waitForSelector('dialog[open]');
 await p.click('dialog button:has-text("حفظ في نفس الملف")'); await p.waitForTimeout(500);
 w = await p.evaluate(()=>window.__writes);
 check(w.length===2 && w[1].name==='original.xlsx' && w[1].size>1000, 'بعد الموافقة يُكتب الملف الأصلي');
 await p.evaluate(()=>app.applyChanges(app.wbs[1], app.wbs[1].sheets[0], [{r:1,c:2,cell:{v:6}}]));
 await p.keyboard.press('Control+S'); await p.waitForTimeout(500);
 check(!(await p.$('dialog[open]')) && (await p.evaluate(()=>window.__writes.length))===3, 'لا يُسأل مرة أخرى لنفس الملف بعد الموافقة');
 // إغلاق ملف غير محفوظ
 await p.evaluate(()=>app.applyChanges(app.wbs[1], app.wbs[1].sheets[0], [{r:1,c:2,cell:{v:7}}]));
 await p.click('.ftab.on .x'); await p.waitForSelector('dialog[open]');
 check((await p.textContent('dialog .body')).includes('غير محفوظة'), 'تنبيه عند إغلاق ملف بتعديلات غير محفوظة');
 await p.click('dialog button:has-text("إلغاء")');
 check((await p.evaluate(()=>app.wbs.length))===2, 'الإلغاء يُبقي الملف مفتوحًا');
 await b.close(); console.log(fails?fails+' فشل':'كل اختبارات الحفظ الآمن نجحت'); })();
