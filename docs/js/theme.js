// المظهر: فاتح / داكن / حسب الجهاز، مع خيار تطبيق الداكن على الشيت كاملًا أو على القوائم فقط
import { settings } from './i18n.js';
const mq = matchMedia('(prefers-color-scheme: dark)');
export function applyTheme() {
  const dark = settings.theme === 'dark' || (settings.theme !== 'light' && mq.matches);
  const r = document.documentElement;
  r.dataset.theme = dark ? 'dark' : 'light';
  r.dataset.sheet = dark && settings.darkSheet !== false ? 'dark' : 'light';
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = dark ? '#12261b' : '#1e6b41';
}
mq.addEventListener('change', () => { if (settings.theme === 'system') applyTheme(); });
applyTheme();
