package com.hdmanager.app;

import android.os.Looper;
import android.os.SystemClock;
import android.os.Trace;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.community.database.sqlite.CapacitorSQLitePlugin;
import org.json.JSONObject;

// Generated from the installed SDK's COMPLETE 49-method API. One SDK instance,
// one original connection registry; no crypto settings or query changes.
// UI/JS does not need SQLCipher before a real SQLite request. Capacitor dispatches
// every method below on its existing FIFO taskHandler. Interactive biometric
// configuration retains the SDK's original main-thread initialization path.
// SDK SHA-256: 36e5395cec122a02ec1372c29d9578e08cd4b013b0ecdf05cab74b213ac65bb7
@CapacitorPlugin(name = "CapacitorSQLite")
public final class LocalStartupSQLitePlugin extends CapacitorSQLitePlugin {
    private int loadAttempts;
    private boolean deferred;
    private boolean initializedOnMainThread;
    private long loadStartNs, loadEndNs;
    @Override public void load() {
        JSONObject config = getConfig().getConfigJSON();
        JSONObject biometric = config.optJSONObject("androidBiometric");
        boolean interactiveOrMalformed = config.has("androidBiometric") &&
            (biometric == null || !Boolean.FALSE.equals(biometric.opt("biometricAuth")));
        deferred = "com.hdmanager.app.localdev".equals(getContext().getPackageName()) && !interactiveOrMalformed;
        if (!deferred) ensureSdkLoaded();
    }
    private synchronized void ensureSdkLoaded() {
        if (loadAttempts != 0) return;
        loadAttempts++;
        initializedOnMainThread = Looper.myLooper() == Looper.getMainLooper();
        loadStartNs = SystemClock.elapsedRealtimeNanos();
        Trace.beginSection("HDSQLite.initialize");
        try { super.load(); }
        finally {
            loadEndNs = SystemClock.elapsedRealtimeNanos();
            Trace.endSection();
            Log.i("HDStartupSQLite", "startNs=" + loadStartNs + " endNs=" + loadEndNs + " mainThread=" + initializedOnMainThread + " deferred=" + deferred);
        }
    }
    @PluginMethod public void getStartupInitializationState(PluginCall call) {
        JSObject value = new JSObject();
        value.put("loadAttempts", loadAttempts);
        value.put("deferred", deferred);
        value.put("initializedOnMainThread", initializedOnMainThread);
        value.put("loadStartNs", loadStartNs);
        value.put("loadEndNs", loadEndNs);
        value.put("originalApiMethods", 49);
        call.resolve(value);
    }
    @Override @PluginMethod public void echo(PluginCall call) { ensureSdkLoaded(); super.echo(call); }
    @Override @PluginMethod public void isSecretStored(PluginCall call) { ensureSdkLoaded(); super.isSecretStored(call); }
    @Override @PluginMethod public void setEncryptionSecret(PluginCall call) { ensureSdkLoaded(); super.setEncryptionSecret(call); }
    @Override @PluginMethod public void changeEncryptionSecret(PluginCall call) { ensureSdkLoaded(); super.changeEncryptionSecret(call); }
    @Override @PluginMethod public void clearEncryptionSecret(PluginCall call) { ensureSdkLoaded(); super.clearEncryptionSecret(call); }
    @Override @PluginMethod public void checkEncryptionSecret(PluginCall call) { ensureSdkLoaded(); super.checkEncryptionSecret(call); }
    @Override @PluginMethod public void getNCDatabasePath(PluginCall call) { ensureSdkLoaded(); super.getNCDatabasePath(call); }
    @Override @PluginMethod public void createNCConnection(PluginCall call) { ensureSdkLoaded(); super.createNCConnection(call); }
    @Override @PluginMethod public void createConnection(PluginCall call) { ensureSdkLoaded(); AndroidStartupTimeline.mark("sqlite.createConnection.begin"); Trace.beginSection("HDStart.SQLite.createConnection"); try { super.createConnection(call); } finally { Trace.endSection(); AndroidStartupTimeline.mark("sqlite.createConnection.end"); } }
    @Override @PluginMethod public void open(PluginCall call) { ensureSdkLoaded(); AndroidStartupTimeline.mark("sqlite.open.begin"); Trace.beginSection("HDStart.SQLite.open"); try { super.open(call); } finally { Trace.endSection(); AndroidStartupTimeline.mark("sqlite.open.end"); } }
    @Override @PluginMethod public void close(PluginCall call) { ensureSdkLoaded(); super.close(call); }
    @Override @PluginMethod public void beginTransaction(PluginCall call) { ensureSdkLoaded(); super.beginTransaction(call); }
    @Override @PluginMethod public void commitTransaction(PluginCall call) { ensureSdkLoaded(); super.commitTransaction(call); }
    @Override @PluginMethod public void rollbackTransaction(PluginCall call) { ensureSdkLoaded(); super.rollbackTransaction(call); }
    @Override @PluginMethod public void isTransactionActive(PluginCall call) { ensureSdkLoaded(); super.isTransactionActive(call); }
    @Override @PluginMethod public void getUrl(PluginCall call) { ensureSdkLoaded(); super.getUrl(call); }
    @Override @PluginMethod public void getVersion(PluginCall call) { ensureSdkLoaded(); super.getVersion(call); }
    @Override @PluginMethod public void closeNCConnection(PluginCall call) { ensureSdkLoaded(); super.closeNCConnection(call); }
    @Override @PluginMethod public void closeConnection(PluginCall call) { ensureSdkLoaded(); super.closeConnection(call); }
    @Override @PluginMethod public void checkConnectionsConsistency(PluginCall call) { ensureSdkLoaded(); super.checkConnectionsConsistency(call); }
    @Override @PluginMethod public void isDatabase(PluginCall call) { ensureSdkLoaded(); super.isDatabase(call); }
    @Override @PluginMethod public void isDatabaseEncrypted(PluginCall call) { ensureSdkLoaded(); super.isDatabaseEncrypted(call); }
    @Override @PluginMethod public void isInConfigEncryption(PluginCall call) { ensureSdkLoaded(); super.isInConfigEncryption(call); }
    @Override @PluginMethod public void isInConfigBiometricAuth(PluginCall call) { ensureSdkLoaded(); super.isInConfigBiometricAuth(call); }
    @Override @PluginMethod public void isNCDatabase(PluginCall call) { ensureSdkLoaded(); super.isNCDatabase(call); }
    @Override @PluginMethod public void isTableExists(PluginCall call) { ensureSdkLoaded(); super.isTableExists(call); }
    @Override @PluginMethod public void getDatabaseList(PluginCall call) { ensureSdkLoaded(); super.getDatabaseList(call); }
    @Override @PluginMethod public void getMigratableDbList(PluginCall call) { ensureSdkLoaded(); super.getMigratableDbList(call); }
    @Override @PluginMethod public void addSQLiteSuffix(PluginCall call) { ensureSdkLoaded(); super.addSQLiteSuffix(call); }
    @Override @PluginMethod public void deleteOldDatabases(PluginCall call) { ensureSdkLoaded(); super.deleteOldDatabases(call); }
    @Override @PluginMethod public void moveDatabasesAndAddSuffix(PluginCall call) { ensureSdkLoaded(); super.moveDatabasesAndAddSuffix(call); }
    @Override @PluginMethod public void execute(PluginCall call) { ensureSdkLoaded(); super.execute(call); }
    @Override @PluginMethod public void executeSet(PluginCall call) throws Exception { ensureSdkLoaded(); super.executeSet(call); }
    @Override @PluginMethod public void run(PluginCall call) { ensureSdkLoaded(); super.run(call); }
    @Override @PluginMethod public void query(PluginCall call) { ensureSdkLoaded(); super.query(call); }
    @Override @PluginMethod public void getTableList(PluginCall call) { ensureSdkLoaded(); super.getTableList(call); }
    @Override @PluginMethod public void isDBExists(PluginCall call) { ensureSdkLoaded(); super.isDBExists(call); }
    @Override @PluginMethod public void isDBOpen(PluginCall call) { ensureSdkLoaded(); super.isDBOpen(call); }
    @Override @PluginMethod public void deleteDatabase(PluginCall call) { ensureSdkLoaded(); super.deleteDatabase(call); }
    @Override @PluginMethod public void createSyncTable(PluginCall call) { ensureSdkLoaded(); super.createSyncTable(call); }
    @Override @PluginMethod public void setSyncDate(PluginCall call) { ensureSdkLoaded(); super.setSyncDate(call); }
    @Override @PluginMethod public void getSyncDate(PluginCall call) { ensureSdkLoaded(); super.getSyncDate(call); }
    @Override @PluginMethod public void addUpgradeStatement(PluginCall call) { ensureSdkLoaded(); super.addUpgradeStatement(call); }
    @Override @PluginMethod public void isJsonValid(PluginCall call) { ensureSdkLoaded(); super.isJsonValid(call); }
    @Override @PluginMethod public void importFromJson(PluginCall call) { ensureSdkLoaded(); super.importFromJson(call); }
    @Override @PluginMethod public void exportToJson(PluginCall call) { ensureSdkLoaded(); super.exportToJson(call); }
    @Override @PluginMethod public void deleteExportedRows(PluginCall call) { ensureSdkLoaded(); super.deleteExportedRows(call); }
    @Override @PluginMethod public void copyFromAssets(PluginCall call) { ensureSdkLoaded(); super.copyFromAssets(call); }
    @Override @PluginMethod public void getFromHTTPRequest(PluginCall call) { ensureSdkLoaded(); super.getFromHTTPRequest(call); }
}
