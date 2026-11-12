package com.hdmanager.app;

import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeSafeArea")
public class NativeSafeAreaPlugin extends Plugin {
    private static org.json.JSONArray copyStartupRows(org.json.JSONArray rows) {
        org.json.JSONArray copy = new org.json.JSONArray();
        synchronized (rows) {
            for (int i = 0; i < rows.length(); i++) copy.put(rows.opt(i));
        }
        return copy;
    }
    @PluginMethod
    public void getStartupSnapshot(PluginCall call) {
        if (!"com.hdmanager.app.localdev".equals(getContext().getPackageName()) && (getContext().getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) == 0) { call.reject("Development startup diagnostics only"); return; }
        JSObject result = new JSObject();
        if (!(getActivity() instanceof MainActivity)) { call.reject("Current startup Activity unavailable"); return; }
        MainActivity activity = (MainActivity) getActivity();
        result.put("processStartMs", android.os.Process.getStartElapsedRealtime());
        result.put("traceId", AndroidStartupTimeline.id());
        result.put("timeline", AndroidStartupTimeline.snapshot());
        if ("com.hdmanager.app.localdev".equals(getContext().getPackageName())) {
            try {
                result.put("selfStatus", new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get("/proc/self/status")), java.nio.charset.StandardCharsets.UTF_8));
                result.put("selfCpuStat", new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get("/proc/self/stat")), java.nio.charset.StandardCharsets.UTF_8));
            } catch (java.io.IOException ignored) { }
        }
        result.put("activityCreateMs", activity.startupCreateMs);
        result.put("nativeFirstFrameMs", activity.startupNativeFrameMs);
        result.put("nativeNowMs", android.os.SystemClock.elapsedRealtime());
          result.put("monotonicNowNs", System.nanoTime());
          result.put("elapsedNowNs", android.os.SystemClock.elapsedRealtimeNanos());
          result.put("events", copyStartupRows(activity.startupEvents));
          result.put("frames", copyStartupRows(activity.startupFrames));
        call.resolve(result);
    }
    @PluginMethod public void recordStartupMilestone(PluginCall call) {
        if (!"com.hdmanager.app.localdev".equals(getContext().getPackageName())) { call.reject("Local startup metadata only"); return; }
        String stage = call.getString("stage", ""), document = call.getString("documentTraceId", "");
        Double at = call.getDouble("at"), origin = call.getDouble("origin");
        if (!stage.matches("(html.initial-script|react.entry|workspace.interactive|home.report-commit|background.auth-start|background.sync-start)") ||
            !document.matches("[a-f0-9-]{36}") || at == null || origin == null || !Double.isFinite(at) || !Double.isFinite(origin)) { call.reject("Invalid startup metadata"); return; }
        AndroidStartupTimeline.js(stage, document, at, origin);
        if (stage.equals("workspace.interactive") || stage.equals("home.report-commit")) {
            android.webkit.WebView view = getBridge().getWebView();
            if (view != null) view.post(() -> view.postVisualStateCallback(0, new android.webkit.WebView.VisualStateCallback() {
                @Override public void onComplete(long requestId) {
                    AndroidStartupTimeline.mark(stage.equals("workspace.interactive") ? "workspace.visual-state" : "home.visual-state");
                }
            }));
        }
        call.resolve();
    }
    @PluginMethod public void inspectLocalEncryptedHeader(PluginCall call) {
        if (!"com.hdmanager.app.localdev".equals(getContext().getPackageName())) { call.reject("Local metadata only"); return; }
        String name = call.getString("database", "");
        if (!name.matches("hd_offline_[a-f0-9]{64}")) { call.reject("Hashed Local database required"); return; }
        try {
            java.io.File file = getContext().getDatabasePath(name + "SQLite.db");
            byte[] header = new byte[16];
            try (java.io.FileInputStream in = new java.io.FileInputStream(file)) { if (in.read(header) != 16) throw new java.io.IOException("Incomplete database header"); }
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(header); StringBuilder hex = new StringBuilder(); for (byte b : digest) hex.append(String.format("%02x", b & 255));
            JSObject result = new JSObject(); result.put("path", file.getAbsolutePath()); result.put("bytes", file.length()); result.put("headerSha256", hex.toString()); result.put("plaintextSqliteHeader", new String(header, java.nio.charset.StandardCharsets.US_ASCII).startsWith("SQLite format 3")); call.resolve(result);
        } catch (Exception error) { call.reject("Local encrypted header inspection failed"); }
    }
    @PluginMethod
    public void setStatusBarDarkIcons(PluginCall call) {
        try {
            boolean darkIcons = Boolean.TRUE.equals(call.getBoolean("darkIcons", true));
            WindowCompat.getInsetsController(getActivity().getWindow(), getActivity().getWindow().getDecorView())
                .setAppearanceLightStatusBars(darkIcons);
            call.resolve();
        } catch (RuntimeException error) {
            call.reject("Unable to update status bar icons", error);
        }
    }

    @PluginMethod
    public void getInsets(PluginCall call) {
        try {
            View decorView = getActivity().getWindow().getDecorView();
            WindowInsetsCompat windowInsets = ViewCompat.getRootWindowInsets(decorView);
            if (windowInsets == null) {
                call.reject("System window insets are not ready");
                return;
            }

            Insets status = windowInsets.getInsets(WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout());
            Insets navigation = windowInsets.getInsets(WindowInsetsCompat.Type.navigationBars());
            float density = getContext().getResources().getDisplayMetrics().density;
            // Capacitor may already inset the WebView on older Android WebViews.
            // CSS must reserve only the part still overlapping its actual bounds.
            View webView = getBridge().getWebView();
            int[] webLocation = new int[2];
            int[] decorLocation = new int[2];
            webView.getLocationInWindow(webLocation);
            decorView.getLocationInWindow(decorLocation);
            int topGap = Math.max(0, webLocation[1] - decorLocation[1]);
            int bottomGap = Math.max(0, decorView.getHeight() - topGap - webView.getHeight());
            int leftGap = Math.max(0, webLocation[0] - decorLocation[0]);
            int rightGap = Math.max(0, decorView.getWidth() - leftGap - webView.getWidth());
            JSObject result = new JSObject();
            result.put("top", Math.ceil(Math.max(0, status.top - topGap) / density));
            result.put("right", Math.ceil(Math.max(0, Math.max(status.right, navigation.right) - rightGap) / density));
            result.put("bottom", Math.ceil(Math.max(0, navigation.bottom - bottomGap) / density));
            result.put("left", Math.ceil(Math.max(0, Math.max(status.left, navigation.left) - leftGap) / density));
            call.resolve(result);
        } catch (RuntimeException error) {
            call.reject("Unable to read system window insets", error);
        }
    }
}
