import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  geofence: { welcomeAssistStatus: vi.fn(), requestWelcomeAssistAccess: vi.fn() },
  bluetooth: { status: vi.fn(), requestAccess: vi.fn() },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
  registerPlugin: (name: string) => name === 'GeofenceProof' ? native.geofence : native.bluetooth,
}));

import { WelcomeAssistSettings } from '@/components/WelcomeAssistSettings';

describe('WelcomeAssistSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    native.geofence.welcomeAssistStatus.mockResolvedValue({
      permission: 'granted', locationEnabled: true, tracking: false, privacy: 'local',
    });
    native.bluetooth.status.mockResolvedValue({
      supported: true, enabled: true, permission: 'granted', state: 'ready',
    });
  });

  it('defaults off and requests permissions once when enabled', async () => {
    const user = userEvent.setup();
    render(<WelcomeAssistSettings />);
    const toggle = screen.getByRole('switch', { name: /welcome assist/i });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(native.geofence.welcomeAssistStatus).toHaveBeenCalled();
    expect(native.bluetooth.status).toHaveBeenCalled();
    expect(localStorage.getItem('emmaus_welcome_assist_enabled')).toBe('true');
  });

  it('can be switched off without revoking phone permissions', async () => {
    localStorage.setItem('emmaus_welcome_assist_enabled', 'true');
    const user = userEvent.setup();
    render(<WelcomeAssistSettings />);
    const toggle = screen.getByRole('switch', { name: /welcome assist/i });
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(localStorage.getItem('emmaus_welcome_assist_enabled')).toBe('false');
    expect(native.geofence.requestWelcomeAssistAccess).not.toHaveBeenCalled();
    expect(native.bluetooth.requestAccess).not.toHaveBeenCalled();
  });
});
