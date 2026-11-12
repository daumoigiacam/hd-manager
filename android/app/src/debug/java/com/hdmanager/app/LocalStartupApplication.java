package com.hdmanager.app;

import android.app.Application;
import android.content.Context;

public final class LocalStartupApplication extends Application {
    @Override protected void attachBaseContext(Context base) {
        super.attachBaseContext(base);
        AndroidStartupTimeline.enable(this);
        AndroidStartupTimeline.mark("application.attach-base-context");
        // Native provider warmup was measured slower over 30 matched samples.
        // Keep only lifecycle instrumentation; WebView follows the normal owner.
    }
    @Override public void onCreate() {
        AndroidStartupTimeline.mark("application.on-create.begin");
        super.onCreate();
        AndroidStartupTimeline.mark("application.on-create.end");
    }
}
