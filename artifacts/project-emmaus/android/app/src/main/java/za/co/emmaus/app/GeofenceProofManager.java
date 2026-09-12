package za.co.emmaus.app;

import android.Manifest;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.PowerManager;
import android.location.LocationManager;

import androidx.core.content.ContextCompat;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingClient;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.tasks.Task;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
final class GeofenceProofManager {
    static final String REQUEST_ID = "emmaus-geofence-proof";
    static final int FLUSH_JOB_ID = 4817;
    private static final long DEFAULT_QUEUE_EXPIRY_MS = 24L * 60L * 60L * 1000L;

    private GeofenceProofManager() {}

    static JSONObject configure(
            Context context,
            double latitude,
            double longitude,
            float radiusMeters,
            long windowStartMs,
            long windowEndMs,
            String endpointUrl
    ) throws JSONException {
        if (latitude < -90 || latitude > 90) {
            throw new IllegalArgumentException("Latitude must be between -90 and 90.");
        }
        if (longitude < -180 || longitude > 180) {
            throw new IllegalArgumentException("Longitude must be between -180 and 180.");
        }
        if (radiusMeters < 50 || radiusMeters > 10_000) {
            throw new IllegalArgumentException("Radius must be between 50 and 10,000 metres.");
        }
        if (windowEndMs <= windowStartMs) {
            throw new IllegalArgumentException("The test window end must be after its start.");
        }
        validateEndpoint(endpointUrl);

        JSONObject config = new JSONObject();
        config.put("latitude", latitude);
        config.put("longitude", longitude);
        config.put("radiusMeters", radiusMeters);
        config.put("windowStartMs", windowStartMs);
        config.put("windowEndMs", windowEndMs);
        config.put("endpointUrl", endpointUrl == null ? "" : endpointUrl.trim());
        config.put("queueExpiryMs", DEFAULT_QUEUE_EXPIRY_MS);
        config.put("enabled", false);
        GeofenceProofStore.saveConfig(context, config);
        return config;
    }

    static Task<Void> start(Context context) {
        JSONObject config = requireConfig(context);
        ensurePermissions(context);
        long now = System.currentTimeMillis();
        long end = config.optLong("windowEndMs", 0);
        if (end <= now) {
            throw new IllegalStateException("The configured test window has already ended.");
        }

        try {
            config.put("enabled", true);
        } catch (JSONException error) {
            throw new IllegalStateException("Could not enable the test geofence.", error);
        }
        GeofenceProofStore.saveConfig(context, config);
        return addGeofence(context, config);
    }

    static Task<Void> stop(Context context) {
        JSONObject config = GeofenceProofStore.readConfig(context);
        if (config != null) {
            try {
                config.put("enabled", false);
            } catch (JSONException error) {
                throw new IllegalStateException("Could not disable the test geofence.", error);
            }
            GeofenceProofStore.saveConfig(context, config);
        }
        return LocationServices.getGeofencingClient(context.getApplicationContext())
                .removeGeofences(pendingIntent(context));
    }

    static void restoreAfterBoot(Context context) {
        JSONObject config = GeofenceProofStore.readConfig(context);
        if (config == null || !config.optBoolean("enabled", false)) {
            GeofenceProofStore.setRebootRecoveryStatus(context, "no_active_test");
            return;
        }
        long now = System.currentTimeMillis();
        if (config.optLong("windowEndMs", 0) <= now) {
            GeofenceProofStore.setRebootRecoveryStatus(context, "test_expired");
            return;
        }
        if (!hasLocationPermissions(context)) {
            GeofenceProofStore.setRebootRecoveryStatus(context, "waiting_for_location_permission");
            return;
        }
        addGeofence(context, config)
                .addOnSuccessListener(ignored -> GeofenceProofStore.setRebootRecoveryStatus(context, "restored"))
                .addOnFailureListener(error -> {
                    GeofenceProofStore.setRebootRecoveryStatus(context, "restore_failed");
                    android.util.Log.w("GeofenceProof", "Unable to restore geofence after boot", error);
                });
    }

