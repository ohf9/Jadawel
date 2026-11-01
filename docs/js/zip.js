// قراءة وكتابة ملفات ZIP (XLSX) دون مكتبات: DecompressionStream / CompressionStream
const TD = new TextDecoder(), TE = new TextEncoder();
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function inflate(data) {
  const s = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function deflate(data) {
  const s = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
let CRC = null;
function crc32(b) {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// يعيد Map: اسم الملف -> Uint8Array
export async function readZip(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let e = b.length - 22; while (e >= 0 && u32(b, e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip');
  const n = u16(b, e + 10); let p = u32(b, e + 16);
  const out = new Map();
  for (let i = 0; i < n; i++) {
    if (u32(b, p) !== 0x02014b50) throw new Error('bad zip');
    const method = u16(b, p + 10), csize = u32(b, p + 20), nl = u16(b, p + 28), el = u16(b, p + 30), cl = u16(b, p + 32), lo = u32(b, p + 42);
    const name = TD.decode(b.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + el + cl;
    if (name.endsWith('/')) continue;
    const lnl = u16(b, lo + 26), lel = u16(b, lo + 28), start = lo + 30 + lnl + lel;
    const raw = b.subarray(start, start + csize);
    out.set(name, method === 0 ? raw.slice() : await inflate(raw));
  }
  return out;
}

export async function writeZip(files) {
  const chunks = [], cd = []; let off = 0;
  const push = (u) => { chunks.push(u); off += u.length; };
  for (const [name, data] of files) {
    const nb = TE.encode(name), crc = crc32(data), comp = await deflate(data);
    const h = new Uint8Array(30 + nb.length), dv = new DataView(h.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true); dv.setUint16(8, 8, true);
    dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true); dv.setUint32(14, crc, true); dv.setUint32(18, comp.length, true); dv.setUint32(22, data.length, true); dv.setUint16(26, nb.length, true);
    h.set(nb, 30);
    cd.push({ nb, crc, cs: comp.length, us: data.length, off });
    push(h); push(comp);
  }
  const cstart = off;
  for (const c of cd) {
    const h = new Uint8Array(46 + c.nb.length), dv = new DataView(h.buffer);
    dv.setUint32(0, 0x02014b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true); dv.setUint16(8, 0x0800, true); dv.setUint16(10, 8, true);
    dv.setUint16(12, 0, true); dv.setUint16(14, 0x21, true); dv.setUint32(16, c.crc, true); dv.setUint32(20, c.cs, true); dv.setUint32(24, c.us, true); dv.setUint16(28, c.nb.length, true);
    dv.setUint32(42, c.off, true); h.set(c.nb, 46);
    push(h);
  }
  const end = new Uint8Array(22), dv = new DataView(end.buffer);
  dv.setUint32(0, 0x06054b50, true); dv.setUint16(8, cd.length, true); dv.setUint16(10, cd.length, true); dv.setUint32(12, off - cstart, true); dv.setUint32(16, cstart, true);
  push(end);
  const all = new Uint8Array(off); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  return all.buffer;
}
export const txt = (u) => TD.decode(u);
export const bytes = (s) => TE.encode(s);
