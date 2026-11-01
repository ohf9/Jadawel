// الإعدادات واللغة: العربية (الأصل) والإنجليزية
const KEY = 'jadawel-settings';
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
export const settings = Object.assign({ lang: 'ar', newRtl: true }, load());
export function saveSettings(patch) { Object.assign(settings, patch); try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* التخزين غير متاح */ } }
export let lang = settings.lang;
export function setLang(l) { lang = l; settings.lang = l; document.documentElement.lang = l; document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr'; }

const EN = {
  'جداول': 'Jadawel', 'الملفات المفتوحة': 'Open files', 'الإعدادات': 'Settings',
  'مصنف جديد (Ctrl+N)': 'New workbook (Ctrl+N)', 'جديد': 'New', 'فتح ملف أو أكثر (Ctrl+O)': 'Open one or more files (Ctrl+O)', 'فتح': 'Open',
  'حفظ في نفس الملف (Ctrl+S)': 'Save to the same file (Ctrl+S)', 'حفظ': 'Save', 'حفظ نسخة باسم آخر (F12)': 'Save a copy as… (F12)', 'حفظ باسم': 'Save as',
  'ملف': 'File', 'لصق (Ctrl+V)': 'Paste (Ctrl+V)', 'لصق': 'Paste', 'قص (Ctrl+X)': 'Cut (Ctrl+X)', 'قص': 'Cut', 'نسخ (Ctrl+C)': 'Copy (Ctrl+C)', 'نسخ': 'Copy',
  'تراجع (Ctrl+Z)': 'Undo (Ctrl+Z)', 'تراجع': 'Undo', 'إعادة (Ctrl+Y)': 'Redo (Ctrl+Y)', 'إعادة': 'Redo', 'الحافظة والتحرير': 'Clipboard & editing',
  'غامق (Ctrl+B)': 'Bold (Ctrl+B)', 'مائل (Ctrl+I)': 'Italic (Ctrl+I)', 'تسطير (Ctrl+U)': 'Underline (Ctrl+U)', 'لون الخط': 'Font color', 'لون التعبئة': 'Fill color', 'بدون تعبئة': 'No fill', 'الخط': 'Font',
  'محاذاة لليسار': 'Align left', 'توسيط': 'Center', 'محاذاة لليمين': 'Align right', 'المحاذاة': 'Alignment',
  'تنسيق الأرقام': 'Number format', 'تقليل الخانات العشرية': 'Decrease decimals', 'زيادة الخانات العشرية': 'Increase decimals', 'الأرقام': 'Number',
  'ملف واحد': 'Single pane',
  'الرئيسية': 'Home', 'عرض': 'View', 'جمع تلقائي': 'AutoSum', 'جمع تلقائي (Alt+=)': 'AutoSum (Alt+=)', 'التفاف': 'Wrap', 'التفاف النص': 'Wrap text', 'خطوط الشبكة': 'Gridlines', 'إظهار خطوط الشبكة': 'Show gridlines', 'اتجاه الورقة': 'Sheet direction',
  'مشاركة': 'Share', 'طباعة': 'Print', 'تصدير': 'Export', 'هذا الجهاز': 'This device', 'التنزيلات': 'Downloads', 'رجوع': 'Back', 'مسح المحتوى (Delete)': 'Clear contents (Delete)', 'حفظ (Ctrl+S)': 'Save (Ctrl+S)',
  'مصنف فارغ': 'Blank workbook', 'ابدأ بجدول جديد.': 'Start with a new spreadsheet.', '📱 هذا الجهاز': '📱 This device', 'ملفات التخزين الداخلي والتنزيلات والمستندات وبطاقة SD.': 'Internal storage, Downloads, Documents and the SD card.',
  '☁ OneDrive وGoogle Drive': '☁ OneDrive and Google Drive', 'تظهر في نافذة اختيار الملفات (القائمة الجانبية) إن كان تطبيقها مثبتًا. يُفتح الملف من مكانه ويُحفظ فيه.': 'They appear in the file picker (side menu) if their app is installed. The file opens from its place and saves back to it.',
  'الأخيرة': 'Recent', '📗 مصنف Excel (XLSX)': '📗 Excel workbook (XLSX)', 'اختر المكان من نافذة النظام: الجهاز أو OneDrive أو Google Drive أو بطاقة SD.': 'Choose the place in the system picker: device, OneDrive, Google Drive or SD card.', '📄 CSV': '📄 CSV', 'القيم فقط للورقة الحالية.': 'Values only, current sheet.',
  '📗 إرسال نسخة Excel': '📗 Send an Excel copy', 'يفتح قائمة المشاركة في الجهاز: OneDrive وGoogle Drive والبريد وواتساب وغيرها.': 'Opens the device share sheet: OneDrive, Google Drive, email, WhatsApp and more.', '📄 إرسال نسخة CSV': '📄 Send a CSV copy', '🖨 إرسال PDF': '🖨 Send as PDF', 'اختر «حفظ كملف PDF» من نافذة الطباعة ثم شاركه.': 'Choose “Save as PDF” in the print window, then share it.',
  '📕 إنشاء PDF': '📕 Create PDF', 'يفتح نافذة الطباعة، اختر منها «حفظ كملف PDF».': 'Opens the print window; choose “Save as PDF”.', '📗 تصدير كـ XLSX': '📗 Export as XLSX', 'حفظ نسخة جديدة بصيغة Excel.': 'Save a new copy in Excel format.', '📄 تصدير كـ CSV': '📄 Export as CSV',
  'لا توجد ملفات أخيرة بعد. الملفات التي تفتحها أو تحفظها من الجهاز تظهر هنا.': 'No recent files yet. Files you open or save from the device appear here.', 'مسح القائمة': 'Clear list', 'إزالة من القائمة': 'Remove from list',
  'لا توجد أرقام متصلة لجمعها': 'No adjacent numbers to sum', 'المشاركة غير متاحة هنا، فحُفظت نسخة من الملف': 'Sharing is not available here, so a copy of the file was saved', 'تعذرت المشاركة: ': 'Could not share: ',
   'اعرض في هذه اللوحة': 'Show in this pane', 'فتح ملف آخر في هذه اللوحة…': 'Open another file in this pane…', 'مصنف جديد في هذه اللوحة': 'New workbook in this pane', '⚠ دوال غير مدعومة: ': '⚠ Unsupported functions: ', 'هذه الدوال لا يحسبها التطبيق بعد، فتبقى قيمها كما حُفظت في الملف، وExcel يعيد حسابها عند فتح الملف.': 'The app cannot calculate these functions yet, so their values stay as saved in the file; Excel recalculates them when you open the file.', 'مسح': 'Clear', 'تعبئة': 'Fill', 'تحرير': 'Edit', 'مدّ التحديد': 'Extend selection', 'اللغة والاتجاه': 'Language & direction', 'المظهر': 'Appearance', '☀ فاتح': '☀ Light', '🌙 داكن': '🌙 Dark', '⚙ حسب الجهاز': '⚙ Follow device', 'الوضع الداكن يشمل': 'Dark mode applies to', 'الشيت كله': 'The whole sheet', 'القوائم والواجهة فقط': 'Menus and interface only',
  '«القوائم والواجهة فقط» تُبقي ورقة العمل بيضاء كما في الورق، والباقي داكن.': '“Menus and interface only” keeps the worksheet white like paper while everything else is dark.',
  'التحديد والنسخ': 'Selection & copy', 'مقابض التحديد (دوائر الزوايا وشريط التعبئة)': 'Selection handles (corner circles and fill bar)', 'شريط النسخ واللصق العائم (ضغطة مطولة أو لمسة على التحديد)': 'Floating copy/paste bar (long-press or tap the selection)',
  'أطفئ الشريط العائم إن كان يزعجك على الهاتف؛ تبقى القائمة بالنقر الأيمن واختصارات لوحة المفاتيح.': 'Turn the floating bar off if it bothers you on a phone; the right-click menu and keyboard shortcuts remain.', 'تتغير الإعدادات فورًا، وتبقى ملفاتك وتعديلاتك كما هي.': 'Settings apply immediately. Your files and edits are kept.', 'نوع الخط': 'Font', 'حجم الخط': 'Font size', 'تكبير الخط': 'Increase font size', 'تصغير الخط': 'Decrease font size', 'ألوان الخط': 'Font colors', 'ألوان التعبئة': 'Fill colors',
  'خطوط عربية': 'Arabic fonts', 'خطوط إنجليزية': 'English fonts', 'الخط الافتراضي': 'Default font', 'تلقائي': 'Automatic', 'ألوان السمة': 'Theme colors', 'ألوان قياسية': 'Standard colors', 'الأخيرة': 'Recent', 'ألوان إضافية…': 'More colors…', 'لوحة واحدة': 'One pane', 'لوحتان جنبًا إلى جنب': 'Two panes side by side', 'جنبًا إلى جنب': 'Side by side', 'لوحتان فوق بعض': 'Two panes stacked', 'فوق بعض': 'Stacked',
  'اعرض الملف الحالي في لوحتين لتتحكم بورقتين منه معًا': 'Show the current file in both panes to work on two sheets at once', 'ورقتان معًا': 'Two sheets',
  'افتح نافذة مستقلة جديدة من التطبيق': 'Open a new independent app window', 'نافذة جديدة': 'New window', 'العرض': 'View',
  'الإعدادات ': 'Settings', 'لغة الواجهة': 'Interface language', 'اتجاه الأوراق الجديدة': 'Direction of new sheets', 'من اليمين إلى اليسار': 'Right to left', 'من اليسار إلى اليمين': 'Left to right',
  'تتغير اللغة فورًا، وتبقى ملفاتك وتعديلاتك كما هي.': 'The language changes immediately. Your files and edits are kept.', 'إلغاء': 'Cancel',
  // الأعداد
  'عام': 'General', 'رقم': 'Number', 'رقم بخانتين': 'Number, 2 decimals', 'آلاف': 'Thousands', 'آلاف بخانتين': 'Thousands, 2 decimals', 'نسبة %': 'Percent', 'نسبة بخانتين': 'Percent, 2 decimals',
  'دولار': 'US dollar', 'ريال سعودي': 'Saudi riyal', 'تاريخ': 'Date', 'تاريخ يوم/شهر/سنة': 'Date (day/month/year)', 'وقت': 'Time', 'نص': 'Text', 'مخصص': 'Custom',
  // الحوارات والرسائل
  'اسحب لتغيير حجم اللوحتين': 'Drag to resize the panes', 'إغلاق': 'Close', 'غير محفوظ': 'Unsaved', 'إغلاق الملف': 'Close file', 'حفظ ثم إغلاق': 'Save and close', 'إغلاق دون حفظ': 'Close without saving',
  'لا يوجد ما يُعاد': 'Nothing to redo', 'لا يوجد ما يُتراجع عنه': 'Nothing to undo', 'الورقة المرتبطة بهذا التعديل حُذفت': 'The sheet for this change was deleted', 'الحافظة فارغة': 'Clipboard is empty',
  'افتح ملفًا أولًا': 'Open a file first', 'اللوحتان تعرضان ورقتين من نفس الملف، وأي تعديل يظهر في الاثنتين': 'Both panes show two sheets of this file. Edits appear in both.',
  'اللوحتان تعرضان نفس الورقة. أضف ورقة جديدة لتتحكم بورقتين': 'Both panes show the same sheet. Add a sheet to work on two.', 'لا توجد بيانات مجاورة لتحديد نهاية التعبئة': 'No adjacent data to decide where to stop filling',
  'النطاق كبير جدًا للتنسيق دفعة واحدة. حدد نطاقًا أصغر.': 'The range is too large to format at once. Select a smaller range.',
  'ورقة': 'Sheet', 'إعادة تسمية الورقة': 'Rename sheet', 'اسم غير صالح (حتى 31 حرفًا، بدون \\ / ? * [ ] :)': 'Invalid name (up to 31 characters, none of \\ / ? * [ ] :)', 'يوجد ورقة بهذا الاسم': 'A sheet with this name already exists',
  'إعادة تسمية': 'Rename', 'حذف الورقة': 'Delete sheet', 'لا يمكن حذف الورقة الوحيدة': 'The only sheet cannot be deleted', 'حذف': 'Delete', 'موافق': 'OK',
  'جداول بيانات': 'Spreadsheets', 'تعذر الفتح: ': 'Could not open: ', 'تعذر فتح الملف: ': 'Could not open the file: ', 'تعذر استقبال الملفات المشاركة: ': 'Could not receive shared files: ',
  'فُتح الملف بالقراءة المبسطة (تنسيقه معقد). سيُحفظ عملك كنسخة جديدة.': 'The file was opened in simple mode (complex formatting). Your work will be saved as a new copy.',
  'ملاحظة: وحدات الماكرو في ملفات XLSM لا تُحفظ. سيُحفظ الملف بصيغة XLSX.': 'Note: macros in XLSM files are not kept. The file will be saved as XLSX.',
  'اختر صيغة النسخة الجديدة. الملف الأصلي لن يتغير.': 'Choose the format of the new copy. The original file will not change.', 'CSV (الورقة الحالية فقط)': 'CSV (current sheet only)',
  'الحفظ بصيغة CSV': 'Save as CSV', 'صيغة CSV تحفظ القيم فقط للورقة الظاهرة. التنسيقات والصيغ والأوراق الأخرى لن تُحفظ فيها.': 'CSV keeps only the values of the visible sheet. Formatting, formulas and other sheets are not saved.', 'متابعة': 'Continue',
  'رسوم بيانية': 'charts', 'جداول محورية': 'pivot tables', 'شرائح تصفية': 'slicers', 'وحدات ماكرو': 'macros', 'بعض التنسيقات': 'some formatting',
  'تنبيه قبل الحفظ': 'Before saving', 'حفظ كنسخة جديدة': 'Save as a new copy', 'استبدال الملف الأصلي؟': 'Save into the original file?', 'حفظ في نفس الملف': 'Save to the same file',
  'لم يُمنح إذن الكتابة': 'Write permission was not granted', 'تم الحفظ في الملف': 'Saved to file', 'تعذر الحفظ في الملف الأصلي': 'Could not save to the original file',
  'لا يسمح النظام بالكتابة في هذا الملف. ملفك الأصلي لم يتغير. اختر مكانًا لحفظ نسخة تحمل تعديلاتك.': 'The system does not allow writing to this file. Your original file is unchanged. Choose where to save a copy with your edits.',
  'اختيار مكان الحفظ': 'Choose where to save', 'تم الحفظ باسم': 'Saved as', 'تم حفظ الملف': 'File saved', 'فشل الحفظ — بياناتك ما زالت محفوظة تلقائيًا: ': 'Save failed. Your data is still autosaved: ',
  'حُفظ في المستندات/Jadawel: ': 'Saved to Documents/Jadawel: ', 'حُفظ تلقائيًا ': 'Autosaved ', '⚠ تعذر الحفظ التلقائي': '⚠ Autosave failed', 'تعذرت استعادة الجلسة السابقة: ': 'Could not restore the previous session: ',
  'تم حفظ الإعدادات': 'Settings saved', 'اسمح بالنوافذ المنبثقة، أو افتح التطبيق مرة ثانية من أيقونته': 'Allow pop-ups, or open the app again from its icon', 'مرجع غير صالح': 'Invalid reference',
  'توجد تعديلات غير محفوظة (محفوظة تلقائيًا للاستعادة)': 'Unsaved changes (autosaved for recovery)', 'لا توجد تعديلات غير محفوظة': 'No unsaved changes',
  '⚠ الصيغ لا يُعاد حسابها بعد': '⚠ Formulas are not recalculated yet', 'محرك حساب الصيغ يأتي في المرحلة 3. القيم المعروضة للصيغ هي آخر قيم محسوبة في الملف، وExcel يعيد حسابها تلقائيًا عند فتح الملف المحفوظ.': 'The formula engine comes in phase 3. Formula cells show the last values stored in the file, and Excel recalculates them when you open the saved file.',
  'اتجاه الورقة (يمين لليسار / يسار لليمين)': 'Sheet direction (right-to-left / left-to-right)', '⇄ اتجاه الورقة': '⇄ Sheet direction', 'مرجع الخلية': 'Cell reference', 'شريط الصيغة': 'Formula bar', 'تحديد الكل': 'Select all',
  'اسحب للتعبئة (نقرتان للتعبئة لأسفل)': 'Drag to fill (double-click to fill down)', 'الشبكة': 'Grid', '＋ مصنف جديد': '＋ New workbook', '📂 فتح ملف': '📂 Open file', 'أو اختر ملفًا مفتوحًا من التبويبات بالأعلى': 'Or pick an open file from the tabs above',
  'ورقة جديدة': 'New sheet', '+ ورقة': '+ Sheet', 'مصنف': 'Book',
};
const PAT = [
  [/^يوجد في «(.*)» تعديلات غير محفوظة\.$/s, (m) => `“${m[1]}” has unsaved changes.`],
  [/^(قص|نسخ) (\d+)×(\d+) — الصق في أي ملف مفتوح$/, (m) => `${m[1] === 'قص' ? 'Cut' : 'Copied'} ${m[2]}×${m[3]}. Paste into any open file.`],
  [/^نسخ (\d+)×(\d+) خلية — أفلِت في أي ملف$/, (m) => `Copy ${m[1]}×${m[2]} cells. Drop into any file.`],
  [/^تم نسخ البيانات إلى «(.*)» عند (.*)$/s, (m) => `Data copied to “${m[1]}” at ${m[2]}`],
  [/^الورقة «(.*)»$/s, (m) => `Sheet “${m[1]}”`],
  [/^سيتم حذف «(.*)» وكل بياناتها\. لا يمكن التراجع عن هذا الإجراء\.$/s, (m) => `“${m[1]}” and all its data will be deleted. This cannot be undone.`],
  [/^تم فتح (.*)\. سيُحفظ عملك كملف XLSX جديد، والملف الأصلي لن يتغير\.$/s, (m) => `Opened ${m[1]}. Your work will be saved as a new XLSX file; the original will not change.`],
  [/^تعذر فتح «(.*)»: (.*)$/s, (m) => `Could not open “${m[1]}”: ${m[2]}`],
  [/^نوع الملف «(.*)» غير مدعوم\.$/s, (m) => `File type “${m[1]}” is not supported.`],
  [/^هذا الملف يحتوي على: (.*)\. هذه العناصر لا يحتفظ بها التطبيق عند الحفظ، لذلك سيُحفظ عملك كنسخة جديدة ويبقى ملفك الأصلي كما هو\.$/s, (m) => `This file contains: ${m[1]}. The app cannot keep these when saving, so your work will be saved as a new copy and your original file stays as it is.`],
  [/^سيتم حفظ التعديلات داخل الملف «(.*)» نفسه، مثل Excel\.$/s, (m) => `Your changes will be saved inside “${m[1]}” itself, like Excel.`],
  [/^تمت استعادة (\d+) ملف(?:، منها (\d+) بتعديلات غير محفوظة)?$/, (m) => `Restored ${m[1]} file(s)${m[2] ? `, ${m[2]} with unsaved changes` : ''}`],
  [/^المتوسط: (.*)   العدد: (.*)   المجموع: (.*)$/s, (m) => `Average: ${m[1]}   Count: ${m[2]}   Sum: ${m[3]}`],
  [/^العدد: (.*)$/s, (m) => `Count: ${m[1]}`],
  [/^اللوحة (\d+) فارغة$/, (m) => `Pane ${m[1]} is empty`],
  [/^ (نافذة (\d+)\))$/, (m) => ` (Window ${m[2]})`],
  [/^(.*) - نسخة\.(.*)$/s, (m) => `${m[1]} - copy.${m[2]}`],
  [/^،$/, () => ', '],
];
export function tr(s) {
  if (lang === 'ar' || s == null || typeof s !== 'string') return s;
  const t = s.trim();
  if (EN[t] !== undefined) return s.replace(t, EN[t]);
  for (const [re, f] of PAT) { const m = re.exec(t); if (m) return s.replace(t, f(m)); }
  return s;
}
// ترجمة عناصر الصفحة الثابتة (النصوص والتلميحات). تحفظ النص العربي الأصلي ليمكن التبديل في أي وقت دون إعادة تحميل
const ORIG = new WeakMap(); // عقدة نص -> الأصل العربي
const ATTRS = ['title', 'aria-label', 'placeholder'];
export function translateDom(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
  for (const n of nodes) {
    let o = ORIG.get(n);
    if (o !== undefined && n.nodeValue !== o.shown) { o = undefined; ORIG.delete(n); } // تغيّر النص برمجيًا: اعتبره أصلًا جديدًا
    const base = o ? o.ar : n.nodeValue;
    const t = base.trim();
    if (!t || !(EN[t] !== undefined || PAT.some(([re]) => re.test(t)))) continue;
    const shown = lang === 'ar' ? base : tr(base);
    if (shown !== n.nodeValue) n.nodeValue = shown;
    ORIG.set(n, { ar: base, shown });
  }
  root.querySelectorAll('[title],[aria-label],[placeholder]').forEach((el) => ATTRS.forEach((a) => {
    const v = el.getAttribute(a); if (!v) return;
    const k = 'data-ar-' + a; let ar = el.getAttribute(k);
    if (ar === null || el.getAttribute('data-sh-' + a) !== v) { ar = v; el.setAttribute(k, v); }
    const shown = lang === 'ar' ? ar : tr(ar);
    el.setAttribute(a, shown); el.setAttribute('data-sh-' + a, shown);
  }));
}
if (lang !== 'ar') { document.documentElement.lang = 'en'; document.documentElement.dir = 'ltr'; }
