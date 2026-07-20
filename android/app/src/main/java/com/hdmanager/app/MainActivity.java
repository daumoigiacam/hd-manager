package com.hdmanager.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ContactPickerPlugin.class);
        registerPlugin(ExternalLauncherPlugin.class);
        registerPlugin(MicrophonePermissionPlugin.class);
        registerPlugin(WifiInfoPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
