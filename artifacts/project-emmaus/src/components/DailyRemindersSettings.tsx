import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, Send } from 'lucide-react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

type ReminderStatus = {
  vapidPublicKey: string;
  reminderTime?: string | null;
  timezone?: string | null;
  currentDevice?: { active: boolean };
};

type ReminderState = 'loading' | 'off' | 'permission-needed' | 'on' | 'blocked' | 'unsupported';
interface NativeReminder {
  status(): Promise<{ enabled: boolean; time: string; permission: string; supported: boolean }>;
  enable(): Promise<{ enabled: boolean; time: string; permission: string }>;
  setTime(options: { time: string }): Promise<{ enabled: boolean; time: string; permission: string }>;
  disable(): Promise<unknown>;
  test(): Promise<unknown>;
}
type NativeReminderGlobal = typeof globalThis & {
  __emmausDailyReminderPlugin?: NativeReminder;
};
const nativeReminder = (() => {
  const scope = globalThis as NativeReminderGlobal;
  return scope.__emmausDailyReminderPlugin ??= registerPlugin<NativeReminder>('DailyReminder');
})();

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function base64UrlToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    credentials: 'include',
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const error = new Error('request failed') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return undefined;
  return response.json();
}

async function registeredServiceWorker() {
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) throw new Error('service worker is not registered');
  return registration;
}

