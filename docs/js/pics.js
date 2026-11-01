// الصور والمخططات المصغّرة (Sparklines): قراءة من XLSX، عرض، إدراج صورة، وإعادة كتابتها عند الحفظ
import { readZip, writeZip, txt, bytes } from './zip.js';
import { dom, kid, kids, desc, relsOf, EMU, DEF_W, DEF_H, NS_A, NS_R, NS_X } from './charts.js';
import { esc } from './util.js';

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp', webp: 'image/webp' };
const ext = (p) => (p.split('.').pop() || 'png').toLowerCase();
const b64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
let _pid = 0; export const picId = () => 'pc' + Date.now().toString(36) + (++_pid);
const colN = (s) => { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const cellRef = (s) => { const m = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(s.trim()); return m ? { r: +m[2] - 1, c: colN(m[1]) } : null; };

export async function readPics(buffer, wb) {
  const zip = await readZip(buffer);
  if (!zip.has('xl/workbook.xml')) return;
  const wbRels = relsOf(zip, 'xl/workbook.xml');
  for (const se of desc(dom(txt(zip.get('xl/workbook.xml'))), 'sheet')) {
    const sh = wb.sheets.find((s) => s.name === se.getAttribute('name')); if (!sh) continue;
    const rid = [...se.attributes].find((a) => a.localName === 'id'); const rel = rid && wbRels.get(rid.value); if (!rel || !zip.has(rel.target)) continue;
    const sx = txt(zip.get(rel.target));
    // مخططات مصغّرة
    const sm = sx.match(/<ext\b[^>]*>\s*<x14:sparklineGroups[\s\S]*?<\/x14:sparklineGroups>\s*<\/ext>/);
    if (sm) {
      sh.sparkExt = sm[0].replace(/\s+xr2:uid="[^"]*"/g, '');
      try {
        const d = dom(`<r xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main" xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main" xmlns:xr2="x">${sm[0].replace(/^<ext\b[^>]*>/, '').replace(/<\/ext>$/, '')}</r>`);
        sh.spark = [];
        for (const g of desc(d, 'sparklineGroup')) {
          const col = kid(g, 'colorSeries'); const color = col && col.getAttribute('rgb') ? '#' + col.getAttribute('rgb').slice(-6) : '#376092';
          const grp = { type: g.getAttribute('type') || 'line', color, rtl: g.getAttribute('rightToLeft') === '1', markers: g.getAttribute('markers') === '1', items: [] };
          for (const s of desc(g, 'sparkline')) { const f = (kid(s, 'f') || {}).textContent, q = (kid(s, 'sqref') || {}).textContent; const ref = q && cellRef(q); if (f && ref) grp.items.push({ f, ...ref }); }
          sh.spark.push(grp);
        }
      } catch (e) { console.warn('sparklines', e); }
    }
    // الصور
    const m = sx.match(/<drawing\b[^>]*\br:id="([^"]+)"/); if (!m) continue;
    const dp = relsOf(zip, rel.target).get(m[1]); if (!dp || !zip.has(dp.target)) continue;
    const drels = relsOf(zip, dp.target); const dd = dom(txt(zip.get(dp.target)));
    const colPx = (c) => (sh.colW[c] || DEF_W), rowPx = (r) => (sh.rowH[r] || DEF_H);
    const pt = (el) => { const g = (n) => +((kid(el, n) || {}).textContent || 0); return { c: g('col') + g('colOff') / EMU / colPx(g('col')), r: g('row') + g('rowOff') / EMU / rowPx(g('row')) }; };
    for (const an of [...dd.documentElement.children]) {
      if (kid(an, 'graphicFrame')) continue; // الرسوم البيانية يقرؤها charts.js
      const blips = desc(an, 'blip'); if (!blips.length) continue;
      let a1, a2;
      if (an.localName === 'twoCellAnchor') { a1 = pt(kid(an, 'from')); a2 = pt(kid(an, 'to')); }
      else if (an.localName === 'oneCellAnchor') {
        a1 = pt(kid(an, 'from')); const ex = kid(an, 'ext'); let w = (+ex.getAttribute('cx')) / EMU, h = (+ex.getAttribute('cy')) / EMU, c = a1.c, r = a1.r;
        while (w > 0 && c < 5000) { const left = colPx(Math.floor(c)) * (1 - (c % 1)); if (w <= left) { c += w / colPx(Math.floor(c)); w = 0; } else { w -= left; c = Math.floor(c) + 1; } }
        while (h > 0 && r < 100000) { const left = rowPx(Math.floor(r)) * (1 - (r % 1)); if (h <= left) { r += h / rowPx(Math.floor(r)); h = 0; } else { h -= left; r = Math.floor(r) + 1; } }
        a2 = { c, r };
      } else continue;
      const media = {}, imgs = [];
      const grp = kid(an, 'grpSp'); let ch = null;
      if (grp) { const gx = kid(kid(grp, 'grpSpPr') || grp, 'xfrm'); if (gx) { const o = kid(gx, 'chOff'), e = kid(gx, 'chExt'); if (o && e) ch = { x: +o.getAttribute('x'), y: +o.getAttribute('y'), w: +e.getAttribute('cx') || 1, h: +e.getAttribute('cy') || 1 }; } }
      for (const pic of desc(an, 'pic')) {
        const bl = desc(pic, 'blip')[0]; if (!bl) continue;
        const ra = [...bl.attributes].find((a) => a.localName === 'embed'); const rr = ra && drels.get(ra.value); if (!rr || !zip.has(rr.target)) continue;
        // كل علاقات الصورة (png + svg) تُحفظ ليُعاد كتابتها كما هي
        for (const b of desc(pic, 'blip').concat(desc(pic, 'svgBlip'))) for (const at of b.attributes) if (at.localName === 'embed' && drels.get(at.value)) { const t = drels.get(at.value).target; if (zip.has(t)) media[at.value] = { name: t.split('/').pop(), bytes: zip.get(t) }; }
        let box = { x: 0, y: 0, w: 1, h: 1 };
        if (ch && pic.parentNode === grp) { const sp = kid(pic, 'spPr'), xf = sp && kid(sp, 'xfrm'); if (xf) { const o = kid(xf, 'off'), e = kid(xf, 'ext'); if (o && e) box = { x: (+o.getAttribute('x') - ch.x) / ch.w, y: (+o.getAttribute('y') - ch.y) / ch.h, w: +e.getAttribute('cx') / ch.w, h: +e.getAttribute('cy') / ch.h }; } }
        imgs.push({ url: `data:${MIME[ext(rr.target)] || 'image/png'};base64,${b64(zip.get(rr.target))}`, box });
      }
      if (!imgs.length) continue;
      (sh.pics = sh.pics || []).push({ id: picId(), anchor: { c1: a1.c, r1: a1.r, c2: a2.c, r2: a2.r }, xml: new XMLSerializer().serializeToString(an), media, imgs });
    }
  }
}

