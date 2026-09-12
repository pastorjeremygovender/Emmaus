package za.co.emmaus.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.Calendar;

@CapacitorPlugin(name = "DailyReminder", permissions = @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS}))
public final class DailyReminderPlugin extends Plugin {
    private static final String PREFS = "daily_reminders";
    private static final String ENABLED = "enabled";
    private static final String MINUTE = "minute";
    private static final int ALARM = 9100;
    private final PermissionRequestGuard permissionRequest = new PermissionRequestGuard();

    @PluginMethod public void status(PluginCall call) {
        try {
            call.resolve(statusObject());
        } catch (RuntimeException error) {
            // Settings must remain renderable even if an Android permission or
            // preference provider is temporarily unavailable.
            JSObject fallback = new JSObject();
            fallback.put("enabled", false);
            fallback.put("time", "09:00");
            fallback.put("permission", "prompt");
            fallback.put("supported", true);
            call.resolve(fallback);
        }
    }

    @PluginMethod public void enable(PluginCall call) {
        try {
            if (!hasNotificationPermission()) {
                if (!permissionRequest.begin(getContext(), call, "daily-reminders.notification")) return;
                try {
                    requestPermissionForAlias("notifications", call, "notificationResult");
                } catch (RuntimeException error) {
                    permissionRequest.fail(getContext(), call, "daily-reminders.notification.start", error);
                }
                return;
            }
            enableNow(call);
        } catch (RuntimeException error) {
            NativePermissionDiagnostics.exception(getContext(), "daily-reminders.enable", error);
            call.reject("Daily reminders could not be enabled.");
        }
    }

    @PermissionCallback public void notificationResult(PluginCall call) {
        if (!permissionRequest.finish(getContext(), call, "daily-reminders.notification")) return;
        try {
            if (!hasNotificationPermission()) {
                NativePermissionDiagnostics.stage(getContext(), "daily-reminders.notification.denied");
                if (call != null) call.resolve(statusObject());
                return;
            }
            enableNow(call);
        } catch (RuntimeException error) {
            NativePermissionDiagnostics.exception(getContext(), "daily-reminders.notification.callback", error);
            if (call != null) call.reject("Daily reminders could not be enabled.");
        }
    }

    @PluginMethod public void setTime(PluginCall call) {
        String value = call.getString("time", "09:00");
        try {
            String[] parts = value.split(":");
            int hour = Integer.parseInt(parts[0]), minute = Integer.parseInt(parts[1]);
            if (hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new Exception();
            prefs(getContext()).edit().putInt(MINUTE, hour * 60 + minute).apply();
            if (isEnabled(getContext())) scheduleStored(getContext());
            call.resolve(statusObject());
        } catch (Exception error) { call.reject("Reminder time must be HH:MM."); }
    }

    @PluginMethod public void disable(PluginCall call) {
        prefs(getContext()).edit().putBoolean(ENABLED, false).apply();
        cancel(getContext());
        call.resolve(statusObject());
    }

    @PluginMethod public void test(PluginCall call) {
        if (!isEnabled(getContext())) { call.reject("Daily reminders are disabled."); return; }
        getContext().sendBroadcast(new Intent(DailyReminderReceiver.ACTION));
        call.resolve();
    }

    private void enableNow(PluginCall call) {
        prefs(getContext()).edit().putBoolean(ENABLED, true).apply();
        scheduleStored(getContext());
        call.resolve(statusObject());
    }
    static boolean isEnabled(Context c) { return prefs(c).getBoolean(ENABLED, false); }
    static void scheduleStored(Context c) {
        if (!isEnabled(c)) return;
        AlarmManager alarm = (AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
        if (alarm == null) return;
        Calendar next = Calendar.getInstance();
        int minute = prefs(c).getInt(MINUTE, 540);
        next.set(Calendar.HOUR_OF_DAY, minute / 60); next.set(Calendar.MINUTE, minute % 60); next.set(Calendar.SECOND, 0); next.set(Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= System.currentTimeMillis()) next.add(Calendar.DAY_OF_YEAR, 1);
        PendingIntent pending = pending(c);
        alarm.setInexactRepeating(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), AlarmManager.INTERVAL_DAY, pending);
    }
    private static void cancel(Context c) { AlarmManager a=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE); if(a!=null)a.cancel(pending(c)); }
    private static PendingIntent pending(Context c) { return PendingIntent.getBroadcast(c, ALARM, new Intent(c, DailyReminderReceiver.class), PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0)); }
    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private JSObject statusObject() {
        SharedPreferences preferences = prefs(getContext());
        JSObject result = new JSObject();
        result.put("enabled", preferences.getBoolean(ENABLED, false));
        result.put("time", format(preferences.getInt(MINUTE, 540)));
        result.put("permission", permissionState());
        result.put("supported", true);
        return result;
    }

    private boolean hasNotificationPermission() {
        return Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }

    private String permissionState() {
        return hasNotificationPermission() ? "granted" : "prompt";
    }
    private static String format(int minute) { return String.format(java.util.Locale.US, "%02d:%02d", minute/60, minute%60); }
}