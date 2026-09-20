package za.co.emmaus.app;

import static org.junit.Assert.assertEquals;

import com.getcapacitor.JSObject;

import org.junit.Test;

public final class WelcomeAssistBluetoothPluginTest {
    @Test
    public void missingPermissionIsAHandledStatusInsteadOfReady() throws Exception {
        JSObject result = WelcomeAssistBluetoothPlugin.statusObject(
            true,
            false,
            "prompt",
            false
        );

        assertEquals("permission-needed", result.getString("state"));
        assertEquals(false, result.getBoolean("enabled"));
        assertEquals(false, result.getBoolean("scanning"));
    }

    @Test
    public void unsupportedBluetoothIsReportedWithoutTouchingTheAdapter() throws Exception {
        JSObject result = WelcomeAssistBluetoothPlugin.statusObject(
            false,
            false,
            "prompt",
            false
        );

        assertEquals("unsupported", result.getString("state"));
    }

    @Test
    public void grantedAndEnabledBluetoothCanReportReady() throws Exception {
        JSObject result = WelcomeAssistBluetoothPlugin.statusObject(
            true,
            true,
            "granted",
            false
        );

        assertEquals("ready", result.getString("state"));
    }
}