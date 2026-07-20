package com.hdmanager.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ExternalLauncher")
public class ExternalLauncherPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url", "");
        String fallbackUrl = call.getString("fallbackUrl", "");

        if (url == null || url.trim().isEmpty()) {
            call.reject("Thiếu đường dẫn cần mở.");
            return;
        }

        LaunchResult result = launchUrl(url);
        if (!result.opened && fallbackUrl != null && !fallbackUrl.trim().isEmpty()) {
            result = launchUrl(fallbackUrl);
        }

        JSObject payload = new JSObject();
        payload.put("opened", result.opened);
        payload.put("url", result.url);
        payload.put("errorMessage", result.errorMessage);
        call.resolve(payload);
    }

    private LaunchResult launchUrl(String rawUrl) {
        String safeUrl = rawUrl == null ? "" : rawUrl.trim();
        if (safeUrl.isEmpty()) {
            return new LaunchResult(false, safeUrl, "Đường dẫn trống.");
        }

        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(safeUrl));
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            return new LaunchResult(true, safeUrl, "");
        } catch (ActivityNotFoundException error) {
            return new LaunchResult(false, safeUrl, "Thiết bị chưa có ứng dụng hỗ trợ đường dẫn này.");
        } catch (Exception error) {
            return new LaunchResult(false, safeUrl, error.getMessage());
        }
    }

    private static class LaunchResult {
        final boolean opened;
        final String url;
        final String errorMessage;

        LaunchResult(boolean opened, String url, String errorMessage) {
            this.opened = opened;
            this.url = url;
            this.errorMessage = errorMessage == null ? "" : errorMessage;
        }
    }
}
