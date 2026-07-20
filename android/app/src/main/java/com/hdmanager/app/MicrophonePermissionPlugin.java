package com.hdmanager.app;

import android.Manifest;
import android.content.pm.PackageManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.Locale;

import androidx.core.content.ContextCompat;

@CapacitorPlugin(
    name = "MicrophonePermission",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone")
    }
)
public class MicrophonePermissionPlugin extends Plugin {

    @PluginMethod
    public void getMicrophonePermissionState(PluginCall call) {
        call.resolve(buildPermissionPayload());
    }

    @PluginMethod
    public void requestMicrophonePermission(PluginCall call) {
        if (isMicrophonePermissionGranted()) {
            call.resolve(buildPermissionPayload());
            return;
        }

        requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        call.resolve(buildPermissionPayload());
    }

    private JSObject buildPermissionPayload() {
        JSObject result = new JSObject();
        String microphoneState = "missing";
        boolean granted = isMicrophonePermissionGranted();

        if (isPermissionDeclared("microphone")) {
            PermissionState state = getPermissionState("microphone");
            microphoneState = granted ? "granted" : state.toString().toLowerCase(Locale.ROOT);
        }

        result.put("microphone", microphoneState);
        result.put("granted", granted);
        return result;
    }

    private boolean isMicrophonePermissionGranted() {
        return ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED;
    }
}
