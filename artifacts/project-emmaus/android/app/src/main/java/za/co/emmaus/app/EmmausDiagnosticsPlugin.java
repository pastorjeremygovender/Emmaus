package za.co.emmaus.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "EmmausDiagnostics")
public final class EmmausDiagnosticsPlugin extends Plugin {
    @PluginMethod
    public void get(PluginCall call) {
        call.resolve(NativePermissionDiagnostics.read(getContext()));
    }

    @PluginMethod
    public void clear(PluginCall call) {
        NativePermissionDiagnostics.clear(getContext());
        call.resolve();
    }
}