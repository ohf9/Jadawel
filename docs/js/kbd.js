// لوحة مفاتيح مخصصة على طريقة Excel: أرقام 123 / 456 / 789 / 0 وأسهم تنقل بين الخلايا
import { settings, saveSettings, tr } from './i18n.js';

const ROWS = [
  [['1'], ['2'], ['3'], ['+', 'op'], ['⌫', 'bs', 'fn'], ['▲', 'up', 'fn'], ['✓', 'enter', 'ok']],
  [['4'], ['5'], ['6'], ['−', 'op', '', '-'], ['◀', 'left', 'fn'], ['▼', 'down', 'fn'], ['▶', 'right', 'fn']],
  [['7'], ['8'], ['9'], ['×', 'op', '', '*'], ['=', 'op'], ['(', 'op'], [')', 'op']],
  [['0'], ['.'], [',', 'op'], ['÷', 'op', '', '/'], ['%', 'op'], ['Tab', 'tab', 'fn sm'], ['ABC', 'abc', 'fn sm']],
];

export function install(app) {
  const el = document.createElement('div'); el.id = 'kbd'; el.dir = 'ltr'; el.hidden = true; el.setAttribute('role', 'group'); el.setAttribute('aria-label', tr('لوحة المفاتيح'));
  el.innerHTML = `<div class="kh"><div class="kk fn sm" role="button" data-k="side" title="${tr('نقل لوحة الأرقام إلى الجهة الأخرى')}">⇄</div></div>` + ROWS.map((r) => `<div class="kr">${r.map(([t, act, cls, ch]) => `<div class="kk ${cls || ''}" role="button" data-k="${act || 'ch'}" data-c="${ch || t}">${t}</div>`).join('')}</div>`).join('');
  const sb = document.querySelector('.statusbar'); sb.parentNode.insertBefore(el, sb);
  sb.insertAdjacentHTML('afterbegin', `<button id="kbd-toggle" class="kbd-toggle" title="${tr('إظهار/إخفاء لوحة الأرقام')}" aria-label="${tr('إظهار/إخفاء لوحة الأرقام')}">⌨</button>`);

  const coarse = () => matchMedia('(pointer:coarse)').matches || app.panes.some((p) => p.touchMode);
  app.kpActive = () => (settings.keypad === undefined ? coarse() : settings.keypad === true);
  app.syncKbd = () => {
    const p = app.pane(), on = app.kpActive() && p && p.sh && document.getElementById('backstage').hidden;
    el.classList.toggle('side-l', settings.kpSide === 'left'); el.classList.toggle('side-r', settings.kpSide !== 'left');
    el.hidden = !on; document.body.classList.toggle('has-kbd', !!on);
    const t = document.getElementById('kbd-toggle'); if (t) t.classList.toggle('on', app.kpActive());
  };
  setInterval(() => app.syncKbd(), 500);
  document.getElementById('kbd-toggle').addEventListener('click', () => { saveSettings({ keypad: !app.kpActive() }); app.syncKbd(); const p = app.pane(); p.sh && p.focus(); });

  const target = (p) => (p.editing && p.editing.fbar ? p.formula : p.editor);
  const insert = (p, text) => {
    if (!p.editing) { p.startEdit(text, 'enter'); return; }
    const ed = target(p), s = ed.selectionStart ?? ed.value.length, e = ed.selectionEnd ?? s;
    ed.value = ed.value.slice(0, s) + text + ed.value.slice(e); const n = s + text.length; ed.setSelectionRange(n, n);
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const caret = (p, d) => { const ed = target(p), rtl = ed.dir === 'rtl', n = Math.max(0, Math.min(ed.value.length, (ed.selectionStart || 0) + (rtl ? -d : d))); ed.setSelectionRange(n, n); };
  const press = (k, c) => {
    const p = app.pane(); if (!p || !p.sh) return;
    if (k === 'side') { saveSettings({ kpSide: settings.kpSide === 'left' ? 'right' : 'left' }); app.syncKbd(); return; }
    if (k === 'ch' || k === 'op') return insert(p, c);
    if (k === 'bs') {
      if (!p.editing) { p.startEdit('', 'enter'); return; }
      const ed = target(p), s = ed.selectionStart, e = ed.selectionEnd; if (s !== e) ed.value = ed.value.slice(0, s) + ed.value.slice(e), ed.setSelectionRange(s, s); else if (s > 0) ed.value = ed.value.slice(0, s - 1) + ed.value.slice(s), ed.setSelectionRange(s - 1, s - 1);
      ed.dispatchEvent(new Event('input', { bubbles: true })); return;
    }
    if (k === 'enter') { if (p.editing) { p.commitEdit(!!p.editing.fbar); p.move(1, 0); p.focus(); } else p.startEdit(); return; }
    if (k === 'tab') { if (p.editing) p.commitEdit(!!p.editing.fbar); p.move(0, 1); p.focus(); return; }
    if (k === 'abc') {
      app.sysKb = true; if (!p.editing) p.startEdit();
      const ed = target(p); ed.inputMode = 'text'; p.editing.keep = true; ed.blur(); ed.focus({ preventScroll: true }); setTimeout(() => { p.editing && (p.editing.keep = false); }, 400); return;
    }
    const dir = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[k];
    if (p.editing && p.editing.mode === 'edit' && (k === 'left' || k === 'right')) return caret(p, k === 'left' ? -1 : 1);
    if (p.editing) p.commitEdit(!!p.editing.fbar);
    app.keyNav(p, { key: dir }); p.focus();
  };
  let timer = null;
  const stop = () => { clearTimeout(timer); clearInterval(timer); timer = null; };
  el.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.kk'); if (!b) return; e.preventDefault(); b.classList.add('down');
    const k = b.dataset.k, c = b.dataset.c; press(k, c);
    if (['bs', 'up', 'down', 'left', 'right'].includes(k)) timer = setTimeout(() => { timer = setInterval(() => press(k, c), 70); }, 380);
    const up = () => { stop(); b.classList.remove('down'); document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', up, true); };
    document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', up, true);
  });
  el.addEventListener('mousedown', (e) => e.preventDefault()); el.addEventListener('touchstart', (e) => { if (e.target.closest('.kk')) e.preventDefault(); }, { passive: false });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

// شرح الشارة الصفراء: دوال لا يحسبها التطبيق
export function installUnsup(app) {
  app.explainUnsup = async function (p) {
    const names = [...(p.wb._unsup || [])].join('، ');
    const r = await this.dialog('دوال لا يحسبها التطبيق', `الدوال التالية في ملفك: <b dir="ltr">${names}</b><br><br>التطبيق لا يعيد حسابها، لذلك تبقى نتائجها كما حُفظت في ملف Excel (القيم الظاهرة صحيحة وقت الحفظ). الملف سليم ولن يتضرر، لكن هذه الخلايا لن تتحدّث إن غيّرت البيانات التي تعتمد عليها، وExcel يعيد حسابها عند فتح الملف.`, [{ label: 'فهمت', value: 'ok', primary: true }, { label: 'إخفاء هذه الشارة', value: 'hide' }]);
    if (r === 'hide') { p.wb._unsupHide = true; this.panes.forEach((q) => q.wb === p.wb && q.refreshHead()); }
  };
}
