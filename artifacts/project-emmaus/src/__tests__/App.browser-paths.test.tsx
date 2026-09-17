import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import App from '@/App';

const mocks = vi.hoisted(() => ({
  auth: {
    user: {
      id: 'browser-member',
      email: 'member@example.test',
      preferredName: 'Grace',
      role: 'user' as 'user' | 'admin' | 'superAdmin',
      passwordRecovery: false,
    },
    loading: false,
    loadingProfile: false,
    resetPassword: vi.fn().mockResolvedValue(undefined),
    updateName: vi.fn().mockResolvedValue(undefined),
  },
  journey: {
    journeys: [
      {
        id: 'daily-rhythm',
        title: '10 Minutes with Jesus',
        description: '',
        journeyType: 'daily-rhythm',
        durationDays: 30,
        status: 'Published',
      },
    ],
    startJourney: vi.fn(),
  },
  rooms: {
    joinRoomByToken: vi.fn(),
  },
  startup: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => mocks.auth,
}));

vi.mock('@/contexts/JourneyContext', () => ({
  JourneyProvider: ({ children }: { children: unknown }) => children,
  useJourney: () => mocks.journey,
}));

vi.mock('@/contexts/RoomsContext', () => ({
  RoomsProvider: ({ children }: { children: unknown }) => children,
  useRooms: () => mocks.rooms,
}));

vi.mock('@/contexts/BibleContext', () => ({
  BibleProvider: ({ children }: { children: unknown }) => children,
}));

vi.mock('@/contexts/AppearanceContext', () => ({
  AppearanceProvider: ({ children }: { children: unknown }) => children,
  useAppearance: () => ({
    theme: 'light',
    fontSize: 'standard',
    setTheme: vi.fn(),
    setFontSize: vi.fn(),
  }),
}));

vi.mock('@/contexts/VoiceSessionContext', () => ({
  VoiceSessionProvider: ({ children }: { children: unknown }) => children,
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: unknown }) => children,
}));

vi.mock('@/components/ui/toaster', () => ({
  Toaster: () => null,
}));

vi.mock('@/components/FloatingEmmausButton', () => ({
  FloatingEmmausButton: () => null,
}));

vi.mock('@/components/emmaus/GlobalVoiceIndicator', () => ({
  GlobalVoiceIndicator: () => null,
}));

vi.mock('@/components/InstallPrompt', () => ({
  InstallPrompt: () => null,
}));

vi.mock('@/lib/journeys-api', () => ({
  getDailyRhythmStartup: mocks.startup,
}));

vi.mock('@/pages/Walk', () => ({
  default: () => <div data-testid="page-walk">My Emmaus</div>,
}));

vi.mock('@/pages/DailyRhythmDay', () => ({
  default: () => {
    const [completed, setCompleted] = useState(false);
    return completed ? (
      <div data-testid="daily-completion-card">Today is complete</div>
    ) : (
      <div data-testid="page-daily-rhythm">
        <button
          type="button"
          onClick={() => {
            setCompleted(true);
            window.dispatchEvent(new CustomEvent('emmaus:opening-completed', {
              detail: {
                decision: {
                  state: 'COMPLETED',
                  destination: '/walk',
                  assignedDay: 1,
                },
              },
            }));
          }}
        >
          Complete today
        </button>
      </div>
    );
  },
}));

vi.mock('@/pages/Personal', () => ({
  default: () => <div data-testid="page-personal">Personal</div>,
}));

vi.mock('@/pages/Admin', () => ({
  default: () => <div data-testid="page-admin">Emmaus Admin</div>,
}));

function openingRequired(destination = '/daily-rhythm/day/1') {
  return {
    state: 'OPENING_REQUIRED',
    destination,
    assignedDay: 1,
  };
}

function openAt(path: string) {
  window.history.replaceState({}, '', path);
}

describe('authenticated browser path matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem('emmaus_splash_shown', 'true');
    window.scrollTo = vi.fn();
    openAt('/');
    mocks.auth.user = {
      id: 'browser-member',
      email: 'member@example.test',
      preferredName: 'Grace',
      role: 'user',
      passwordRecovery: false,
    };
    mocks.startup.mockResolvedValue(openingRequired());
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    openAt('/');
  });

  it('opens an authenticated root launch on My Emmaus without a Daily Rhythm redirect', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByTestId('page-walk')).toBeInTheDocument());
    expect(window.location.pathname).toBe('/walk');
    expect(mocks.startup).not.toHaveBeenCalled();
  });

  it('opens an authenticated deep link directly without a Daily Rhythm redirect', async () => {
    openAt('/personal?source=shared');

    render(<App />);

    await waitFor(() => expect(screen.getByTestId('page-personal')).toBeInTheDocument());
    expect(window.location.pathname).toBe('/personal');
    expect(window.location.search).toBe('?source=shared');
    expect(mocks.startup).not.toHaveBeenCalled();
  });

  it('opens an authenticated invite directly', async () => {
    sessionStorage.setItem('emmaus_splash_shown', 'true');
    sessionStorage.setItem('pendingInviteToken', 'invite-token-1');
    openAt('/');

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/join-room/invite-token-1'));
    expect(screen.getByText("You've been invited")).toBeInTheDocument();
    expect(mocks.startup).not.toHaveBeenCalled();
  });

  it('does not invoke the Daily Rhythm opening for an authenticated invite', async () => {
    sessionStorage.setItem('emmaus_splash_shown', 'true');
    sessionStorage.setItem('pendingInviteToken', 'invite-token-1');

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/join-room/invite-token-1'));
    expect(screen.getByText("You've been invited")).toBeInTheDocument();
    expect(mocks.startup).not.toHaveBeenCalled();
  });

  it('keeps a restored recovery session on the recovery screen', async () => {
    mocks.auth.user.passwordRecovery = true;
    openAt('/walk');

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/auth/callback'));
    expect(window.location.search).toBe('?mode=recovery');
    expect(screen.getByText('Choose a new password')).toBeInTheDocument();
    expect(mocks.startup).not.toHaveBeenCalled();
  });

  it('leaves onboarding usable for an authenticated account without a preferred name', async () => {
    mocks.auth.user.preferredName = '';
    openAt('/onboarding');

    render(<App />);

    expect(screen.getByText('What would you like us to call you?')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Skip for now'));
    await waitFor(() =>
      expect(screen.getByText("Let's begin by spending 10 Minutes with Jesus.")).toBeInTheDocument(),
    );
    expect(mocks.startup).not.toHaveBeenCalled();
  });

  it('lets an admin explicitly open /admin without a member opening request', async () => {
    mocks.auth.user.role = 'admin';
    openAt('/admin');

    render(<App />);

    expect(screen.getByTestId('page-admin')).toBeInTheDocument();
    expect(mocks.startup).not.toHaveBeenCalled();
  });

  it('lets a super-admin explicitly open /admin without a member opening request', async () => {
    mocks.auth.user.role = 'superAdmin';
    openAt('/admin');

    render(<App />);

    expect(screen.getByTestId('page-admin')).toBeInTheDocument();
    expect(mocks.startup).not.toHaveBeenCalled();
  });

  it('keeps a restored member route available when the opening service is unavailable', async () => {
    openAt('/personal');

    render(<App />);

    await waitFor(() => expect(screen.getByTestId('page-personal')).toBeInTheDocument());
    expect(window.location.pathname).toBe('/personal');
    expect(mocks.startup).not.toHaveBeenCalled();
  });
});