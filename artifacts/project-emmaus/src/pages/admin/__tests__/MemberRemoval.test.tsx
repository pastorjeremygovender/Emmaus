import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminUsers from '../Users';

const mocks = vi.hoisted(() => ({
  currentUser: {
    id: 'super-admin',
    email: 'admin@example.test',
    preferredName: 'Admin',
    role: 'superAdmin',
  },
  activeAccounts: [{
    id: 'member-1',
    email: 'member@example.test',
    preferredName: 'Member One',
    role: 'user' as const,
    accountStatus: 'active' as const,
    removedAt: null,
    joinedAt: '2026-01-01T00:00:00.000Z',
    lastActiveAt: '2026-01-02T00:00:00.000Z',
    currentJourneyId: null,
    currentJourneyTitle: null,
    currentDay: null,
    daysWalking: 0,
    completedJourneys: [],
    reflectionCount: 0,
  }],
  removedAccounts: [{
    id: 'member-2',
    email: 'removed@example.test',
    preferredName: 'Removed Member',
    role: 'user' as const,
    accountStatus: 'removed' as const,
    removedAt: '2026-01-02T00:00:00.000Z',
    joinedAt: '2026-01-01T00:00:00.000Z',
    lastActiveAt: '2026-01-02T00:00:00.000Z',
    currentJourneyId: null,
    currentJourneyTitle: null,
    currentDay: null,
    daysWalking: 0,
    completedJourneys: [],
    reflectionCount: 0,
  }],
  listEmmausAccounts: vi.fn(),
  removeEmmausAccount: vi.fn(),
  reinstateEmmausAccount: vi.fn(),
  getAccountLifecycle: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mocks.currentUser }),
}));

vi.mock('@/contexts/JourneyContext', () => ({
  useJourney: () => ({ journeys: [] }),
}));

vi.mock('@/lib/pastoral-api', () => ({
  listEmmausAccounts: mocks.listEmmausAccounts,
  removeEmmausAccount: mocks.removeEmmausAccount,
  reinstateEmmausAccount: mocks.reinstateEmmausAccount,
  getAccountLifecycle: mocks.getAccountLifecycle,
}));

describe('member removal controls', () => {
  beforeEach(() => {
    mocks.listEmmausAccounts.mockImplementation((_auth, status = 'active') =>
      Promise.resolve(status === 'removed' ? mocks.removedAccounts : mocks.activeAccounts));
    mocks.removeEmmausAccount.mockResolvedValue({ ok: true, account: { id: 'member-1', email: 'member@example.test' }, dataRetained: true });
    mocks.reinstateEmmausAccount.mockResolvedValue({ ok: true, account: { id: 'member-2', email: 'removed@example.test' } });
    mocks.getAccountLifecycle.mockResolvedValue([]);
    vi.clearAllMocks();
  });

  it('requires explicit permanent-delete confirmation while offering retained-data removal', async () => {
    const user = userEvent.setup();
    render(<AdminUsers />);

    await screen.findByText('Member One');
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(screen.getByText('Retain data and remove access')).toBeTruthy();
    expect(screen.getByText('Delete permanently')).toBeTruthy();

    await user.click(screen.getByText('Delete permanently'));
    const permanentButton = screen.getByRole('button', { name: 'Delete permanently' });
    expect((permanentButton as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByLabelText(/Type member@example.test to confirm/i), 'member@example.test');
    expect((permanentButton as HTMLButtonElement).disabled).toBe(false);
    await user.click(permanentButton);

    await waitFor(() => expect(mocks.removeEmmausAccount).toHaveBeenCalledWith(
      expect.anything(),
      'member-1',
      { mode: 'permanent', confirmationEmail: 'member@example.test' },
    ));
  });

  it('shows retained accounts separately and asks for confirmation before reinstating', async () => {
    const user = userEvent.setup();
    render(<AdminUsers />);

    await screen.findByText('Member One');
    await user.click(screen.getByRole('button', { name: 'Removed members' }));
    await screen.findByText('Removed Member');
    await user.click(screen.getByRole('button', { name: 'Reinstate' }));

    expect(screen.getByText(/All preserved journeys, devotionals, Bible activity/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reinstate member' }));
    await waitFor(() => expect(mocks.reinstateEmmausAccount).toHaveBeenCalledWith(
      expect.anything(),
      'member-2',
    ));
  });
});