/**
 * SermonCompanionReader.source-param.test.tsx
 *
 * Confirms that the completion card shows the correct return label for every
 * recognised ?source= value, and for the case where the parameter is absent.
 *
 * resolveReturn contract (SermonCompanionReader):
 *   source=today               → "Back to Today's Steps"  → /walk
 *   source=walk                → "Back to Today's Steps"  → /walk
 *   source=nextStepsDevotionals→ "Back to Next Steps"     → /journeys?tab=devotionals
 *   source=nextStepsJourneys   → "Back to Next Steps"     → /journeys?tab=journeys
 *   source=nextStepsSermons    → "Back to Next Steps"     → /journeys?tab=sermons
 *   source=nextSteps (legacy)  → "Back to Next Steps"     → /journeys?tab=sermons
 *   source=<missing>           → "Back to Next Steps"     → /journeys?tab=sermons
 *
 * Tests use the isAlreadyCompleted path (day 1 already in completedDays,
 * !justCompleted) so the replay completion card is shown without any
 * button interaction needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// ── wouter ────────────────────────────────────────────────────────────────────
const mockSetLocation = vi.fn();

vi.mock('wouter', () => ({
  useParams: () => ({ id: 'companion-1', day: '1' }),
  useLocation: () => ['/', mockSetLocation],
}));

// ── AuthContext ───────────────────────────────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', preferredName: 'Tester' },
  }),
}));

// ── BottomNav ─────────────────────────────────────────────────────────────────
vi.mock('@/components/BottomNav', () => ({
  BottomNav: () => <div data-testid="bottom-nav" />,
}));

// ── SermonCompanionReading — surface only the actionButton ───────────────────
vi.mock('@/components/SermonCompanionReading', () => ({
  SermonCompanionReading: ({ actionButton }: { actionButton: React.ReactNode }) => (
    <div data-testid="reading-area">{actionButton}</div>
  ),
}));

// ─────────────────────────────────────────────────────────────────────────────

import SermonCompanionReader from '../SermonCompanionReader';

// ── Shared fetch stub ─────────────────────────────────────────────────────────

/**
 * Stubs the three fetch routes used by SermonCompanionReader.
 * Progress is pre-seeded with day 1 complete so the component renders the
 * replay completion card (isAlreadyCompleted path) without user interaction.
 */
function setupFetch() {
  const companion = {
    id: 'companion-1',
    title: 'Test Companion',
    numberOfDays: 1,
    entries: [
      {
        id: 'entry-1',
        dayNumber: 1,
        title: 'Day 1',
        scriptureReference: 'John 1:1',
        greeting: 'Hello',
        reflection: 'Reflect.',
        prayer: 'Pray.',
        nextStep: 'Act.',
        closing: 'Amen.',
        status: 'Published',
      },
    ],
    // Day 1 already completed → isAlreadyCompleted path, no click needed.
    progress: { currentDay: 1, completedDays: [1] },
  };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      const method = options?.method?.toUpperCase() ?? 'GET';

      if (method === 'GET' && url.includes('/member')) {
        return { ok: true, json: async () => companion } as Response;
      }
      if (method === 'POST' && url.includes('/progress/start')) {
        return { ok: true, json: async () => companion.progress } as Response;
      }
      if (method === 'POST' && url.includes('/progress/complete-day')) {
        return { ok: true, json: async () => companion.progress } as Response;
      }

      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }),
  );
}

// Helper — set window.location.search before the component reads it on mount.
function setSource(source: string | null) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { search: source !== null ? `?source=${source}` : '' },
  });
}

afterEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { search: '' },
  });
  vi.unstubAllGlobals();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('SermonCompanionReader — completion card return label per ?source= value', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFetch();
  });

  it('source=today → "Back to Today\'s Steps"', async () => {
    setSource('today');
    render(<SermonCompanionReader />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to today's steps/i })).toBeInTheDocument();
    });
  });

  it('source=walk → "Back to Today\'s Steps"', async () => {
    setSource('walk');
    render(<SermonCompanionReader />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to today's steps/i })).toBeInTheDocument();
    });
  });

  it('source=nextStepsDevotionals → "Back to Next Steps"', async () => {
    setSource('nextStepsDevotionals');
    render(<SermonCompanionReader />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to next steps/i })).toBeInTheDocument();
    });
  });

  it('source=nextStepsJourneys → "Back to Next Steps"', async () => {
    setSource('nextStepsJourneys');
    render(<SermonCompanionReader />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to next steps/i })).toBeInTheDocument();
    });
  });

  it('source=nextStepsSermons → "Back to Next Steps"', async () => {
    setSource('nextStepsSermons');
    render(<SermonCompanionReader />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to next steps/i })).toBeInTheDocument();
    });
  });

  it('source=nextSteps (legacy) → "Back to Next Steps"', async () => {
    setSource('nextSteps');
    render(<SermonCompanionReader />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to next steps/i })).toBeInTheDocument();
    });
  });

  it('no source param (deep link) → "Back to Next Steps"', async () => {
    setSource(null);
    render(<SermonCompanionReader />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to next steps/i })).toBeInTheDocument();
    });
  });
});

describe('SermonCompanionReader — completion card return destination per ?source= value', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFetch();
  });

  it('source=today → navigates to /walk on return', async () => {
    setSource('today');
    render(<SermonCompanionReader />);
    const btn = await screen.findByRole('button', { name: /back to today's steps/i });
    btn.click();
    expect(mockSetLocation).toHaveBeenCalledWith('/walk');
  });

  it('source=walk → navigates to /walk on return', async () => {
    setSource('walk');
    render(<SermonCompanionReader />);
    const btn = await screen.findByRole('button', { name: /back to today's steps/i });
    btn.click();
    expect(mockSetLocation).toHaveBeenCalledWith('/walk');
  });

  it('source=nextStepsDevotionals → navigates to /journeys?tab=devotionals on return', async () => {
    setSource('nextStepsDevotionals');
    render(<SermonCompanionReader />);
    const btn = await screen.findByRole('button', { name: /back to next steps/i });
    btn.click();
    expect(mockSetLocation).toHaveBeenCalledWith('/journeys?tab=devotionals');
  });

  it('source=nextStepsJourneys → navigates to /journeys?tab=journeys on return', async () => {
    setSource('nextStepsJourneys');
    render(<SermonCompanionReader />);
    const btn = await screen.findByRole('button', { name: /back to next steps/i });
    btn.click();
    expect(mockSetLocation).toHaveBeenCalledWith('/journeys?tab=journeys');
  });

  it('source=nextStepsSermons → navigates to /journeys?tab=sermons on return', async () => {
    setSource('nextStepsSermons');
    render(<SermonCompanionReader />);
    const btn = await screen.findByRole('button', { name: /back to next steps/i });
    btn.click();
    expect(mockSetLocation).toHaveBeenCalledWith('/journeys?tab=sermons');
  });

  it('source=nextSteps (legacy) → navigates to /journeys?tab=sermons on return', async () => {
    setSource('nextSteps');
    render(<SermonCompanionReader />);
    const btn = await screen.findByRole('button', { name: /back to next steps/i });
    btn.click();
    expect(mockSetLocation).toHaveBeenCalledWith('/journeys?tab=sermons');
  });

  it('no source param → navigates to /journeys?tab=sermons on return', async () => {
    setSource(null);
    render(<SermonCompanionReader />);
    const btn = await screen.findByRole('button', { name: /back to next steps/i });
    btn.click();
    expect(mockSetLocation).toHaveBeenCalledWith('/journeys?tab=sermons');
  });
});
