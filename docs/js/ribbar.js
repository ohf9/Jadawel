// إخفاء الشريط (مثل Minimize في Excel): كامل ← تبويبات فقط ← مخفي تمامًا (للمساحة القصوى)
import { tr } from './i18n.js';

export function installRibbonToggle(app) {
  const tabs = document.querySelector('.rtabs'), rib = document.querySelector('.ribbon'); if (!tabs || !rib) return;
  const mk = (id, title, path) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.className = 'rib-ctl'; b.title = tr(title); b.innerHTML = `<svg viewBox="0 0 24 24">${path}</svg>`; return b; };
  const spacer = document.createElement('span'); spacer.className = 'rib-sp';
  const bCol = mk('rib-toggle', 'إخفاء الشريط', '<path d="M6 14l6-6 6 6"/>'), bFull = mk('rib-focus', 'إخفاء كل القوائم لمساحة أكبر', '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>');
  tabs.append(spacer, bFull, bCol);
  const rest = mk('rib-restore', 'إظهار القوائم', '<path d="M6 10l6 6 6-6"/>'); rest.className = 'rib-restore'; document.body.appendChild(rest);
  let state = 'full'; try { state = localStorage.getItem('jadawel-rib') || 'full'; } catch (e) { /* لا بأس */ }
  const relayout = () => requestAnimationFrame(() => app.panes.forEach((p) => { if (p.sh) { p.block = null; p.render(true); p.updateSel(); } }));
  const set = (s, save = true) => {
    state = s; document.body.dataset.rib = s; rib.classList.remove('peek');
    bCol.querySelector('svg').style.transform = s === 'full' ? '' : 'rotate(180deg)'; bCol.title = tr(s === 'full' ? 'إخفاء الشريط' : 'إظهار الشريط');
    if (save) try { localStorage.setItem('jadawel-rib', s); } catch (e) { /* لا بأس */ }
    relayout();
  };
  bCol.addEventListener('click', () => set(state === 'full' ? 'tabs' : 'full'));
  bFull.addEventListener('click', () => set('none'));
  rest.addEventListener('click', () => set('full'));
  tabs.addEventListener('dblclick', (e) => { if (e.target.closest('[data-rt]') && !e.target.closest('[data-rt=file]')) set(state === 'full' ? 'tabs' : 'full'); });
  // في وضع «تبويبات فقط»: الضغط على تبويب يُظهر شريطه مؤقتًا فوق الورقة
  tabs.addEventListener('click', (e) => {
    const t = e.target.closest('[data-rt]'); if (!t || t.dataset.rt === 'file' || state !== 'tabs') return;
    rib.style.top = tabs.getBoundingClientRect().bottom + 'px'; rib.classList.add('peek');
  });
  rib.addEventListener('click', (e) => { if (state === 'tabs' && e.target.closest('.rb, button') && !e.target.closest('[data-act$="Menu"],[data-act=nfMenu]')) setTimeout(() => { if (!document.querySelector('.pop')) rib.classList.remove('peek'); }, 250); });
  document.addEventListener('pointerdown', (e) => { if (rib.classList.contains('peek') && !e.target.closest('.ribbon, .rtabs, .pop')) rib.classList.remove('peek'); }, true);
  set(['full', 'tabs', 'none'].includes(state) ? state : 'full', false);
}
