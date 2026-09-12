package za.co.emmaus.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.Collections;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

@CapacitorPlugin(
    name = "WelcomeAssistBluetooth",
    permissions = {
        @Permission(
            alias = "nearbyDevices",
            strings = {
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT
            }
        )
    }
)
public final class WelcomeAssistBluetoothPlugin extends Plugin {
    private static final long MAX_PROBE_MS = 15000L;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private BluetoothLeScanner activeScanner;
    private ScanCallback activeCallback;
    private Runnable activeTimeout;
    private PluginCall activeCall;

    @PluginMethod
    public void status(PluginCall call) {
        try {
            boolean scanGranted = hasScanPermission();
            boolean connectGranted = hasConnectPermission();
            boolean permissionsGranted = scanGranted && connectGranted;
            boolean supported = hasBluetoothFeature();
            boolean enabled = false;

            // Android 12+ protects getAdapter/isEnabled with BLUETOOTH_CONNECT.
            // Do not touch the adapter until both permissions are granted.
            BluetoothAdapter adapter = permissionsGranted || Build.VERSION.SDK_INT < Build.VERSION_CODES.S
                ? adapter()
                : null;
            supported = supported || adapter != null;
            enabled = supported && permissionsGranted && adapter != null && adapter.isEnabled();
            call.resolve(statusObject(
                supported,
                enabled,
                bluetoothPermission(scanGranted, connectGranted),
                activeCallback != null
            ));
        } catch (SecurityException ignored) {
            // A status probe is observational; permission-needed is a safe
            // result and must never tear down the hosting Activity.
            call.resolve(statusObject(hasBluetoothFeature(), false, "denied", activeCallback != null));
        } catch (RuntimeException ignored) {
            call.resolve(statusObject(hasBluetoothFeature(), false, "prompt", activeCallback != null));
        }
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            call.resolve();
            return;
        }
        if (getPermissionState("nearbyDevices") == PermissionState.GRANTED) {
            call.resolve();
            return;
        }
        requestPermissionForAlias("nearbyDevices", call, "permissionResult");
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        if (getPermissionState("nearbyDevices") == PermissionState.GRANTED) {
            call.resolve();
        } else {
            call.reject("Bluetooth access was not granted.");
        }
    }

    @PluginMethod
    public void probe(PluginCall call) {
        if (activeCallback != null) {
            call.reject("A Welcome Assist Bluetooth probe is already running.");
            return;
        }
        if (!hasScanPermission()) {
            call.reject("Bluetooth permission is required before probing.");
            return;
        }

        String serviceUuid = call.getString("serviceUuid");
        if (serviceUuid == null || serviceUuid.isBlank()) {
            call.reject("A beacon serviceUuid is required.");
            return;
        }

        final UUID uuid;
        try {
            uuid = UUID.fromString(serviceUuid);
        } catch (IllegalArgumentException error) {
            call.reject("serviceUuid must be a valid UUID.");
            return;
        }

        BluetoothAdapter adapter = adapter();
        if (adapter == null || !adapter.isEnabled()) {
            call.reject("Bluetooth is unavailable or switched off.");
            return;
        }
        BluetoothLeScanner scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) {
            call.reject("Bluetooth LE scanning is unavailable.");
            return;
        }

        long requestedMs = call.getLong("durationMs", 8000L);
        long durationMs = Math.max(1000L, Math.min(requestedMs, MAX_PROBE_MS));
        AtomicBoolean seen = new AtomicBoolean(false);
        AtomicInteger strongestRssi = new AtomicInteger(Integer.MIN_VALUE);

        ScanCallback callback = new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, ScanResult result) {
                seen.set(true);
                strongestRssi.accumulateAndGet(result.getRssi(), Math::max);
            }

            @Override
            public void onScanFailed(int errorCode) {
                finishProbe(false, Integer.MIN_VALUE, "scan_failed_" + errorCode);
            }
        };

        ScanFilter filter = new ScanFilter.Builder()
            .setServiceUuid(new ParcelUuid(uuid))
            .build();
        ScanSettings settings = new ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_POWER)
            .build();

        activeScanner = scanner;
        activeCallback = callback;
        activeCall = call;
        activeTimeout = () -> finishProbe(seen.get(), strongestRssi.get(), null);

        try {
            scanner.startScan(Collections.singletonList(filter), settings, callback);
            handler.postDelayed(activeTimeout, durationMs);
        } catch (SecurityException error) {
            clearProbe();
            call.reject("Bluetooth permission is required before probing.");
        }
    }

    @PluginMethod
    public void stopProbe(PluginCall call) {
        if (activeCallback != null) {
            finishProbe(false, Integer.MIN_VALUE, "stopped");
        }
        call.resolve();
    }

    private synchronized void finishProbe(boolean seen, int strongestRssi, String reason) {
        PluginCall call = activeCall;
        if (call == null) return;
        if (activeTimeout != null) handler.removeCallbacks(activeTimeout);
        try {
            if (activeScanner != null && activeCallback != null && hasScanPermission()) {
                activeScanner.stopScan(activeCallback);
            }
        } catch (SecurityException ignored) {
        }
        clearProbe();

        JSObject result = new JSObject();
        result.put("beaconSeen", seen);
        if (seen && strongestRssi != Integer.MIN_VALUE) result.put("strongestRssi", strongestRssi);
        result.put("reason", reason == null ? "completed" : reason);
        result.put("identifiersStored", false);
        call.resolve(result);
    }

    private void clearProbe() {
        activeScanner = null;
        activeCallback = null;
        activeTimeout = null;
        activeCall = null;
    }

    private BluetoothAdapter adapter() {
        BluetoothManager manager = (BluetoothManager) getContext()
            .getSystemService(Context.BLUETOOTH_SERVICE);
        return manager == null ? null : manager.getAdapter();
    }

    private boolean hasBluetoothFeature() {
        try {
            return getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE);
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private String bluetoothPermission(boolean scanGranted, boolean connectGranted) {
        if (scanGranted && connectGranted) return "granted";
        try {
            PermissionState scan = getPermissionState("nearbyDevices");
            return scan == PermissionState.DENIED ? "denied" : "prompt";
        } catch (RuntimeException ignored) {
            return "prompt";
        }
    }

    static JSObject statusObject(boolean supported, boolean enabled, String permission, boolean scanning) {
        JSObject result = new JSObject();
        result.put("supported", supported);
        result.put("enabled", enabled);
        result.put("permission", permission);
        result.put(
            "state",
            !supported ? "unsupported"
                : !"granted".equals(permission) ? "permission-needed"
                : !enabled ? "off"
                : "ready"
        );
        result.put("scanning", scanning);
        result.put("automaticScanning", false);
        return result;
    }

    private boolean hasScanPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_SCAN)
                == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasConnectPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT)
                == PackageManager.PERMISSION_GRANTED;
    }
}
