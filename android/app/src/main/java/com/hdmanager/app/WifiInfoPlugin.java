package com.hdmanager.app;

import android.Manifest;
import android.content.Context;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.TransportInfo;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.net.wifi.ScanResult;
import android.os.Build;
import android.provider.Settings;
import android.text.TextUtils;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@CapacitorPlugin(
    name = "WifiInfo",
    permissions = {
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION }, alias = "location"),
        @Permission(strings = { Manifest.permission.NEARBY_WIFI_DEVICES }, alias = "nearbyWifi")
    }
)
public class WifiInfoPlugin extends Plugin {

    private static final String FAILURE_WIFI_DISABLED = "wifi_disabled";
    private static final String FAILURE_NOT_CONNECTED = "not_connected_to_wifi";
    private static final String FAILURE_LOCATION_PERMISSION = "location_permission_denied";
    private static final String FAILURE_NEARBY_PERMISSION = "nearby_wifi_permission_denied";
    private static final String FAILURE_LOCATION_SERVICES = "location_services_off";
    private static final String FAILURE_SSID_UNAVAILABLE = "ssid_unavailable";
    private static final String FAILURE_SCAN_EMPTY = "scan_empty";
    private static final String FAILURE_UNSUPPORTED = "unsupported";

    @PluginMethod
    public void getCurrentWifiInfo(PluginCall call) {
        String[] requiredAliases = getRequiredPermissionAliases();
        if (shouldRequestPermissions(requiredAliases)) {
            requestPermissionForAliases(requiredAliases, call, "wifiPermissionsCallback");
            return;
        }

        resolveCurrentWifiInfo(call);
    }

    @PermissionCallback
    private void wifiPermissionsCallback(PluginCall call) {
        resolveCurrentWifiInfo(call);
    }

    @PluginMethod
    public void scanWifiNetworks(PluginCall call) {
        String[] requiredAliases = getRequiredPermissionAliases();
        if (shouldRequestPermissions(requiredAliases)) {
            requestPermissionForAliases(requiredAliases, call, "wifiScanPermissionsCallback");
            return;
        }

        resolveWifiNetworkScan(call);
    }

    @PermissionCallback
    private void wifiScanPermissionsCallback(PluginCall call) {
        resolveWifiNetworkScan(call);
    }

    private void resolveCurrentWifiInfo(PluginCall call) {
        JSObject checks = new JSObject();
        JSObject permissions = buildPermissionStatePayload();

        WifiManager wifiManager = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        ConnectivityManager connectivityManager = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);

        if (wifiManager == null) {
            resolveFailure(call, FAILURE_UNSUPPORTED, "Thiet bi nay khong ho tro lay thong tin WiFi hien tai.", checks, permissions, false);
            return;
        }

        boolean wifiEnabled = wifiManager.isWifiEnabled();
        checks.put("wifiEnabled", wifiEnabled);
        if (!wifiEnabled) {
            resolveFailure(call, FAILURE_WIFI_DISABLED, "WiFi tren dien thoai dang tat.", checks, permissions, true);
            return;
        }

        boolean connectedToWifi = isConnectedToWifi(connectivityManager, wifiManager);
        checks.put("connectedToWifi", connectedToWifi);
        if (!connectedToWifi) {
            resolveFailure(call, FAILURE_NOT_CONNECTED, "May chua ket noi WiFi hien tai.", checks, permissions, true);
            return;
        }

        boolean locationPermissionGranted = isLocationPermissionGranted();
        checks.put("locationPermissionGranted", locationPermissionGranted);
        if (!locationPermissionGranted) {
            resolveFailure(call, FAILURE_LOCATION_PERMISSION, "Chua cap quyen vi tri.", checks, permissions, true);
            return;
        }

        boolean nearbyPermissionGranted = isNearbyWifiPermissionGranted();
        checks.put("nearbyWifiPermissionGranted", nearbyPermissionGranted);
        if (!nearbyPermissionGranted) {
            resolveFailure(call, FAILURE_NEARBY_PERMISSION, "Chua cap quyen Nearby devices.", checks, permissions, true);
            return;
        }

