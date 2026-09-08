import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DailyRemindersSettings } from '@/components/DailyRemindersSettings';

const endpoint = 'https://push.example.test/device-1';
const subscription = {
  endpoint,
  toJSON: vi.fn(() => ({ endpoint, keys: { auth: 'auth-key', p256dh: 'key' } })),
  unsubscribe: vi.fn(async () => true),
} as unknown as PushSubscription;

let currentSubscription: PushSubscription | null;
let notification: { permission: NotificationPermission; requestPermission: ReturnType<typeof vi.fn> };
let getSubscription: ReturnType<typeof vi.fn>;
let subscribe: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function status(active = false) {
  return {
    vapidPublicKey: 'AQIDBA',
    reminderTime: '09:00',
    timezone: 'Africa/Johannesburg',
    currentDevice: { active },
  };
}

beforeEach(() => {
  currentSubscription = null;
  getSubscription = vi.fn(async () => currentSubscription);
  subscribe = vi.fn(async () => subscription);
  notification = {
    permission: 'default',
    requestPermission: vi.fn(async () => notification.permission),
  };
  fetchMock = vi.fn(async (path: string) => jsonResponse(status()));

  Object.defineProperty(window, 'Notification', { configurable: true, value: notification });
  Object.defineProperty(window, 'PushManager', { configurable: true, value: class PushManager {} });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: vi.fn(async () => ({ pushManager: { getSubscription, subscribe } })),
    },
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DailyRemindersSettings', () => {
  it('shows permission needed after reading the actual permission and status', async () => {
    render(<DailyRemindersSettings />);

    expect(await screen.findByText('Permission needed')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/reminders/status', expect.objectContaining({
      credentials: 'include',
      cache: 'no-store',
    }));
  });

  it('requests permission only from the switch gesture, subscribes, and saves the device', async () => {
    const user = userEvent.setup();
    render(<DailyRemindersSettings />);
    await screen.findByText('Permission needed');
    expect(notification.requestPermission).not.toHaveBeenCalled();

    notification.permission = 'granted';
    await user.click(screen.getByTestId('toggle-notifications'));

    await waitFor(() => expect(screen.getByText('On daily at 09:00')).toBeInTheDocument());
    expect(notification.requestPermission).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(fetchMock).toHaveBeenCalledWith('/api/reminders/subscriptions', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"reminderTime":"09:00"'),
    }));
  });

  it('shows On when the browser subscription belongs to the current device', async () => {
    currentSubscription = subscription;
    notification.permission = 'granted';
    fetchMock.mockResolvedValue(jsonResponse(status(true)));

    render(<DailyRemindersSettings />);

    expect(await screen.findByText('On daily at 09:00')).toBeInTheDocument();
    expect(notification.requestPermission).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/reminders/status?endpoint=${encodeURIComponent(endpoint)}`,
      expect.anything(),
    );
  });

  it('reports blocked permission without offering a misleading enabled switch', async () => {
    notification.permission = 'denied';
    render(<DailyRemindersSettings />);

    expect(await screen.findByText('Blocked in browser settings')).toBeInTheDocument();
    expect(screen.getByTestId('toggle-notifications')).toBeDisabled();
  });

  it('disables the current device with its endpoint', async () => {
    const user = userEvent.setup();
    currentSubscription = subscription;
    notification.permission = 'granted';
    fetchMock.mockResolvedValue(jsonResponse(status(true)));
    render(<DailyRemindersSettings />);
    await screen.findByText('On daily at 09:00');

    await user.click(screen.getByRole('button', { name: 'Disable on this device' }));

    await waitFor(() => expect(screen.getByText('Off')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/reminders/subscriptions', expect.objectContaining({
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    }));
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it('saves HH:MM preferences and sends an authenticated test notification', async () => {
    const user = userEvent.setup();
    currentSubscription = subscription;
    notification.permission = 'granted';
    fetchMock.mockResolvedValue(jsonResponse(status(true)));
    render(<DailyRemindersSettings />);
    await screen.findByText('On daily at 09:00');

    fireEvent.change(screen.getByLabelText('Daily time'), { target: { value: '08:15' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/reminders/preferences', expect.objectContaining({
      method: 'PATCH',
      body: expect.stringContaining('"reminderTime":"08:15"'),
    })));

    await user.click(screen.getByRole('button', { name: /send test/i }));
    await waitFor(() => expect(screen.getByText('Test notification sent. It may take a moment to arrive.')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/reminders/test', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ endpoint }),
    }));
  });
});