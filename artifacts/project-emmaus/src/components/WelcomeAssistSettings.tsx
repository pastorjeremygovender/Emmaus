import { useMemo, useState } from 'react';
import { Bluetooth, MapPin } from 'lucide-react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Switch } from '@/components/ui/switch';

interface GeofenceBridge {
  welcomeAssistStatus(): Promise<{ permission: 'granted' | 'needed'; locationEnabled: boolean; tracking: boolean; privacy: string }>;
  requestWelcomeAssistAccess(): Promise<void>;
}
interface BluetoothStatus {
  supported: boolean;
  enabled: boolean;
  permission: 'granted' | 'prompt' | 'denied';
  state?: 'unsupported' | 'off' | 'permission-needed' | 'ready';
}
interface BluetoothBridge {
  status(): Promise<BluetoothStatus>;
  requestAccess(): Promise<void>;
}

const geofence = registerPlugin<GeofenceBridge>('GeofenceProof');
const bluetooth = registerPlugin<BluetoothBridge>('WelcomeAssistBluetooth');
const STORAGE_KEY = 'emmaus_welcome_assist_enabled';

export function WelcomeAssistSettings() {
  const nativeAndroid = useMemo(() => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android', []);
  const [enabled, setEnabled] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (!nativeAndroid) return null;

  const changeEnabled = async (next: boolean) => {
    if (!next) {
      localStorage.setItem(STORAGE_KEY, 'false');
      setEnabled(false);
      setMessage('Welcome Assist is off. Emmaus will not check for arrival.');
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      let location = await geofence.welcomeAssistStatus();
      if (location.permission !== 'granted') {
        await geofence.requestWelcomeAssistAccess();
        location = await geofence.welcomeAssistStatus();
      }
      let bt = await bluetooth.status();
      if (bt.supported && bt.permission !== 'granted') {
        await bluetooth.requestAccess();
        bt = await bluetooth.status();
      }
      if (location.permission !== 'granted') {
        setMessage('Location permission is needed to turn on Welcome Assist.');
        return;
      }
      if (bt.supported && bt.permission !== 'granted') {
        setMessage('Bluetooth permission is needed to turn on Welcome Assist.');
        return;
      }
      localStorage.setItem(STORAGE_KEY, 'true');
      setEnabled(true);
      setMessage(!location.locationEnabled
        ? 'Welcome Assist is on. Switch on Location in phone settings when you want arrival recognition.'
        : bt.supported && !bt.enabled
          ? 'Welcome Assist is on. Switch on Bluetooth when you want arrival recognition.'
          : 'Welcome Assist is on. Emmaus does not record your route.');
    } catch {
      setMessage('Permission was not granted. Welcome Assist remains off.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card px-3.5 py-3" data-testid="welcome-assist-settings">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <MapPin size={17} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <label htmlFor="welcome-assist-toggle" className="text-[14px] font-semibold">Welcome Assist</label>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              Optional arrival recognition. Emmaus does not continuously track your location or record your route.
            </p>
          </div>
        </div>
        <Switch
          id="welcome-assist-toggle"
          checked={enabled}
          disabled={busy}
          onCheckedChange={next => void changeEnabled(next)}
          data-testid="toggle-welcome-assist"
          aria-label="Welcome Assist"
        />
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Bluetooth size={14} aria-hidden="true" />
        <span>{busy ? 'Requesting permissions…' : enabled ? 'On' : 'Off'}</span>
      </div>
      {message && <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground" aria-live="polite">{message}</p>}
    </div>
  );
}
