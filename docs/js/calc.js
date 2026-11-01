// محرك الصيغ: يعيد حساب الخلايا المتأثرة بعد كل تعديل (مبني على fast-formula-parser مع دوال إضافية)
import { key, unkey } from './util.js';
const FP = window.FormulaParser;
const FE = FP && FP.FormulaError;
const dateSerial = (d) => d.getTime() / 86400000 + 25569;
const colNum = (s) => { let n = 0; for (const ch of s.replace(/\$/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

// ---- دوال إضافية (غير موجودة في المكتبة) ----
const isErr = (x) => FE && x instanceof FE;
const cells2d = (p) => (p.isRangeRef || p.isArray ? p.value : [[p.value]]);
const flat = (p) => cells2d(p).flat();
const nums = (params, strict) => { const o = []; for (const p of params) for (const x of flat(p)) { if (isErr(x)) throw x; if (typeof x === 'number') o.push(x); else if (!strict && typeof x === 'boolean' && !(p.isRangeRef || p.isArray)) o.push(+x); else if (!(p.isRangeRef || p.isArray) && typeof x === 'string' && x.trim() !== '' && !isNaN(+x)) o.push(+x); } return o; };
const val = (p) => (p && p.isArray ? p.value[0][0] : p ? p.value : undefined);
const numArg = (p) => { const v = val(p); if (isErr(v)) throw v; const n = typeof v === 'number' ? v : typeof v === 'boolean' ? +v : (v == null || v === '') ? 0 : +v; if (isNaN(n)) throw FE.VALUE; return n; };
function critFn(c) {
  if (typeof c === 'number' || typeof c === 'boolean') return (v) => (typeof v === 'number' || typeof v === 'boolean') && +v === +c;
  let s = String(c == null ? '' : c), op = '=';
  const m = /^(<=|>=|<>|<|>|=)(.*)$/s.exec(s); if (m) { op = m[1]; s = m[2]; }
  const n = s.trim() !== '' && !isNaN(+s) ? +s : null;
  if (n != null) return (v) => { if (typeof v === 'string' && v.trim() !== '' && !isNaN(+v)) v = +v; if (typeof v !== 'number') return op === '<>'; return op === '=' ? v === n : op === '<>' ? v !== n : op === '<' ? v < n : op === '>' ? v > n : op === '<=' ? v <= n : v >= n; };
  const re = new RegExp('^' + s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/~?\*/g, (x) => (x[0] === '~' ? '\\*' : '[\\s\\S]*')).replace(/~?\?/g, (x) => (x[0] === '~' ? '\\?' : '[\\s\\S]')) + '$', 'i');
  return (v) => { const t = v == null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v); if (op === '=') return s === '' ? (v == null || v === '') : re.test(t); if (op === '<>') return !re.test(t); return typeof v === 'string' && (op === '<' ? t.toLowerCase() < s.toLowerCase() : op === '>' ? t.toLowerCase() > s.toLowerCase() : op === '<=' ? t.toLowerCase() <= s.toLowerCase() : t.toLowerCase() >= s.toLowerCase()); };
}
// يعيد صفوف/أعمدة الخلايا التي تحقق كل الشروط (أزواج نطاق، معيار)
function matchMask(pairs) {
  const first = cells2d(pairs[0][0]); const R = first.length, C = first[0].length; const mask = [];
  const fns = pairs.map(([rg, c]) => [cells2d(rg), critFn(val(c))]);
  for (const [g] of fns) if (g.length !== R || g[0].length !== C) throw FE.VALUE;
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) mask.push(fns.every(([g, f]) => f(g[i][j])));
  return mask;
}
const pairsOf = (a) => { const o = []; for (let i = 0; i < a.length; i += 2) o.push([a[i], a[i + 1]]); return o; };
const pickNums = (target, mask) => { const t = flat(target); const o = []; t.forEach((x, i) => { if (mask[i] && typeof x === 'number') o.push(x); }); return o; };
const sorted = (a) => a.slice().sort((x, y) => x - y);
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const varS = (a, pop) => { if (a.length < (pop ? 1 : 2)) throw FE.DIV0; const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - (pop ? 0 : 1)); };
const eqLoose = (a, b) => (typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : a === b);
function matchPos(look, arr, type) {
  if (type === 0) { const f = critFn(typeof look === 'string' ? look.replace(/^([<>=])/, '=$1') : look); const i = arr.findIndex((x) => (typeof look === 'string' ? (typeof x === 'string' && eqWild(look, x)) : f(x))); return i < 0 ? -1 : i; }
  let best = -1;
  for (let i = 0; i < arr.length; i++) { const x = arr[i]; if (x == null || typeof x !== typeof look) continue; if (type === 1 ? x <= look : x >= look) best = i; else if (type === 1 ? x > look : x < look) break; }
  return best;
}
const eqWild = (pat, s) => new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i').test(s);

