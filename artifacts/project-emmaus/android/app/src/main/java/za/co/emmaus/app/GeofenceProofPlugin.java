package za.co.emmaus.app;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import android.Manifest;
import android.os.Build;
import androidx.core.content.ContextCompat;
import android.content.pm.PackageManager;
import android.location.LocationManager;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(
        name = "GeofenceProof",
        permissions = {
                @Permission(alias = "location", strings = {Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}),
                @Permission(alias = "backgroundLocation", strings = {Manifest.permission.ACCESS_BACKGROUND_LOCATION})
        }
)
public final class GeofenceProofPlugin extends Plugin {
    private final PermissionRequestGuard foregroundPermissionRequest = new PermissionRequestGuard();
    private final PermissionRequestGuard backgroundPermissionRequest = new PermissionRequestGuard();
    @PluginMethod
    public void welcomeAssistStatus(PluginCall call) {
        JSObject result = new JSObject();
        try {
            boolean location = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                    || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            LocationManager manager = (LocationManager) getContext().getSystemService(android.content.Context.LOCATION_SERVICE);
            result.put("permission", location ? "granted" : "needed");
            result.put("locationEnabled", manager != null && (Build.VERSION.SDK_INT < 28 || manager.isLocationEnabled()));
        } catch (RuntimeException error) {
            result.put("permission", "needed");
            result.put("locationEnabled", false);
        }
        result.put("tracking", false);
        result.put("privacy", "Location is used only for an optional one-time Welcome Assist test and is not sent.");
        call.resolve(result);
    }

    @PluginMethod
    public void requestWelcomeAssistAccess(PluginCall call) {
        try {
            if (hasForegroundPermission()) {
                call.resolve();
                return;
            }
            if (!foregroundPermissionRequest.begin(getContext(), call, "location.foreground")) return;
            try {
                requestPermissionForAlias("location", call, "welcomeLocationResult");
            } catch (RuntimeException error) {
                foregroundPermissionRequest.fail(getContext(), call, "location.foreground.start", error);
            }
        } catch (RuntimeException error) {
            NativePermissionDiagnostics.exception(getContext(), "location.foreground", error);
            call.reject("Location permission could not be requested.");
        }
    }

    @com.getcapacitor.annotation.PermissionCallback
    public void welcomeLocationResult(PluginCall call) {
        if (!foregroundPermissionRequest.finish(getContext(), call, "location.foreground")) return;
        try {
            if (hasForegroundPermission()) {
                if (call != null) call.resolve();
            } else if (call != null) {
                NativePermissionDiagnostics.stage(getContext(), "location.foreground.denied");
                call.reject("Location access was not granted.");
            }
        } catch (RuntimeException error) {
            NativePermissionDiagnostics.exception(getContext(), "location.foreground.callback", error);
            if (call != null) call.reject("Location access could not be confirmed.");
        }
    }

    @PluginMethod
    public void requestBackgroundAccess(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.resolve();
            return;
        }
        try {
            if (!hasForegroundPermission()) {
                call.reject("Foreground location permission is required first.");
                return;
            }
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                    == PackageManager.PERMISSION_GRANTED) {
                call.resolve();
                return;
            }
            if (!backgroundPermissionRequest.begin(getContext(), call, "location.background")) return;
            try {
                requestPermissionForAlias("backgroundLocation", call, "backgroundLocationResult");
            } catch (RuntimeException error) {
                backgroundPermissionRequest.fail(getContext(), call, "location.background.start", error);
            }
        } catch (RuntimeException error) {
            NativePermissionDiagnostics.exception(getContext(), "location.background", error);
            call.reject("Background location permission could not be requested.");
        }
    }

    @com.getcapacitor.annotation.PermissionCallback
    public void backgroundLocationResult(PluginCall call) {
        if (!backgroundPermissionRequest.finish(getContext(), call, "location.background")) return;
        try {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                    == PackageManager.PERMISSION_GRANTED) {
                if (call != null) call.resolve();
            } else if (call != null) {
                NativePermissionDiagnostics.stage(getContext(), "location.background.denied");
                call.reject("Background location access was not granted.");
            }
        } catch (RuntimeException error) {
            NativePermissionDiagnostics.exception(getContext(), "location.background.callback", error);
            if (call != null) call.reject("Background location access could not be confirmed.");
        }
    }

    private boolean hasForegroundPermission() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }
    @PluginMethod
    public void openDiagnostics(PluginCall call) {
        if (!isDebuggableBuild()) {
            call.reject("Diagnostics are available only in debug builds.");
            return;
        }
        Intent intent = new Intent(getContext(), GeofenceProofActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    private boolean isDebuggableBuild() {
        android.content.pm.ApplicationInfo applicationInfo = getContext().getApplicationInfo();
        return applicationInfo != null
                && (applicationInfo.flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    @PluginMethod
    public void configure(PluginCall call) {
        try {
            JSONObject config = GeofenceProofManager.configure(
                    getContext(),
                    Double.parseDouble(required(call, "latitude")),
                    Double.parseDouble(required(call, "longitude")),
                    Float.parseFloat(required(call, "radiusMeters")),
                    Long.parseLong(required(call, "windowStartMs")),
                    Long.parseLong(required(call, "windowEndMs")),
                    call.getString("endpointUrl", "")
            );
            call.resolve(toJsObject(config));
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "Could not configure geofence proof." : error.getMessage());
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        try {
            GeofenceProofManager.start(getContext())
                    .addOnSuccessListener(ignored -> call.resolve(GeofenceProofPlugin.toJsObject(GeofenceProofManager.status(getContext()))))
                    .addOnFailureListener(error -> call.reject(error.getMessage(), error));
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "Could not start geofence proof." : error.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        GeofenceProofManager.stop(getContext())
                .addOnSuccessListener(ignored -> call.resolve())
                .addOnFailureListener(error -> call.reject(error.getMessage(), error));
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(toJsObject(GeofenceProofManager.status(getContext())));
    }

    @PluginMethod
    public void getEvents(PluginCall call) {
        JSObject result = new JSObject();
        result.put("events", GeofenceProofManager.events(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void clearEvents(PluginCall call) {
        GeofenceProofManager.clearEvents(getContext());
        call.resolve();
    }

    @PluginMethod
    public void flush(PluginCall call) {
        new Thread(() -> {
            boolean retry = GeofenceProofManager.flushQueued(getContext());
            JSObject result = new JSObject();
            result.put("retry", retry);
            result.put("status", toJsObject(GeofenceProofManager.status(getContext())));
            call.resolve(result);
        }).start();
    }

    private static String required(PluginCall call, String name) {
        String value = call.getString(name);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " is required.");
        }
        return value;
    }

    private static JSObject toJsObject(JSONObject json) {
        JSObject result = new JSObject();
        JSONArray names = json.names();
        if (names == null) {
            return result;
        }
        for (int index = 0; index < names.length(); index++) {
            String name = names.optString(index);
            Object value = json.opt(name);
            if (value != null && value != JSONObject.NULL) {
                result.put(name, value);
            }
        }
        return result;
    }
}