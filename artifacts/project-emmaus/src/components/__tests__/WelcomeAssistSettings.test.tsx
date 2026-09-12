import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  geofence: {
    welcomeAssistStatus: vi.fn(),
    requestWelcomeAssistAccess: vi.fn(),
  },
  bluetooth: {
    status: vi.fn(),
    requestAccess: vi.fn(),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
  registerPlugin: (name: string) => name === 'GeofenceProof' ? native.geofence : native.bluetooth,
}));

import { WelcomeAssistSettings } from '@/components/WelcomeAssistSettings';

describe('WelcomeAssistSettings native states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    native.bluetooth.status.mockResolvedValue({
      supported: true,
      enabled: false,
      permission: 'prompt',
      state: 'permission-needed',
      scanning: false,
      automaticScanning: false,
    });
    native.geofence.welcomeAssistStatus.mockResolvedValue({
      permission: 'granted',
      locationEnabled: true,
      tracking: false,
      privacy: 'local',
    });
  });

  it('shows permission-needed Bluetooth without scanning or exposing diagnostics', async () => {
    const user = userEvent.setup();
    render(<WelcomeAssistSettings />);

    await waitFor(() => expect(native.bluetooth.status).toHaveBeenCalledOnce());
    expect(screen.getByText(/Bluetooth: permission needed/i)).toBeInTheDocument();
    expect(screen.queryByText(/latitude|longitude|endpoint|device id|diagnostic/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /check bluetooth readiness/i }));
    await waitFor(() => expect(native.bluetooth.requestAccess).toHaveBeenCalledOnce());
    expect(native.bluetooth.status.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('gives a plain privacy-safe location readiness message', async () => {
    const user = userEvent.setup();
    render(<WelcomeAssistSettings />);

    await user.click(screen.getByRole('button', { name: /test location detection/i }));

    await waitFor(() => {
      expect(screen.getByText(/one-time location test/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/no route is tracked and no coordinates are shown or sent/i)).toBeInTheDocument();
  });
});