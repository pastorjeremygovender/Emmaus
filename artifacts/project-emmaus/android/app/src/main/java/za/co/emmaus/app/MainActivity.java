package za.co.emmaus.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "EmmausMainActivity";
    private static final String WIDGET_PROMPT_PREFS = "emmaus_widget_prompt";
    private static final String KEY_PROMPT_REQUESTED = "daily_rhythm_prompt_requested";

    interface EmmausPermissionCallback { void onResult(boolean granted); }
    private EmmausPermissionCallback pendingPermissionCallback;
    private String[] pendingPermissions;
    private final ActivityResultLauncher<String[]> emmausPermissionLauncher =
        registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), ignored -> {
            EmmausPermissionCallback callback = pendingPermissionCallback;
            String[] permissions = pendingPermissions;
            pendingPermissionCallback = null;
            pendingPermissions = null;
            if (callback == null || permissions == null) return;
            boolean granted = true;
            for (String permission : permissions) {
                if (ContextCompat.checkSelfPermission(this, permission) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    granted = false;
                    break;
                }
            }
            callback.onResult(granted);
        });

    boolean requestEmmausPermissions(String[] permissions, EmmausPermissionCallback callback) {
        if (permissions == null || permissions.length == 0 || callback == null
                || pendingPermissionCallback != null || isFinishing() || isDestroyed()) return false;
        pendingPermissionCallback = callback;
        pendingPermissions = permissions.clone();
        try {
            emmausPermissionLauncher.launch(pendingPermissions);
            return true;
        } catch (RuntimeException error) {
            pendingPermissionCallback = null;
            pendingPermissions = null;
            NativePermissionDiagnostics.exception(this, "permission-broker.launch", error);
            return false;
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GeofenceProofPlugin.class);
        registerPlugin(WelcomeAssistBluetoothPlugin.class);
        registerPlugin(DailyRhythmDeepLinkPlugin.class);
        registerPlugin(DailyReminderPlugin.class);
        registerPlugin(EmmausDiagnosticsPlugin.class);
        DailyRhythmDeepLinkPlugin.captureIntent(this, getIntent(), "activity_on_create");
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onNewIntent(Intent intent) {
        DailyRhythmDeepLinkPlugin.captureIntent(this, intent, "activity_on_new_intent");
        setIntent(intent);
        super.onNewIntent(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        Log.i(TAG, "stage=activity_resumed");
        DailyRhythmWidgetProvider.refresh(this);
        new Handler(Looper.getMainLooper()).postDelayed(this::offerDailyRhythmWidget, 1200);
    }

    private void offerDailyRhythmWidget() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        AppWidgetManager manager = AppWidgetManager.getInstance(this);
        ComponentName provider = new ComponentName(this, DailyRhythmWidgetProvider.class);
        if (!manager.isRequestPinAppWidgetSupported()) return;
        if (manager.getAppWidgetIds(provider).length > 0) return;

        boolean alreadyRequested = getSharedPreferences(WIDGET_PROMPT_PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_PROMPT_REQUESTED, false);
        if (alreadyRequested) return;

        boolean requestOpened = manager.requestPinAppWidget(provider, null, null);
        if (requestOpened) {
            getSharedPreferences(WIDGET_PROMPT_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_PROMPT_REQUESTED, true)
                .apply();
        }
    }
}