    static JSONObject recordEntry(Context context) {
        JSONObject config = GeofenceProofStore.readConfig(context);
        if (config == null || !config.optBoolean("enabled", false)) {
            return null;
        }

        long now = System.currentTimeMillis();
        long start = config.optLong("windowStartMs", 0);
        long end = config.optLong("windowEndMs", 0);
        if (now < start || now > end) {
            return null;
        }

        // Duplicate suppression is scoped to this local test window. The
        // device identifier is deliberately not included in events or queues.
        String eventKey = start + ":" + end;
        if (GeofenceProofStore.hasHandledKey(context, eventKey)) {
            GeofenceProofStore.incrementDuplicateCount(context);
            return null;
        }

        boolean offline = !hasValidatedNetwork(context);
        JSONObject event = new JSONObject();
        try {
            event.put("event_type", "geofence_entry");
            event.put("detection_timestamp", now);
            event.put("received_timestamp", System.currentTimeMillis());
            event.put("delivery_delay_ms", Math.max(0L, event.optLong("received_timestamp") - now));
            event.put("queued_offline", offline);
            event.put("app_lifecycle_state", GeofenceProofStore.lifecycleState(context));
        } catch (JSONException error) {
            throw new IllegalStateException("Could not create diagnostic event.", error);
        }

        GeofenceProofStore.markHandledKey(context, eventKey);
        GeofenceProofStore.appendEvent(context, event);

        String endpoint = config.optString("endpointUrl", "").trim();
        if (!endpoint.isEmpty()) {
            long expiry = now + config.optLong("queueExpiryMs", DEFAULT_QUEUE_EXPIRY_MS);
            GeofenceProofStore.enqueue(context, eventKey, expiry, event);
            scheduleFlush(context);
        }
        return event;
    }

    static JSONObject status(Context context) {
        JSONObject status = new JSONObject();
        JSONObject config = GeofenceProofStore.readConfig(context);
        long now = System.currentTimeMillis();
        long windowStart = config == null ? 0 : config.optLong("windowStartMs", 0);
        long windowEnd = config == null ? 0 : config.optLong("windowEndMs", 0);
        int pending = pendingQueueCount(context);
        try {
            status.put("test_armed", config != null && config.optBoolean("enabled", false)
                    && now >= windowStart && now <= windowEnd);
            status.put("test_expired", config != null && windowEnd > 0 && now > windowEnd);
            status.put("window_start_ms", windowStart);
            status.put("window_end_ms", windowEnd);
            status.put("radius_meters", config == null ? 0 : config.optDouble("radiusMeters", 0));
            status.put("foreground_location_granted", hasForegroundLocationPermission(context));
            status.put("background_location_granted", hasBackgroundLocationPermission(context));
            status.put("location_services_enabled", locationServicesEnabledForUi(context));
            status.put("battery_optimization_ignored", batteryOptimizationIgnored(context));
            status.put("validated_network_available", hasValidatedNetwork(context));
            status.put("event_count", GeofenceProofStore.readEvents(context).length());
            status.put("pending_delivery_count", pending);
            status.put("waiting_for_connectivity", pending > 0 && !hasValidatedNetwork(context));
            status.put("duplicate_events_suppressed", GeofenceProofStore.duplicateCount(context));
            status.put("reboot_recovery_status", GeofenceProofStore.rebootRecoveryStatus(context));
            status.put("lifecycle_state", GeofenceProofStore.lifecycleState(context));
            JSONArray storedEvents = GeofenceProofStore.readEvents(context);
            JSONObject lastEvent = storedEvents.length() == 0 ? null : sanitizeEvent(storedEvents.optJSONObject(storedEvents.length() - 1));
            if (lastEvent != null) {
                status.put("last_geofence_event", lastEvent);
            }
        } catch (JSONException ignored) {
            // JSONObject construction above only uses primitive values.
        }
        return status;
    }

