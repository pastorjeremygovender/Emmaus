package za.co.emmaus.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridges widget deep links into the Capacitor WebView.
 *
 * Android delivers a widget PendingIntent to MainActivity, but a Capacitor
 * app whose server URL points at the published web origin does not navigate
 * that WebView from Intent data automatically. Keep the handoff pending until
 * the web app is ready, and also emit new intents when the singleTask activity
 * is already running.
 */
@CapacitorPlugin(name = "DailyRhythmDeepLink")
public final class DailyRhythmDeepLinkPlugin extends Plugin {
    private static final String PREFS = "emmaus_daily_rhythm_deep_link";
    private static final String KEY_PENDING_ROUTE = "pending_route";

    static String routeFromIntent(Intent intent) {
        if (intent == null) return null;
        Uri data = intent.getData();
        if (data == null
            || !"https".equalsIgnoreCase(data.getScheme())
            || !"emmaus.co.za".equalsIgnoreCase(data.getHost())
            || !"widget".equals(data.getQueryParameter("source"))) {
            return null;
        }

        String path = data.getPath();
        if (path == null || !path.matches("/daily-rhythm/day/[1-9][0-9]*")) {
            return null;
        }
        String version = data.getQueryParameter("version");
        if (version != null && !"1".equals(version)) {
            return null;
        }

        Uri.Builder route = new Uri.Builder()
            .path(path)
            .appendQueryParameter("source", "widget")
            .appendQueryParameter("version", "1");
        String journeyId = data.getQueryParameter("journeyId");
        if (journeyId != null && !journeyId.isBlank() && journeyId.length() <= 160) {
            route.appendQueryParameter("journeyId", journeyId);
        }
        String stepId = data.getQueryParameter("stepId");
        if (stepId != null && !stepId.isBlank() && stepId.length() <= 160) {
            route.appendQueryParameter("stepId", stepId);
        }
        return route.build().toString();
    }

    static void remember(Context context, String route) {
        if (route == null || route.isBlank()) return;
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_PENDING_ROUTE, route)
            .apply();
    }

    private static String consume(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String route = preferences.getString(KEY_PENDING_ROUTE, null);
        preferences.edit().remove(KEY_PENDING_ROUTE).apply();
        return route;
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        String route = routeFromIntent(intent);
        if (route == null) return;

        remember(getContext(), route);
        JSObject payload = new JSObject();
        payload.put("path", route);
        payload.put("source", "widget");
        notifyListeners("deepLink", payload);
    }

    @PluginMethod
    public void getPendingDeepLink(PluginCall call) {
        String route = consume(getContext());
        JSObject result = new JSObject();
        if (route != null) {
            result.put("path", route);
            result.put("source", "widget");
        }
        call.resolve(result);
    }
}