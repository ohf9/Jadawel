// نوافذ منبثقة مرتبة بحركة سلسة: الخطوط، الأحجام، الألوان، صيغ الأرقام
import { FONT_GROUPS, SIZES, fontCss, DEFAULT_FONT, DEFAULT_SIZE } from './fonts.js';
import { formatNumber, esc } from './util.js';
import { tr } from './i18n.js';

let cur = null;
export function closePopover() { if (!cur) return; const { el, off, anchor } = cur; cur = null; off(); anchor && anchor.classList.remove('open'); el.classList.remove('in'); setTimeout(() => el.remove(), 140); }
export function openPopover(anchor, el, { cls = '' } = {}) {
  const same = cur && cur.anchor === anchor; closePopover(); if (same) return null;
  el.classList.add('pop'); if (cls) el.classList.add(cls); el.setAttribute('role', 'menu');
  document.body.appendChild(el);
  const place = () => {
    const a = anchor.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, m = 6;
    el.style.maxHeight = ''; const w = el.offsetWidth, h = el.offsetHeight;
    const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
    let x = rtl ? a.right - w : a.left; x = Math.max(m, Math.min(vw - w - m, x));
    const below = vh - a.bottom - m, above = a.top - m; let y, mh;
    if (h <= below || below >= above) { y = a.bottom + 2; mh = below - 2; el.style.transformOrigin = 'top'; } else { mh = above - 2; y = Math.max(m, a.top - Math.min(h, mh) - 2); el.style.transformOrigin = 'bottom'; }
    el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.maxHeight = Math.max(160, mh) + 'px';
  };
  place(); anchor.classList.add('open');
  requestAnimationFrame(() => el.classList.add('in'));
  const down = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) closePopover(); };
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePopover(); } };
  const away = () => closePopover();
  document.addEventListener('pointerdown', down, true); document.addEventListener('keydown', key, true); addEventListener('resize', away);
  el.addEventListener('mousedown', (e) => { if (!/INPUT|TEXTAREA/.test(e.target.tagName)) e.preventDefault(); }); // لا تسحب التركيز من الشيت
  cur = { el, anchor, off: () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key, true); removeEventListener('resize', away); } };
  const sel = el.querySelector('.it.on'); if (sel) sel.scrollIntoView({ block: 'center' });
  return el;
}
const h = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d; };

export function fontMenu(anchor, current, pick) {
  const el = h(''); el.className = 'menu-font';
  const cur0 = current || DEFAULT_FONT;
  el.innerHTML = FONT_GROUPS.map((g) => `<div class="mh">${tr(g.label)}</div>` + g.list.map(([n]) => `<button class="it${n === cur0 ? ' on' : ''}" data-v="${esc(n)}"><span class="ck">✓</span><span class="fn" style="font-family:${fontCss(n)}">${esc(n)}</span><span class="fp" style="font-family:${fontCss(n)}">أبجد Abc ١٢٣</span></button>`).join('')).join('')
    + `<div class="sep"></div><button class="it" data-v=""><span class="ck"></span><span class="fn">${tr('الخط الافتراضي')}</span></button>`;
  el.addEventListener('click', (e) => { const b = e.target.closest('.it'); if (!b) return; closePopover(); pick(b.dataset.v || null); });
  return openPopover(anchor, el);
}
export function sizeMenu(anchor, current, pick) {
  const el = h(''); el.className = 'menu-size';
  el.innerHTML = `<input class="sz-in" type="number" min="1" max="400" step="1" inputmode="numeric" value="${current || DEFAULT_SIZE}" aria-label="${tr('حجم الخط')}">` + SIZES.map((n) => `<button class="it${n === (current || DEFAULT_SIZE) ? ' on' : ''}" data-v="${n}">${n}</button>`).join('');
  const inp = el.querySelector('input');
  el.addEventListener('click', (e) => { const b = e.target.closest('.it'); if (!b) return; closePopover(); pick(+b.dataset.v); });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const v = Math.round(+inp.value); if (v >= 1 && v <= 400) { closePopover(); pick(v); } } });
  const o = openPopover(anchor, el); if (o && !matchMedia('(pointer:coarse)').matches) setTimeout(() => inp.select(), 30); return o;
}

// ---- الألوان ----
const mix = (hex, t, to) => { const n = parseInt(hex.slice(1), 16); const c = [n >> 16 & 255, n >> 8 & 255, n & 255].map((v) => Math.round(v + (to - v) * t)); return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''); };
const THEME = ['#ffffff', '#000000', '#e7e6e6', '#44546a', '#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47'];
const STD = ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0'];
const rec = (kind) => { try { return JSON.parse(localStorage.getItem('jadawel-recent-' + kind)) || []; } catch (e) { return []; } };
export function pushRecent(kind, c) { try { localStorage.setItem('jadawel-recent-' + kind, JSON.stringify([c, ...rec(kind).filter((x) => x !== c)].slice(0, 10))); } catch (e) { /* لا بأس */ } }
export function colorMenu(anchor, kind, current, pick) {
  const el = h(''); el.className = 'menu-color';
  const sw = (c, t) => `<button class="sw${c === current ? ' on' : ''}" data-v="${c}" style="background:${c}" title="${c}${t ? ' ' + t : ''}"></button>`;
  const shades = [[0.8, 255], [0.6, 255], [0.4, 255], [0.25, 0], [0.5, 0]];
  let g = '';
  for (let r = 0; r < 6; r++) g += THEME.map((c, i) => { if (r === 0) return sw(c); const [t, to] = shades[r - 1]; return sw(i === 0 ? mix('#ffffff', t * 0.35, 0) : i === 1 ? mix('#000000', t * 0.5, 255) : mix(c, t, to)); }).join('');
  const rc = rec(kind);
  el.innerHTML = `<button class="it auto" data-v="">${kind === 'fill' ? '<span class="nofill"></span>' + tr('بدون تعبئة') : '<span class="autoA">A</span>' + tr('تلقائي')}</button>`
    + `<div class="mh">${tr('ألوان السمة')}</div><div class="grid">${g}</div><div class="mh">${tr('ألوان قياسية')}</div><div class="grid">${STD.map((c) => sw(c)).join('')}</div>`
    + (rc.length ? `<div class="mh">${tr('الأخيرة')}</div><div class="grid">${rc.map((c) => sw(c)).join('')}</div>` : '')
    + `<div class="sep"></div><label class="it more">🎨 ${tr('ألوان إضافية…')}<input type="color" value="${current || '#ffe699'}"></label>`;
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; closePopover(); pick(b.dataset.v || null); });
  const ci = el.querySelector('input[type=color]'); ci.addEventListener('change', () => { closePopover(); pick(ci.value); });
  return openPopover(anchor, el);
}

export function nfMenu(anchor, presets, current, pick) {
  const el = h(''); el.className = 'menu-nf';
  const sample = (nf) => { try { if (nf === 'General') return '1234.5'; if (nf === '@') return '1234.5'; if (/y|d{1,2}|h/i.test(nf) && !/#|0/.test(nf)) return formatNumber(45678.5, nf); return formatNumber(nf.includes('%') ? 0.1234 : 1234.567, nf); } catch (e) { return ''; } };
  el.innerHTML = presets.map(([v, l]) => `<button class="it${v === current ? ' on' : ''}" data-v="${esc(v)}"><span class="ck">✓</span><span class="nl">${tr(l)}</span><span class="ns">${esc(sample(v))}</span></button>`).join('');
  el.addEventListener('click', (e) => { const b = e.target.closest('.it'); if (!b) return; closePopover(); pick(b.dataset.v); });
  return openPopover(anchor, el);
}
