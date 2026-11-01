package com.jadawel.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** يفتح الملفات من مدير الملفات ويحفظ داخل نفس الملف (مثل Excel) عبر نظام الملفات في Android. */
@CapacitorPlugin(name = "JadawelNative")
public class JadawelNativePlugin extends Plugin {
    private static final List<Uri> PENDING = Collections.synchronizedList(new ArrayList<Uri>());
    private static final String XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    static void collect(Intent i) {
        if (i == null) return;
        String a = i.getAction();
        if (Intent.ACTION_VIEW.equals(a) && i.getData() != null) add(i.getData());
        else if (Intent.ACTION_SEND.equals(a)) {
            Uri u = i.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) add(u);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(a)) {
            ArrayList<Uri> l = i.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (l != null) for (Uri u : l) add(u);
        }
        ClipData cd = i.getClipData();
        if (cd != null) for (int k = 0; k < cd.getItemCount(); k++) { Uri u = cd.getItemAt(k).getUri(); if (u != null) add(u); }
    }

    private static void add(Uri u) { if (!PENDING.contains(u)) PENDING.add(u); }

    private String nameOf(Uri uri) {
        String name = null;
        try (Cursor c = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) name = c.getString(idx);
            }
        } catch (Exception ignored) { }
        if (name == null || name.isEmpty()) { name = uri.getLastPathSegment(); if (name == null) name = "file.xlsx"; }
        return name;
    }

    private byte[] readAll(Uri uri) throws Exception {
        ContentResolver cr = getContext().getContentResolver();
        try (InputStream in = cr.openInputStream(uri)) {
            if (in == null) throw new Exception("cannot open");
            ByteArrayOutputStream out = new ByteArrayOutputStream(Math.max(8192, in.available()));
            byte[] buf = new byte[65536]; int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    private void persist(Uri uri, Intent data) {
        try { getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION); return; } catch (Exception ignored) { }
        try { getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception ignored) { }
    }

    private JSObject describe(Uri uri) throws Exception {
        JSObject o = new JSObject();
        o.put("uri", uri.toString());
        o.put("name", nameOf(uri));
        o.put("data", Base64.encodeToString(readAll(uri), Base64.NO_WRAP));
        return o;
    }

    private void respondFiles(PluginCall call, List<Uri> uris, boolean persist) {
        JSArray files = new JSArray();
        String err = null;
        for (Uri u : uris) {
            try { if (persist) persist(u, null); files.put(describe(u)); } catch (Exception e) { err = nameOf(u) + ": " + e.getMessage(); }
        }
        JSObject res = new JSObject();
        res.put("files", files);
        if (err != null) res.put("error", err);
        call.resolve(res);
    }

    @PluginMethod
    public void takeFiles(PluginCall call) {
        List<Uri> uris;
        synchronized (PENDING) { uris = new ArrayList<>(PENDING); PENDING.clear(); }
        respondFiles(call, uris, true);
    }

    @PluginMethod
    public void pickFiles(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{XLSX, "application/vnd.ms-excel", "application/vnd.ms-excel.sheet.macroEnabled.12", "text/csv", "text/comma-separated-values", "text/tab-separated-values", "text/plain", "application/vnd.oasis.opendocument.spreadsheet", "application/octet-stream"});
        i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, i, "pickResult");
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) { JSObject r = new JSObject(); r.put("files", new JSArray()); call.resolve(r); return; }
        Intent d = result.getData();
        List<Uri> uris = new ArrayList<>();
        if (d.getClipData() != null) for (int k = 0; k < d.getClipData().getItemCount(); k++) uris.add(d.getClipData().getItemAt(k).getUri());
        else if (d.getData() != null) uris.add(d.getData());
        respondFiles(call, uris, true);
    }

    @PluginMethod
    public void readFile(PluginCall call) {
        try { call.resolve(describe(Uri.parse(call.getString("uri")))); } catch (Exception e) { call.reject(e.getMessage()); }
    }

    /** يكتب البيانات كاملة في الذاكرة أولًا ثم يفتح الملف للكتابة، حتى لا يُقطع الملف إذا فشل شيء قبل الكتابة. */
    @PluginMethod
    public void writeFile(PluginCall call) {
        try {
            byte[] bytes = Base64.decode(call.getString("data"), Base64.DEFAULT);
            Uri uri = Uri.parse(call.getString("uri"));
            try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (out == null) throw new Exception("cannot open for writing");
                out.write(bytes); out.flush();
            }
            call.resolve();
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    @PluginMethod
    public void saveAs(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        String mime = call.getString("mime", XLSX);
        i.setType(mime);
        i.putExtra(Intent.EXTRA_TITLE, call.getString("name", "book.xlsx"));
        startActivityForResult(call, i, "saveResult");
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) { call.reject("cancelled"); return; }
        Uri uri = result.getData().getData();
        try {
            String d = call.getString("data");
            if (d != null) {
                byte[] bytes = Base64.decode(d, Base64.DEFAULT);
                try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                    if (out == null) throw new Exception("cannot open for writing");
                    out.write(bytes); out.flush();
                }
            }
            persist(uri, null);
            JSObject r = new JSObject(); r.put("uri", uri.toString()); r.put("name", nameOf(uri));
            call.resolve(r);
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }
}
