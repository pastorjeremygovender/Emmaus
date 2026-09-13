package za.co.emmaus.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.Until;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Exercises the real Capacitor permission bridge and system dialogs. These
 * tests intentionally do not invoke plugin callback methods directly.
 */
@RunWith(AndroidJUnit4.class)
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
    public void locationDenialKeepsMainActivityAlive() throws Exception {
        revoke("android.permission.ACCESS_FINE_LOCATION", "android.permission.ACCESS_COARSE_LOCATION");
        launch();

        PluginInvocation request = startPluginCall("GeofenceProof.requestWelcomeAssistAccess()");
        assertTrue("location permission dialog did not appear", waitForPermissionDialog());
        assertTrue(clickPermissionButton(false));
        String result = request.await();

        assertTrue("location request did not return: " + result, result.contains("resolved") || result.contains("rejected"));
        assertActivityAlive();
    }

    @Test
    @SdkSuppress(minSdkVersion = 31)
    public void bluetoothDenialAndRapidSecondTapKeepMainActivityAlive() throws Exception {
        revoke("android.permission.BLUETOOTH_SCAN", "android.permission.BLUETOOTH_CONNECT");
        launch();

        PluginInvocation request = startPluginCall(
            "Promise.allSettled([" +
                "window.Capacitor.Plugins.WelcomeAssistBluetooth.requestAccess()," +
                "window.Capacitor.Plugins.WelcomeAssistBluetooth.requestAccess()" +
            "])"
        );
        assertTrue("Bluetooth permission dialog did not appear", waitForPermissionDialog());
        assertTrue(clickPermissionButton(false));
        String result = request.await();

        assertTrue("Bluetooth requests did not return: " + result, result.contains("resolved") || result.contains("rejected"));
        assertActivityAlive();
    }

    @Test
    @SdkSuppress(minSdkVersion = 33)
    public void notificationCancellationKeepsMainActivityAlive() throws Exception {
        revoke("android.permission.POST_NOTIFICATIONS");
        launch();

        PluginInvocation request = startPluginCall("DailyReminder.enable()");
        assertTrue("notification permission dialog did not appear", waitForPermissionDialog());
        device.pressBack();
        String result = request.await();

        assertTrue("notification request did not return: " + result, result.contains("resolved") || result.contains("rejected"));
        assertActivityAlive();
    }

    @Test
    @SdkSuppress(minSdkVersion = 33)
    public void notificationGrantEnablesReminder() throws Exception {
        revoke("android.permission.POST_NOTIFICATIONS");
        launch();

        PluginInvocation request = startPluginCall("DailyReminder.enable()");
        assertTrue("notification permission dialog did not appear", waitForPermissionDialog());
        assertTrue(clickPermissionButton(true));
        assertTrue(request.await().contains("resolved"));
        assertTrue("reminder did not become enabled", callPlugin("DailyReminder.status()").contains("\\\"enabled\\\":true"));
        assertActivityAlive();
    }

    @Test
    @SdkSuppress(minSdkVersion = 31)
    public void bluetoothGrantChangesPermissionState() throws Exception {
        revoke("android.permission.BLUETOOTH_SCAN", "android.permission.BLUETOOTH_CONNECT");
        launch();

        PluginInvocation request = startPluginCall("WelcomeAssistBluetooth.requestAccess()");
        assertTrue("Bluetooth permission dialog did not appear", waitForPermissionDialog());
        assertTrue(clickPermissionButton(true));
        assertTrue(request.await().contains("resolved"));
        assertTrue("Bluetooth permission did not become granted", callPlugin("WelcomeAssistBluetooth.status()").contains("\\\"permission\\\":\\\"granted"));
        assertActivityAlive();
    }

    @Test
    @SdkSuppress(minSdkVersion = 23)
    public void locationGrantChangesPermissionState() throws Exception {
        revoke("android.permission.ACCESS_FINE_LOCATION", "android.permission.ACCESS_COARSE_LOCATION");
        launch();

        PluginInvocation request = startPluginCall("GeofenceProof.requestWelcomeAssistAccess()");
        assertTrue("location permission dialog did not appear", waitForPermissionDialog());
        assertTrue(clickPermissionButton(true));
        assertTrue(request.await().contains("resolved"));
        assertTrue("location permission did not become granted", callPlugin("GeofenceProof.welcomeAssistStatus()").contains("\\\"permission\\\":\\\"granted"));
        assertActivityAlive();
    }

    @Test
    public void permissionStatusCallsSurviveActivityPauseAndResume() throws Exception {
        launch();
        assertTrue(callPlugin("Promise.all([" +
            "DailyReminder.status()," +
            "GeofenceProof.welcomeAssistStatus()," +
            "WelcomeAssistBluetooth.status()" +
        "])").contains("resolved"));

        activity.runOnUiThread(() -> activity.moveTaskToBack(true));
        SystemClock.sleep(500);
        Activity resumed = launch();
        assertNotNull(resumed);
        assertFalse(resumed.isFinishing());
        assertTrue(callPlugin("Promise.all([" +
            "DailyReminder.status()," +
            "GeofenceProof.welcomeAssistStatus()," +
            "WelcomeAssistBluetooth.status()" +
        "])").contains("resolved"));
    }

    @Test
    @SdkSuppress(maxSdkVersion = 32)
    public void notificationEnableDoesNotRequestUnsupportedRuntimePermission() throws Exception {
        launch();
        assertTrue(callPlugin("DailyReminder.enable()").contains("resolved"));
        assertActivityAlive();
    }

    @Test
    @SdkSuppress(maxSdkVersion = 30)
    public void bluetoothAccessDoesNotRequestAndroid12PermissionOnOlderDevices() throws Exception {
        launch();
        assertTrue(callPlugin("WelcomeAssistBluetooth.requestAccess()").contains("resolved"));
        assertActivityAlive();
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
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch completed = new CountDownLatch(1);
        String script =
            "(async()=>{try{" +
            "const DailyReminder=window.Capacitor.Plugins.DailyReminder;" +
            "const GeofenceProof=window.Capacitor.Plugins.GeofenceProof;" +
            "const WelcomeAssistBluetooth=window.Capacitor.Plugins.WelcomeAssistBluetooth;" +
            "return 'resolved:'+JSON.stringify(await (" + expression + "));" +
            "}catch(e){return 'rejected:'+String(e);}})()";
        activity.runOnUiThread(() -> webView.evaluateJavascript(script, value -> {
            result.set(value == null ? "" : value);
            completed.countDown();
        }));
        return new PluginInvocation(result, completed);
    }

    private static final class PluginInvocation {
        private final AtomicReference<String> result;
        private final CountDownLatch completed;

        private PluginInvocation(AtomicReference<String> result, CountDownLatch completed) {
            this.result = result;
            this.completed = completed;
        }

        private String await() throws Exception {
            assertTrue("permission bridge did not return", completed.await(15, TimeUnit.SECONDS));
            return result.get();
        }
    }

    private boolean waitForPermissionDialog() {
        String[] grantLabels = {"Allow", "While using the app", "Only this time"};
        for (String label : grantLabels) {
            if (device.wait(Until.hasObject(By.text(label)), 2500)) return true;
        }
        return false;
    }

    private boolean clickPermissionButton(boolean grant) {
        String[] labels = grant
            ? new String[]{"Allow", "While using the app", "Only this time"}
            : new String[]{"Don't allow", "Deny"};
        for (String label : labels) {
            androidx.test.uiautomator.UiObject2 button = device.findObject(By.text(label));
            if (button != null) {
                button.click();
                return true;
            }
        }
        return false;
    }

    private void revoke(String... permissions) throws Exception {
        String packageName = InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName();
        for (String permission : permissions) {
            runShell("pm revoke " + packageName + " " + permission);
            runShell("pm clear-permission-flags " + packageName + " " + permission + " user-set user-fixed");
        }
    }

    private void runShell(String command) throws Exception {
        ParcelFileDescriptor descriptor = instrumentation.getUiAutomation().executeShellCommand(command);
        if (descriptor != null) descriptor.close();
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