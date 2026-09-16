package za.co.emmaus.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import android.content.Intent;
import android.net.Uri;

import org.junit.Test;

public class DailyRhythmDeepLinkPluginTest {
    @Test
    public void internalWidgetIntentUsesExtrasInsteadOfHttpsView() {
        Intent intent = new Intent(DailyRhythmDeepLinkPlugin.ACTION_OPEN_DAILY_RHYTHM);
        intent.putExtra(
            DailyRhythmDeepLinkPlugin.EXTRA_WIDGET_ROUTE,
            "/daily-rhythm/day/4?source=widget&version=1&journeyId=daily-rhythm&stepId=step-4"
        );

        assertEquals(
            "/daily-rhythm/day/4?source=widget&version=1&journeyId=daily-rhythm&stepId=step-4",
            DailyRhythmDeepLinkPlugin.routeFromIntent(intent)
        );
    }

    @Test
    public void widgetIntentPreservesTheDisplayedDayAndStep() {
        Intent intent = new Intent(
            Intent.ACTION_VIEW,
            Uri.parse("https://emmaus.co.za/daily-rhythm/day/4?source=widget&version=1&journeyId=daily-rhythm&stepId=step-4")
        );

        assertEquals(
            "/daily-rhythm/day/4?source=widget&version=1&journeyId=daily-rhythm&stepId=step-4",
            DailyRhythmDeepLinkPlugin.routeFromIntent(intent)
        );
    }

    @Test
    public void nonWidgetOrUnsafeIntentsAreIgnored() {
        assertNull(DailyRhythmDeepLinkPlugin.routeFromIntent(new Intent(
            Intent.ACTION_VIEW,
            Uri.parse("https://emmaus.co.za/walk?source=widget")
        )));
        assertNull(DailyRhythmDeepLinkPlugin.routeFromIntent(new Intent(
            Intent.ACTION_VIEW,
            Uri.parse("https://example.com/daily-rhythm/day/4?source=widget")
        )));
    }

    @Test
    public void malformedDayAndExternalStepValuesAreRejected() {
        assertNull(DailyRhythmDeepLinkPlugin.routeFromIntent(new Intent(
            Intent.ACTION_VIEW,
            Uri.parse("https://emmaus.co.za/daily-rhythm/day/0?source=widget")
        )));
        assertEquals(
            "/daily-rhythm/day/4?source=widget&version=1",
            DailyRhythmDeepLinkPlugin.routeFromIntent(new Intent(
                Intent.ACTION_VIEW,
                Uri.parse("https://emmaus.co.za/daily-rhythm/day/4?source=widget&version=1&stepId=" + "x".repeat(161))
            ))
        );
    }

    @Test
    public void widgetFallbackIsPreservedWhenTheNativeEntryIsUnavailable() {
        assertEquals(
            "/daily-rhythm/day/4?source=widget&version=1&widgetFallback=unavailable",
            DailyRhythmDeepLinkPlugin.routeFromIntent(new Intent(
                Intent.ACTION_VIEW,
                Uri.parse("https://emmaus.co.za/daily-rhythm/day/4?source=widget&version=1&widgetFallback=unavailable")
            ))
        );
    }
}