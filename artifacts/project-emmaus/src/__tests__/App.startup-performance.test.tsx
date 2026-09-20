import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { JourneyProvider } from '@/contexts/JourneyContext';
import OpeningGate from '@/components/OpeningGate';
import {
  AUTHENTICATED_STARTUP_BUDGET_MS,
  type AuthenticatedStartupPhase,
} from '@/lib/startup-performance';

const navigation = vi.hoisted(() => {
  const state = {
    authorizedPath: null as string | null,
    targetShownAt: null as number | null,
  };
  return {
    state,
    setLocation: vi.fn((path: string) => {
      state.authorizedPath = path;
      window.dispatchEvent(new Event('test:authorized-target'));
    }),
  };
});
const setLocation = navigation.setLocation;
const AUTHORIZED_TARGET = '/walk';

vi.mock('wouter', () => ({
  useLocation: () => ['/', setLocation],
}));

type PhaseLog = {
  phase?: string;
  durationMs?: number;
};

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function phaseFrom(
  debug: ReturnType<typeof vi.spyOn>,
  label: string,
  phase: string,
): PhaseLog {
  const calls = debug.mock.calls as unknown[][];
  const call = calls.find(call => (
    call[0] === label &&
    (call[1] as PhaseLog | undefined)?.phase === phase
  ));
  if (!call) {
    throw new Error(`Authenticated startup did not record phase "${phase}"`);
  }
  return call[1] as PhaseLog;
}

function assertWithinBudget(
  phase: AuthenticatedStartupPhase,
  durationMs: number,
): void {
  const budgetMs = AUTHENTICATED_STARTUP_BUDGET_MS[phase];
  if (durationMs > budgetMs) {
    throw new Error(
      `[authenticated startup] ${phase} exceeded its ${budgetMs}ms budget: ${durationMs}ms`,
    );
  }
  expect(durationMs).toBeGreaterThanOrEqual(0);
}

function AuthorizedTarget() {
  useEffect(() => {
    navigation.state.targetShownAt = performance.now();
  }, []);

  return <div data-testid="authorized-target">My Emmaus</div>;
}

describe('authenticated cold-launch performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigation.state.authorizedPath = null;
    navigation.state.targetShownAt = null;
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('emmaus_splash_shown', 'true');

    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/auth/user')) {
        return Promise.resolve(response({
          user: {
            id: 'cold-launch-member',
            email: 'member@example.test',
            preferredName: 'Grace',
            role: 'user',
          },
        }));
      }
      if (url.endsWith('/api/journeys/published')) {
        return Promise.resolve(response({
          journeys: [
            {
              id: 'daily-rhythm',
              title: '10 Minutes with Jesus',
              description: '',
              journeyType: 'daily-rhythm',
              durationDays: 30,
              status: 'Published',
            },
            {
              id: 'secondary-walk',
              title: 'A Secondary Walk',
              description: '',
              journeyType: 'walk',
              durationDays: 3,
              status: 'Published',
            },
          ],
        }));
      }
      if (url.endsWith('/api/journeys/daily-rhythm/steps')) {
        return Promise.resolve(response({ steps: [] }));
      }
      if (url.endsWith('/api/journeys/secondary-walk/steps')) {
        return Promise.resolve(response({ steps: [] }));
      }
      if (url.endsWith('/api/journeys/progress')) {
        return Promise.resolve(response({ progress: {} }));
      }
      if (url.endsWith('/api/journeys/daily-rhythm/state')) {
        return Promise.resolve(response(null));
      }
      if (url.endsWith('/api/journeys/daily-rhythm/startup')) {
        return Promise.resolve(response({
          state: 'OPENING_REQUIRED',
          destination: '/daily-rhythm/day/7',
          assignedDay: 7,
        }));
      }
      throw new Error(`Unexpected startup request: ${url}`);
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows My Emmaus without requesting the Daily Rhythm startup decision', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const coldLaunchStartedAt = performance.now();

    render(
      <AuthProvider>
        <JourneyProvider>
          <OpeningGate>
            <AuthorizedTarget />
          </OpeningGate>
        </JourneyProvider>
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('authorized-target')).toBeInTheDocument());
    const authorizedTargetDuration = Math.round(
      (navigation.state.targetShownAt ?? performance.now()) - coldLaunchStartedAt,
    );

    await waitFor(() => {
      expect(debug.mock.calls.some(([label, details]) => (
        label === '[JourneyBootstrap]' &&
        (details as PhaseLog | undefined)?.phase === 'secondary-content-ready'
      ))).toBe(true);
    });

    expect(screen.getByTestId('authorized-target')).toBeInTheDocument();
    assertWithinBudget('authorizedTarget', authorizedTargetDuration);
    expect((vi.mocked(fetch).mock.calls as unknown[][]).some(([input]) => (
      String(input).endsWith('/api/journeys/daily-rhythm/startup')
    ))).toBe(false);

    const identityProfile = phaseFrom(debug, '[AuthBootstrap]', 'identity-profile-ready');
    const primaryContent = phaseFrom(debug, '[JourneyBootstrap]', 'primary-content-ready');
    const secondaryContent = phaseFrom(debug, '[JourneyBootstrap]', 'secondary-content-ready');

    assertWithinBudget('identityProfile', identityProfile.durationMs ?? -1);
    assertWithinBudget('primaryContent', primaryContent.durationMs ?? -1);
    assertWithinBudget('secondaryContent', secondaryContent.durationMs ?? -1);
  });
});