    static JSONArray events(Context context) {
        JSONArray sanitized = new JSONArray();
        JSONArray stored = GeofenceProofStore.readEvents(context);
        for (int index = 0; index < stored.length(); index++) {
            JSONObject event = sanitizeEvent(stored.optJSONObject(index));
            if (event != null) {
                sanitized.put(event);
            }
        }
        return sanitized;
    }

    static void clearEvents(Context context) {
        GeofenceProofStore.clear(context);
    }

    static Task<Void> clearTestData(Context context) {
        GeofenceProofStore.clear(context);
        return LocationServices.getGeofencingClient(context.getApplicationContext())
                .removeGeofences(pendingIntent(context));
    }

    static void setLifecycleState(Context context, String state) {
        GeofenceProofStore.setLifecycleState(context, state);
    }

    static boolean hasForegroundLocationPermission(Context context) {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    static boolean hasBackgroundLocationPermission(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return hasForegroundLocationPermission(context);
        }
        return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    static boolean hasLocationPermissions(Context context) {
        return hasForegroundLocationPermission(context) && hasBackgroundLocationPermission(context);
    }

    static boolean flushQueued(Context context) {
        JSONObject config = GeofenceProofStore.readConfig(context);
        if (config == null) {
            return false;
        }
        String endpoint = config.optString("endpointUrl", "").trim();
        if (endpoint.isEmpty() || !hasValidatedNetwork(context)) {
            return false;
        }

        long now = System.currentTimeMillis();
        JSONArray queue = GeofenceProofStore.readQueue(context);
        JSONArray remaining = new JSONArray();
        boolean retry = false;
        for (int index = 0; index < queue.length(); index++) {
            JSONObject item = queue.optJSONObject(index);
            if (item == null) {
                continue;
            }
            long expiresAt = item.optLong("expiresAt", 0);
            if (expiresAt <= now) {
                continue;
            }
            JSONObject event = item.optJSONObject("event");
            if (event == null) {
                continue;
            }
            try {
                if (!postEvent(endpoint, event)) {
                    remaining.put(item);
                    retry = true;
                }
            } catch (Exception error) {
                remaining.put(item);
                retry = true;
            }
        }
        GeofenceProofStore.replaceQueue(context, remaining);
        return retry;
    }

    static int pendingQueueCount(Context context) {
        JSONArray queue = GeofenceProofStore.readQueue(context);
        long now = System.currentTimeMillis();
        int count = 0;
        for (int index = 0; index < queue.length(); index++) {
            JSONObject item = queue.optJSONObject(index);
            if (item != null && item.optLong("expiresAt", 0) > now) {
                count++;
            }
        }
        return count;
    }

    static void scheduleFlush(Context context) {
        JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (scheduler == null) {
            return;
        }
        JobInfo job = new JobInfo.Builder(
                FLUSH_JOB_ID,
                new ComponentName(context, GeofenceProofJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .setMinimumLatency(0)
                .build();
        scheduler.schedule(job);
    }

    private static Task<Void> addGeofence(Context context, JSONObject config) {
        Geofence geofence = new Geofence.Builder()
                .setRequestId(REQUEST_ID)
                .setCircularRegion(
                        config.optDouble("latitude"),
                        config.optDouble("longitude"),
                        (float) config.optDouble("radiusMeters"))
                .setExpirationDuration(Math.max(1L, config.optLong("windowEndMs") - System.currentTimeMillis()))
                .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
                .build();

        GeofencingRequest request = new GeofencingRequest.Builder()
                .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
                .addGeofence(geofence)
                .build();

        return LocationServices.getGeofencingClient(context.getApplicationContext())
                .addGeofences(request, pendingIntent(context));
    }

    private static PendingIntent pendingIntent(Context context) {
        Intent intent = new Intent(context, GeofenceProofReceiver.class)
                .setAction("za.co.emmaus.app.GEOFENCE_PROOF_EVENT");
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(context, 4818, intent, flags);
    }

    private static JSONObject requireConfig(Context context) {
        JSONObject config = GeofenceProofStore.readConfig(context);
        if (config == null) {
            throw new IllegalStateException("Configure a test geofence first.");
        }
        return config;
    }

    private static void ensurePermissions(Context context) {
        if (!hasForegroundLocationPermission(context)) {
            throw new SecurityException("Foreground location permission is required.");
        }
        if (!hasBackgroundLocationPermission(context)) {
            throw new SecurityException("Background location permission is required.");
        }
    }

    private static boolean hasValidatedNetwork(Context context) {
        ConnectivityManager connectivity = (ConnectivityManager)
                context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivity == null) {
            return false;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Network network = connectivity.getActiveNetwork();
            if (network == null) {
                return false;
            }
            NetworkCapabilities capabilities = connectivity.getNetworkCapabilities(network);
            return capabilities != null
                    && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        }
        android.net.NetworkInfo info = connectivity.getActiveNetworkInfo();
        return info != null && info.isConnected();
    }

    static boolean locationServicesEnabledForUi(Context context) {
        LocationManager locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) {
            return false;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return locationManager.isLocationEnabled();
        }
        try {
            return locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
                    || locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception ignored) {
            return false;
        }
    }

    private static String batteryOptimizationIgnored(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return "not_applicable";
        }
        PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (powerManager == null) {
            return "unknown";
        }
        return powerManager.isIgnoringBatteryOptimizations(context.getPackageName()) ? "ignored" : "active";
    }

