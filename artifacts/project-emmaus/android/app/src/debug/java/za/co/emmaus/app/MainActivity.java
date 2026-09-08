package za.co.emmaus.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * Debug-only Capacitor registration. Release builds continue to use the
 * unchanged main-source MainActivity.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GeofenceProofPlugin.class);
        super.onCreate(savedInstanceState);
    }
}