const EXTRA = {
  MAX: (...p) => { const a = nums(p, true); return a.length ? Math.max(...a) : 0; },
  MIN: (...p) => { const a = nums(p, true); return a.length ? Math.min(...a) : 0; },
  CHOOSE: (_c, i, ...r) => { const n = Math.floor(numArg(i)); if (n < 1 || n > r.length) throw FE.VALUE; return val(r[n - 1]); },
  SLN: (c, s, l) => { const L = numArg(l); if (!L) throw FE.DIV0; return (numArg(c) - numArg(s)) / L; },
  PMT: (r, n, pv, fv, ty) => { const R = numArg(r), N = numArg(n), P = numArg(pv), F = fv ? numArg(fv) : 0, T = ty ? numArg(ty) : 0; if (!R) return -(P + F) / N; const k = Math.pow(1 + R, N); return -(R * (P * k + F)) / ((1 + R * T) * (k - 1)); },
  FV: (r, n, pm, pv, ty) => { const R = numArg(r), N = numArg(n), M = numArg(pm), P = pv ? numArg(pv) : 0, T = ty ? numArg(ty) : 0; if (!R) return -(P + M * N); const k = Math.pow(1 + R, N); return -(P * k + M * (1 + R * T) * (k - 1) / R); },
  PV: (r, n, pm, fv, ty) => { const R = numArg(r), N = numArg(n), M = numArg(pm), F = fv ? numArg(fv) : 0, T = ty ? numArg(ty) : 0; if (!R) return -(F + M * N); const k = Math.pow(1 + R, N); return -(F + M * (1 + R * T) * (k - 1) / R) / k; },
  NPER: (r, pm, pv, fv, ty) => { const R = numArg(r), M = numArg(pm), P = numArg(pv), F = fv ? numArg(fv) : 0, T = ty ? numArg(ty) : 0; if (!R) return -(P + F) / M; const z = M * (1 + R * T) / R; const v = (-F + z) / (P + z); if (v <= 0) throw FE.NUM; return Math.log(v) / Math.log(1 + R); },
  NPV: (r, ...v) => { const R = numArg(r); const a = nums(v, true); return a.reduce((s, x, i) => s + x / Math.pow(1 + R, i + 1), 0); },
  IRR: (v, g) => { const a = nums([v], true); if (!a.some((x) => x > 0) || !a.some((x) => x < 0)) throw FE.NUM; let x = g ? numArg(g) : 0.1; for (let i = 0; i < 100; i++) { let f = 0, d = 0; a.forEach((c, t) => { f += c / Math.pow(1 + x, t); d -= t * c / Math.pow(1 + x, t + 1); }); if (!d) break; const nx = x - f / d; if (Math.abs(nx - x) < 1e-10) return nx; x = nx; } throw FE.NUM; },
  RATE: (n, pm, pv, fv, ty, g) => { const N = numArg(n), M = numArg(pm), P = numArg(pv), F = fv ? numArg(fv) : 0, T = ty ? numArg(ty) : 0; let x = g ? numArg(g) : 0.1; const f = (r) => (r === 0 ? P + M * N + F : P * Math.pow(1 + r, N) + M * (1 + r * T) * (Math.pow(1 + r, N) - 1) / r + F); for (let i = 0; i < 100; i++) { const h = 1e-7, d = (f(x + h) - f(x - h)) / (2 * h); if (!d) break; const nx = x - f(x) / d; if (Math.abs(nx - x) < 1e-10) return nx; x = nx; } throw FE.NUM; },
  MAXA: (...p) => { const a = p.flatMap(flat).map((x) => (typeof x === 'number' ? x : typeof x === 'boolean' ? +x : typeof x === 'string' ? 0 : null)).filter((x) => x != null); return a.length ? Math.max(...a) : 0; },
  MINA: (...p) => { const a = p.flatMap(flat).map((x) => (typeof x === 'number' ? x : typeof x === 'boolean' ? +x : typeof x === 'string' ? 0 : null)).filter((x) => x != null); return a.length ? Math.min(...a) : 0; },
  MEDIAN: (...p) => { const a = sorted(nums(p, true)); if (!a.length) throw FE.NUM; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; },
  LARGE: (r, k) => { const a = sorted(nums([r], true)).reverse(); const i = numArg(k); if (i < 1 || i > a.length) throw FE.NUM; return a[Math.ceil(i) - 1]; },
  SMALL: (r, k) => { const a = sorted(nums([r], true)); const i = numArg(k); if (i < 1 || i > a.length) throw FE.NUM; return a[Math.ceil(i) - 1]; },
  COUNTA: (...p) => p.flatMap(flat).filter((x) => x != null && x !== '').length,
  COUNTBLANK: (r) => flat(r).filter((x) => x == null || x === '').length,
  COUNTIFS: (...a) => matchMask(pairsOf(a)).filter(Boolean).length,
  SUMIFS: (s, ...a) => { const m = matchMask(pairsOf(a)); return pickNums(s, m).reduce((x, y) => x + y, 0); },
  AVERAGEIFS: (s, ...a) => { const m = matchMask(pairsOf(a)); const v = pickNums(s, m); if (!v.length) throw FE.DIV0; return mean(v); },
  MAXIFS: (s, ...a) => { const v = pickNums(s, matchMask(pairsOf(a))); return v.length ? Math.max(...v) : 0; },
  MINIFS: (s, ...a) => { const v = pickNums(s, matchMask(pairsOf(a))); return v.length ? Math.min(...v) : 0; },
  MATCH: (look, rg, t) => { const l = val(look), arr = flat(rg), i = matchPos(l, arr, t ? numArg(t) : 1); if (i < 0) throw FE.NA; return i + 1; },
  LOOKUP: (look, rg, res) => { const arr = flat(rg), i = matchPos(val(look), arr, 1); if (i < 0) throw FE.NA; const r = res ? flat(res) : arr; return r[i]; },
  XLOOKUP: (look, rg, ret, nf, mm) => { const arr = flat(rg), mode = mm ? numArg(mm) : 0; let i = matchPos(val(look), arr, 0); if (i < 0 && mode === -1) { let b = -1; arr.forEach((x, j) => { if (typeof x === 'number' && x <= val(look) && (b < 0 || x > arr[b])) b = j; }); i = b; } if (i < 0 && mode === 1) { let b = -1; arr.forEach((x, j) => { if (typeof x === 'number' && x >= val(look) && (b < 0 || x < arr[b])) b = j; }); i = b; } if (i < 0) { if (nf) return val(nf); throw FE.NA; } const rr = cells2d(ret); return rr.length === 1 ? rr[0][i] : rr[i][0]; },
  RANK: (x, rg, ord) => { const v = numArg(x), a = nums([rg], true); if (!a.includes(v)) throw FE.NA; const asc = ord && numArg(ord) !== 0; return 1 + a.filter((y) => (asc ? y < v : y > v)).length; },
  MODE: (...p) => { const a = nums(p, true), c = new Map(); a.forEach((x) => c.set(x, (c.get(x) || 0) + 1)); let b = null, n = 1; for (const [x, k] of c) if (k > n) { b = x; n = k; } if (b == null) throw FE.NA; return b; },
  STDEV: (...p) => Math.sqrt(varS(nums(p, true), false)), STDEVP: (...p) => Math.sqrt(varS(nums(p, true), true)),
  VAR: (...p) => varS(nums(p, true), false), VARP: (...p) => varS(nums(p, true), true),
  SUBTOTAL: (f, ...p) => { let n = numArg(f); if (n > 100) n -= 100; const a = nums(p, true); const all = p.flatMap(flat);
    switch (n) { case 1: if (!a.length) throw FE.DIV0; return mean(a); case 2: return a.length; case 3: return all.filter((x) => x != null && x !== '').length; case 4: return a.length ? Math.max(...a) : 0; case 5: return a.length ? Math.min(...a) : 0;
      case 6: return a.reduce((x, y) => x * y, 1); case 7: return Math.sqrt(varS(a, false)); case 8: return Math.sqrt(varS(a, true)); case 9: return a.reduce((x, y) => x + y, 0); case 10: return varS(a, false); case 11: return varS(a, true); default: throw FE.VALUE; } },
  TEXTJOIN: (d, ign, ...p) => { const sep = String(val(d) ?? ''); const skip = !!val(ign); return p.flatMap(flat).filter((x) => !(skip && (x == null || x === ''))).map((x) => (typeof x === 'boolean' ? (x ? 'TRUE' : 'FALSE') : x == null ? '' : x)).join(sep); },
  SWITCH: (e, ...r) => { const v = val(e); for (let i = 0; i + 1 < r.length; i += 2) if (eqLoose(val(r[i]), v)) return val(r[i + 1]); if (r.length % 2) return val(r[r.length - 1]); throw FE.NA; },
  UPPER: (t) => String(val(t) ?? '').toUpperCase(),
  VALUE: (t) => { const v = val(t); if (typeof v === 'number') return v; const n = +String(v ?? '').replace(/[,\s]/g, ''); if (isNaN(n)) throw FE.VALUE; return n; },
  SUBSTITUTE: (t, o, n, k) => { const s = String(val(t) ?? ''), a = String(val(o) ?? ''), b = String(val(n) ?? ''); if (!a) return s; if (!k) return s.split(a).join(b); let c = 0, i = -1, idx = numArg(k); while ((i = s.indexOf(a, i + 1)) >= 0) { if (++c === idx) return s.slice(0, i) + b + s.slice(i + a.length); } return s; },
  AVERAGEA: (...p) => { const a = p.flatMap(flat).map((x) => (typeof x === 'number' ? x : typeof x === 'boolean' ? +x : typeof x === 'string' ? 0 : null)).filter((x) => x != null); if (!a.length) throw FE.DIV0; return mean(a); },
  PERCENTILE: (r, k) => { const a = sorted(nums([r], true)), q = numArg(k); if (!a.length || q < 0 || q > 1) throw FE.NUM; const p = (a.length - 1) * q, lo = Math.floor(p); return a[lo] + (a[Math.min(lo + 1, a.length - 1)] - a[lo]) * (p - lo); },
};
EXTRA['RANK.EQ'] = EXTRA.RANK; EXTRA['MODE.SNGL'] = EXTRA.MODE; EXTRA['STDEV.S'] = EXTRA.STDEV; EXTRA['STDEV.P'] = EXTRA.STDEVP; EXTRA['VAR.S'] = EXTRA.VAR; EXTRA['VAR.P'] = EXTRA.VARP; EXTRA['PERCENTILE.INC'] = EXTRA.PERCENTILE;

