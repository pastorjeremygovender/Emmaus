import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import OpeningGate from '../OpeningGate';
import { safeOpeningDestination } from '@/lib/opening-destination';

const getDailyRhythmStartup = vi.hoisted(() => vi.fn());
const setLocation = vi.hoisted(() => vi.fn());

let currentLocation = '/';
let authState: {
  user: { id: string; role: 'member'; preferredName: string } | null;
  loading: boolean;
  loadingProfile: boolean;
} = {
  user: { id: 'member-1', role: 'member', preferredName: 'Grace' },
  loading: false,
  loadingProfile: false,
};

vi.mock('wouter', () => ({
  useLocation: () => [currentLocation, setLocation],
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('@/lib/journeys-api', () => ({
  getDailyRhythmStartup,
}));

describe('OpeningGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentLocation = '/';
    authState = {
      user: { id: 'member-1', role: 'member', preferredName: 'Grace' },
      loading: false,
      loadingProfile: false,
    };
    sessionStorage.clear();
    getDailyRhythmStartup.mockResolvedValue({
      state: 'OPENING_REQUIRED',
      destination: '/daily-rhythm/day/1',
      assignedDay: 1,
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('asks the server to decide even when an authenticated member launches at root', async () => {
    render(<OpeningGate><div>member content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(getDailyRhythmStartup).toHaveBeenCalledTimes(1);
    expect(setLocation).toHaveBeenCalledWith('/daily-rhythm/day/1', { replace: true });
    expect(screen.getByText('member content')).toBeInTheDocument();
  });

  it('fails closed on an opening error instead of falling back to the Walk', async () => {
    getDailyRhythmStartup.mockRejectedValueOnce(
      Object.assign(new Error('opening unavailable'), { diagnosticReference: 'opening-test' }),
    );
    render(<OpeningGate><div>member content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(screen.getByText('Today’s opening is unavailable')).toBeInTheDocument();
    expect(screen.getByText(/opening-test/)).toBeInTheDocument();
    expect(setLocation).not.toHaveBeenCalledWith('/walk');
  });

  it('rejects external and privileged pending destinations', () => {
    expect(safeOpeningDestination('https://example.com/walk')).toBeNull();
    expect(safeOpeningDestination('/admin')).toBeNull();
    expect(safeOpeningDestination('/auth/callback?mode=recovery')).toBeNull();
    expect(safeOpeningDestination('/walk?tab=today')).toBe('/walk?tab=today');
  });
});