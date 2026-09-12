package za.co.emmaus.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;

import com.getcapacitor.JSObject;

import java.util.Locale;

/**
 * Small, test-build-only breadcrumbs for diagnosing native permission failures.
 *
 * The values are deliberately limited to a stage and a sanitized exception
 * class/message. No user content, coordinates, identifiers, or credentials are
 * ever written.
 */
final class NativePermissionDiagnostics {
    private static final String PREFS = "emmaus_native_permission_diagnostics";
    private static final String STAGE = "stage";
    private static final String ERROR_CLASS = "error_class";
    private static final String ERROR_MESSAGE = "error_message";
    private static final int MAX_MESSAGE_LENGTH = 240;

    private NativePermissionDiagnostics() {}

    static boolean isAvailable(Context context) {
        return BuildConfig.DEBUG || BuildConfig.VERSION_NAME.toLowerCase(Locale.US).contains("-rc");
    }

    static void stage(Context context, String value) {
        if (!isAvailable(context)) return;
        preferences(context).edit()
            .putString(STAGE, sanitize(value, 120))
            .apply();
    }

    static void exception(Context context, String value, Throwable error) {
        if (!isAvailable(context)) return;
        preferences(context).edit()
            .putString(STAGE, sanitize(value, 120))
            .putString(ERROR_CLASS, error == null ? "UnknownException" : error.getClass().getSimpleName())
            .putString(ERROR_MESSAGE, error == null ? "" : sanitize(error.getMessage(), MAX_MESSAGE_LENGTH))
            .apply();
    }

    static JSObject read(Context context) {
        JSObject result = new JSObject();
        result.put("available", isAvailable(context));
        if (!isAvailable(context)) return result;

        SharedPreferences values = preferences(context);
        result.put("stage", values.getString(STAGE, ""));
        result.put("exceptionClass", values.getString(ERROR_CLASS, ""));
        result.put("exceptionMessage", values.getString(ERROR_MESSAGE, ""));
        return result;
    }

    static void clear(Context context) {
        if (isAvailable(context)) preferences(context).edit().clear().apply();
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String sanitize(String value, int maxLength) {
        if (value == null) return "";
        String sanitized = value
            .replace('\n', ' ')
            .replace('\r', ' ')
            .replaceAll("[^A-Za-z0-9 _.:/+,()\\-]", "?")
            .trim();
        return sanitized.length() <= maxLength ? sanitized : sanitized.substring(0, maxLength);
    }
}