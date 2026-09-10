package za.co.emmaus.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String WIDGET_PROMPT_PREFS = "emmaus_widget_prompt";
    private static final String KEY_PROMPT_REQUESTED = "daily_rhythm_prompt_requested";

    @Override
    public void onResume() {
        super.onResume();
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
