// قوالب جاهزة لصفحة «جديد»: مصانف بها عناوين وصيغ وتنسيق تعمل مباشرة
import { newWorkbook } from './io.js';
import { key } from './util.js';
import { settings, lang } from './i18n.js';
import { recalc } from './calc.js';

const H = { b: 1, fill: '#1e6b41', color: '#ffffff', al: 'center', bd: 'tblr' };
const BD = { bd: 'tblr' };
const T = (ar, en) => (lang === 'ar' ? ar : en);

function make(name, build) {
  const wb = newWorkbook(name, settings.newRtl); const sh = wb.sheets[0]; sh.name = name.slice(0, 31);
  const set = (r, c, v, s) => { const cell = {}; if (typeof v === 'string' && v[0] === '=') cell.f = v.slice(1); else cell.v = v; if (s) cell.s = s; sh.cells.set(key(r, c), cell); sh.edited.add(key(r, c)); };
  const W = (...w) => w.forEach((x, i) => { sh.colW[i] = x; });
  build(set, W, sh);
  try { recalc(wb, [...sh.cells.entries()].filter(([, c]) => c.f != null).map(([k]) => { const [r, c] = k.split(',').map(Number); return { sheet: sh, r, c }; })); } catch (e) { console.warn('tpl calc', e); }
  sh.rewrite = false; return wb;
}

