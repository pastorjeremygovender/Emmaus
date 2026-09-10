package za.co.emmaus.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * Debug-only persistence for the Android geofence proof.
 *
 * The event payload intentionally contains no member identity or coordinates.
 * Configuration and delivery bookkeeping are kept separate from the payload.
 */
final class GeofenceProofStore {
    private static final String PREFS = "emmaus_geofence_proof";
    private static final String CONFIG = "config";
    private static final String EVENTS = "events";
    private static final String QUEUE = "queue";
    private static final String HANDLED_KEYS = "handled_keys";
    private static final String DEVICE_ID = "anonymous_device_id";
    private static final String LIFECYCLE = "lifecycle_state";
    private static final String DUPLICATES = "duplicate_count";
    private static final String REBOOT_STATUS = "reboot_recovery_status";

    private GeofenceProofStore() {}

    static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized String anonymousDeviceId(Context context) {
        SharedPreferences preferences = prefs(context);
        String existing = preferences.getString(DEVICE_ID, null);
        if (existing != null && !existing.isBlank()) {
            return existing;
        }
        String generated = "proof-" + java.util.UUID.randomUUID();
        preferences.edit().putString(DEVICE_ID, generated).apply();
        return generated;
    }

    static synchronized void saveConfig(Context context, JSONObject config) {
        prefs(context).edit().putString(CONFIG, config.toString()).apply();
    }

    static synchronized JSONObject readConfig(Context context) {
        String raw = prefs(context).getString(CONFIG, null);
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return new JSONObject(raw);
        } catch (JSONException ignored) {
            return null;
        }
    }

    static synchronized void setLifecycleState(Context context, String state) {
        prefs(context).edit().putString(LIFECYCLE, state).apply();
    }

    static synchronized String lifecycleState(Context context) {
        return prefs(context).getString(LIFECYCLE, "unknown");
    }

    static synchronized int duplicateCount(Context context) {
        return prefs(context).getInt(DUPLICATES, 0);
    }

    static synchronized void incrementDuplicateCount(Context context) {
        SharedPreferences preferences = prefs(context);
        preferences.edit().putInt(DUPLICATES, preferences.getInt(DUPLICATES, 0) + 1).apply();
    }

    static synchronized void setRebootRecoveryStatus(Context context, String status) {
        prefs(context).edit().putString(REBOOT_STATUS, status).apply();
    }

    static synchronized String rebootRecoveryStatus(Context context) {
        return prefs(context).getString(REBOOT_STATUS, "not_tested");
    }

    static synchronized JSONArray readEvents(Context context) {
        return readArray(prefs(context).getString(EVENTS, "[]"));
    }

    static synchronized void appendEvent(Context context, JSONObject event) {
        JSONArray events = readEvents(context);
        events.put(event);
        prefs(context).edit().putString(EVENTS, events.toString()).apply();
    }

    static synchronized boolean hasHandledKey(Context context, String key) {
        return handledKeys(context).contains(key);
    }

    static synchronized void markHandledKey(Context context, String key) {
        Set<String> keys = handledKeys(context);
        keys.add(key);
        prefs(context).edit().putStringSet(HANDLED_KEYS, keys).apply();
    }

    static synchronized void enqueue(Context context, String key, long expiresAt, JSONObject event) {
        JSONArray queue = readArray(prefs(context).getString(QUEUE, "[]"));
        JSONObject item = new JSONObject();
        try {
            item.put("key", key);
            item.put("expiresAt", expiresAt);
            item.put("event", event);
            queue.put(item);
        } catch (JSONException ignored) {
            return;
        }
        prefs(context).edit().putString(QUEUE, queue.toString()).apply();
    }

    static synchronized JSONArray readQueue(Context context) {
        return readArray(prefs(context).getString(QUEUE, "[]"));
    }

    static synchronized void replaceQueue(Context context, JSONArray queue) {
        prefs(context).edit().putString(QUEUE, queue.toString()).apply();
    }

    static synchronized void clear(Context context) {
        prefs(context).edit().clear().apply();
    }

    private static Set<String> handledKeys(Context context) {
        return new HashSet<>(prefs(context).getStringSet(HANDLED_KEYS, Set.of()));
    }

    private static JSONArray readArray(String raw) {
        try {
            return new JSONArray(raw);
        } catch (JSONException ignored) {
            return new JSONArray();
        }
    }
}