// ---- استخراج المراجع من نص الصيغة (لمعرفة الخلايا المتأثرة) ----
const REF = /(?<![A-Za-z0-9_.$\u0600-\u06FF])(?:('(?:[^']|'')+'|[A-Za-z0-9_\u0600-\u06FF.]+)!)?(?:(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?|(\$?[A-Z]{1,3}):(\$?[A-Z]{1,3})|(\$?\d+):(\$?\d+))(?![A-Za-z0-9_(])/g;
const cellRc = (s) => { const m = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(s); return [+m[2] - 1, colNum(m[1])]; };
const BIG = 1048576;
function parseRefs(f, cur) {
  const out = []; const clean = f.replace(/"(?:[^"]|"")*"/g, '""');
  for (const m of clean.matchAll(REF)) {
    const sh = m[1] ? m[1].replace(/^'|'$/g, '').replace(/''/g, "'") : cur;
    if (m[2]) { const [r1, c1] = cellRc(m[2]); const [r2, c2] = m[3] ? cellRc(m[3]) : [r1, c1]; out.push({ sh, r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) }); }
    else if (m[4]) out.push({ sh, r1: 0, r2: BIG, c1: Math.min(colNum(m[4]), colNum(m[5])), c2: Math.max(colNum(m[4]), colNum(m[5])) });
    else out.push({ sh, c1: 0, c2: 16384, r1: Math.min(+m[6].replace('$', ''), +m[7].replace('$', '')) - 1, r2: Math.max(+m[6].replace('$', ''), +m[7].replace('$', '')) - 1 });
  }
  return out;
}

