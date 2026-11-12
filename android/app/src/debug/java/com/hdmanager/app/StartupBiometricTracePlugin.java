package com.hdmanager.app;

import android.os.SystemClock;
import android.util.Log;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import ee.forgr.biometric.NativeBiometric;

// Explicit diagnostic Intent only. Never selected by normal benchmark or login.
// No keys, values, grant claims or credentials are logged.
@CapacitorPlugin(name = "NativeBiometric")
public class StartupBiometricTracePlugin extends NativeBiometric {
    @Override @PluginMethod public void getData(PluginCall call) {
        long start = SystemClock.elapsedRealtimeNanos();
        try { super.getData(call); }
        finally { Log.i("HDStartupNative", "getData startNs=" + start + " endNs=" + SystemClock.elapsedRealtimeNanos()); }
    }
    @Override @PluginMethod public void setData(PluginCall call) {
        long start = SystemClock.elapsedRealtimeNanos();
        try { super.setData(call); }
        finally { Log.i("HDStartupNative", "setData startNs=" + start + " endNs=" + SystemClock.elapsedRealtimeNanos()); }
    }
}
