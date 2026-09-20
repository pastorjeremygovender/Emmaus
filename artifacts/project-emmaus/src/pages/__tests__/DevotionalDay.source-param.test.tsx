/**
 * DevotionalDay.source-param.test.tsx
 *
 * Confirms that the completion card shows the correct return label for every
 * recognised ?source= value, and for the case where the parameter is absent.
 *
 * resolveReturn contract (DevotionalDay):
 *   source=today               → "Back to My Emmaus"   → /walk
 *   source=walk                → "Back to My Emmaus"   → /walk
 *   source=nextStepsDevotionals→ "Discover"                → /journeys?tab=devotionals
 *   source=nextSteps           → "Discover"                → /journeys?tab=devotionals
 *   source=nextStepsJourneys   → "Back to Discover"        → /journeys?tab=journeys
 *   source=nextStepsSermons    → "Back to Discover"        → /journeys?tab=sermons
 *   source=devotionalPrevious  → "Previous Steps"          → /devotional/:sourceId/previous
 *   source=<missing>           → "Back to Discover"        → /journeys?tab=devotionals
 *
 * Tests use the alreadyCompleted path (day 1 already in completedDays) so the
 * completion card is shown without any button interaction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// ── wouter ────────────────────────────────────────────────────────────────────
const mockSetLocation = vi.fn();

vi.mock('wouter', () => ({
  useParams: () => ({ seriesId: 'series-1', day: '1' }),
  useLocation: () => ['/', mockSetLocation],
}));

// ── AuthContext ───────────────────────────────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', preferredName: 'Tester' },
  }),
}));

// ── DailyRhythmReading (resolveDisplayName) ───────────────────────────────────
vi.mock('@/components/DailyRhythmReading', () => ({
  resolveDisplayName: () => 'Friend',
}));

// ── BottomNav ─────────────────────────────────────────────────────────────────
vi.mock('@/components/BottomNav', () => ({
  BottomNav: () => <div data-testid="bottom-nav" />,
}));

// ── DevotionalReading — surface only the actionButton ────────────────────────
vi.mock('@/components/DevotionalReading', () => ({
  DevotionalReading: ({ actionButton }: { actionButton: React.ReactNode }) => (
    <div data-testid="reading-area">{actionButton}</div>
  ),
}));

// ── devotionals-api ───────────────────────────────────────────────────────────
import type { SeriesWithEntries, DevotionalProgress } from '@/lib/devotionals-api';

const SERIES_DATA: SeriesWithEntries = {
  id: 'series-1',
  title: 'Test Series',
  description: null,
  seriesType: 'devotional',
  status: 'Published',
  publishedAt: '2024-01-01',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  createdBy: null,
  entries: [
    {
      id: 'e1',
      seriesId: 'series-1',
      dayNumber: 1,
      title: 'Day One',
      scriptureReference: 'John 1:1',
      greeting: 'Hello',
      considerThis: 'Think on this.',
      prayer: 'Pray.',
      nextStep: 'Do this.',
      closing: 'Amen.',
      publishedAt: '2024-01-01',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
      status: 'Published',
    },
  ],
};

// Day 1 already completed → alreadyCompleted path, no button interaction needed.
const PROGRESS_DATA: DevotionalProgress = {
  id: 'prog-1',
  userId: 'user-1',
  seriesId: 'series-1',
  currentDay: 1,
  completedDays: [1],
  startedAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

vi.mock('@/lib/devotionals-api', () => ({
  getSeriesWithEntries: async () => SERIES_DATA,
  getProgress: async () => PROGRESS_DATA,
  startSeries: async () => PROGRESS_DATA,
  markDayComplete: async () => PROGRESS_DATA,
}));

// ─────────────────────────────────────────────────────────────────────────────

import DevotionalDay from '../DevotionalDay';

// Helper — set window.location.search before the component reads it on mount.
function setSource(source: string | null, sourceId?: string) {
  const search = source !== null
    ? `?source=${source}${sourceId ? `&sourceId=${sourceId}` : ''}`
    : '';
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { search },
  });
}

afterEach(() => {
  // Restore a usable location object between tests.
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { search: '' },
  });
});

describe('DevotionalDay — completion card return label per ?source= value', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

   it('source=today → "Back to My Emmaus"', async () => {
    setSource('today');
    render(<DevotionalDay />);
    await waitFor(() => {
       expect(screen.getByRole('button', { name: /back to my emmaus/i })).toBeInTheDocument();
    });
  });

   it('source=walk → "Back to My Emmaus"', async () => {
    setSource('walk');
    render(<DevotionalDay />);
    await waitFor(() => {
       expect(screen.getByRole('button', { name: /back to my emmaus/i })).toBeInTheDocument();
    });
  });

  it('source=nextStepsDevotionals → "Discover" (nav + completion card)', async () => {
    setSource('nextStepsDevotionals');
    render(<DevotionalDay />);
    await waitFor(() => {
      // Both nav bar and completion-card show "Discover" for this source
      expect(screen.getAllByRole('button', { name: /^discover$/i }).length).toBeGreaterThan(0);
    });
  });

  it('source=nextSteps (legacy) → "Discover" (nav + completion card)', async () => {
    setSource('nextSteps');
    render(<DevotionalDay />);
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^discover$/i }).length).toBeGreaterThan(0);
    });
  });

  it('source=nextStepsJourneys → "Back to Discover"', async () => {
    setSource('nextStepsJourneys');
    render(<DevotionalDay />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^back to discover$/i })).toBeInTheDocument();
    });
  });

  it('source=nextStepsSermons → "Back to Discover"', async () => {
    setSource('nextStepsSermons');
    render(<DevotionalDay />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^back to discover$/i })).toBeInTheDocument();
    });
  });

  it('no source param (deep link) → "Back to Discover"', async () => {
    setSource(null);
    render(<DevotionalDay />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^back to discover$/i })).toBeInTheDocument();
    });
  });

  it('source=devotionalPrevious → at least one "Previous Steps" button visible', async () => {
    setSource('devotionalPrevious', 'series-1');
    render(<DevotionalDay />);
    await waitFor(() => {
      // Both the nav-bar back button and the completion-card return button show
      // "Previous Steps" when source=devotionalPrevious — getAllByRole handles both.
      expect(screen.getAllByRole('button', { name: /previous steps/i }).length).toBeGreaterThan(0);
    });
  });
});

describe('DevotionalDay — completion card return destination per ?source= value', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('source=today → navigates to /walk on return', async () => {
    setSource('today');
    render(<DevotionalDay />);
    const btn = await screen.findByRole('button', { name: /back to my emmaus/i });
    btn.click();
    expect(mockSetLocation).toHaveBeenCalledWith('/walk', { replace: true });
  });

  it('source=walk → navigates to /walk on return', async () => {
    setSource('walk');
    render(<DevotionalDay />);
    const btn = await screen.findByRole('button', { name: /back to my emmaus/i });
    btn.click();
    expect(mockSetLocation).toHaveBeenCalledWith('/walk', { replace: true });
  });

  it('source=nextStepsDevotionals → navigates to /journeys?tab=devotionals on return', async () => {
    setSource('nextStepsDevotionals');
    render(<DevotionalDay />);
    // Both nav bar and completion card show "Discover"; both navigate to the same path
    const btns = await screen.findAllByRole('button', { name: /^discover$/i });
    expect(btns.length).toBeGreaterThan(0);
    btns[0].click();
    expect(mockSetLocation).toHaveBeenCalledWith('/journeys?tab=devotionals', { replace: true });
  });

  it('source=nextStepsJourneys → navigates to /journeys?tab=journeys on return', async () => {
    setSource('nextStepsJourneys');
    render(<DevotionalDay />);
    const btn = await screen.findByRole('button', { name: /^back to discover$/i });
    btn.click();
    expect(mockSetLocation).toHaveBeenCalledWith('/journeys?tab=journeys', { replace: true });
  });

  it('source=nextStepsSermons → navigates to /journeys?tab=sermons on return', async () => {
    setSource('nextStepsSermons');
    render(<DevotionalDay />);
    const btn = await screen.findByRole('button', { name: /^back to discover$/i });
    btn.click();
    expect(mockSetLocation).toHaveBeenCalledWith('/journeys?tab=sermons', { replace: true });
  });

  it('no source param → navigates to /journeys?tab=devotionals on return', async () => {
    setSource(null);
    render(<DevotionalDay />);
    const btn = await screen.findByRole('button', { name: /^back to discover$/i });
    btn.click();
    expect(mockSetLocation).toHaveBeenCalledWith('/journeys?tab=devotionals', { replace: true });
  });

  it('source=devotionalPrevious → navigates to /devotional/:sourceId/previous on return', async () => {
    setSource('devotionalPrevious', 'series-1');
    render(<DevotionalDay />);
    // Both the nav bar and completion card show "Previous Steps"; click whichever comes first —
    // both resolve to the same destination in test (history.length = 1, so setLocation fires).
    const btns = await screen.findAllByRole('button', { name: /previous steps/i });
    expect(btns.length).toBeGreaterThan(0);
    btns[0].click();
    expect(mockSetLocation).toHaveBeenCalledWith('/devotional/series-1/previous', { replace: true });
  });
});
