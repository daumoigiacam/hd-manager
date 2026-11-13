package com.hdmanager.app;

import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;
import android.view.FrameMetrics;
import android.view.Window;
import com.getcapacitor.JSObject;
import java.util.ArrayDeque;
import org.json.JSONArray;
import org.json.JSONObject;

// Explicit Local diagnostic only, inert on normal startup. Observes real
// Android Window frames on its own handler; never invokes GC, changes business
// state or substitutes DOM/RAF for native timing. Every delivered frame and
// every overflow/dropped callback is retained in the exported counters.
final class LocalFrameObservation {
    private final Object lock = new Object();
    private final ArrayDeque<JSONObject> pending = new ArrayDeque<>();
    private final HandlerThread thread = new HandlerThread("HDLocalWindowFrames");
    private final Window window;
    private final Window.OnFrameMetricsAvailableListener listener;
    private long sequence, overflow, dropped;
    private volatile String phase = "unmarked";
    private boolean closed, closing;
    LocalFrameObservation(Window window) {
        this.window = window;
        thread.start();
        listener = (w, frame, callbackDrops) -> {
            synchronized (lock) {
                if (closed) return;
                sequence++; dropped += callbackDrops;
                if (pending.size() >= 4096) { overflow++; return; }
                JSONObject row = new JSONObject();
                try {
                    row.put("sequence", sequence);
                    row.put("phase", phase);
                    row.put("observedElapsedNs", SystemClock.elapsedRealtimeNanos());
                    row.put("intendedVsyncNs", frame.getMetric(FrameMetrics.INTENDED_VSYNC_TIMESTAMP));
                    row.put("vsyncNs", frame.getMetric(FrameMetrics.VSYNC_TIMESTAMP));
                    row.put("totalNs", frame.getMetric(FrameMetrics.TOTAL_DURATION));
                    row.put("layoutNs", frame.getMetric(FrameMetrics.LAYOUT_MEASURE_DURATION));
                    row.put("drawNs", frame.getMetric(FrameMetrics.DRAW_DURATION));
                    row.put("syncNs", frame.getMetric(FrameMetrics.SYNC_DURATION));
                    row.put("commandIssueNs", frame.getMetric(FrameMetrics.COMMAND_ISSUE_DURATION));
                    row.put("swapNs", frame.getMetric(FrameMetrics.SWAP_BUFFERS_DURATION));
                    row.put("firstDraw", frame.getMetric(FrameMetrics.FIRST_DRAW_FRAME));
                    row.put("droppedReports", callbackDrops);
                    pending.addLast(row);
                } catch (org.json.JSONException error) { overflow++; }
            }
        };
        window.addOnFrameMetricsAvailableListener(listener, new Handler(thread.getLooper()));
    }
    void phase(String value) { phase = value; }
    JSObject drain() {
        synchronized (lock) {
            JSONArray rows = new JSONArray();
            while (!pending.isEmpty()) rows.put(pending.removeFirst());
            JSObject result = new JSObject();
            result.put("frames", rows); result.put("observedFrames", sequence);
            result.put("overflowFrames", overflow); result.put("droppedReports", dropped);
            result.put("closed", closed); result.put("pendingLimit", 4096);
            result.put("nativeClock", "elapsedRealtimeNanos");
            result.put("measurement", "Android Window FrameMetrics; total/draw/sync/command/swap are distinct from atrace DrawFrame section wall time");
            return result;
        }
    }
    void close(Runnable complete) {
        synchronized (lock) { if (closed || closing) { if (complete != null) complete.run(); return; } closing = true; }
        window.removeOnFrameMetricsAvailableListener(listener);
        // Flush callbacks already queued before removal. Never discard the
        // final slow frame at the measurement boundary or block the UI thread.
        new Handler(thread.getLooper()).post(() -> {
            synchronized (lock) { closed = true; }
            if (complete != null) complete.run();
            thread.quitSafely();
        });
    }
}
