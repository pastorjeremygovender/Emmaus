package za.co.emmaus.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Log;

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
    private static final String TAG = "EmmausWidgetBridge";
    private static final String PREFS = "emmaus_daily_rhythm_deep_link";
    private static final String KEY_PENDING_ROUTE = "pending_route";

    static final String ACTION_OPEN_DAILY_RHYTHM = "za.co.emmaus.app.OPEN_DAILY_RHYTHM";
    static final String EXTRA_WIDGET_ROUTE = "emmaus_widget_route";

    static String routeFromIntent(Intent intent) {
        if (intent == null) return null;
        String extraRoute = intent.getStringExtra(EXTRA_WIDGET_ROUTE);
        if (extraRoute != null && !extraRoute.isBlank()) {
            try {
                Uri extra = Uri.parse("https://emmaus.co.za" + extraRoute);
                String fromExtra = routeFromUri(extra);
                if (fromExtra != null) return fromExtra;
            } catch (RuntimeException ignored) {
                // Fall through to the https VIEW data used by older widgets.
            }
        }
        return routeFromUri(intent.getData());
    }

    private static String routeFromUri(Uri data) {
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
        if ("unavailable".equals(data.getQueryParameter("widgetFallback"))) {
            route.appendQueryParameter("widgetFallback", "unavailable");
        }
        return route.build().toString();
    }

    static void remember(Context context, String route) {
        if (route == null || route.isBlank()) return;
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_PENDING_ROUTE, route)
            .apply();
        Log.i(TAG, "stage=route_stored route=" + route);
    }

    static void captureIntent(Context context, Intent intent, String stage) {
        String route = routeFromIntent(intent);
        String source = "widget";
        if (route == null && intent != null) {
            String notificationDestination = intent.getStringExtra("destination");
            if ("/personal".equals(notificationDestination)) {
                route = "/personal?source=notification";
                source = "notification";
            }
        }
        if (route == null) {
            Log.i(TAG, "stage=" + stage + " route=none");
            return;
        }
        remember(context, route);
        Log.i(TAG, "stage=" + stage + " source=" + source + " route=" + route);
    }

    private static String peek(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return preferences.getString(KEY_PENDING_ROUTE, null);
    }

    private static void acknowledge(Context context, String route) {
        if (route == null || route.isBlank()) return;
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String pending = preferences.getString(KEY_PENDING_ROUTE, null);
        if (route.equals(pending)) {
            preferences.edit().remove(KEY_PENDING_ROUTE).apply();
            Log.i(TAG, "stage=route_acknowledged route=" + route);
        } else {
            Log.i(TAG, "stage=route_acknowledge_ignored route_match=false");
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        String route = routeFromIntent(intent);
        String source = "widget";
        if (route == null && intent != null) {
            String notificationDestination = intent.getStringExtra("destination");
            if ("/personal".equals(notificationDestination)) {
                route = "/personal?source=notification";
                source = "notification";
            }
        }
        if (route == null) return;

        remember(getContext(), route);
        Log.i(TAG, "stage=listener_delivery source=" + source + " route=" + route);
        JSObject payload = new JSObject();
        payload.put("path", route);
        payload.put("source", source);
        notifyListeners("deepLink", payload);
    }

    @PluginMethod
    public void getPendingDeepLink(PluginCall call) {
        String route = peek(getContext());
        Log.i(TAG, "stage=web_pending_read hasRoute=" + (route != null));
        JSObject result = new JSObject();
        if (route != null) {
            result.put("path", route);
            result.put("source", "widget");
        }
        call.resolve(result);
    }

    @PluginMethod
    public void acknowledgePendingDeepLink(PluginCall call) {
        acknowledge(getContext(), call.getString("path"));
        call.resolve();
    }
}