// جسر Android: فتح الملفات من مدير الملفات والحفظ داخل نفس الملف (يتصرف مثل File System Access في المتصفح)
const cap = window.Capacitor;
// Android فقط (على iOS ما فيه JadawelNative، فيستخدم مسارات المتصفح)
export const isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform() && (!cap.getPlatform || cap.getPlatform() === 'android'));
const N = () => cap.Plugins.JadawelNative;

export function b64ToBytes(b64) { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
function blobToB64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); }); }
const mimeOf = (n) => (/\.csv$/i.test(n) ? 'text/csv' : /\.tsv$/i.test(n) ? 'text/tab-separated-values' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

export function nativeHandle(info) {
  return {
    kind: 'native', native: true, name: info.name, uri: info.uri, _data: info.data || null,
    async getFile() { let d = this._data; this._data = null; if (!d) d = (await N().readFile({ uri: this.uri })).data; return new File([b64ToBytes(d)], this.name); },
    async queryPermission() { return 'granted'; }, async requestPermission() { return 'granted'; },
    async createWritable() {
      const parts = []; const h = this;
      return { write: async (x) => { parts.push(x); }, close: async () => { await N().writeFile({ uri: h.uri, data: await blobToB64(new Blob(parts)) }); }, abort: async () => {} };
    },
  };
}
export const plain = (h) => (h && h.native ? { kind: 'native', native: true, name: h.name, uri: h.uri } : h);
export const rehydrate = (h) => (h && h.native && !h.getFile ? nativeHandle(h) : h);

export async function takeIntentFiles() {
  const r = await N().takeFiles();
  if (r.error) console.warn(r.error);
  return (r.files || []).map((f) => nativeHandle(f));
}

if (isNative) {
  window.showOpenFilePicker = async () => {
    const r = await N().pickFiles();
    const hs = (r.files || []).map((f) => nativeHandle(f));
    if (!hs.length) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
    return hs;
  };
  window.showSaveFilePicker = async (o) => {
    try { const r = await N().saveAs({ name: (o && o.suggestedName) || 'book.xlsx', mime: mimeOf((o && o.suggestedName) || '') }); return nativeHandle(r); }
    catch (e) { throw Object.assign(new Error('cancelled'), { name: String(e.message || e).includes('cancel') ? 'AbortError' : 'Error' }); }
  };
}

// مشاركة ملف عبر قائمة المشاركة في Android (أو Web Share في المتصفح)؛ تعيد false إن لم تتوفر
export async function shareBlob(blob, name, mime) {
  if (isNative && N().shareFile) {
    await N().shareFile({ name, mime, data: await blobToB64(blob), title: name });
    return true;
  }
  const f = new File([blob], name, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: name }); return true; }
  return false;
}
// طباعة الصفحة الحالية (أو حفظها PDF من نافذة الطباعة)
export function printPage(name) {
  if (isNative && N().printPage) { N().printPage({ name }).catch(() => window.print()); return; }
  window.print();
}
