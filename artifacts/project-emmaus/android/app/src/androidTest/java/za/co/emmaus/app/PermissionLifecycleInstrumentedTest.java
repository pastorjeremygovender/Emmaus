package za.co.emmaus.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;
import androidx.test.uiautomator.Until;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.FixMethodOrder;
import org.junit.runners.MethodSorters;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Exercises the real Capacitor permission bridge and system dialogs. These
 * tests intentionally do not invoke plugin callback methods directly.
 */
@RunWith(AndroidJUnit4.class)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public final class PermissionLifecycleInstrumentedTest {
    private android.app.Instrumentation instrumentation;
    private UiDevice device;
    private Activity activity;

    @Before
    public void setUp() {
        instrumentation = InstrumentationRegistry.getInstrumentation();
        device = UiDevice.getInstance(instrumentation);
    }

    @After
    public void tearDown() {
        if (activity != null) {
            activity.finish();
            instrumentation.waitForIdleSync();
        }
    }

    @Test
    @SdkSuppress(minSdkVersion = 23)
    public void a01_locationDenialKeepsMainActivityAlive() throws Exception {
        launch();

        PluginInvocation request = startPluginCall("GeofenceProof.requestWelcomeAssistAccess()");
        dismissPermissionDialog();
        String result = request.await();

        assertTrue("location request did not return: " + result, result.contains("resolved") || result.contains("rejected"));
        assertActivityAlive();
    }

    @Test
    @SdkSuppress(minSdkVersion = 31)
    public void a02_bluetoothDenialAndRapidSecondTapKeepMainActivityAlive() throws Exception {
        launch();

        PluginInvocation request = startPluginCall(
            "Promise.allSettled([" +
                "window.Capacitor.Plugins.WelcomeAssistBluetooth.requestAccess()," +
                "window.Capacitor.Plugins.WelcomeAssistBluetooth.requestAccess()" +
            "])"
        );
        dismissPermissionDialog();
        String result = request.await();

        assertTrue("Bluetooth requests did not return: " + result, result.contains("resolved") || result.contains("rejected"));
        assertActivityAlive();
    }

    @Test
    @SdkSuppress(minSdkVersion = 33)
    public void a03_notificationCancellationKeepsMainActivityAlive() throws Exception {
        launch();

        PluginInvocation request = startPluginCall("DailyReminder.enable()");
        dismissPermissionDialog();
        String result = request.await();

        assertTrue("notification request did not return: " + result, result.contains("resolved") || result.contains("rejected"));
        assertActivityAlive();
    }

    @Test
    @SdkSuppress(maxSdkVersion = 32)
    public void z01_notificationEnableDoesNotRequestUnsupportedRuntimePermission() throws Exception {
        launch();
        assertTrue(callPlugin("DailyReminder.enable()").contains("resolved"));
        assertActivityAlive();
    }

    @Test
    @SdkSuppress(maxSdkVersion = 30)
    public void z02_bluetoothAccessDoesNotRequestAndroid12PermissionOnOlderDevices() throws Exception {
        launch();
        assertTrue(callPlugin("WelcomeAssistBluetooth.requestAccess()").contains("resolved"));
        assertActivityAlive();
    }

    private void dismissPermissionDialog() {
        UiObject2 deny = device.wait(
            Until.findObject(By.res("com.android.permissioncontroller", "permission_deny_button")),
            10000
        );
        if (deny == null) {
            deny = device.wait(
                Until.findObject(By.res("com.google.android.permissioncontroller", "permission_deny_button")),
                3000
            );
        }
        if (deny != null) {
            deny.click();
            device.waitForIdle();
        } else {
            device.pressBack();
        }
    }

    private Activity launch() {
        Intent launch = new Intent(
            InstrumentationRegistry.getInstrumentation().getTargetContext(),
            MainActivity.class
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        activity = instrumentation.startActivitySync(launch);
        assertNotNull(activity);
        WebView webView = waitForWebView(activity);
        assertNotNull(webView);
        assertTrue("Capacitor plugins did not become ready", waitForCapacitorPlugins(webView));
        return activity;
    }

    private String callPlugin(String expression) throws Exception {
        return startPluginCall(expression).await();
    }

    private PluginInvocation startPluginCall(String expression) throws Exception {
        WebView webView = waitForWebView(activity);
        assertNotNull(webView);
        CountDownLatch started = new CountDownLatch(1);
        String script =
            "window.__emmausNativeTestResult=null;" +
            "(async()=>{try{" +
            "const DailyReminder=window.Capacitor.Plugins.DailyReminder;" +
            "const GeofenceProof=window.Capacitor.Plugins.GeofenceProof;" +
            "const WelcomeAssistBluetooth=window.Capacitor.Plugins.WelcomeAssistBluetooth;" +
            "window.__emmausNativeTestResult='resolved:'+JSON.stringify(await (" + expression + "));" +
            "}catch(e){window.__emmausNativeTestResult='rejected:'+String(e);}})()";
        activity.runOnUiThread(() -> webView.evaluateJavascript(script, ignored -> started.countDown()));
        assertTrue("permission bridge call did not start", started.await(5, TimeUnit.SECONDS));
        return new PluginInvocation(webView);
    }

    private final class PluginInvocation {
        private final WebView webView;

        private PluginInvocation(WebView webView) {
            this.webView = webView;
        }

        private String await() throws Exception {
            long deadline = SystemClock.uptimeMillis() + 15000;
            while (SystemClock.uptimeMillis() < deadline) {
                AtomicReference<String> value = new AtomicReference<>();
                CountDownLatch checked = new CountDownLatch(1);
                activity.runOnUiThread(() -> webView.evaluateJavascript(
                    "window.__emmausNativeTestResult",
                    result -> {
                        value.set(result);
                        checked.countDown();
                    }
                ));
                assertTrue("permission bridge polling timed out", checked.await(2, TimeUnit.SECONDS));
                String result = value.get();
                if (result != null && !"null".equals(result) && !"undefined".equals(result)) {
                    return result;
                }
                SystemClock.sleep(100);
            }
            throw new AssertionError("permission bridge did not return");
        }
    }

    private void assertActivityAlive() {
        assertNotNull(activity);
        assertFalse(activity.isFinishing());
        assertFalse(activity.isDestroyed());
    }

    private boolean waitForCapacitorPlugins(WebView webView) {
        long deadline = SystemClock.uptimeMillis() + 20000;
        while (SystemClock.uptimeMillis() < deadline) {
            AtomicReference<Boolean> ready = new AtomicReference<>(false);
            CountDownLatch checked = new CountDownLatch(1);
            activity.runOnUiThread(() -> webView.evaluateJavascript(
                "Boolean(window.Capacitor&&window.Capacitor.Plugins&&" +
                "window.Capacitor.Plugins.DailyReminder&&" +
                "window.Capacitor.Plugins.GeofenceProof&&" +
                "window.Capacitor.Plugins.WelcomeAssistBluetooth)",
                value -> {
                    ready.set("true".equals(value));
                    checked.countDown();
                }));
            try {
                checked.await(1, TimeUnit.SECONDS);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                return false;
            }
            if (Boolean.TRUE.equals(ready.get())) return true;
            SystemClock.sleep(250);
        }
        return false;
    }

    private static WebView waitForWebView(Activity activity) {
        long deadline = SystemClock.uptimeMillis() + 10000;
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