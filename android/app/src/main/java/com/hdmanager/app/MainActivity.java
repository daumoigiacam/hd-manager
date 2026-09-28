package com.hdmanager.app;

import android.os.Bundle;
import android.os.Build;
import android.os.SystemClock;
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
    private static final String TAG = "HDManagerMainActivity";
    private static final String RENDERER_RETRY_COUNT = "hd_renderer_retry_count";
    private static final String RENDERER_LAST_EXIT = "hd_renderer_last_exit";
    private static final long RENDERER_RETRY_WINDOW_MS = 60_000L;
    private boolean isForeground;
    private boolean rendererRecoveryPending;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ContactPickerPlugin.class);
        registerPlugin(ExternalLauncherPlugin.class);
        registerPlugin(MicrophonePermissionPlugin.class);
        registerPlugin(WifiInfoPlugin.class);
        registerPlugin(NativeSafeAreaPlugin.class);
        bridgeBuilder.addWebViewListener(new WebViewListener() {
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
    }

    @Override
    public void onResume() {
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
