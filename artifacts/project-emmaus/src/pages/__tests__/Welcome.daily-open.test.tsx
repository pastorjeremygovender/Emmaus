import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import Welcome from '../Welcome';
import { accountStorageKey } from '@/lib/account-storage';

const onboardingMocks = vi.hoisted(() => ({
  markOnboarded: vi.fn(),
  isOnboarded: vi.fn(() => true),
}));
const setLocation = vi.fn();

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

describe('Welcome — first daily open routing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T09:00:00'));
    vi.clearAllMocks();
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('checks Daily Rhythm after an overnight same-session reopen instead of bypassing to Today’s Steps', () => {
    const yesterdayKey = accountStorageKey('emmaus_last_opened_v2', 'daily-open-member');
    localStorage.setItem(yesterdayKey, '2026-08-20');

    const { rerender } = render(<Welcome />);
    expect(setLocation).not.toHaveBeenCalled();

    journeyLoading = false;
    rerender(<Welcome />);

    expect(setLocation).toHaveBeenCalledWith('/daily-rhythm/day/4');
    expect(localStorage.getItem(yesterdayKey)).toBe('2026-08-21');
  });

  it('uses Today’s Steps only after Daily Rhythm has already opened today', () => {
    const todayKey = accountStorageKey('emmaus_last_opened_v2', 'daily-open-member');
    localStorage.setItem(todayKey, '2026-08-21');
    journeyLoading = false;

    render(<Welcome />);

    expect(setLocation).toHaveBeenCalledWith('/walk');
  });
});