        boolean locationServicesEnabled = isLocationServicesEnabled();
        checks.put("locationServicesEnabled", locationServicesEnabled);
        if (!locationServicesEnabled) {
            resolveFailure(call, FAILURE_LOCATION_SERVICES, "Dien thoai dang tat Dich vu vi tri.", checks, permissions, true);
            return;
        }

        try {
            WifiInfo wifiInfo = getConnectedWifiInfo(connectivityManager, wifiManager);
            if (wifiInfo == null) {
                resolveFailure(call, FAILURE_NOT_CONNECTED, "May chua ket noi WiFi hien tai.", checks, permissions, true);
                return;
            }

            String ssid = sanitizeSsid(wifiInfo.getSSID());
            if (TextUtils.isEmpty(ssid) || WifiManager.UNKNOWN_SSID.equals(ssid)) {
                resolveFailure(call, FAILURE_SSID_UNAVAILABLE, "Da ket noi WiFi nhung Android chua tra duoc SSID.", checks, permissions, true);
                return;
            }

            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("supported", true);
            result.put("failureCode", JSObject.NULL);
            result.put("message", "Da nhan WiFi hien tai: " + ssid);
            result.put("ssid", ssid);

            String bssid = sanitizeBssid(wifiInfo.getBSSID());
            if (!TextUtils.isEmpty(bssid)) {
                result.put("bssid", bssid);
            }

            result.put("rssi", wifiInfo.getRssi());
            result.put("linkSpeed", wifiInfo.getLinkSpeed());
            result.put("frequency", wifiInfo.getFrequency());
            result.put("source", "android-native");
            result.put("checks", checks);
            result.put("permissions", permissions);
            call.resolve(result);
        } catch (SecurityException error) {
            resolveFailure(call, FAILURE_UNSUPPORTED, "Android da chan viec doc WiFi hien tai.", checks, permissions, false);
        } catch (Exception error) {
            call.reject("Khong doc duoc WiFi hien tai.", error);
        }
    }

    private void resolveFailure(
        PluginCall call,
        String failureCode,
        String message,
        JSObject checks,
        JSObject permissions,
        boolean supported
    ) {
        JSObject result = new JSObject();
        result.put("ok", false);
        result.put("supported", supported);
        result.put("failureCode", failureCode);
        result.put("message", message);
        result.put("checks", checks);
        result.put("permissions", permissions);
        call.resolve(result);
    }

    private void resolveWifiNetworkScan(PluginCall call) {
        JSObject checks = new JSObject();
        JSObject permissions = buildPermissionStatePayload();

        WifiManager wifiManager = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        ConnectivityManager connectivityManager = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);

        if (wifiManager == null) {
            resolveFailure(call, FAILURE_UNSUPPORTED, "Thiet bi nay khong ho tro quet danh sach WiFi.", checks, permissions, false);
            return;
        }

        boolean wifiEnabled = wifiManager.isWifiEnabled();
        checks.put("wifiEnabled", wifiEnabled);
        if (!wifiEnabled) {
            resolveFailure(call, FAILURE_WIFI_DISABLED, "WiFi tren dien thoai dang tat.", checks, permissions, true);
            return;
        }

        boolean locationPermissionGranted = isLocationPermissionGranted();
        checks.put("locationPermissionGranted", locationPermissionGranted);
        if (!locationPermissionGranted) {
            resolveFailure(call, FAILURE_LOCATION_PERMISSION, "Chua cap quyen vi tri.", checks, permissions, true);
            return;
        }

        boolean nearbyPermissionGranted = isNearbyWifiPermissionGranted();
        checks.put("nearbyWifiPermissionGranted", nearbyPermissionGranted);
        if (!nearbyPermissionGranted) {
            resolveFailure(call, FAILURE_NEARBY_PERMISSION, "Chua cap quyen WiFi lan can.", checks, permissions, true);
            return;
        }

        boolean locationServicesEnabled = isLocationServicesEnabled();
        checks.put("locationServicesEnabled", locationServicesEnabled);
        if (!locationServicesEnabled) {
            resolveFailure(call, FAILURE_LOCATION_SERVICES, "Dien thoai dang tat Dich vu vi tri.", checks, permissions, true);
            return;
        }

        try {
            boolean scanStarted = wifiManager.startScan();
            checks.put("scanStarted", scanStarted);

            WifiInfo connectedWifiInfo = getConnectedWifiInfo(connectivityManager, wifiManager);
            String connectedSsid = connectedWifiInfo == null ? null : sanitizeSsid(connectedWifiInfo.getSSID());
            String connectedBssid = connectedWifiInfo == null ? null : sanitizeBssid(connectedWifiInfo.getBSSID());

            List<ScanResult> scanResults = wifiManager.getScanResults();
            Map<String, WifiNetworkItem> networkMap = new HashMap<>();

            if (scanResults != null) {
                for (ScanResult scanResult : scanResults) {
                    String ssid = sanitizeSsid(scanResult.SSID);
                    if (TextUtils.isEmpty(ssid) || WifiManager.UNKNOWN_SSID.equals(ssid)) continue;

                    String bssid = sanitizeBssid(scanResult.BSSID);
                    String key = ssid.toLowerCase(Locale.ROOT);
                    boolean connected = isSameWifi(ssid, bssid, connectedSsid, connectedBssid);
                    WifiNetworkItem candidate = new WifiNetworkItem(
                        ssid,
                        bssid,
                        scanResult.level,
                        scanResult.frequency,
                        scanResult.capabilities,
                        connected
                    );
                    WifiNetworkItem existing = networkMap.get(key);
                    if (existing == null || candidate.connected || candidate.level > existing.level) {
                        networkMap.put(key, candidate);
                    }
                }
            }

            ArrayList<WifiNetworkItem> networks = new ArrayList<>(networkMap.values());
            Collections.sort(networks, new Comparator<WifiNetworkItem>() {
                @Override
                public int compare(WifiNetworkItem left, WifiNetworkItem right) {
                    if (left.connected != right.connected) return left.connected ? -1 : 1;
                    return Integer.compare(right.level, left.level);
                }
            });

            JSArray networkArray = new JSArray();
            for (WifiNetworkItem network : networks) {
                JSObject item = new JSObject();
                item.put("ssid", network.ssid);
                if (!TextUtils.isEmpty(network.bssid)) item.put("bssid", network.bssid);
                item.put("rssi", network.level);
                item.put("frequency", network.frequency);
                item.put("capabilities", network.capabilities);
                item.put("connected", network.connected);
                item.put("source", "android-native-scan");
                networkArray.put(item);
            }

            JSObject result = new JSObject();
            result.put("ok", networks.size() > 0);
            result.put("supported", true);
            result.put("failureCode", networks.size() > 0 ? JSObject.NULL : FAILURE_SCAN_EMPTY);
            result.put("message", networks.size() > 0
                ? "Da do thay " + networks.size() + " WiFi gan day."
                : "Chua do thay WiFi nao. Hay bat Vi tri, bat WiFi va thu lai.");
            result.put("scanStarted", scanStarted);
            result.put("connectedSsid", connectedSsid);
            result.put("connectedBssid", connectedBssid);
            result.put("networks", networkArray);
            result.put("checks", checks);
            result.put("permissions", permissions);
            call.resolve(result);
        } catch (SecurityException error) {
            resolveFailure(call, FAILURE_LOCATION_PERMISSION, "Android chua cap du quyen Vi tri/WiFi de quet danh sach WiFi.", checks, permissions, true);
        } catch (Exception error) {
            call.reject("Khong quet duoc danh sach WiFi.", error);
        }
    }

    private JSObject buildPermissionStatePayload() {
        JSObject permissions = new JSObject();
        permissions.put("location", isPermissionDeclared("location") ? getPermissionState("location").toString() : "missing");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.put("nearbyWifi", isPermissionDeclared("nearbyWifi") ? getPermissionState("nearbyWifi").toString() : "missing");
        } else {
            permissions.put("nearbyWifi", "granted");
        }
        return permissions;
    }

    private String[] getRequiredPermissionAliases() {
        ArrayList<String> aliases = new ArrayList<>();
        if (isPermissionDeclared("location")) {
            aliases.add("location");
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && isPermissionDeclared("nearbyWifi")) {
            aliases.add("nearbyWifi");
        }
        return aliases.toArray(new String[0]);
    }

    private boolean shouldRequestPermissions(String[] aliases) {
        for (String alias : aliases) {
            if (getPermissionState(alias) != PermissionState.GRANTED) {
                return true;
            }
        }
        return false;
    }

    private boolean isLocationPermissionGranted() {
        return !isPermissionDeclared("location") || getPermissionState("location") == PermissionState.GRANTED;
    }

    private boolean isNearbyWifiPermissionGranted() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return true;
        }
        return !isPermissionDeclared("nearbyWifi") || getPermissionState("nearbyWifi") == PermissionState.GRANTED;
    }

    private boolean isConnectedToWifi(ConnectivityManager connectivityManager, WifiManager wifiManager) {
        if (connectivityManager != null) {
            Network activeNetwork = connectivityManager.getActiveNetwork();
            if (activeNetwork != null) {
                NetworkCapabilities capabilities = connectivityManager.getNetworkCapabilities(activeNetwork);
                if (capabilities != null && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                    return true;
                }
            }
        }

        WifiInfo fallbackInfo = wifiManager.getConnectionInfo();
        return fallbackInfo != null && fallbackInfo.getNetworkId() != -1;
    }

    private WifiInfo getConnectedWifiInfo(ConnectivityManager connectivityManager, WifiManager wifiManager) {
        if (connectivityManager != null) {
            Network activeNetwork = connectivityManager.getActiveNetwork();
            if (activeNetwork != null) {
                NetworkCapabilities capabilities = connectivityManager.getNetworkCapabilities(activeNetwork);
                if (capabilities != null && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        TransportInfo transportInfo = capabilities.getTransportInfo();
                        if (transportInfo instanceof WifiInfo) {
                            return (WifiInfo) transportInfo;
                        }
                    }
                }
            }
        }

        return wifiManager.getConnectionInfo();
    }

    private boolean isLocationServicesEnabled() {
        LocationManager locationManager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) {
            return false;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return locationManager.isLocationEnabled();
        }

        try {
            int mode = Settings.Secure.getInt(getContext().getContentResolver(), Settings.Secure.LOCATION_MODE);
            return mode != Settings.Secure.LOCATION_MODE_OFF;
        } catch (Settings.SettingNotFoundException error) {
            return locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        }
    }

    private String sanitizeSsid(String rawValue) {
        if (rawValue == null) return null;
        String sanitized = rawValue.trim();
        if (sanitized.startsWith("\"") && sanitized.endsWith("\"") && sanitized.length() >= 2) {
            sanitized = sanitized.substring(1, sanitized.length() - 1);
        }
        return sanitized.trim();
    }

    private String sanitizeBssid(String rawValue) {
        if (TextUtils.isEmpty(rawValue) || "02:00:00:00:00:00".equals(rawValue)) {
            return null;
        }
        return rawValue;
    }

    private boolean isSameWifi(String ssid, String bssid, String connectedSsid, String connectedBssid) {
        if (TextUtils.isEmpty(ssid) || TextUtils.isEmpty(connectedSsid)) return false;
        if (!ssid.equals(connectedSsid)) return false;
        if (!TextUtils.isEmpty(bssid) && !TextUtils.isEmpty(connectedBssid)) {
            return bssid.equalsIgnoreCase(connectedBssid);
        }
        return true;
    }

    private static class WifiNetworkItem {
        final String ssid;
        final String bssid;
        final int level;
        final int frequency;
        final String capabilities;
        final boolean connected;

        WifiNetworkItem(String ssid, String bssid, int level, int frequency, String capabilities, boolean connected) {
            this.ssid = ssid;
            this.bssid = bssid;
            this.level = level;
            this.frequency = frequency;
            this.capabilities = capabilities;
            this.connected = connected;
        }
    }
}