export const calcReady = () => !!FP;

// يعيد حساب المصنف. seeds: قائمة {sheet, r, c} للخلايا المعدّلة (أو null لحساب الخلايا بلا قيمة محفوظة فقط)
// تعيد قائمة الأوراق التي تغيّرت قيمها
export function recalc(wb, seeds) {
  if (!FP) return [];
  const byName = new Map(wb.sheets.map((s) => [s.name, s]));
  const formulas = []; // {sh, k, cell, r, c}
  for (const sh of wb.sheets) for (const [k, cell] of sh.cells) if (cell.f != null) { const [r, c] = unkey(k); formulas.push({ sh, k, cell, r, c }); }
  if (!formulas.length) return [];
  const affected = new Set();
  const id = (sh, k) => sh.id + '|' + k;
  // الخلايا بلا قيمة محفوظة تُحسب دائمًا
  for (const f of formulas) if (f.cell.v === undefined) affected.add(id(f.sh, f.k));
  if (seeds && seeds.length) {
    for (const f of formulas) f.refs = f.cell._refs && f.cell._rf === f.cell.f ? f.cell._refs : (f.cell._refs = parseRefs(f.cell.f, f.sh.name), f.cell._rf = f.cell.f, f.cell._refs);
    let frontier = seeds.map((s) => ({ name: s.sheet.name, r: s.r, c: s.c }));
    for (const f of formulas) if (seeds.some((s) => s.sheet === f.sh && s.r === f.r && s.c === f.c)) { affected.add(id(f.sh, f.k)); f.hit = true; }
    frontier.push(...formulas.filter((f) => f.hit).map((f) => ({ name: f.sh.name, r: f.r, c: f.c })));
    while (frontier.length) {
      const next = [];
      for (const f of formulas) {
        const fid = id(f.sh, f.k); if (f.hit) continue;
        if (f.refs.some((rf) => frontier.some((p) => rf.sh === p.name && p.r >= rf.r1 && p.r <= rf.r2 && p.c >= rf.c1 && p.c <= rf.c2))) { f.hit = true; affected.add(fid); next.push({ name: f.sh.name, r: f.r, c: f.c }); }
      }
      frontier = next;
    }
  }
  if (!affected.size) return [];
  const memo = new Map(), busy = new Set(), changedSheets = new Set();
  const rawVal = (cell) => (cell == null ? null : cell.v instanceof Date ? dateSerial(cell.v) : cell.v);
  const normalize = (v) => (isErr(v) ? v.error || '#VALUE!' : Array.isArray(v) ? normalize(v[0] && v[0][0]) : v == null ? 0 : v instanceof Date ? dateSerial(v) : v);
  let parser;
  function cellValue(sh, r, c) {
    const k = key(r, c), cell = sh.cells.get(k); if (!cell) return null;
    if (cell.f == null || !affected.has(id(sh, k))) { const v = rawVal(cell); return typeof v === 'string' && /^#(N\/A|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|NULL!)$/.test(v) ? new FE(v) : v; }
    const mid = id(sh, k); if (memo.has(mid)) return memo.get(mid);
    if (busy.has(mid)) return 0; // مرجع دائري
    busy.add(mid);
    const keep = cell.v;
    let res;
    try { res = normalize(parser.parse(cell.f, { sheet: sh.name, row: r + 1, col: c + 1 }, true)); }
    catch (e) { const um = /Function (\S+) is not implemented/i.exec((e && e.message) || ''); if (um) (wb._unsup || (wb._unsup = new Set())).add(um[1]); res = /not implemented/i.test((e && e.message) || '') && keep !== undefined ? keep : /not implemented/i.test((e && e.message) || '') ? '#NAME?' : '#VALUE!'; }
    if (res !== keep && !(typeof res === 'number' && typeof keep === 'number' && Math.abs(res - keep) < 1e-12)) { cell.v = res; changedSheets.add(sh); }
    busy.delete(mid); memo.set(mid, res);
    const out = typeof res === 'string' && res[0] === '#' && /^#[A-Z/0!?]+$/.test(res) ? new FE(res) : res;
    memo.set(mid, out); return out;
  }
  parser = new FP({
    functions: EXTRA,
    onCell: (ref) => { const sh = byName.get(ref.sheet); if (!sh) throw FE.REF; return cellValue(sh, ref.row - 1, ref.col - 1); },
    onRange: (ref) => {
      const sh = byName.get(ref.sheet); if (!sh) throw FE.REF;
      const r1 = ref.from.row - 1, r2 = ref.to.row - 1, c1 = ref.from.col - 1, c2 = ref.to.col - 1;
      // نقصر النطاقات الضخمة (أعمدة/صفوف كاملة) على البيانات الموجودة
      let mr = 0, mc = 0; for (const k of sh.cells.keys()) { const [r, c] = unkey(k); if (r > mr) mr = r; if (c > mc) mc = c; }
      const R2 = Math.min(r2, Math.max(r1, mr)), C2 = Math.min(c2, Math.max(c1, mc)); const out = [];
      for (let r = r1; r <= R2; r++) { const row = []; for (let c = c1; c <= C2; c++) row.push(cellValue(sh, r, c)); out.push(row); }
      return out;
    },
    onVariable: () => { throw FE.NAME; },
  });
  for (const f of formulas) if (affected.has(id(f.sh, f.k))) cellValue(f.sh, f.r, f.c);
  return [...changedSheets];
}
