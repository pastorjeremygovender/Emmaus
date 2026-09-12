package za.co.emmaus.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.Intent;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public final class SettingsStatusInstrumentedTest {
    @Test
    public void productionActivitySurvivesSettingsLifecycleAndIndependentStatusCalls() throws Exception {
        android.app.Instrumentation instrumentation =
            InstrumentationRegistry.getInstrumentation();
        Intent launch = new Intent(
            InstrumentationRegistry.getInstrumentation().getTargetContext(),
            MainActivity.class
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        Activity activity = instrumentation.startActivitySync(launch);
        assertNotNull(activity);

        WebView webView = waitForWebView(activity);
        assertNotNull(webView);
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch completed = new CountDownLatch(1);
        String script =
            "(async()=>{" +
            "const p=window.Capacitor&&window.Capacitor.Plugins||{};" +
            "const out={};" +
            "const settings=document.querySelector('[data-testid=\"settings-trigger\"]');" +
            "if(settings){settings.click();settings.click();settings.click();}" +
            "out.settingsTriggerPresent=!!settings;" +
            "for(const [name,key] of [['DailyReminder','reminders'],['GeofenceProof','location'],['WelcomeAssistBluetooth','bluetooth']]){" +
            "try{out[key]={ok:true,value:await p[name].status()};}" +
            "catch(e){out[key]={ok:false,error:String(e)};}" +
            "}" +
            "return JSON.stringify(out);" +
            "})()";
        activity.runOnUiThread(() -> webView.evaluateJavascript(script, value -> {
            result.set(value);
            completed.countDown();
        }));

        assertTrue("status bridge did not answer", completed.await(10, TimeUnit.SECONDS));
        String statusResult = result.get();
        assertNotNull(statusResult);
        assertFalse("a native status call rejected: " + statusResult, statusResult.contains("\\\"ok\\\":false"));

        activity.finish();
        instrumentation.waitForIdleSync();
        Activity reopened = instrumentation.startActivitySync(launch);
        assertNotNull(reopened);
        assertFalse(reopened.isFinishing());
        reopened.finish();
    }

    private static WebView waitForWebView(Activity activity) {
        long deadline = SystemClock.uptimeMillis() + 5000;
        while (SystemClock.uptimeMillis() < deadline) {
            WebView webView = findWebView(activity.getWindow().getDecorView());
            if (webView != null) return webView;
            SystemClock.sleep(100);
        }
        return null;
    }

    private static WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (!(view instanceof ViewGroup)) return null;
        ViewGroup group = (ViewGroup) view;
        for (int index = 0; index < group.getChildCount(); index++) {
            WebView found = findWebView(group.getChildAt(index));
            if (found != null) return found;
        }
        return null;
    }
}