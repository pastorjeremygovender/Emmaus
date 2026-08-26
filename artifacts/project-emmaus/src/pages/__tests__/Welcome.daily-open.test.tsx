import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import Welcome from '../Welcome';
import { accountStorageKey } from '@/lib/account-storage';

const onboardingMocks = vi.hoisted(() => ({
  markOnboarded: vi.fn(),
  isOnboarded: vi.fn(() => true),
  getDailyRhythmStartup: vi.fn(),
}));
const startupRoutingMocks = vi.hoisted(() => ({
  complete: false,
}));
const setLocation = vi.fn();
const { getDailyRhythmStartup } = onboardingMocks;

let authState = {
  user: {
    id: 'daily-open-member',
    role: 'member',
    preferredName: 'Grace',
    passwordRecovery: false,
  },
  loading: false,
  loadingProfile: false,
};

let journeyLoading = true;
const journeys = [{ id: 'daily', journeyType: 'daily-rhythm' }];
const progress = { daily: { currentDay: 4, completedDays: [1, 2, 3] } };
const getStepsForJourney = vi.fn(() => [1, 2, 3, 4, 5].map(day => ({ day })));

vi.mock('wouter', () => ({
  useLocation: () => ['/', setLocation],
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('@/contexts/JourneyContext', () => ({
  useJourney: () => ({
    journeys,
    progress,
    loading: journeyLoading,
    getStepsForJourney,
  }),
}));

vi.mock('@/lib/onboarding', () => ({
  isOnboarded: onboardingMocks.isOnboarded,
  markOnboarded: onboardingMocks.markOnboarded,
}));

vi.mock('@/lib/journeys-api', () => ({
  getDailyRhythmStartup: onboardingMocks.getDailyRhythmStartup,
}));

vi.mock('@/lib/startup-routing', () => ({
  isStartupRoutingComplete: () => startupRoutingMocks.complete,
  markStartupRoutingComplete: () => {
    startupRoutingMocks.complete = true;
  },
}));

describe('Welcome — first daily open routing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T09:00:00'));
    vi.clearAllMocks();
    startupRoutingMocks.complete = false;
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('emmaus_splash_shown', 'true');
    authState = {
      user: {
        id: 'daily-open-member',
        role: 'member',
        preferredName: 'Grace',
        passwordRecovery: false,
      },
      loading: false,
      loadingProfile: false,
    };
    journeyLoading = true;
    getDailyRhythmStartup.mockResolvedValue({
      firstOpen: true,
      destination: '/daily-rhythm/day/4',
      journeyId: 'daily',
      currentDay: 4,
      progress: progress.daily,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the current Daily Rhythm step after an overnight same-session reopen', async () => {
    const yesterdayKey = accountStorageKey('emmaus_last_opened_v3', 'daily-open-member');
    localStorage.setItem(yesterdayKey, '2026-08-20');

    const { rerender } = render(<Welcome />);
    expect(setLocation).not.toHaveBeenCalled();

    journeyLoading = false;
    rerender(<Welcome />);

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(setLocation).toHaveBeenCalledWith('/daily-rhythm/day/4');
    expect(localStorage.getItem(yesterdayKey)).toBe('2026-08-20');
  });

  it('opens Today’s Steps after Daily Rhythm has already opened today', async () => {
    const todayKey = accountStorageKey('emmaus_last_opened_v3', 'daily-open-member');
    localStorage.setItem(todayKey, '2026-08-21');
    journeyLoading = false;
    getDailyRhythmStartup.mockResolvedValue({
      firstOpen: false,
      destination: '/walk',
      journeyId: 'daily',
      currentDay: 4,
      progress: progress.daily,
    });
    render(<Welcome />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(setLocation).toHaveBeenCalledWith('/walk');
  });

  it('re-checks the server after an overnight re-entry even if yesterday completed startup routing', async () => {
    startupRoutingMocks.complete = true;
    journeyLoading = false;
    getDailyRhythmStartup.mockResolvedValue({
      firstOpen: true,
      destination: '/daily-rhythm/day/4',
      journeyId: 'daily',
      currentDay: 4,
      progress: progress.daily,
    });

    render(<Welcome />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(getDailyRhythmStartup).toHaveBeenCalledTimes(1);
    expect(setLocation).toHaveBeenCalledWith('/daily-rhythm/day/4');
  });

  it('does not fall back to Today’s Steps when the first startup request fails', async () => {
    journeyLoading = false;
    getDailyRhythmStartup
      .mockRejectedValueOnce(new Error('temporary startup failure'))
      .mockResolvedValueOnce({
        firstOpen: true,
        destination: '/daily-rhythm/day/4',
        journeyId: 'daily',
        currentDay: 4,
        progress: progress.daily,
      });

    render(<Welcome />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(setLocation).not.toHaveBeenCalled();
    expect(getDailyRhythmStartup).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setLocation).toHaveBeenCalledWith('/daily-rhythm/day/4');
    expect(setLocation).not.toHaveBeenCalledWith('/walk');
  });
});
