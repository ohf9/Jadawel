// قائمة الخطوط: أسماء Excel القياسية (تُحفظ كما هي في الملف) مع بدائل تعمل على أي جهاز.
// الخطوط المضمّنة (Cairo وغيرها) محمّلة من مجلد fonts ولا تحتاج إنترنت.
const AR = [
  ['Cairo', '"Cairo"'], ['Tajawal', '"Tajawal"'], ['Noto Kufi Arabic', '"Noto Kufi Arabic"'], ['Noto Naskh Arabic', '"Noto Naskh Arabic"'],
  ['Amiri', '"Amiri"'], ['IBM Plex Sans Arabic', '"IBM Plex Sans Arabic"'],
  ['Traditional Arabic', '"Traditional Arabic","Amiri","Noto Naskh Arabic"'], ['Simplified Arabic', '"Simplified Arabic","Noto Naskh Arabic"'], ['Sakkal Majalla', '"Sakkal Majalla","Amiri","Noto Naskh Arabic"'],
];
const EN = [
  ['Calibri', 'Calibri,"Carlito","Noto Sans Arabic",sans-serif'], ['Arial', 'Arial,"Arimo","Noto Sans Arabic",sans-serif'],
  ['Tahoma', 'Tahoma,"Open Sans","Noto Sans Arabic",sans-serif'], ['Segoe UI', '"Segoe UI","Open Sans","Noto Sans Arabic",sans-serif'], ['Verdana', 'Verdana,"Open Sans",sans-serif'],
  ['Times New Roman', '"Times New Roman","Tinos","Noto Naskh Arabic",serif'], ['Georgia', 'Georgia,"Noto Serif",serif'],
  ['Courier New', '"Courier New","Cousine",monospace'], ['Consolas', 'Consolas,"Cousine",monospace'], ['Inter', '"Inter",sans-serif'], ['Roboto', 'Roboto,"Noto Sans Arabic",sans-serif'],
];
export const FONT_GROUPS = [{ id: 'ar', label: 'خطوط عربية', list: AR }, { id: 'en', label: 'خطوط إنجليزية', list: EN }];
export const DEFAULT_FONT = 'Calibri', DEFAULT_SIZE = 11;
export const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
const MAP = new Map([...AR, ...EN]);
// يعيد قيمة font-family لاسم خط (اسم غير معروف يُستخدم كما هو مع بدائل عامة)
export function fontCss(name) {
  // القيمة تُستخدم داخل style="..."، فتُحوَّل علامات الاقتباس إلى مفردة
  const v = MAP.has(name) ? MAP.get(name) : '"' + String(name).replace(/["'\\;{}]/g, '') + '","Noto Sans Arabic",Tahoma,sans-serif';
  return v.replace(/"/g, "'");
}