// ---------- الكتابة ----------
export async function injectPics(buffer, wb) {
  const any = wb.sheets.some((s) => (s.pics && s.pics.length) || s.sparkExt);
  if (!any) return buffer;
  const zip = await readZip(buffer);
  const wbRels = relsOf(zip, 'xl/workbook.xml');
  const sheetEls = desc(dom(txt(zip.get('xl/workbook.xml'))), 'sheet');
  let ct = txt(zip.get('[Content_Types].xml')); let ctAdd = '';
  for (const [e, t] of [['png', 'image/png'], ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['gif', 'image/gif'], ['svg', 'image/svg+xml']]) if (!new RegExp(`Extension="${e}"`, 'i').test(ct)) ctAdd += `<Default Extension="${e}" ContentType="${t}"/>`;
  let drN = 0; for (const k of zip.keys()) { const x = k.match(/^xl\/drawings\/drawing(\d+)\.xml$/); if (x) drN = Math.max(drN, +x[1]); }
  let mN = 0;
  const addRel = (path, id, type, target) => {
    const dir = path.slice(0, path.lastIndexOf('/') + 1), name = path.slice(path.lastIndexOf('/') + 1), rp = dir + '_rels/' + name + '.rels';
    let r = zip.has(rp) ? txt(zip.get(rp)) : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
    r = r.replace('</Relationships>', `<Relationship Id="${id}" Type="${NS_R}/${type}" Target="${target}"/></Relationships>`); zip.set(rp, bytes(r));
  };
  for (const sh of wb.sheets) {
    const pics = sh.pics || []; if (!pics.length && !sh.sparkExt) continue;
    const se = sheetEls.find((e) => e.getAttribute('name') === sh.name); if (!se) continue;
    const rid = [...se.attributes].find((a) => a.localName === 'id'); const rel = rid && wbRels.get(rid.value); if (!rel || !zip.has(rel.target)) continue;
    let sx = txt(zip.get(rel.target));
    if (pics.length) {
      let drPath, drXml;
      const dm = sx.match(/<drawing\b[^>]*\br:id="([^"]+)"/);
      if (dm) { const dp = relsOf(zip, rel.target).get(dm[1]); if (dp && zip.has(dp.target)) { drPath = dp.target; drXml = txt(zip.get(drPath)); } }
      if (!drPath) {
        drN++; drPath = `xl/drawings/drawing${drN}.xml`;
        drXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="${NS_X}" xmlns:a="${NS_A}"></xdr:wsDr>`;
        ctAdd += `<Override PartName="/${drPath}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`;
        const tag = `<drawing xmlns:r="${NS_R}" r:id="rIdJd2"/>`;
        const at = sx.search(/<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/);
        sx = at >= 0 ? sx.slice(0, at) + tag + sx.slice(at) : sx.replace('</worksheet>', tag + '</worksheet>');
        addRel(rel.target, 'rIdJd2', 'drawing', '../drawings/' + drPath.split('/').pop());
      }
      const ms = (drXml.match(/\bid="(\d+)"/g) || []).map((x) => +x.slice(4, -1)); let oid = Math.max(2000, ...ms) + 1;
      const cp = (c, r) => { const ci = Math.floor(c), ri = Math.floor(r); return `<xdr:col>${ci}</xdr:col><xdr:colOff>${Math.round((c - ci) * (sh.colW[ci] || DEF_W) * EMU)}</xdr:colOff><xdr:row>${ri}</xdr:row><xdr:rowOff>${Math.round((r - ri) * (sh.rowH[ri] || DEF_H) * EMU)}</xdr:rowOff>`; };
      let anchors = '';
      for (const pc of pics) {
        const wrote = {};
        for (const [id, md] of Object.entries(pc.media || {})) { mN++; const nm = `jp${mN}.${ext(md.name)}`; zip.set('xl/media/' + nm, md.bytes); wrote[id] = nm; addRel(drPath, id, 'image', '../media/' + nm); }
        const an = pc.anchor;
        if (pc.xml && !pc.anchorEdited) anchors += pc.xml;
        else if (pc.xml) { // صورة أصلية حُرّكت: نحدّث from/to فقط
          anchors += pc.xml.replace(/<(\w+:)?from>[\s\S]*?<\/(\w+:)?from>/, `<xdr:from>${cp(an.c1, an.r1)}</xdr:from>`).replace(/<(\w+:)?to>[\s\S]*?<\/(\w+:)?to>/, `<xdr:to>${cp(an.c2, an.r2)}</xdr:to>`).replace(/^<(\w+:)?oneCellAnchor/, '<xdr:twoCellAnchor').replace(/<\/(\w+:)?oneCellAnchor>$/, '</xdr:twoCellAnchor>');
        } else {
          const id = Object.keys(wrote)[0]; if (!id) continue;
          anchors += `<xdr:twoCellAnchor editAs="oneCell"><xdr:from>${cp(an.c1, an.r1)}</xdr:from><xdr:to>${cp(an.c2, an.r2)}</xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${oid++}" name="Picture ${oid}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="${NS_R}" r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`;
        }
      }
      drXml = drXml.replace(/<\/(\w+:)?wsDr>\s*$/, anchors + '</$1wsDr>'); zip.set(drPath, bytes(drXml));
    }
    if (sh.sparkExt) {
      let ex = sh.sparkExt; const head = ex.match(/^<ext\b[^>]*>/)[0]; let add = '';
      if (!/xmlns:x14=/.test(head)) add += ' xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"';
      if (!/xmlns:xm=/.test(head)) add += ' xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main"';
      ex = ex.replace(/^<ext\b/, '<ext' + add);
      if (/<extLst>/.test(sx)) sx = sx.replace('</extLst>', ex + '</extLst>'); else sx = sx.replace('</worksheet>', `<extLst>${ex}</extLst></worksheet>`);
    }
    zip.set(rel.target, bytes(sx));
  }
  if (ctAdd) { ct = ct.replace('</Types>', ctAdd + '</Types>'); zip.set('[Content_Types].xml', bytes(ct)); }
  return await writeZip(zip);
}

