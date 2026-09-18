import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import Welcome from '../Welcome';
import { rememberPresentedDailyRhythmDay } from '@/lib/daily-rhythm-presentation';

const setLocation = vi.fn();

let authState = {
  user: {
    id: 'daily-open-member',
    role: 'user' as const,
    preferredName: 'Grace',
    passwordRecovery: false,
  },
  loading: false,
  loadingProfile: false,
};

const getDailyRhythmState = vi.fn();

vi.mock('wouter', () => ({
  useLocation: () => ['/', setLocation],
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('@/lib/journeys-api', () => ({
  getDailyRhythmState: (...args: unknown[]) => getDailyRhythmState(...args),
}));

vi.mock('@/lib/native-daily-rhythm-deep-link', () => ({
  waitForNativeDailyRhythmDeepLink: () => Promise.resolve(null),
}));

describe('Welcome — opening authority boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('emmaus_splash_shown', 'true');
    getDailyRhythmState.mockResolvedValue({
      todayAvailableDay: 26,
      assignedDay: 26,
    });
    authState = {
      user: {
        id: 'daily-open-member',
        role: 'user',
        preferredName: 'Grace',
        passwordRecovery: false,
      },
      loading: false,
      loadingProfile: false,
    };
  });

  afterEach(() => vi.useRealTimers());

  it('opens today’s Daily Rhythm on the first icon launch of the day', async () => {
    render(<Welcome />);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(setLocation).toHaveBeenCalledWith('/daily-rhythm/day/26?source=first-open', { replace: true });
  });

  it('sends later icon launches to My Emmaus after widget, icon, or completion', async () => {
    rememberPresentedDailyRhythmDay('daily-open-member', 26);
    render(<Welcome />);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(setLocation).toHaveBeenCalledWith('/walk', { replace: true });
  });

  it('still routes password recovery through the recovery callback', async () => {
    authState = {
      ...authState,
      user: { ...authState.user, passwordRecovery: true },
    };
    render(<Welcome />);
    await act(async () => { await Promise.resolve(); });
    expect(setLocation).toHaveBeenCalledWith('/auth/callback?mode=recovery');
  });

  it('routes an account without a preferred name to onboarding', async () => {
    authState = {
      ...authState,
      user: { ...authState.user, preferredName: '' },
    };
    render(<Welcome />);
    await act(async () => { await Promise.resolve(); });
    expect(setLocation).toHaveBeenCalledWith('/onboarding');
  });
});
