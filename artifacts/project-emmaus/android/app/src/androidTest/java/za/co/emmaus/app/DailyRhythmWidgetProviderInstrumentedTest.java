package za.co.emmaus.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Context;
import android.net.Uri;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class DailyRhythmWidgetProviderInstrumentedTest {
    @Test
    public void productionWidgetPendingIntentLaunchesMainActivityWithExactEntry() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        android.app.Instrumentation instrumentation =
            InstrumentationRegistry.getInstrumentation();
        android.app.Instrumentation.ActivityMonitor monitor =
            instrumentation.addMonitor(MainActivity.class.getName(), null, false);

        android.content.Intent widgetIntent = DailyRhythmWidgetProvider.buildWidgetIntent(
            context,
            4,
            "daily-rhythm",
            "step-4"
        );
        PendingIntent pendingIntent = DailyRhythmWidgetProvider.buildPendingIntent(
            context,
            417,
            widgetIntent
        );

        assertEquals(MainActivity.class.getName(), widgetIntent.getComponent().getClassName());
        pendingIntent.send();

        Activity activity = instrumentation.waitForMonitorWithTimeout(monitor, 5000);
        assertNotNull(activity);
        Uri data = activity.getIntent().getData();
        assertNotNull(data);
        assertEquals("/daily-rhythm/day/4", data.getPath());
        assertEquals("widget", data.getQueryParameter("source"));
        assertEquals("1", data.getQueryParameter("version"));
        assertEquals("daily-rhythm", data.getQueryParameter("journeyId"));
        assertEquals("step-4", data.getQueryParameter("stepId"));

        activity.finish();
        instrumentation.removeMonitor(monitor);
    }
}