// ---------- العرض ----------
function sparkSvg(vals, g, w, h) {
  const nums = vals.filter((v) => typeof v === 'number'); if (!nums.length) return '';
  let mn = Math.min(...nums), mx = Math.max(...nums); if (mn === mx) { mn -= 1; mx += 1; }
  const pad = 3, n = vals.length, X = (i) => pad + (n === 1 ? (w - 2 * pad) / 2 : (g.rtl ? n - 1 - i : i) * (w - 2 * pad) / (n - 1)), Y = (v) => h - pad - (v - mn) / (mx - mn) * (h - 2 * pad);
  if (g.type === 'column' || g.type === 'stacked') {
    const bw = Math.max(1, (w - 2 * pad) / n * 0.7); let s = '';
    vals.forEach((v, i) => { if (typeof v !== 'number') return; const y = Y(v), y0 = Y(Math.max(mn, Math.min(0, mx))); s += `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${Math.min(y, y0).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, Math.abs(y0 - y)).toFixed(1)}" fill="${g.color}"/>`; });
    return s;
  }
  let d = '', pen = false; const pts = [];
  vals.forEach((v, i) => { if (typeof v !== 'number') { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1); pen = true; pts.push([X(i), Y(v), v]); });
  let s = `<path d="${d}" fill="none" stroke="${g.color}" stroke-width="1.6" stroke-linejoin="round"/>`;
  if (g.markers) for (const [x, y, v] of pts) s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2" fill="${v === mx ? '#2e9d4f' : v === mn ? '#d33' : g.color}"/>`;
  return s;
}
function sparkVals(wb, sh, f) {
  const m = /^(?:'((?:[^']|'')+)'|([^!']+))?!?\$?([A-Za-z]+)\$?(\d+)(?::\$?([A-Za-z]+)\$?(\d+))?$/.exec(f.replace(/^=/, '')); if (!m) return [];
  const name = (m[1] || m[2] || '').replace(/''/g, "'"); const t = name ? wb.sheets.find((s) => s.name === name) : sh; if (!t) return [];
  const c1 = colN(m[3]), r1 = +m[4] - 1, c2 = m[5] ? colN(m[5]) : c1, r2 = m[6] ? +m[6] - 1 : r1; const out = [];
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) { const x = t.cells.get(r + ',' + c); out.push(x && typeof x.v === 'number' ? x.v : null); }
  return out;
}
const fpos = (arr, v) => { const i = Math.max(0, Math.min(arr.length - 2, Math.floor(v))); return arr[i] + (arr[i + 1] - arr[i]) * (v - i); };

