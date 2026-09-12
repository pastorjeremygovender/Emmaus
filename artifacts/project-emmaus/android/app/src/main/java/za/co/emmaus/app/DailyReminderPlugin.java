package za.co.emmaus.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
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

    @PluginMethod public void status(PluginCall call) {
        SharedPreferences prefs = prefs(getContext());
        JSObject result = new JSObject();
        result.put("enabled", prefs.getBoolean(ENABLED, false));
        result.put("time", format(prefs.getInt(MINUTE, 540)));
        result.put("permission", permissionState());
        result.put("supported", true);
        call.resolve(result);
    }

    @PluginMethod public void enable(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationResult");
            return;
        }
        enableNow(call);
    }

    @PermissionCallback private void notificationResult(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            call.resolve(statusObject());
            return;
        }
        enableNow(call);
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
    private String permissionState() {
        if (Build.VERSION.SDK_INT < 33) return "granted";
        PermissionState state = getPermissionState("notifications");
        return state == PermissionState.GRANTED ? "granted" : state == PermissionState.PROMPT ? "prompt" : "denied";
    }
    private JSObject statusObject() { JSObject o=new JSObject(); o.put("enabled",isEnabled(getContext())); o.put("time",format(prefs(getContext()).getInt(MINUTE,540))); o.put("permission",permissionState()); o.put("supported",true); return o; }
    private static String format(int minute) { return String.format(java.util.Locale.US, "%02d:%02d", minute/60, minute%60); }
}