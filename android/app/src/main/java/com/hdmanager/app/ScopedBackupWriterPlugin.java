package com.hdmanager.app;

import android.Manifest;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Own-file writes only. Android 10+ uses scoped MediaStore without broad storage
 * permissions; older Android uses the already declared WRITE permission. No API
 * accepts an arbitrary path/URI or deletes a completed backup.
 */
@CapacitorPlugin(name = "ScopedBackupWriter", permissions = {
    @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "legacyBackupWrite")
})
public class ScopedBackupWriterPlugin extends Plugin {
    private static final String FOLDER = "HDManager/AutoBackups";
    private static final int MAX_CHUNK_CHARACTERS = 8 * 1024 * 1024;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Map<String, Session> sessions = new HashMap<>();
    private volatile boolean disposed;

    private static class Session {
        String filename;
        Uri uri;
        File temporary;
        File destination;
        OutputStream stream;
    }

    private interface Operation { void run() throws Exception; }

    private void runIO(PluginCall call, Operation operation) {
        if (disposed) { call.reject("Phiên ghi sao lưu đã kết thúc.", "BACKUP_CLOSED"); return; }
        try { io.execute(() -> {
            try {
                if (disposed) throw new IOException("Backup writer closed");
                operation.run();
            } catch (Exception error) {
                if ((getContext().getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
                    android.util.Log.w("ScopedBackupWriter", "Backup I/O failed", error);
                }
                call.reject("Không thể ghi sao lưu (" + error.getClass().getSimpleName() + ").", "BACKUP_IO_ERROR");
            }
        }); } catch (java.util.concurrent.RejectedExecutionException error) {
            call.reject("Phiên ghi sao lưu đã kết thúc.", "BACKUP_CLOSED");
        }
    }

    private String filename(PluginCall call) throws IOException {
        String name = call.getString("filename", "");
        if (!name.startsWith("auto-") || !name.endsWith(".json") || name.length() > 240
            || name.contains("/") || name.contains("\\")) {
            throw new IOException("Invalid backup filename");
        }
        for (int index = 0; index < name.length(); index++) {
            if (name.charAt(index) < 32) throw new IOException("Invalid backup filename");
        }
        return name;
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            && getPermissionState("legacyBackupWrite") != PermissionState.GRANTED) {
            requestPermissionForAlias("legacyBackupWrite", call, "legacyPermissionResult");
            return;
        }
        createSession(call);
    }

    @PermissionCallback
    private void legacyPermissionResult(PluginCall call) {
        if (getPermissionState("legacyBackupWrite") != PermissionState.GRANTED) {
            call.reject("Chưa cho phép ghi file sao lưu.", "BACKUP_PERMISSION_DENIED");
            return;
        }
        createSession(call);
    }

    private void createSession(PluginCall call) {
        runIO(call, () -> {
            String name = filename(call);
            String handle = UUID.randomUUID().toString();
            Session session = new Session();
            session.filename = name;
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOCUMENTS + "/" + FOLDER);
                    values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    session.uri = getContext().getContentResolver().insert(
                        MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values);
                    if (session.uri == null) throw new IOException("Cannot create pending backup");
                    OutputStream raw = getContext().getContentResolver().openOutputStream(session.uri, "w");
                    if (raw == null) throw new IOException("Cannot open pending backup");
                    session.stream = new BufferedOutputStream(raw, 65536);
                } else {
                    File root = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), FOLDER).getCanonicalFile();
                    if (!root.isDirectory() && !root.mkdirs()) throw new IOException("Cannot create backup directory");
                    session.destination = new File(root, name).getCanonicalFile();
                    if (!session.destination.getParentFile().equals(root)) throw new IOException("Invalid destination");
                    if (session.destination.exists()) {
                        session.filename = name.substring(0, name.length() - 5) + "-" + handle.substring(0, 8) + ".json";
                        session.destination = new File(root, session.filename);
                    }
                    session.temporary = new File(root, ".partial-" + handle);
                    session.stream = new BufferedOutputStream(new FileOutputStream(session.temporary), 65536);
                }
                sessions.put(handle, session);
                JSObject result = new JSObject();
                result.put("handle", handle);
                call.resolve(result);
            } catch (Exception error) {
                discard(session);
                throw error;
            }
        });
    }

    private Session session(PluginCall call) throws IOException {
        Session session = sessions.get(call.getString("handle", ""));
        if (session == null) throw new IOException("Unknown backup handle");
        return session;
    }

    @PluginMethod
    public void append(PluginCall call) {
        runIO(call, () -> {
            Session session = session(call);
            String data = call.getString("data");
            if (data == null || data.length() > MAX_CHUNK_CHARACTERS || session.stream == null) {
                throw new IOException("Invalid backup chunk");
            }
            session.stream.write(data.getBytes(StandardCharsets.UTF_8));
            call.resolve();
        });
    }

    @PluginMethod
    public void commit(PluginCall call) {
        runIO(call, () -> {
            Session session = session(call);
            session.stream.close();
            session.stream = null;
            String path;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues ready = new ContentValues();
                ready.put(MediaStore.MediaColumns.IS_PENDING, 0);
                if (getContext().getContentResolver().update(session.uri, ready, null, null) != 1) {
                    throw new IOException("Cannot publish completed backup");
                }
                path = session.uri.toString();
            } else {
                if (session.destination.exists() || !session.temporary.renameTo(session.destination)) {
                    throw new IOException("Cannot publish completed backup");
                }
                path = session.destination.getAbsolutePath();
            }
            sessions.remove(call.getString("handle", ""));
            JSObject result = new JSObject();
            result.put("path", path);
            result.put("filename", session.filename);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void abort(PluginCall call) {
        runIO(call, () -> {
            String handle = call.getString("handle", "");
            Session session = sessions.get(handle);
            if (session != null && !discard(session)) throw new IOException("Cannot remove pending backup");
            sessions.remove(handle);
            JSObject result = new JSObject();
            result.put("discarded", true);
            call.resolve(result);
        });
    }

    private boolean discard(Session session) {
        boolean closed = true;
        boolean removed = true;
        try { if (session.stream != null) session.stream.close(); } catch (IOException ignored) { closed = false; }
        try {
            if (session.uri != null) removed = getContext().getContentResolver().delete(session.uri, null, null) > 0;
            if (session.temporary != null && session.temporary.exists()) removed = session.temporary.delete() && removed;
        } catch (RuntimeException ignored) { removed = false; }
        return closed && removed;
    }

    @Override
    protected void handleOnDestroy() {
        disposed = true;
        io.execute(() -> { for (Session session : sessions.values()) discard(session); sessions.clear(); });
        io.shutdown();
        super.handleOnDestroy();
    }
}