function isInstalledPwa() {
  return window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function DailyRemindersSettings() {
  const [status, setStatus] = useState<ReminderStatus | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [state, setState] = useState<ReminderState>('loading');
  const [time, setTime] = useState('09:00');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);

  const supported = typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;
  const nativeAndroid = typeof window !== 'undefined' &&
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  const refresh = useCallback(async () => {
    if (nativeAndroid) {
      try {
        const native = await nativeReminder.status();
        setTime(native.time || '09:00');
        setState(native.permission === 'denied' && native.enabled ? 'blocked' : native.enabled ? 'on' : 'off');
      } catch {
        setState('off');
        setMessage('Native reminders are unavailable in this build.');
      }
      return;
    }
    if (!supported) {
      setState('unsupported');
      return;
    }
    try {
      const registration = await registeredServiceWorker();
      const currentSubscription = await registration.pushManager.getSubscription();
      const endpointQuery = currentSubscription
        ? `?endpoint=${encodeURIComponent(currentSubscription.endpoint)}`
        : '';
      const serverStatus = await request(`/api/reminders/status${endpointQuery}`) as ReminderStatus;
      setStatus(serverStatus);
      setSubscription(currentSubscription);
      setPermission(Notification.permission);
      setTime(serverStatus.reminderTime || '09:00');
      setState(
        Notification.permission === 'denied'
          ? 'blocked'
          : currentSubscription && serverStatus.currentDevice?.active
            ? 'on'
            : Notification.permission === 'default'
              ? 'permission-needed'
              : 'off',
      );
    } catch {
      setMessage('We could not check reminders just now. Please try again in a moment.');
      setState('off');
    }
  }, [nativeAndroid, supported]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveTime = async (nextTime: string) => {
    setTime(nextTime);
    if (!/^\d{2}:\d{2}$/.test(nextTime)) return;
    setWorking(true);
    setMessage('');
    try {
      if (nativeAndroid) {
        await nativeReminder.setTime({ time: nextTime });
        return;
      }
      if (!status) return;
      await request('/api/reminders/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ reminderTime: nextTime, timezone: timezone() }),
      });
      setStatus({ ...status, reminderTime: nextTime, timezone: timezone() });
    } catch {
      setMessage('We could not save that time. Your current reminder is unchanged.');
    } finally {
      setWorking(false);
    }
  };

  const enable = async () => {
    if (nativeAndroid) {
      setWorking(true);
      setMessage('');
      try {
        const result = await nativeReminder.enable();
        setTime(result.time || time);
        setState(result.permission === 'granted' ? 'on' : 'blocked');
        if (result.permission !== 'granted') setMessage('Notifications are blocked. Enable them in Android settings, then try again.');
      } catch { setMessage('We could not enable reminders. Please try again.'); }
      finally { setWorking(false); }
      return;
    }
    if (!supported || !status?.vapidPublicKey) return;
    setWorking(true);
    setMessage('');
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== 'granted') {
        setState(nextPermission === 'denied' ? 'blocked' : 'permission-needed');
        return;
      }
      const registration = await registeredServiceWorker();
      // A subscription found on this browser but not owned by this signed-in
      // account must not be transferred server-side. Remove it locally first
      // so the push service issues a fresh endpoint for this account.
      if (subscription && !status.currentDevice?.active) {
        await subscription.unsubscribe();
      }
      const nextSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(status.vapidPublicKey),
      });
      await request('/api/reminders/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          subscription: nextSubscription.toJSON(),
          reminderTime: time,
          timezone: timezone(),
        }),
      });
      setSubscription(nextSubscription);
      setStatus({ ...status, currentDevice: { active: true } });
      setState('on');
    } catch (error) {
      const conflict = typeof error === 'object' && error !== null &&
        'status' in error && (error as { status?: number }).status === 409;
      setMessage(conflict
        ? 'This device was connected to another account. Refresh Emmaus, then try turning reminders on again.'
        : 'We could not turn on reminders. Please check your browser notification settings and try again.');
      setState(Notification.permission === 'denied' ? 'blocked' : 'off');
    } finally {
      setWorking(false);
    }
  };

  const disable = async () => {
    if (nativeAndroid) {
      setWorking(true);
      try { await nativeReminder.disable(); setState('off'); }
      catch { setMessage('We could not turn off reminders on this device.'); }
      finally { setWorking(false); }
      return;
    }
    if (!subscription) return;
    setWorking(true);
    setMessage('');
    try {
      await request('/api/reminders/subscriptions', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
       await subscription.unsubscribe().catch(() => false);
      setSubscription(null);
      setStatus(status ? { ...status, currentDevice: { active: false } } : status);
      setState(permission === 'denied' ? 'blocked' : 'off');
    } catch {
      setMessage('We could not turn off reminders on this device. Please try again.');
    } finally {
      setWorking(false);
    }
  };

  const sendTest = async () => {
    if (nativeAndroid) {
      setWorking(true);
      try { await nativeReminder.test(); setMessage('Test notification sent.'); }
      catch { setMessage('Enable reminders before sending a test.'); }
      finally { setWorking(false); }
      return;
    }
    if (!subscription) return;
    setWorking(true);
    setMessage('');
    try {
      await request('/api/reminders/test', {
        method: 'POST',
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      setMessage('Test notification sent. It may take a moment to arrive.');
    } catch {
      setMessage('We could not send a test notification just now.');
    } finally {
      setWorking(false);
    }
  };

  const detail = useMemo(() => {
    if (state === 'loading') return 'Checking this device…';
     if (state === 'unsupported') return nativeAndroid ? 'Off' : 'Unsupported on this browser';
    if (state === 'blocked') return nativeAndroid ? 'Blocked in Android settings' : 'Blocked in browser settings';
    if (state === 'permission-needed') return 'Permission needed';
    if (state === 'on') return `On daily at ${time}`;
    return 'Off';
  }, [nativeAndroid, state, time]);

  const guidance = isInstalledPwa()
    ? 'Notifications are managed in this app’s device settings.'
    : 'For the most reliable reminders, install Emmaus to your home screen.';

  return (
    <div className="rounded-xl border border-border/50 bg-card px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {state === 'on' ? <Bell size={17} className="text-primary" /> : <BellOff size={17} className="text-muted-foreground" />}
          <div>
            <Label htmlFor="notifications-toggle" className="block cursor-pointer text-[14px] font-semibold">Daily Reminders</Label>
            <p className="mt-0.5 text-[11px] text-muted-foreground" aria-live="polite">{detail}</p>
          </div>
        </div>
        <Switch
          id="notifications-toggle"
          checked={state === 'on'}
          disabled={working || state === 'loading' || state === 'unsupported' || state === 'blocked'}
          onCheckedChange={(checked) => void (checked ? enable() : disable())}
          data-testid="toggle-notifications"
        />
      </div>
      {(!nativeAndroid && state !== 'unsupported' && state !== 'loading' || nativeAndroid && state !== 'loading') && (
        <div className="mt-3 border-t border-border/50 pt-3">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-2 sm:flex">
            <Label htmlFor="reminder-time" className="shrink-0 text-[12px] font-medium">Daily time</Label>
            <div className="min-w-0 w-full max-w-32">
              <Input id="reminder-time" type="time" value={time} disabled={working} onChange={(event) => void saveTime(event.target.value)} className="h-9 w-full min-w-0 text-sm" />
            </div>
            {state === 'on' && <Button type="button" variant="ghost" size="sm" disabled={working} onClick={() => void sendTest()} className="col-span-2 justify-self-start gap-1 text-xs sm:ml-auto"><Send size={14} /> Send test</Button>}
          </div>
          {state === 'on' && <button type="button" disabled={working} onClick={() => void disable()} className="mt-2 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground">Disable on this device</button>}
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{guidance}</p>
        </div>
      )}
      {message && <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground" role="status">{message}</p>}
    </div>
  );
}