export const TEMPLATES = [
  { id: 'blank', icon: 'M6 3h8l5 5v13H6zM14 3v5h5', name: () => T('مصنف فارغ', 'Blank workbook'), desc: () => T('ابدأ بجدول جديد.', 'Start with an empty sheet.'), build: null },
  { id: 'grades', icon: 'M4 5h16v14H4zM4 10h16M9 5v14', name: () => T('سجل الدرجات', 'Grade book'), desc: () => T('درجات الطلاب مع المجموع والنسبة والتقدير.', 'Scores with total, percentage and grade.'),
    build: () => make(T('سجل الدرجات', 'Grades'), (set, W, sh) => {
      const hd = [T('م', '#'), T('اسم الطالب', 'Student'), T('اختبار 1 (10)', 'Quiz 1 (10)'), T('اختبار 2 (10)', 'Quiz 2 (10)'), T('منتصف الفصل (20)', 'Midterm (20)'), T('النهائي (40)', 'Final (40)'), T('المجموع', 'Total'), T('النسبة', 'Percent'), T('التقدير', 'Grade')];
      hd.forEach((h, c) => set(0, c, h, H)); W(40, 200, 90, 90, 120, 100, 90, 90, 90); sh.rowH[0] = 34;
      for (let r = 1; r <= 30; r++) { set(r, 0, r, { ...BD, al: 'center' }); for (let c = 1; c <= 5; c++) set(r, c, null, BD);
        set(r, 6, `=IF(COUNT(C${r + 1}:F${r + 1})=0,"",SUM(C${r + 1}:F${r + 1}))`, { ...BD, b: 1, al: 'center' }); set(r, 7, `=IF(G${r + 1}="","",G${r + 1}/80)`, { ...BD, nf: '0%', al: 'center' });
        set(r, 8, `=IF(H${r + 1}="","",IF(H${r + 1}>=0.9,"A",IF(H${r + 1}>=0.8,"B",IF(H${r + 1}>=0.7,"C",IF(H${r + 1}>=0.6,"D","F")))))`, { ...BD, b: 1, al: 'center' }); }
      set(32, 1, T('المتوسط', 'Average'), { b: 1 }); for (let c = 2; c <= 6; c++) { const L = 'CDEFG'[c - 2]; set(32, c, `=IFERROR(AVERAGE(${L}2:${L}31),"")`, { b: 1, nf: '0.0', al: 'center' }); }
    }) },
  { id: 'budget', icon: 'M12 3v18M16 7c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 3 4 3 4 1.3 4 3-1.8 3-4 3-4-1.3-4-3', name: () => T('ميزانية شهرية', 'Monthly budget'), desc: () => T('دخل ومصروفات مع الرصيد المتبقي.', 'Income, expenses and balance.'),
    build: () => make(T('الميزانية', 'Budget'), (set, W) => {
      set(0, 0, T('الميزانية الشهرية', 'Monthly budget'), { b: 1, sz: 16 }); W(220, 110, 40, 220, 110);
      set(2, 0, T('الدخل', 'Income'), H); set(2, 1, T('المبلغ', 'Amount'), H); set(2, 3, T('المصروفات', 'Expenses'), H); set(2, 4, T('المبلغ', 'Amount'), H);
      const inc = [T('الراتب', 'Salary'), T('دخل إضافي', 'Extra income'), T('أخرى', 'Other')], exp = [T('الإيجار', 'Rent'), T('الكهرباء والماء', 'Utilities'), T('الطعام', 'Food'), T('المواصلات', 'Transport'), T('الاتصالات', 'Phone & internet'), T('ترفيه', 'Leisure'), T('أخرى', 'Other')];
      for (let i = 0; i < 8; i++) { set(3 + i, 0, inc[i] || '', BD); set(3 + i, 1, null, { ...BD, nf: '#,##0.00' }); set(3 + i, 3, exp[i] || '', BD); set(3 + i, 4, null, { ...BD, nf: '#,##0.00' }); }
      set(11, 0, T('إجمالي الدخل', 'Total income'), { b: 1 }); set(11, 1, '=SUM(B4:B11)', { b: 1, nf: '#,##0.00' }); set(11, 3, T('إجمالي المصروفات', 'Total expenses'), { b: 1 }); set(11, 4, '=SUM(E4:E11)', { b: 1, nf: '#,##0.00' });
      set(13, 0, T('الرصيد المتبقي', 'Balance'), { b: 1, fill: '#e3f1e8' }); set(13, 1, '=B12-E12', { b: 1, fill: '#e3f1e8', nf: '#,##0.00' });
    }) },
  { id: 'invoice', icon: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6', name: () => T('فاتورة', 'Invoice'), desc: () => T('بنود وكميات وأسعار مع الضريبة والإجمالي.', 'Items, quantities, tax and total.'),
    build: () => make(T('فاتورة', 'Invoice'), (set, W) => {
      set(0, 0, T('فاتورة', 'INVOICE'), { b: 1, sz: 20 }); set(1, 0, T('رقم الفاتورة:', 'Invoice #:')); set(2, 0, T('التاريخ:', 'Date:')); set(3, 0, T('العميل:', 'Customer:')); W(260, 80, 110, 120);
      [T('الوصف', 'Description'), T('الكمية', 'Qty'), T('السعر', 'Price'), T('الإجمالي', 'Total')].forEach((h, c) => set(5, c, h, H));
      for (let r = 6; r < 16; r++) { set(r, 0, '', BD); set(r, 1, null, { ...BD, al: 'center' }); set(r, 2, null, { ...BD, nf: '#,##0.00' }); set(r, 3, `=IF(B${r + 1}="","",B${r + 1}*C${r + 1})`, { ...BD, nf: '#,##0.00' }); }
      set(17, 2, T('المجموع', 'Subtotal'), { b: 1 }); set(17, 3, '=SUM(D7:D16)', { nf: '#,##0.00' });
      set(18, 2, T('الضريبة 15%', 'Tax 15%'), { b: 1 }); set(18, 3, '=D18*0.15', { nf: '#,##0.00' });
      set(19, 2, T('الإجمالي', 'Total'), { b: 1, fill: '#e3f1e8' }); set(19, 3, '=D18+D19', { b: 1, fill: '#e3f1e8', nf: '#,##0.00' });
    }) },
  { id: 'attendance', icon: 'M5 12l4 4 10-10', name: () => T('سجل الحضور', 'Attendance'), desc: () => T('حضور وغياب 20 يومًا مع عدّاد الغياب.', '20 days with absence counter.'),
    build: () => make(T('الحضور', 'Attendance'), (set, W, sh) => {
      set(0, 0, T('م', '#'), H); set(0, 1, T('الاسم', 'Name'), H); W(40, 190); for (let d = 1; d <= 20; d++) { set(0, 1 + d, d, H); sh.colW[1 + d] = 34; } set(0, 22, T('غياب', 'Absent'), H); sh.colW[22] = 64;
      for (let r = 1; r <= 30; r++) { set(r, 0, r, { ...BD, al: 'center' }); set(r, 1, '', BD); for (let d = 2; d <= 21; d++) set(r, d, null, { ...BD, al: 'center' }); set(r, 22, `=COUNTIF(C${r + 1}:V${r + 1},"غ")+COUNTIF(C${r + 1}:V${r + 1},"A")`, { ...BD, b: 1, al: 'center' }); }
      set(32, 1, T('اكتب «غ» أو A للغياب', 'Type A for absent'), { color: '#6a7077' });
    }) },
  { id: 'schedule', icon: 'M4 5h16v15H4zM4 10h16M9 5v15M15 5v15', name: () => T('جدول أسبوعي', 'Weekly schedule'), desc: () => T('أيام الأسبوع وحصص اليوم.', 'Days and daily periods.'),
    build: () => make(T('الجدول', 'Schedule'), (set, W) => {
      const days = [T('الأحد', 'Sun'), T('الاثنين', 'Mon'), T('الثلاثاء', 'Tue'), T('الأربعاء', 'Wed'), T('الخميس', 'Thu')]; set(0, 0, '', H); W(110, 120, 120, 120, 120, 120);
      days.forEach((d, i) => set(0, 1 + i, d, H)); for (let p = 1; p <= 7; p++) { set(p, 0, T('الحصة ', 'Period ') + p, { ...H, fill: '#4a8a67' }); for (let c = 1; c <= 5; c++) set(p, c, '', { ...BD, al: 'center' }); }
    }) },
  { id: 'tasks', icon: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2', name: () => T('قائمة مهام', 'To-do list'), desc: () => T('المهمة والمسؤول والموعد والحالة.', 'Task, owner, due date, status.'),
    build: () => make(T('المهام', 'Tasks'), (set, W) => {
      [T('المهمة', 'Task'), T('المسؤول', 'Owner'), T('الموعد', 'Due'), T('الحالة', 'Status')].forEach((h, c) => set(0, c, h, H)); W(260, 140, 110, 110);
      for (let r = 1; r <= 25; r++) for (let c = 0; c < 4; c++) set(r, c, c === 3 ? null : '', BD);
    }) },
];
