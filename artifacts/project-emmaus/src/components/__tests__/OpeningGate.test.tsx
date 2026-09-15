import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import OpeningGate from '../OpeningGate';
import { safeOpeningDestination } from '@/lib/opening-destination';
import { accountStorageKey } from '@/lib/account-storage';
import { DAILY_RHYTHM_PRESENTED_DAY_KEY } from '@/lib/daily-rhythm-presentation';

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
    localStorage.clear();
    // Route assertions model an in-session navigation. Cold-launch splash
    // presentation has its own regression coverage below.
    sessionStorage.setItem('emmaus_splash_shown', 'true');
    getDailyRhythmStartup.mockResolvedValue({
      state: 'OPENING_REQUIRED',
      destination: '/daily-rhythm/day/1',
      assignedDay: 1,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
  });

  it('asks the server to decide even when an authenticated member launches at root', async () => {
    render(<OpeningGate><div>member content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(getDailyRhythmStartup).toHaveBeenCalledTimes(1);
    expect(setLocation).toHaveBeenCalledWith('/daily-rhythm/day/1', { replace: true });
    expect(screen.getByText('member content')).toBeInTheDocument();
  });

  it('does not interrupt in-session room navigation with the Daily Rhythm opening', async () => {
    currentLocation = '/rooms/room-1';
    render(<OpeningGate><div>room content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(getDailyRhythmStartup).not.toHaveBeenCalled();
    expect(setLocation).not.toHaveBeenCalled();
    expect(screen.getByText('room content')).toBeInTheDocument();
  });

  it('lets a cold Bible launch continue without requesting the Daily Rhythm opening', async () => {
    currentLocation = '/bible';
    sessionStorage.clear();
    vi.useFakeTimers();

    render(<OpeningGate><div>bible content</div></OpeningGate>);

    expect(screen.getByRole('status', { name: 'Emmaus is loading' })).toBeInTheDocument();
    expect(getDailyRhythmStartup).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByText('bible content')).toBeInTheDocument();
    expect(setLocation).not.toHaveBeenCalled();
  });

  it('lets Bible deep links retain their query and hash without opening redirects', async () => {
    currentLocation = '/bible/read/john/3?translation=esv#verse-16';
    render(<OpeningGate><div>bible reader</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(getDailyRhythmStartup).not.toHaveBeenCalled();
    expect(setLocation).not.toHaveBeenCalled();
    expect(screen.getByText('bible reader')).toBeInTheDocument();
  });

  it('preserves query and hash when another gated destination is held', async () => {
    currentLocation = '/personal?source=shared#overview';
    window.history.replaceState({}, '', currentLocation);
    render(<OpeningGate><div>personal content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(getDailyRhythmStartup).toHaveBeenCalledTimes(1);
    expect(setLocation).toHaveBeenCalledWith('/daily-rhythm/day/1', { replace: true });
    expect(sessionStorage.getItem('emmaus_pending_opening_destination_v1'))
      .toBe('/personal?source=shared#overview');
  });

  it('does not lock an unfinished Daily Rhythm reading when leaving for Today’s Steps or Journeys', async () => {
    const firstRender = render(<OpeningGate><div>member content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(getDailyRhythmStartup).toHaveBeenCalledTimes(1);
    firstRender.unmount();
    vi.clearAllMocks();

    // A native tab link can reload the app while the current Daily Rhythm step
    // is still unfinished. The server is rechecked, but the separate
    // presented-day marker allows normal destinations through.
    currentLocation = '/walk';
    render(<OpeningGate><div>member content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(getDailyRhythmStartup).toHaveBeenCalledTimes(1);
    expect(setLocation).not.toHaveBeenCalled();
    expect(screen.getByText('member content')).toBeInTheDocument();

    cleanup();
    vi.clearAllMocks();
    currentLocation = '/journeys';
    render(<OpeningGate><div>journeys content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(getDailyRhythmStartup).toHaveBeenCalledTimes(1);
    expect(setLocation).not.toHaveBeenCalled();
    expect(screen.getByText('journeys content')).toBeInTheDocument();
  });

  it('rechecks the server when the local calendar day changes', async () => {
    const firstRender = render(<OpeningGate><div>member content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(getDailyRhythmStartup).toHaveBeenCalledTimes(1);
    firstRender.unmount();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 24 * 60 * 60 * 1000));

    getDailyRhythmStartup.mockResolvedValueOnce({
      state: 'OPENING_REQUIRED',
      destination: '/daily-rhythm/day/2',
      assignedDay: 2,
    });

    render(<OpeningGate><div>member content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(getDailyRhythmStartup).toHaveBeenCalledTimes(1);
    expect(setLocation).toHaveBeenCalledWith('/daily-rhythm/day/2', { replace: true });
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

  it('re-resolves after a retained PWA resumes without duplicating visibility/page-show requests', async () => {
    getDailyRhythmStartup
      .mockResolvedValueOnce({
        state: 'OPENING_REQUIRED',
        destination: '/daily-rhythm/day/1',
        assignedDay: 1,
      })
      .mockResolvedValueOnce({
        state: 'OPENING_REQUIRED',
        destination: '/daily-rhythm/day/2',
        assignedDay: 2,
      });
    render(<OpeningGate><div>member content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pageshow'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getDailyRhythmStartup).toHaveBeenCalledTimes(2);
    expect(setLocation).toHaveBeenCalledWith('/daily-rhythm/day/2', { replace: true });
  });

  it('retries the same opening after an offline startup reconnects', async () => {
    getDailyRhythmStartup
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        state: 'OPENING_REQUIRED',
        destination: '/daily-rhythm/day/1',
        assignedDay: 1,
      });
    render(<OpeningGate><div>member content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(screen.getByText('Today’s opening is unavailable')).toBeInTheDocument();
    expect(setLocation).not.toHaveBeenCalledWith('/walk');

    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getDailyRhythmStartup).toHaveBeenCalledTimes(2);
    expect(setLocation).toHaveBeenLastCalledWith('/daily-rhythm/day/1', { replace: true });
    expect(setLocation).not.toHaveBeenCalledWith('/walk');
  });

  it('rejects external and privileged pending destinations', () => {
    expect(safeOpeningDestination('https://example.com/walk')).toBeNull();
    expect(safeOpeningDestination('/admin')).toBeNull();
    expect(safeOpeningDestination('/auth/callback?mode=recovery')).toBeNull();
    expect(safeOpeningDestination('/walk?tab=today')).toBe('/walk?tab=today');
  });

  it('shows the branded splash during a cold opening instead of a blank screen', async () => {
    sessionStorage.clear();
    const pendingStartup = new Promise<never>(() => {});
    getDailyRhythmStartup.mockReturnValueOnce(pendingStartup);

    render(<OpeningGate><div>member content</div></OpeningGate>);
    expect(screen.getByRole('status', { name: 'Emmaus is loading' })).toBeInTheDocument();
    expect(screen.queryByText('member content')).not.toBeInTheDocument();
  });

  it('shows the branded splash on a second launch while authentication is pending', () => {
    authState = {
      user: null,
      loading: true,
      loadingProfile: true,
    };

    render(<OpeningGate><div>Welcome</div></OpeningGate>);

    expect(screen.getByRole('status', { name: 'Emmaus is loading' })).toBeInTheDocument();
    expect(screen.queryByText('Welcome')).not.toBeInTheDocument();
  });

  it('renders the normal opening after authentication resolves successfully', async () => {
    authState = {
      user: null,
      loading: true,
      loadingProfile: true,
    };
    const view = render(<OpeningGate><div>Welcome</div></OpeningGate>);

    authState = {
      user: { id: 'member-1', role: 'member', preferredName: 'Grace' },
      loading: false,
      loadingProfile: false,
    };
    view.rerender(<OpeningGate><div>Welcome</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(getDailyRhythmStartup).toHaveBeenCalledTimes(1);
    expect(setLocation).toHaveBeenCalledWith('/daily-rhythm/day/1', { replace: true });
    expect(screen.getByText('Welcome')).toBeInTheDocument();
  });

  it('routes the root to sign-in when authentication times out without a session', async () => {
    authState = {
      user: null,
      loading: true,
      loadingProfile: true,
    };
    const view = render(<OpeningGate><div>Welcome</div></OpeningGate>);
    expect(screen.getByRole('status', { name: 'Emmaus is loading' })).toBeInTheDocument();

    authState = {
      user: null,
      loading: false,
      loadingProfile: false,
    };
    view.rerender(<OpeningGate><div>Welcome</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(setLocation).toHaveBeenCalledWith('/auth', { replace: true });
    expect(screen.queryByRole('status', { name: 'Emmaus is loading' })).not.toBeInTheDocument();
  });

  it('keeps a completed decision in place when the reader reports completion', async () => {
    render(<OpeningGate><div>member content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    await act(async () => {
      window.dispatchEvent(new CustomEvent('emmaus:opening-completed', {
        detail: {
          decision: {
            state: 'COMPLETED',
            destination: '/walk',
            assignedDay: 1,
          },
        },
      }));
    });

    expect(screen.getByText('member content')).toBeInTheDocument();
    expect(getDailyRhythmStartup).toHaveBeenCalledTimes(1);
  });

  it('stores the server-assigned day in a separate account-scoped presentation marker', async () => {
    render(<OpeningGate><div>member content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(localStorage.getItem(accountStorageKey(
      DAILY_RHYTHM_PRESENTED_DAY_KEY,
      'member-1',
    ))).toBe('1');
    expect(localStorage.getItem('emmaus_opening_resolved_v1')).toBeNull();
  });

  it('keeps an unfinished automatic opening non-locking through lifecycle and history events', async () => {
    const view = render(<OpeningGate><div>member content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(setLocation).toHaveBeenCalledTimes(1);
    expect(setLocation).toHaveBeenCalledWith('/daily-rhythm/day/1', { replace: true });

    // The member leaves the unfinished opening for Today's Steps.
    currentLocation = '/walk';
    view.rerender(<OpeningGate><div>member content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    vi.clearAllMocks();

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new PopStateEvent('popstate', { state: { route: '/walk' } }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getDailyRhythmStartup).toHaveBeenCalledTimes(1);
    expect(setLocation).not.toHaveBeenCalled();
    expect(screen.getByText('member content')).toBeInTheDocument();

    // A PWA suspension, reload, or remount must preserve the same-day escape.
    view.unmount();
    vi.clearAllMocks();
    currentLocation = '/walk';
    render(<OpeningGate><div>member content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(getDailyRhythmStartup).toHaveBeenCalledTimes(1);
    expect(setLocation).not.toHaveBeenCalled();
    expect(screen.getByText('member content')).toBeInTheDocument();
  });

  it('opens again only when the server-assigned day changes', async () => {
    getDailyRhythmStartup
      .mockResolvedValueOnce({
        state: 'OPENING_REQUIRED',
        destination: '/daily-rhythm/day/1',
        assignedDay: 1,
      })
      .mockResolvedValueOnce({
        state: 'OPENING_REQUIRED',
        destination: '/daily-rhythm/day/2',
        assignedDay: 2,
      })
      .mockResolvedValueOnce({
        state: 'OPENING_REQUIRED',
        destination: '/daily-rhythm/day/2',
        assignedDay: 2,
      });
    const view = render(<OpeningGate><div>member content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    currentLocation = '/walk';
    view.rerender(<OpeningGate><div>member content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    vi.clearAllMocks();

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setLocation).toHaveBeenCalledTimes(1);
    expect(setLocation).toHaveBeenCalledWith('/daily-rhythm/day/2', { replace: true });
    expect(localStorage.getItem(accountStorageKey(
      DAILY_RHYTHM_PRESENTED_DAY_KEY,
      'member-1',
    ))).toBe('2');

    // Repeated resume events on the new day do not add another opening entry.
    currentLocation = '/walk';
    view.rerender(<OpeningGate><div>member content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(getDailyRhythmStartup).toHaveBeenCalledTimes(1);
    expect(setLocation).toHaveBeenCalledTimes(1);
  });

  it('leaves deliberate Daily Rhythm card navigation outside the automatic gate', async () => {
    localStorage.setItem(accountStorageKey(
      DAILY_RHYTHM_PRESENTED_DAY_KEY,
      'member-1',
    ), '1');
    currentLocation = '/daily-rhythm/day/1';

    render(<OpeningGate><div>deliberate reader</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(getDailyRhythmStartup).not.toHaveBeenCalled();
    expect(setLocation).not.toHaveBeenCalled();
    expect(screen.getByText('deliberate reader')).toBeInTheDocument();
  });
});
