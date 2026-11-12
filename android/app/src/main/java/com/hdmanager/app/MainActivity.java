package com.hdmanager.app;

import android.os.Bundle;
import android.os.Build;
import android.os.SystemClock;
import android.os.Handler;
import android.os.HandlerThread;
import android.view.FrameMetrics;
import org.json.JSONArray;
import org.json.JSONObject;
import android.graphics.Color;
import android.util.Log;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.view.Window;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    public long startupCreateMs;
    public long startupNativeFrameMs;
    public final JSONArray startupEvents = new JSONArray();
    public final JSONArray startupFrames = new JSONArray();
    private HandlerThread startupFrameThread;
    private Window.OnFrameMetricsAvailableListener startupFrameListener;
    private void startupEvent(String stage) {
        if (!"com.hdmanager.app.localdev".equals(getPackageName()) && (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) == 0) return;
        AndroidStartupTimeline.mark(stage);
        try {
            JSONObject row = new JSONObject();
            row.put("stage", stage); row.put("elapsedNs", SystemClock.elapsedRealtimeNanos()); row.put("monotonicNs", System.nanoTime());
            synchronized (startupEvents) { if (startupEvents.length() < 128) startupEvents.put(row); }
            Log.i("HDStartupPhase", row.toString());
        } catch (org.json.JSONException ignored) { }
    }
    @Override public void setContentView(int layoutResID) {
        startupEvent("webview.layout-inflation.begin");
        super.setContentView(layoutResID);
        startupEvent("webview.layout-inflation.end");
    }
    @Override protected void load() {
        startupEvent("capacitor.bridge-initialization.begin");
        super.load();
        startupEvent("capacitor.bridge-initialization.end");
    }
    private static final String TAG = "HDManagerMainActivity";
    private boolean isLocalInstantWindow() {
        return "com.hdmanager.app.localdev".equals(getPackageName());
    }
    private static final String RENDERER_RETRY_COUNT = "hd_renderer_retry_count";
    private static final String RENDERER_LAST_EXIT = "hd_renderer_last_exit";
    private static final long RENDERER_RETRY_WINDOW_MS = 60_000L;
    private boolean isForeground;
    private boolean rendererRecoveryPending;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        startupEvent("activity.creation.begin");
        if (isLocalInstantWindow()) {
            getWindow().setWindowAnimations(0);
            overridePendingTransition(0, 0);
        }
        if (("com.hdmanager.app.localdev".equals(getPackageName()) || (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0)) {
            startupCreateMs = SystemClock.elapsedRealtime();
            Log.i("HDStartup", "processStartMs=" + android.os.Process.getStartElapsedRealtime() + " activityCreateMs=" + startupCreateMs);
        }
        registerPlugin(ContactPickerPlugin.class);
        registerPlugin(ExternalLauncherPlugin.class);
        registerPlugin(MicrophonePermissionPlugin.class);
        registerPlugin(WifiInfoPlugin.class);
        registerPlugin(NativeSafeAreaPlugin.class);
        registerPlugin(ScopedBackupWriterPlugin.class);
        bridgeBuilder.addWebViewListener(new WebViewListener() {
            @Override public void onPageStarted(WebView view) { startupEvent("webview.page-started"); }
            @Override public void onPageLoaded(WebView view) { startupEvent("webview.page-loaded"); }
            @Override public void onPageCommitVisible(WebView view, String url) {
                startupEvent("webview.page-commit-visible");
                if (("com.hdmanager.app.localdev".equals(getPackageName()) || (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0))
                    view.postVisualStateCallback(1, new WebView.VisualStateCallback() {
                        @Override public void onComplete(long requestId) { startupEvent("webview.visual-state-checkpoint"); }
                    });
            }
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                Log.e(TAG, detail.didCrash() ? "WebView renderer crashed" : "WebView renderer was killed by Android");
                ViewParent parent = view.getParent();
                if (parent instanceof ViewGroup) {
                    ((ViewGroup) parent).removeView(view);
                }
                view.destroy();
                rendererRecoveryPending = true;
                if (isForeground) scheduleRendererRecovery();
                return true;
            }
        });
        super.onCreate(savedInstanceState);
        if ("com.hdmanager.app.localdev".equals(getPackageName())) WebView.setWebContentsDebuggingEnabled(true);
        startupEvent("activity.super-create.end");
        if (("com.hdmanager.app.localdev".equals(getPackageName()) || (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0)
                && getIntent().getBooleanExtra("hd_startup_native_trace", false)) {
            startupFrameThread = new HandlerThread("HDStartupFrames"); startupFrameThread.start();
            startupFrameListener = (window, frame, dropped) -> {
                try {
                    JSONObject row = new JSONObject();
                    row.put("observedElapsedNs", SystemClock.elapsedRealtimeNanos());
                    row.put("intendedVsyncNs", frame.getMetric(FrameMetrics.INTENDED_VSYNC_TIMESTAMP));
                    row.put("vsyncNs", frame.getMetric(FrameMetrics.VSYNC_TIMESTAMP));
                    row.put("totalNs", frame.getMetric(FrameMetrics.TOTAL_DURATION));
                    row.put("layoutNs", frame.getMetric(FrameMetrics.LAYOUT_MEASURE_DURATION));
                    row.put("drawNs", frame.getMetric(FrameMetrics.DRAW_DURATION));
                    row.put("syncNs", frame.getMetric(FrameMetrics.SYNC_DURATION));
                    row.put("commandIssueNs", frame.getMetric(FrameMetrics.COMMAND_ISSUE_DURATION));
                    row.put("swapNs", frame.getMetric(FrameMetrics.SWAP_BUFFERS_DURATION));
                    row.put("droppedReports", dropped);
                    synchronized (startupFrames) { if (startupFrames.length() < 1024) startupFrames.put(row); }
                } catch (org.json.JSONException ignored) { }
            };
            getWindow().addOnFrameMetricsAvailableListener(startupFrameListener, new Handler(startupFrameThread.getLooper()));
        }
        if (("com.hdmanager.app.localdev".equals(getPackageName()) || (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0)
                && getIntent().getBooleanExtra("hd_startup_native_trace", false)) {
            try {
                getBridge().registerPlugin(Class.forName("com.hdmanager.app.StartupBiometricTracePlugin").asSubclass(com.getcapacitor.Plugin.class));
            } catch (ClassNotFoundException error) { Log.w("HDStartup", "Optional native tracing unavailable"); }
        }
        if (("com.hdmanager.app.localdev".equals(getPackageName()) || (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0)) getWindow().getDecorView().post(() -> android.view.Choreographer.getInstance().postFrameCallback(time -> {
            startupNativeFrameMs = SystemClock.elapsedRealtime();
            Log.i("HDStartup", "nativeFirstFrameMs=" + startupNativeFrameMs);
        }));

        try {
            Window window = getWindow();
            WindowCompat.setDecorFitsSystemWindows(window, false);
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                window.setNavigationBarContrastEnforced(false);
            }
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
            controller.setAppearanceLightStatusBars(true);
            controller.setAppearanceLightNavigationBars(true);
            window.getDecorView().setBackgroundColor(Color.WHITE);
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().setBackgroundColor(Color.WHITE);
            }
        } catch (RuntimeException error) {
            Log.w(TAG, "Unable to apply optional system bar styling", error);
        }
        startupEvent("activity.creation.end");
    }

    @Override public void onDestroy() {
        if (startupFrameListener != null) {
            getWindow().removeOnFrameMetricsAvailableListener(startupFrameListener);
            startupFrameListener = null;
        }
        if (startupFrameThread != null) startupFrameThread.quitSafely();
        super.onDestroy();
    }

    @Override
    public void onResume() {
        if (isLocalInstantWindow()) {
            getWindow().setWindowAnimations(0);
            overridePendingTransition(0, 0);
        }
        super.onResume();
        isForeground = true;
        if (rendererRecoveryPending) scheduleRendererRecovery();
    }

    @Override
    public void onPause() {
        isForeground = false;
        super.onPause();
    }

    private void scheduleRendererRecovery() {
        rendererRecoveryPending = false;
        getWindow().getDecorView().postDelayed(() -> {
            if (isFinishing() || isDestroyed()) return;
            if (!isForeground) {
                rendererRecoveryPending = true;
                return;
            }

            long now = SystemClock.elapsedRealtime();
            long lastExit = getIntent().getLongExtra(RENDERER_LAST_EXIT, 0L);
            int retryCount = now - lastExit < RENDERER_RETRY_WINDOW_MS
                ? getIntent().getIntExtra(RENDERER_RETRY_COUNT, 0)
                : 0;
            if (retryCount >= 1) {
                showRendererRecoveryScreen();
                return;
            }

            getIntent().putExtra(RENDERER_RETRY_COUNT, retryCount + 1);
            getIntent().putExtra(RENDERER_LAST_EXIT, now);
            recreate();
        }, 500);
    }

    private void showRendererRecoveryScreen() {
        FrameLayout root = findViewById(android.R.id.content);
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setBackgroundColor(Color.WHITE);
        int padding = Math.round(32 * getResources().getDisplayMetrics().density);
        panel.setPadding(padding, padding, padding, padding);

        TextView message = new TextView(this);
        message.setText("Ứng dụng cần tải lại sau khi Android giải phóng bộ nhớ.");
        message.setTextColor(Color.BLACK);
        message.setTextSize(18);
        message.setGravity(Gravity.CENTER);
        panel.addView(message);

        Button retry = new Button(this);
        retry.setText("Thử lại");
        retry.setOnClickListener(view -> {
            getIntent().removeExtra(RENDERER_RETRY_COUNT);
            getIntent().removeExtra(RENDERER_LAST_EXIT);
            recreate();
        });
        panel.addView(retry);
        root.addView(panel, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));
    }
}
