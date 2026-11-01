// عامل الخدمة: يعمل التطبيق دون اتصال + يستقبل الملفات المشاركة من Android
const V = 'jadawel-v9';
const SHELL = ['./', 'index.html', 'app.css', 'fonts/fonts.css', 'js/ui.js', 'js/calc.js', 'vendor/formula-parser.min.js', 'vendor/xlsx.full.min.js', 'js/theme.js', 'js/recents.js', 'js/fonts.js', 'js/i18n.js', 'js/fill.js', 'js/native.js', 'manifest.webmanifest', 'vendor/exceljs.min.js', 'js/app.js', 'js/tools.js', 'js/kbd.js', 'js/charts.js', 'js/chartui.js', 'js/zip.js', 'js/freeze.js', 'js/cf.js', 'js/i18n-more.js', 'js/fnlib.js', 'js/pane.js', 'js/io.js', 'js/store.js', 'js/util.js', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V && k !== 'jadawel-share').map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/share')) {
    e.respondWith((async () => {
      const form = await e.request.formData(); const c = await caches.open('jadawel-share');
      let i = 0;
      for (const f of form.getAll('files')) { if (f && f.name) await c.put(new Request('shared/' + (i++)), new Response(f, { headers: { 'x-name': encodeURIComponent(f.name) } })); }
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // الشبكة أولًا (للحصول على التحديثات)، ثم النسخة المخزنة عند انقطاع الاتصال
  e.respondWith(fetch(e.request).then((res) => { const cp = res.clone(); caches.open(V).then((c) => c.put(e.request, cp)); return res; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
