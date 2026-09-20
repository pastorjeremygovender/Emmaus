package za.co.emmaus.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.DatePicker;
import android.app.DatePickerDialog;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.TimePicker;
import android.app.TimePickerDialog;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.DateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

public final class GeofenceProofActivity extends Activity {
    private static final int REQUEST_FOREGROUND = 8101;
    private static final int REQUEST_BACKGROUND = 8102;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private EditText latitude;
    private EditText longitude;
    private EditText radius;
    private EditText windowStart;
    private EditText windowEnd;
    private EditText endpoint;
    private TextView status;
    private TextView results;
    private final Runnable refresh = new Runnable() {
        @Override
        public void run() {
            renderStatus();
            handler.postDelayed(this, 2_000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        GeofenceProofManager.setLifecycleState(this, "foreground_activity");
        setContentView(buildView());
        renderStatus();
    }

    @Override
    protected void onStart() {
        super.onStart();
        GeofenceProofManager.setLifecycleState(this, "foreground_activity");
        handler.post(refresh);
    }

    @Override
    protected void onResume() {
        super.onResume();
        renderStatus();
    }

    @Override
    protected void onStop() {
        GeofenceProofManager.setLifecycleState(this, "background_receiver");
        handler.removeCallbacks(refresh);
        super.onStop();
    }

    private View buildView() {
        int padding = (int) (getResources().getDisplayMetrics().density * 20);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(padding, padding, padding, padding);

        TextView title = text("Emmaus Geofence Test", 26);
        content.addView(title, wrap());

        TextView subtitle = text("Isolated debug test only. This app does not open Emmaus or sign you in.", 16);
        content.addView(subtitle, wrapWithBottomMargin(20));

        TextView explanation = text(
                "This is an isolated Emmaus location test. It records only whether this test phone enters "
                        + "the test area during the selected period. It does not record your route, continuously "
                        + "track you, identify an Emmaus user or send information to the production Emmaus system.",
                16
        );
        content.addView(explanation, wrapWithBottomMargin(20));

        content.addView(text("1. Choose a temporary test area", 20), wrapWithBottomMargin(8));
        Button setLocation = button("Set test location to where I am now", v -> setLocationToNow());
        content.addView(setLocation, wrapWithBottomMargin(8));
        content.addView(text("This uses one location reading to fill the form. It stays on this test phone and is never copied into results.", 14), wrapWithBottomMargin(12));

        latitude = addField(content, "Test latitude", "", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL | InputType.TYPE_NUMBER_FLAG_SIGNED);
        longitude = addField(content, "Test longitude", "", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL | InputType.TYPE_NUMBER_FLAG_SIGNED);
        radius = addField(content, "Test radius in metres", "150", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        windowStart = addTimeField(content, "Test start time", System.currentTimeMillis() - 60_000);
        windowEnd = addTimeField(content, "Test end time", System.currentTimeMillis() + 2 * 60 * 60 * 1000L);
        endpoint = addField(content, "Optional isolated test endpoint (leave blank for local-only results)", "", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);

        content.addView(text("For the simplest test, leave the endpoint blank. Production Emmaus endpoints are blocked.", 14), wrapWithBottomMargin(20));

        content.addView(text("2. Prepare permissions", 20), wrapWithBottomMargin(8));
        content.addView(button("Explain permissions", v -> showPermissionExplanation()), wrapWithBottomMargin(8));
        content.addView(button("Grant location permission", v -> requestForegroundPermission()), wrapWithBottomMargin(8));
        content.addView(button("Grant background location permission", v -> requestBackgroundPermission()), wrapWithBottomMargin(20));

        content.addView(text("3. Run the test", 20), wrapWithBottomMargin(8));
        content.addView(button("Start test", v -> startGeofence()), wrapWithBottomMargin(8));
        content.addView(button("Stop test", v -> stopGeofence()), wrapWithBottomMargin(8));
        content.addView(button("Test status", v -> renderStatus()), wrapWithBottomMargin(20));

        content.addView(text("4. Read or clear results", 20), wrapWithBottomMargin(8));
        content.addView(button("View results", v -> showResults()), wrapWithBottomMargin(8));
        content.addView(button("Copy results", v -> copyResults()), wrapWithBottomMargin(8));
        content.addView(button("Clear test data", v -> confirmClearTestData()), wrapWithBottomMargin(20));

        content.addView(text("STATUS", 20), wrapWithBottomMargin(8));
        status = text("", 15);
        status.setTextIsSelectable(true);
        content.addView(status, wrapWithBottomMargin(20));

        content.addView(text("RESULTS", 20), wrapWithBottomMargin(8));
        results = text("", 15);
        results.setTextIsSelectable(true);
        content.addView(results, wrap());

        ScrollView scroll = new ScrollView(this);
        scroll.addView(content);
        return scroll;
    }

    private EditText addField(LinearLayout parent, String label, String value, int inputType) {
        TextView labelView = text(label, 15);
        parent.addView(labelView, wrap());
        EditText input = new EditText(this);
        input.setText(value);
        input.setTextSize(16);
        input.setSingleLine(true);
        input.setInputType(inputType);
        parent.addView(input, wrapWithBottomMargin(10));
        return input;
    }

    private EditText addTimeField(LinearLayout parent, String label, long initialTime) {
        TextView labelView = text(label, 15);
        parent.addView(labelView, wrap());
        EditText input = new EditText(this);
        input.setText(formatTime(initialTime));
        input.setTextSize(16);
        input.setSingleLine(true);
        input.setFocusable(false);
        input.setClickable(true);
        input.setTag(initialTime);
        input.setOnClickListener(v -> chooseTime(input, label));
        parent.addView(input, wrapWithBottomMargin(10));
        return input;
    }

    private void chooseTime(EditText field, String label) {
        long current = field.getTag() instanceof Long ? (Long) field.getTag() : System.currentTimeMillis();
        Calendar calendar = Calendar.getInstance();
        calendar.setTimeInMillis(current);
        DatePickerDialog datePicker = new DatePickerDialog(
                this,
                (DatePicker view, int year, int month, int day) -> {
                    calendar.set(Calendar.YEAR, year);
                    calendar.set(Calendar.MONTH, month);
                    calendar.set(Calendar.DAY_OF_MONTH, day);
                    new TimePickerDialog(
                            this,
                            (TimePicker timeView, int hour, int minute) -> {
                                calendar.set(Calendar.HOUR_OF_DAY, hour);
                                calendar.set(Calendar.MINUTE, minute);
                                calendar.set(Calendar.SECOND, 0);
                                calendar.set(Calendar.MILLISECOND, 0);
                                long selected = calendar.getTimeInMillis();
                                field.setTag(selected);
                                field.setText(formatTime(selected));
                            },
                            calendar.get(Calendar.HOUR_OF_DAY),
                            calendar.get(Calendar.MINUTE),
                            true
                    ).show();
                },
                calendar.get(Calendar.YEAR),
                calendar.get(Calendar.MONTH),
                calendar.get(Calendar.DAY_OF_MONTH)
        );
        datePicker.setTitle("Choose " + label.toLowerCase(Locale.getDefault()));
        datePicker.show();
    }

    private void setLocationToNow() {
        if (!GeofenceProofManager.hasForegroundLocationPermission(this)) {
            status.setText("Grant location permission first, then try this button again.");
            return;
        }
        if (!GeofenceProofManager.locationServicesEnabledForUi(this)) {
            status.setText("Turn on Location in the phone settings, then try this button again.");
            return;
        }

        CancellationTokenSource cancellation = new CancellationTokenSource();
        LocationServices.getFusedLocationProviderClient(this)
                .getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, cancellation.getToken())
                .addOnSuccessListener(location -> {
                    if (location == null) {
                        status.setText("The phone did not provide a location. Move outdoors or try again.");
                        return;
                    }
                    latitude.setText(String.format(Locale.US, "%.6f", location.getLatitude()));
                    longitude.setText(String.format(Locale.US, "%.6f", location.getLongitude()));
                    status.setText("Test location set on this phone. Coordinates will not appear in copied results.");
                })
                .addOnFailureListener(error -> status.setText("Could not read the phone location: " + error.getMessage()));
    }

    private void showPermissionExplanation() {
        new AlertDialog.Builder(this)
                .setTitle("About permissions")
                .setMessage(
                        "This is an isolated Emmaus location test. It records only whether this test phone enters "
                                + "the test area during the selected period. It does not record your route, continuously "
                                + "track you, identify an Emmaus user or send information to the production Emmaus system.\n\n"
                                + "Foreground location lets the app set up the test. Background location lets Android "
                                + "notice entry while this test app is not open. You can uninstall the test app when finished."
                )
                .setPositiveButton("OK", null)
                .show();
    }

    private void requestForegroundPermission() {
        if (GeofenceProofManager.hasForegroundLocationPermission(this)) {
            status.setText("Foreground location permission is already granted.");
            return;
        }
        ActivityCompat.requestPermissions(
                this,
                new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
                REQUEST_FOREGROUND
        );
    }

    private void requestBackgroundPermission() {
        if (!GeofenceProofManager.hasForegroundLocationPermission(this)) {
            status.setText("Grant location permission first, then grant background location permission.");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            status.setText("This Android version uses the foreground location permission for this test.");
            return;
        }
        if (GeofenceProofManager.hasBackgroundLocationPermission(this)) {
            status.setText("Background location permission is already granted.");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            new AlertDialog.Builder(this)
                    .setTitle("Allow background location")
                    .setMessage("On the next screen, choose Permissions, Location, then Allow all the time. Return here when finished.")
                    .setPositiveButton("Open settings", (dialog, which) -> openAppSettings())
                    .setNegativeButton("Cancel", null)
                    .show();
            return;
        }
        ActivityCompat.requestPermissions(
                this,
                new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION},
                REQUEST_BACKGROUND
        );
    }

    private void openAppSettings() {
        Intent intent = new Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getPackageName())
        );
        startActivity(intent);
    }

    private void startGeofence() {
        try {
            GeofenceProofManager.configure(
                    this,
                    Double.parseDouble(latitude.getText().toString().trim()),
                    Double.parseDouble(longitude.getText().toString().trim()),
                    Float.parseFloat(radius.getText().toString().trim()),
                    windowValue(windowStart),
                    windowValue(windowEnd),
                    endpoint.getText().toString().trim()
            );
            GeofenceProofManager.start(this)
                    .addOnSuccessListener(ignored -> renderStatus())
                    .addOnFailureListener(error -> status.setText("Start failed: " + message(error)));
        } catch (Exception error) {
            status.setText("Configuration failed: " + message(error));
        }
    }

    private long windowValue(EditText field) {
        Object tag = field.getTag();
        if (tag instanceof Long) {
            return (Long) tag;
        }
        return Long.parseLong(field.getText().toString().trim());
    }

    private void stopGeofence() {
        GeofenceProofManager.stop(this)
                .addOnSuccessListener(ignored -> renderStatus())
                .addOnFailureListener(error -> status.setText("Stop failed: " + message(error)));
    }

    private void renderStatus() {
        if (status == null) {
            return;
        }
        JSONObject value = GeofenceProofManager.status(this);
        StringBuilder text = new StringBuilder();
        text.append("Test armed: ").append(value.optBoolean("test_armed", false) ? "YES" : "NO").append('\n');
        text.append("Test window: ").append(formatTime(value.optLong("window_start_ms", 0)))
                .append(" to ").append(formatTime(value.optLong("window_end_ms", 0))).append('\n');
        text.append("Radius: ").append(formatNumber(value.optDouble("radius_meters", 0))).append(" metres\n");
        text.append("Foreground permission: ").append(yesNo(value.optBoolean("foreground_location_granted", false))).append('\n');
        text.append("Background permission: ").append(yesNo(value.optBoolean("background_location_granted", false))).append('\n');
        text.append("Location services: ").append(value.optBoolean("location_services_enabled", false) ? "ON" : "OFF").append('\n');
        text.append("Battery optimisation: ").append(value.optString("battery_optimization_ignored", "unknown")).append('\n');
        text.append("Internet: ").append(value.optBoolean("validated_network_available", false) ? "ONLINE" : "OFFLINE").append('\n');
        text.append("Waiting for connectivity: ").append(yesNo(value.optBoolean("waiting_for_connectivity", false))).append('\n');
        text.append("Duplicate events suppressed: ").append(value.optInt("duplicate_events_suppressed", 0)).append('\n');
        text.append("Test expiry: ").append(value.optBoolean("test_expired", false) ? "EXPIRED" : "not expired").append('\n');
        text.append("Reboot recovery: ").append(value.optString("reboot_recovery_status", "not_tested")).append('\n');
        text.append("Last geofence event: ").append(formatEvent(value.optJSONObject("last_geofence_event")));
        status.setText(text.toString());
        if (results != null) {
            results.setText(buildResultsText());
        }
    }

    private String buildResultsText() {
        JSONObject value = GeofenceProofManager.status(this);
        StringBuilder text = new StringBuilder();
        JSONArray events = GeofenceProofManager.events(this);
        if (events.length() == 0) {
            text.append("No geofence entry has been recorded yet.\n");
        } else {
            for (int index = 0; index < events.length(); index++) {
                text.append("Event ").append(index + 1).append('\n');
                text.append(formatEvent(events.optJSONObject(index))).append("\n\n");
            }
        }
        text.append("Reboot recovery result: ").append(value.optString("reboot_recovery_status", "not_tested")).append('\n');
        text.append("Duplicate suppression result: ").append(value.optInt("duplicate_events_suppressed", 0)).append(" duplicate event(s) suppressed.\n");
        text.append("\nCoordinates, device identifiers and personal information are never included in copied results.");
        return text.toString();
    }

    private void showResults() {
        new AlertDialog.Builder(this)
                .setTitle("Test results")
                .setMessage(buildResultsText())
                .setPositiveButton("Close", null)
                .show();
    }

    private void copyResults() {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard != null) {
            clipboard.setPrimaryClip(ClipData.newPlainText("Emmaus geofence test results", buildResultsText()));
            Toast.makeText(this, "Safe test results copied. Coordinates and identifiers were excluded.", Toast.LENGTH_LONG).show();
        }
    }

    private void confirmClearTestData() {
        new AlertDialog.Builder(this)
                .setTitle("Clear all test data?")
                .setMessage("This deletes the local test location, events, queue and test configuration from this phone.")
                .setPositiveButton("Clear test data", (dialog, which) -> {
                    GeofenceProofManager.clearTestData(this)
                            .addOnCompleteListener(ignored -> renderStatus());
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private String formatEvent(JSONObject event) {
        if (event == null) {
            return "none";
        }
        return event.optString("event_type", "unknown")
                + " | detected " + formatTime(event.optLong("detection_timestamp", 0))
                + " | shown " + formatTime(event.optLong("received_timestamp", 0))
                + " | delay " + event.optLong("delivery_delay_ms", 0) + " ms"
                + " | offline " + yesNo(event.optBoolean("queued_offline", false))
                + " | app state " + event.optString("app_lifecycle_state", "unknown");
    }

    private String formatTime(long timestamp) {
        if (timestamp <= 0) {
            return "not set";
        }
        return DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, Locale.getDefault())
                .format(new Date(timestamp));
    }

    private String formatNumber(double value) {
        return String.format(Locale.getDefault(), "%.0f", value);
    }

    private String yesNo(boolean value) {
        return value ? "YES" : "NO";
    }

    private String message(Throwable error) {
        return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
    }

    private TextView text(String value, int size) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        return view;
    }

    private Button button(String label, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(16);
        button.setAllCaps(false);
        button.setMinHeight((int) (getResources().getDisplayMetrics().density * 56));
        button.setOnClickListener(listener);
        return button;
    }

    private LinearLayout.LayoutParams wrap() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
    }

    private LinearLayout.LayoutParams wrapWithBottomMargin(int marginDp) {
        LinearLayout.LayoutParams params = wrap();
        params.bottomMargin = (int) (getResources().getDisplayMetrics().density * marginDp);
        return params;
    }
}