package za.co.emmaus.app;

import android.content.pm.ApplicationInfo;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "EmmausDiagnostics")
public final class EmmausDiagnosticsPlugin extends Plugin {
    private boolean isDebuggable() {
        return (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    @PluginMethod
    public void get(PluginCall call) {
        if (!isDebuggable()) {
            JSObject result = new JSObject();
            result.put("available", false);
            call.resolve(result);
            return;
        }
        call.resolve(NativePermissionDiagnostics.read(getContext()));
    }

    @PluginMethod
    public void clear(PluginCall call) {
        if (isDebuggable()) NativePermissionDiagnostics.clear(getContext());
        call.resolve();
    }
}
