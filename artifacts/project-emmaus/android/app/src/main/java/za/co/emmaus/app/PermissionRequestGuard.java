package za.co.emmaus.app;

import android.content.Context;

import com.getcapacitor.PluginCall;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Prevents overlapping permission dialogs and makes callback completion
 * idempotent for one native request.
 */
final class PermissionRequestGuard {
    private final AtomicBoolean active = new AtomicBoolean(false);
    private final Set<String> completedCallIds = ConcurrentHashMap.newKeySet();

    boolean begin(Context context, PluginCall call, String stage) {
        if (!active.compareAndSet(false, true)) {
            NativePermissionDiagnostics.stage(context, stage + ".overlap");
            reject(call, "Another permission request is already in progress.");
            return false;
        }
        NativePermissionDiagnostics.stage(context, stage + ".requested");
        return true;
    }

    boolean finish(Context context, PluginCall call, String stage) {
        active.set(false);
        if (call == null) {
            NativePermissionDiagnostics.stage(context, stage + ".missing-call");
            return false;
        }

        String callbackId = call.getCallbackId();
        if (callbackId != null && !completedCallIds.add(callbackId)) {
            NativePermissionDiagnostics.stage(context, stage + ".duplicate");
            return false;
        }

        NativePermissionDiagnostics.stage(context, stage + ".returned");
        return true;
    }

    void fail(Context context, PluginCall call, String stage, Throwable error) {
        active.set(false);
        NativePermissionDiagnostics.exception(context, stage, error);
        if (call == null) return;

        String callbackId = call.getCallbackId();
        if (callbackId != null && !completedCallIds.add(callbackId)) return;
        reject(call, "Permission request could not be started.");
    }

    private static void reject(PluginCall call, String message) {
        if (call != null) call.reject(message);
    }
}