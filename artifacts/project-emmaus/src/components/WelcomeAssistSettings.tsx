import { useEffect, useMemo, useState } from 'react';
import { Bluetooth, MapPin } from 'lucide-react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Button } from '@/components/ui/button';

interface GeofenceBridge {
  openDiagnostics(): Promise<void>;
  welcomeAssistStatus(): Promise<{ permission: 'granted' | 'needed'; locationEnabled: boolean; tracking: boolean; privacy: string }>;
  requestWelcomeAssistAccess(): Promise<void>;
}

interface BluetoothStatus {
  supported: boolean;
  enabled: boolean;
  permission: 'granted' | 'prompt' | 'denied';
  state?: 'unsupported' | 'off' | 'permission-needed' | 'ready';
  scanning: boolean;
  automaticScanning: boolean;
}

interface BluetoothBridge {
  status(): Promise<BluetoothStatus>;
  requestAccess(): Promise<void>;
}

const geofence = registerPlugin<GeofenceBridge>('GeofenceProof');
const bluetooth = registerPlugin<BluetoothBridge>('WelcomeAssistBluetooth');

export function WelcomeAssistSettings() {
  const nativeAndroid = useMemo(
    () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android',
    [],
  );
  const [bluetoothStatus, setBluetoothStatus] = useState<BluetoothStatus | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshBluetooth = async () => {
    if (!nativeAndroid) return;
    try {
      setBluetoothStatus(await bluetooth.status());
    } catch {
      setBluetoothStatus(null);
    }
  };

  useEffect(() => {
    void refreshBluetooth();
  }, [nativeAndroid]);

  if (!nativeAndroid) return null;

  const openLocationTest = async () => {
    setMessage('');
    try {
      const status = await geofence.welcomeAssistStatus();
      if (status.permission !== 'granted') {
        await geofence.requestWelcomeAssistAccess();
        const updated = await geofence.welcomeAssistStatus();
        setMessage(updated.permission === 'granted'
          ? 'Location permission is ready. No route is tracked and no coordinates are shown or sent.'
          : 'Location access was not granted. You can enable it later in phone settings.');
      } else if (!status.locationEnabled) {
        setMessage('Turn on Location in Android settings, then try again.');
      } else {
        setMessage('Welcome Assist is ready for a one-time location test. No route is tracked and no coordinates are shown or sent.');
      }
    } catch {
      setMessage('Location access was not granted. You can enable it later in phone settings.');
    }
  };

  const prepareBluetooth = async () => {
    setBusy(true);
    setMessage('');
    try {
      const status = await bluetooth.status();
      if (!status.supported) {
        setMessage('This phone does not support Bluetooth beacon detection.');
        return;
      }
      if (status.permission !== 'granted') {
        await bluetooth.requestAccess();
      }
      const updated = await bluetooth.status();
      setBluetoothStatus(updated);
      setMessage(updated.enabled
        ? 'Bluetooth is ready for Welcome Assist testing.'
        : 'Permission is ready. Switch on Bluetooth to continue testing.');
    } catch {
      setMessage('Bluetooth access was not granted. You can enable it later in phone settings.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card px-3.5 py-3" data-testid="welcome-assist-settings">
      <div className="flex items-start gap-2.5">
        <MapPin size={17} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="text-[14px] font-semibold">Welcome Assist testing</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Optional testing for discreet arrival recognition. Emmaus does not continuously track your location or record your route.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        <Button type="button" variant="outline" className="min-h-[44px] justify-start gap-2" onClick={openLocationTest}>
          <MapPin size={16} aria-hidden="true" />
          Test location detection
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-[44px] justify-start gap-2"
          onClick={prepareBluetooth}
          disabled={busy}
        >
          <Bluetooth size={16} aria-hidden="true" />
          {busy ? 'Checking Bluetooth…' : 'Check Bluetooth readiness'}
        </Button>
      </div>

      {bluetoothStatus && (
        <p className="mt-2 text-[11px] text-muted-foreground" aria-live="polite">
           Bluetooth: {bluetoothStatus.state === 'unsupported' || !bluetoothStatus.supported
             ? 'unsupported'
             : bluetoothStatus.state === 'permission-needed'
               ? 'permission needed'
               : bluetoothStatus.state === 'off'
                 ? 'off'
                 : bluetoothStatus.state === 'ready' || bluetoothStatus.enabled
                   ? 'ready'
                   : 'not ready'}
        </p>
      )}
      {message && <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground" aria-live="polite">{message}</p>}
    </div>
  );
}
