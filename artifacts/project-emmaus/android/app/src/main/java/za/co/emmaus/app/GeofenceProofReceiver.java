package za.co.emmaus.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import com.google.android.gms.location.GeofencingEvent;

public final class GeofenceProofReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            GeofenceProofManager.restoreAfterBoot(context);
            GeofenceProofManager.scheduleFlush(context);
            return;
        }

        GeofencingEvent event = GeofencingEvent.fromIntent(intent);
        if (event == null || event.hasError()) {
            if (event != null) {
                android.util.Log.w("GeofenceProof", "Geofence error: " + event.getErrorCode());
            }
            return;
        }
        if (event.getGeofenceTransition() == com.google.android.gms.location.Geofence.GEOFENCE_TRANSITION_ENTER) {
            GeofenceProofManager.recordEntry(context);
        }
    }
}