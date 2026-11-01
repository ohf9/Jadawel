// التعبئة التلقائية: نسخ، سلاسل أرقام، تواريخ، نص مع رقم، أيام وشهور (عربي وإنجليزي)
import { shiftFormula } from './util.js';

const LISTS = [
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
  ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
  ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'],
  ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'],
  ['محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني', 'جمادى الأولى', 'جمادى الثانية', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'],
];
const findList = (t) => { const k = String(t).trim().toLowerCase(); for (const l of LISTS) { const i = l.findIndex((x) => x.toLowerCase() === k); if (i >= 0) return { l, i }; } return null; };
const TRAIL = /^(.*?)(\d+)$/s;

// كل خلية: { v, f, s } أو null. line مرتّبة باتجاه التعبئة. يُرجع دالة تُنتج الخلية رقم k (k يبدأ من 0 بعد آخر خلية مصدر)
function seriesFor(line, copyOnly) {
  const n = line.length;
  const pick = (k) => line[k % n];
  const cp = (k) => { const c = pick(k); return c ? { ...c } : null; };
  if (copyOnly || !line.length) return cp;
  const cells = line.filter(Boolean);
  if (cells.length !== n || cells.some((c) => c.f != null)) return cp;
  const vals = cells.map((c) => c.v);
  const keep = (k, v) => { const c = pick(k); const o = { v }; if (c && c.s) o.s = c.s; return o; };
  // أرقام
  if (vals.every((v) => typeof v === 'number')) {
    if (n === 1) return cp;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    vals.forEach((y, x) => { sx += x; sy += y; sxy += x * y; sxx += x * x; });
    const den = n * sxx - sx * sx, slope = (n * sxy - sx * sy) / den, icpt = (sy - slope * sx) / n;
    return (k) => keep(k, Number((icpt + slope * (n + k)).toPrecision(14)));
  }
  // تواريخ
  if (vals.every((v) => v instanceof Date)) {
    const step = n === 1 ? 86400000 : (vals[1] - vals[0]);
    return (k) => keep(k, new Date(vals[n - 1].getTime() + step * (k + 1)));
  }
  // أيام وشهور
  const lists = vals.map(findList);
  if (lists.every((x) => x && x.l === lists[0].l)) {
    const L = lists[0].l, len = L.length;
    const step = n === 1 ? 1 : ((lists[1].i - lists[0].i + len) % len || 1);
    return (k) => keep(k, L[(lists[n - 1].i + step * (k + 1)) % len]);
  }
  // نص ينتهي برقم: "بند 1" ← "بند 2"
  if (vals.every((v) => typeof v === 'string' && TRAIL.test(v))) {
    const ms = vals.map((v) => TRAIL.exec(v));
    if (ms.every((m) => m[1] === ms[0][1])) {
      const nums = ms.map((m) => Number(m[2])); const width = ms[n - 1][2].length;
      const step = n === 1 ? 1 : nums[1] - nums[0];
      const zeroPad = ms[n - 1][2].length > 1 && ms[n - 1][2][0] === '0';
      return (k) => { const nv = nums[n - 1] + step * (k + 1); const t = nv < 0 ? String(nv) : (zeroPad ? String(nv).padStart(width, '0') : String(nv)); return keep(k, ms[0][1] + t); };
    }
  }
  return cp;
}

/**
 * يحسب خلايا التعبئة.
 * src: { r1, c1, r2, c2 } النطاق المصدر، target: النطاق الجديد (يمتد من حافة المصدر)، get(r, c) → خلية، dir: 'down'|'up'|'right'|'left'
 * يُرجع [{ r, c, cell }]
 */
export function computeFill(src, target, get, dir, copyOnly) {
  const out = [];
  const vertical = dir === 'down' || dir === 'up';
  const forward = dir === 'down' || dir === 'right';
  const lines = vertical ? src.c2 - src.c1 + 1 : src.r2 - src.r1 + 1;
  const srcLen = vertical ? src.r2 - src.r1 + 1 : src.c2 - src.c1 + 1;
  for (let l = 0; l < lines; l++) {
    const pos = (i) => (vertical ? { r: src.r1 + i, c: src.c1 + l } : { r: src.r1 + l, c: src.c1 + i });
    const idx = [...Array(srcLen).keys()]; if (!forward) idx.reverse();
    const line = idx.map((i) => { const p = pos(i); return get(p.r, p.c) || null; });
    const gen = seriesFor(line, copyOnly);
    const total = vertical ? target.r2 - target.r1 + 1 : target.c2 - target.c1 + 1;
    for (let k = 0; k < total; k++) {
      // الخلية رقم k بعد حافة المصدر باتجاه التعبئة
      const tr = dir === 'down' ? src.r2 + 1 + k : dir === 'up' ? src.r1 - 1 - k : src.r1 + l;
      const tc = dir === 'right' ? src.c2 + 1 + k : dir === 'left' ? src.c1 - 1 - k : src.c1 + l;
      if (tr < 0 || tc < 0) continue;
      const si = k % srcLen; const sp = pos(forward ? si : srcLen - 1 - si);
      let cell = gen(k);
      const srcCell = line[si];
      if (srcCell && srcCell.f != null) cell = { f: shiftFormula(srcCell.f, tr - sp.r, tc - sp.c), v: undefined, ...(srcCell.s ? { s: srcCell.s } : {}) };
      out.push({ r: tr, c: tc, cell: cell && (cell.v != null || cell.f != null || cell.s) ? cell : null });
    }
  }
  return out;
}
