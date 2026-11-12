package com.hdmanager.app;

import android.content.Context;
import android.os.SystemClock;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.UUID;

/** Bounded, Local-only metadata. No identity, document, credential or payload. */
public final class AndroidStartupTimeline {
    private static boolean enabled;
    private static String traceId;
    private static final JSONArray events = new JSONArray();
    public static synchronized void enable(Context context) {
        if (!"com.hdmanager.app.localdev".equals(context.getPackageName())) return;
        if (!enabled) { traceId = UUID.randomUUID().toString(); enabled = true; mark("process.start", android.os.Process.getStartElapsedRealtime() * 1000000L); }
    }
    public static void mark(String stage) { mark(stage, SystemClock.elapsedRealtimeNanos()); }
    private static synchronized void mark(String stage, long at) {
        if (!enabled || events.length() >= 256) return;
        try { JSONObject row = new JSONObject(); row.put("traceId", traceId); row.put("stage", stage); row.put("elapsedNs", at); row.put("threadId", android.os.Process.myTid()); events.put(row); } catch (org.json.JSONException ignored) { }
    }
    public static synchronized void js(String stage, String documentTraceId, double at, double origin) {
        if (!enabled || events.length() >= 256) return;
        try { JSONObject row = new JSONObject(); row.put("traceId", traceId); row.put("documentTraceId", documentTraceId); row.put("stage", stage); row.put("elapsedNs", SystemClock.elapsedRealtimeNanos()); row.put("performanceNowMs", at); row.put("timeOriginMs", origin); events.put(row); } catch (org.json.JSONException ignored) { }
    }
    public static synchronized JSONArray snapshot() { JSONArray copy = new JSONArray(); for (int i=0;i<events.length();i++) copy.put(events.opt(i)); return copy; }
    public static synchronized String id() { return traceId; }
}