export function installPics(Pane, App) {
  const P = Pane.prototype;
  const base = P.renderExtras;
  P.renderExtras = function () {
    if (base) base.call(this);
    if (!this.picEl) { this.picEl = document.createElement('div'); this.picEl.className = 'pics'; this.layer.appendChild(this.picEl); this.initPics(); }
    const sh = this.sh; const el = this.picEl; if (!sh) { el.innerHTML = ''; return; }
    let h = '';
    for (const pc of sh.pics || []) {
      const a = pc.anchor, x1 = fpos(this.colX, a.c1), x2 = fpos(this.colX, a.c2), y1 = fpos(this.rowY, a.r1), y2 = fpos(this.rowY, a.r2), W = Math.max(8, x2 - x1), H = Math.max(8, y2 - y1);
      const on = this.selPic === pc.id;
      h += `<div class="pic${on ? ' on' : ''}" data-id="${pc.id}" style="inset-inline-start:${x1}px;top:${y1}px;width:${W}px;height:${H}px">` + pc.imgs.map((i) => `<img draggable="false" src="${i.url}" style="inset-inline-start:${i.box.x * 100}%;top:${i.box.y * 100}%;width:${i.box.w * 100}%;height:${i.box.h * 100}%">`).join('') + (on ? '<button type="button" class="picdel" title="حذف الصورة">✕</button>' : '') + '</div>';
    }
    for (const g of sh.spark || []) for (const it of g.items) {
      if (this.block && (it.r < this.block.r0 || it.r > this.block.r1)) continue;
      if (it.c >= sh.ncols || it.r >= sh.nrows) continue;
      const x = this.colX[it.c], y = this.rowY[it.r], w = this.colX[it.c + 1] - x, hh = this.rowY[it.r + 1] - y; if (w < 6 || hh < 6) continue;
      let inner = ''; try { inner = sparkSvg(sparkVals(this.wb, sh, it.f), g, w, hh); } catch (e) { /* تجاهل */ }
      h += `<svg class="spk" style="inset-inline-start:${x}px;top:${y}px;width:${w}px;height:${hh}px" viewBox="0 0 ${w} ${hh}">${inner}</svg>`;
    }
    el.innerHTML = h;
  };
  P.initPics = function () {
    this.picEl.addEventListener('pointerdown', (e) => {
      const d = e.target.closest && e.target.closest('.pic'); const sh = this.sh;
      if (!d) return;
      const pc = sh.pics.find((x) => x.id === d.dataset.id); if (!pc) return;
      if (e.target.closest('.picdel')) { e.preventDefault(); e.stopPropagation(); this.app.deletePic(this, pc.id); return; }
      if (this.selPic !== pc.id) { this.selPic = pc.id; this.renderExtras(); return; }
      e.preventDefault(); const rtl = sh.rtl, sx = e.clientX, sy = e.clientY, a0 = { ...pc.anchor }, wpx = fpos(this.colX, a0.c2) - fpos(this.colX, a0.c1), hpx = fpos(this.rowY, a0.r2) - fpos(this.rowY, a0.r1);
      const x0 = fpos(this.colX, a0.c1), y0 = fpos(this.rowY, a0.r1); let moved = false; d.setPointerCapture(e.pointerId);
      const ffrom = (arr, v) => { let lo = 0, hi = arr.length - 2; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (arr[m] <= v) lo = m; else hi = m - 1; } return lo + (v - arr[lo]) / ((arr[lo + 1] - arr[lo]) || 1); };
      const mv = (ev) => { let dx = ev.clientX - sx; if (rtl) dx = -dx; const dy = ev.clientY - sy; if (!moved && Math.hypot(dx, dy) < 4) return; moved = true; const x = Math.max(0, x0 + dx), y = Math.max(0, y0 + dy); pc.anchor = { c1: ffrom(this.colX, x), r1: ffrom(this.rowY, y), c2: ffrom(this.colX, x + wpx), r2: ffrom(this.rowY, y + hpx) }; d.style.insetInlineStart = x + 'px'; d.style.top = y + 'px'; };
      const up = () => { d.removeEventListener('pointermove', mv); d.removeEventListener('pointerup', up); d.removeEventListener('pointercancel', up); if (moved) { pc.anchorEdited = true; const b = a0, af = { ...pc.anchor }; const set = (v) => () => { pc.anchor = { ...v }; pc.anchorEdited = true; }; this.app.pushUndoFn(this.wb, sh, set(b), set(af)); this.app.markDirty(this.wb); } };
      d.addEventListener('pointermove', mv); d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
    });
    this.layer.addEventListener('pointerdown', (e) => { if (this.selPic && !(e.target.closest && e.target.closest('.pic'))) { this.selPic = null; this.renderExtras(); } }, true);
    this.el.addEventListener('keydown', (e) => { if (this.selPic && !this.editing && (e.key === 'Delete' || e.key === 'Backspace') && !e.target.closest('input,textarea')) { e.preventDefault(); this.app.deletePic(this, this.selPic); } });
  };
  Object.assign(App, {
    deletePic(p, id) {
      const sh = p.sh, i = sh.pics.findIndex((x) => x.id === id); if (i < 0) return; const [pc] = sh.pics.splice(i, 1); p.selPic = null;
      const del = () => { const j = sh.pics.indexOf(pc); if (j >= 0) sh.pics.splice(j, 1); }, add = () => { if (!sh.pics.includes(pc)) sh.pics.splice(Math.min(i, sh.pics.length), 0, pc); };
      this.pushUndoFn(p.wb, sh, add, del); this.markDirty(p.wb); this.panes.forEach((q) => { if (q.sh === sh) q.renderExtras(); });
    },
    insertPicture(p) {
      if (!p.sh) return;
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/gif,image/webp'; inp.style.display = 'none'; document.body.appendChild(inp);
      inp.addEventListener('change', async () => {
        const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
        const u8 = new Uint8Array(await f.arrayBuffer()); const e = ((f.name.split('.').pop() || 'png').toLowerCase().replace('jpeg', 'jpg')); const url = `data:${f.type || MIME[e] || 'image/png'};base64,${b64(u8)}`;
        const im = new Image(); await new Promise((r) => { im.onload = r; im.onerror = r; im.src = url; });
        let w = im.naturalWidth || 300, h = im.naturalHeight || 200; const k = Math.min(1, 360 / w, 280 / h); w *= k; h *= k;
        const sh = p.sh, x = p.colX[p.sel.ac], y = p.rowY[p.sel.ar];
        const ffrom = (arr, v) => { let lo = 0, hi = arr.length - 2; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (arr[m] <= v) lo = m; else hi = m - 1; } return lo + (v - arr[lo]) / ((arr[lo + 1] - arr[lo]) || 1); };
        const pc = { id: picId(), anchor: { c1: ffrom(p.colX, x), r1: ffrom(p.rowY, y), c2: ffrom(p.colX, x + w), r2: ffrom(p.rowY, y + h) }, xml: null, media: { rIdNew: { name: 'img.' + (MIME[e] ? e : 'png'), bytes: u8 } }, imgs: [{ url, box: { x: 0, y: 0, w: 1, h: 1 } }] };
        (sh.pics = sh.pics || []).push(pc); p.selPic = pc.id;
        const add = () => { if (!sh.pics.includes(pc)) sh.pics.push(pc); }, del = () => { const j = sh.pics.indexOf(pc); if (j >= 0) sh.pics.splice(j, 1); };
        this.pushUndoFn(p.wb, sh, del, add); this.markDirty(p.wb); this.panes.forEach((q) => { if (q.sh === sh) q.renderExtras(); });
      });
      inp.click();
    },
  });
}
void esc; void kids;
