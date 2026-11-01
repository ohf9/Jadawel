// قائمة الملفات الأخيرة: تُحفظ في قاعدة مشتركة بين النوافذ (المقابض أو روابط Android) لإعادة فتح الملف بنقرة
import { plain, rehydrate } from './native.js';
const MAX = 20;
let dbp;
const db = () => dbp || (dbp = new Promise((res, rej) => { const rq = indexedDB.open('jadawel-recents', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('r', { keyPath: 'id' }); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }));
const run = (mode, fn) => db().then((d) => new Promise((res, rej) => { const t = d.transaction('r', mode); const s = t.objectStore('r'); const r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }));
const idOf = (h) => (h.uri ? h.uri : 'fs:' + h.name);
export async function addRecent(handle, name) {
  if (!handle) return;
  try {
    await run('readwrite', (s) => s.put({ id: idOf(handle), name: name || handle.name, handle: plain(handle), time: Date.now() }));
    const all = await listRecents();
    for (const e of all.slice(MAX)) await run('readwrite', (s) => s.delete(e.id));
  } catch (e) { /* بعض المتصفحات لا تخزّن مقبض الملف: لا بأس */ }
}
export async function listRecents() { try { const a = (await run('readonly', (s) => s.getAll())) || []; return a.sort((x, y) => y.time - x.time); } catch (e) { return []; } }
export const removeRecent = (id) => run('readwrite', (s) => s.delete(id));
export async function clearRecents() { await run('readwrite', (s) => s.clear()); }
// يعيد مقبضًا جاهزًا للقراءة أو يرمي خطأ إن رُفض الإذن/حُذف الملف
export async function resolveRecent(entry) {
  const h = rehydrate(entry.handle);
  if (h.queryPermission) {
    let p = await h.queryPermission({ mode: 'readwrite' });
    if (p !== 'granted') p = await h.requestPermission({ mode: 'readwrite' });
    if (p !== 'granted') throw new Error('permission');
  }
  return h;
}
