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
