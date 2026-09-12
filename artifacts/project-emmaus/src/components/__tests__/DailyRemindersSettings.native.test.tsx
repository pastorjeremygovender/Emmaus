import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  status: vi.fn(),
  enable: vi.fn(),
  setTime: vi.fn(),
  disable: vi.fn(),
  test: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
  registerPlugin: () => native,
}));

import { DailyRemindersSettings } from '@/components/DailyRemindersSettings';

describe('DailyRemindersSettings native Android path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    native.status.mockResolvedValue({
      enabled: false,
      time: '09:00',
      permission: 'prompt',
      supported: true,
    });
    native.enable.mockResolvedValue({
      enabled: true,
      time: '09:00',
      permission: 'granted',
    });
    native.setTime.mockResolvedValue({
      enabled: true,
      time: '08:15',
      permission: 'granted',
    });
  });

  it('starts off and enables through the native bridge without browser push setup', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<DailyRemindersSettings />);

    await waitFor(() => expect(native.status).toHaveBeenCalledOnce());
    expect(screen.getByText('Off')).toBeInTheDocument();

    await user.click(screen.getByTestId('toggle-notifications'));

    await waitFor(() => expect(native.enable).toHaveBeenCalledOnce());
    expect(screen.getByText('On daily at 09:00')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes time changes to the native scheduler', async () => {
    const user = userEvent.setup();
    render(<DailyRemindersSettings />);

    await waitFor(() => expect(native.status).toHaveBeenCalledOnce());
    await user.clear(screen.getByLabelText('Daily time'));
    await user.type(screen.getByLabelText('Daily time'), '08:15');

    await waitFor(() => {
      expect(native.setTime).toHaveBeenCalledWith({ time: '08:15' });
    });
  });

  it('keeps Settings usable when the native status probe rejects', async () => {
    native.status.mockRejectedValueOnce(new Error('status bridge unavailable'));

    render(<DailyRemindersSettings />);

    await waitFor(() => expect(native.status).toHaveBeenCalledOnce());
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.getByTestId('toggle-notifications')).toBeEnabled();
    expect(screen.getByLabelText('Daily time')).toBeInTheDocument();
  });
});