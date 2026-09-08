import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import Welcome from '../Welcome';

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

vi.mock('wouter', () => ({
  useLocation: () => ['/', setLocation],
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

describe('Welcome — opening authority boundary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('emmaus_splash_shown', 'true');
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

  it('does not ask Welcome to resolve or consume the Daily Rhythm opening', async () => {
    render(<Welcome />);
    await act(async () => { await Promise.resolve(); });

    expect(setLocation).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
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