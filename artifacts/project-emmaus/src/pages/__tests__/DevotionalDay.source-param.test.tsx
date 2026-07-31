/**
 * DevotionalDay.source-param.test.tsx
 *
 * Confirms that the completion card shows the correct return label for every
 * recognised ?source= value, and for the case where the parameter is absent.
 *
 * resolveReturn contract (DevotionalDay):
 *   source=today               → "Back to Today's Steps"   → /walk
 *   source=walk                → "Back to Today's Steps"   → /walk
 *   source=nextStepsDevotionals→ "Back to Next Steps"      → /journeys?tab=devotionals
 *   source=nextSteps           → "Back to Next Steps"      → /journeys?tab=devotionals
 *   source=nextStepsJourneys   → "Back to Next Steps"      → /journeys?tab=journeys
 *   source=nextStepsSermons    → "Back to Next Steps"      → /journeys?tab=sermons
 *   source=<missing>           → "Back to Next Steps"      → /journeys?tab=devotionals
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
function setSource(source: string | null) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { search: source !== null ? `?source=${source}` : '' },
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

  it('source=today → "Back to Today\'s Steps"', async () => {
    setSource('today');
    render(<DevotionalDay />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to today's steps/i })).toBeInTheDocument();
    });
  });

  it('source=walk → "Back to Today\'s Steps"', async () => {
    setSource('walk');
    render(<DevotionalDay />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to today's steps/i })).toBeInTheDocument();
    });
  });

  it('source=nextStepsDevotionals → "Back to Next Steps"', async () => {
    setSource('nextStepsDevotionals');
    render(<DevotionalDay />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to next steps/i })).toBeInTheDocument();
    });
  });

  it('source=nextSteps (legacy) → "Back to Next Steps"', async () => {
    setSource('nextSteps');
    render(<DevotionalDay />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to next steps/i })).toBeInTheDocument();
    });
  });

  it('source=nextStepsJourneys → "Back to Next Steps"', async () => {
    setSource('nextStepsJourneys');
    render(<DevotionalDay />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to next steps/i })).toBeInTheDocument();
    });
  });

  it('source=nextStepsSermons → "Back to Next Steps"', async () => {
    setSource('nextStepsSermons');
    render(<DevotionalDay />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to next steps/i })).toBeInTheDocument();
    });
  });

  it('no source param (deep link) → "Back to Next Steps"', async () => {
    setSource(null);
    render(<DevotionalDay />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to next steps/i })).toBeInTheDocument();
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
    const btn = await screen.findByRole('button', { name: /back to today's steps/i });
    btn.click();
    expect(mockSetLocation).toHaveBeenCalledWith('/walk');
  });

  it('source=walk → navigates to /walk on return', async () => {
    setSource('walk');
    render(<DevotionalDay />);
    const btn = await screen.findByRole('button', { name: /back to today's steps/i });
    btn.click();
    expect(mockSetLocation).toHaveBeenCalledWith('/walk');
  });

  it('source=nextStepsDevotionals → navigates to /journeys?tab=devotionals on return', async () => {
    setSource('nextStepsDevotionals');
    render(<DevotionalDay />);
    const btn = await screen.findByRole('button', { name: /back to next steps/i });
    btn.click();
    expect(mockSetLocation).toHaveBeenCalledWith('/journeys?tab=devotionals');
  });

  it('source=nextStepsJourneys → navigates to /journeys?tab=journeys on return', async () => {
    setSource('nextStepsJourneys');
    render(<DevotionalDay />);
    const btn = await screen.findByRole('button', { name: /back to next steps/i });
    btn.click();
    expect(mockSetLocation).toHaveBeenCalledWith('/journeys?tab=journeys');
  });

  it('source=nextStepsSermons → navigates to /journeys?tab=sermons on return', async () => {
    setSource('nextStepsSermons');
    render(<DevotionalDay />);
    const btn = await screen.findByRole('button', { name: /back to next steps/i });
    btn.click();
    expect(mockSetLocation).toHaveBeenCalledWith('/journeys?tab=sermons');
  });

  it('no source param → navigates to /journeys?tab=devotionals on return', async () => {
    setSource(null);
    render(<DevotionalDay />);
    const btn = await screen.findByRole('button', { name: /back to next steps/i });
    btn.click();
    expect(mockSetLocation).toHaveBeenCalledWith('/journeys?tab=devotionals');
  });
});