    private static JSONObject sanitizeEvent(JSONObject event) {
        if (event == null) {
            return null;
        }
        JSONObject safe = new JSONObject();
        try {
            safe.put("event_type", event.optString("event_type", "unknown"));
            safe.put("detection_timestamp", event.optLong("detection_timestamp", 0));
            safe.put("received_timestamp", event.optLong("received_timestamp", 0));
            safe.put("delivery_delay_ms", event.optLong("delivery_delay_ms", 0));
            safe.put("queued_offline", event.optBoolean("queued_offline", false));
            safe.put("app_lifecycle_state", event.optString("app_lifecycle_state", "unknown"));
        } catch (JSONException ignored) {
            return null;
        }
        return safe;
    }

    private static void validateEndpoint(String endpointUrl) {
        if (endpointUrl == null || endpointUrl.trim().isEmpty()) {
            return;
        }
        try {
            URL endpoint = new URL(endpointUrl.trim());
            String host = endpoint.getHost().toLowerCase();
            if (host.equals("emmaus.co.za") || host.endsWith(".emmaus.co.za")) {
                throw new IllegalArgumentException("Production Emmaus endpoints are not allowed.");
            }
            if (!endpoint.getProtocol().equals("http") && !endpoint.getProtocol().equals("https")) {
                throw new IllegalArgumentException("The diagnostic endpoint must use HTTP or HTTPS.");
            }
        } catch (java.net.MalformedURLException error) {
            throw new IllegalArgumentException("The diagnostic endpoint is not a valid URL.");
        }
    }

    private static boolean postEvent(String endpointUrl, JSONObject event) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(endpointUrl).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(5_000);
        connection.setReadTimeout(5_000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json");
        byte[] body = event.toString().getBytes(StandardCharsets.UTF_8);
        connection.setFixedLengthStreamingMode(body.length);
        try (OutputStream output = connection.getOutputStream()) {
            output.write(body);
        }
        int responseCode = connection.getResponseCode();
        InputStream stream = responseCode >= 400 ? connection.getErrorStream() : connection.getInputStream();
        if (stream != null) {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream))) {
                while (reader.readLine() != null) {
                    // Drain the response so the connection can be reused/closed cleanly.
                }
            }
        }
        connection.disconnect();
        return responseCode >= 200 && responseCode < 300;
    }
}