import { plain } from './native.js';
// الحفظ التلقائي في IndexedDB (يبقى على الجهاز بعد إغلاق التطبيق أو تعطله)
let DB = 'jadawel'; const VER = 1;
// كل نافذة مفتوحة من التطبيق لها رقم وقاعدة بيانات مستقلة، فلا تتداخل ملفاتها وتعديلاتها
export const setSlot = (n) => { DB = n > 1 ? 'jadawel-' + n : 'jadawel'; };
let dbp;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const rq = indexedDB.open(DB, VER);
    rq.onupgradeneeded = () => { const d = rq.result; d.createObjectStore('wbs', { keyPath: 'id' }); d.createObjectStore('blobs'); d.createObjectStore('meta'); };
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
  return dbp;
}
function tx(store, mode, fn) {
  return db().then((d) => new Promise((res, rej) => {
    const t = d.transaction(store, mode); const s = t.objectStore(store); let out;
    Promise.resolve(fn(s)).then((v) => { out = v; });
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export function putWb(wb, order) {
  const doc = { id: wb.id, name: wb.name, kind: wb.kind, dirty: wb.dirty, handle: plain(wb.handle) || null, overwriteOK: wb.overwriteOK, order, created: wb.created,
    sheets: wb.sheets.map((s) => ({ ...s })) };
  return tx('wbs', 'readwrite', (s) => s.put(doc)).catch((e) => {
    // بعض المتصفحات لا تقبل تخزين مقبض الملف
    if (doc.handle) { doc.handle = null; return tx('wbs', 'readwrite', (s) => s.put(doc)); }
    throw e;
  });
}
export const putOrig = (id, buf) => tx('blobs', 'readwrite', (s) => buf ? s.put(buf, id) : s.delete(id));
export const delWb = (id) => Promise.all([tx('wbs', 'readwrite', (s) => s.delete(id)), putOrig(id, null)]);
export async function loadAll() {
  const docs = await tx('wbs', 'readonly', (s) => req(s.getAll()));
  docs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const d of docs) d.orig = (await tx('blobs', 'readonly', (s) => req(s.get(d.id)))) || null;
  return docs;
}
export const putMeta = (k, v) => tx('meta', 'readwrite', (s) => s.put(v, k));
export const getMeta = (k) => tx('meta', 'readonly', (s) => req(s.get(k)));
