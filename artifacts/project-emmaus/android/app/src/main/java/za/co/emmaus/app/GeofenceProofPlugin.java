package za.co.emmaus.app;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "GeofenceProof")
public final class GeofenceProofPlugin extends Plugin {
    @PluginMethod
    public void openDiagnostics(PluginCall call) {
        Intent intent = new Intent(getContext(), GeofenceProofActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
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