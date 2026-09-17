import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import OpeningGate from '../OpeningGate';

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
    sessionStorage.setItem('emmaus_splash_shown', 'true');
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState({}, '', '/');
  });

  it('does not auto-redirect normal root launches into Daily Rhythm', async () => {
    render(<OpeningGate><div>member content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); });

    expect(setLocation).not.toHaveBeenCalled();
    expect(screen.getByText('member content')).toBeInTheDocument();
  });

  it('leaves widget Daily Rhythm routes available to render directly', async () => {
    currentLocation = '/daily-rhythm/day/4?source=widget&version=1';
    render(<OpeningGate><div>widget content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); });

    expect(setLocation).not.toHaveBeenCalled();
    expect(screen.getByText('widget content')).toBeInTheDocument();
  });

  it('keeps unauthenticated users on the auth boundary', async () => {
    authState = { user: null, loading: false, loadingProfile: false };
    render(<OpeningGate><div>public content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); });

    expect(setLocation).toHaveBeenCalledWith('/auth', { replace: true });
  });

  it('still routes an account without a preferred name to onboarding', async () => {
    authState = {
      user: { id: 'member-1', role: 'member', preferredName: '' },
      loading: false,
      loadingProfile: false,
    };
    render(<OpeningGate><div>member content</div></OpeningGate>);
    await act(async () => { await Promise.resolve(); });

    expect(setLocation).toHaveBeenCalledWith('/onboarding', { replace: true });
  });

  it('shows the branded splash while authentication is loading', () => {
    authState = { user: null, loading: true, loadingProfile: true };
    render(<OpeningGate><div>member content</div></OpeningGate>);

    expect(screen.getByRole('status', { name: 'Emmaus is loading' })).toBeInTheDocument();
    expect(screen.queryByText('member content')).not.toBeInTheDocument();
  });
});