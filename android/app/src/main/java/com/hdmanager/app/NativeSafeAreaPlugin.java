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
            JSObject result = new JSObject();
            result.put("top", Math.ceil(status.top / density));
            result.put("right", Math.ceil(Math.max(status.right, navigation.right) / density));
            result.put("bottom", Math.ceil(navigation.bottom / density));
            result.put("left", Math.ceil(Math.max(status.left, navigation.left) / density));
            call.resolve(result);
        } catch (RuntimeException error) {
            call.reject("Unable to read system window insets", error);
        }
    }
}
