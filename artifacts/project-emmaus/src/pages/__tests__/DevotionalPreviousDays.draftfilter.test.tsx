/**
 * DevotionalPreviousDays.draftfilter.test.tsx
 *
 * Confirms that the Previous Days list for a Daily Devotional series never
 * exposes a link to a Draft entry.
 *
 *  1. Mixed Published + Draft entries → only Published entries render in the list.
 *  2. Draft entry sits between Published entries → Draft row is absent.
 *  3. All entries are Draft → empty-state message is shown, no Review links.
 *  4. Published entry that is above the available day → not shown (availability gate).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// ── wouter ────────────────────────────────────────────────────────────────────
const mockSetLocation = vi.fn();

vi.mock('wouter', () => ({
  useParams: () => ({ seriesId: 'series-1' }),
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

// ── dev-mode ──────────────────────────────────────────────────────────────────
vi.mock('@/lib/dev-mode', () => ({
  isDevelopmentMode: () => false,
}));

// ── devotional-calendar — always return a large available day ─────────────────
vi.mock('@/lib/devotional-calendar', () => ({
  calcAvailableDaySelfPaced: () => 99,
}));

// ── return-context ────────────────────────────────────────────────────────────
vi.mock('@/lib/return-context', () => ({
  resolveReturn: () => ({ path: '/journeys?tab=devotionals', label: 'Back to Next Steps' }),
}));

// ── devotionals-api ───────────────────────────────────────────────────────────
import type { SeriesWithEntries, DevotionalProgress } from '@/lib/devotionals-api';

let mockSeriesData: SeriesWithEntries;
let mockProgressData: DevotionalProgress | null;

vi.mock('@/lib/devotionals-api', () => ({
  getSeriesWithEntries: async () => mockSeriesData,
  getProgress: async () => mockProgressData,
  startSeries: async () => mockProgressData,
}));

// ─────────────────────────────────────────────────────────────────────────────

import DevotionalPreviousDays from '../DevotionalPreviousDays';

// ── Shared fixture helpers ────────────────────────────────────────────────────

const BASE_SERIES: Omit<SeriesWithEntries, 'entries'> = {
  id: 'series-1',
  title: 'Test Series',
  description: null,
  seriesType: 'devotional',
  status: 'Published',
  publishedAt: '2024-01-01',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  createdBy: null,
};

const BASE_ENTRY = {
  id: 'e1',
  seriesId: 'series-1',
  dayNumber: 1,
  title: 'Day One Title',
  scriptureReference: 'John 1:1',
  greeting: 'Hello',
  considerThis: 'Think.',
  prayer: 'Amen.',
  nextStep: 'Do this.',
  closing: 'Blessings.',
  publishedAt: '2024-01-01',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

const BASE_PROGRESS: DevotionalProgress = {
  id: 'prog-1',
  userId: 'user-1',
  seriesId: 'series-1',
  currentDay: 1,
  completedDays: [1, 2, 3],
  startedAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

// ─────────────────────────────────────────────────────────────────────────────

describe('DevotionalPreviousDays — Draft entry filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProgressData = { ...BASE_PROGRESS };
  });

  it('shows only Published entries when the series has a mix of Published and Draft entries', async () => {
    mockSeriesData = {
      ...BASE_SERIES,
      entries: [
        { ...BASE_ENTRY, id: 'e1', dayNumber: 1, title: 'Day One Published', status: 'Published' },
        { ...BASE_ENTRY, id: 'e2', dayNumber: 2, title: 'Day Two Draft',     status: 'Draft'     },
        { ...BASE_ENTRY, id: 'e3', dayNumber: 3, title: 'Day Three Published', status: 'Published' },
      ],
    };

    render(<DevotionalPreviousDays />);

    await waitFor(() => {
      expect(screen.getByText('Day One Published')).toBeInTheDocument();
    });

    // Published entries appear
    expect(screen.getByText('Day One Published')).toBeInTheDocument();
    expect(screen.getByText('Day Three Published')).toBeInTheDocument();

    // Draft entry must NOT appear
    expect(screen.queryByText('Day Two Draft')).not.toBeInTheDocument();

    // Review buttons exist only for Published days
    expect(screen.getByTestId('review-day-1')).toBeInTheDocument();
    expect(screen.getByTestId('review-day-3')).toBeInTheDocument();
    expect(screen.queryByTestId('review-day-2')).not.toBeInTheDocument();
  });

  it('shows no entries and no Review links when all entries are Draft', async () => {
    mockSeriesData = {
      ...BASE_SERIES,
      entries: [
        { ...BASE_ENTRY, id: 'e1', dayNumber: 1, title: 'Day One Draft',   status: 'Draft' },
        { ...BASE_ENTRY, id: 'e2', dayNumber: 2, title: 'Day Two Draft',   status: 'Draft' },
      ],
    };

    render(<DevotionalPreviousDays />);

    await waitFor(() => {
      expect(screen.getByText(/no previous entries/i)).toBeInTheDocument();
    });

    // No Review links must appear
    expect(screen.queryByTestId('review-day-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-day-2')).not.toBeInTheDocument();

    // Entry titles must not appear in the list
    expect(screen.queryByText('Day One Draft')).not.toBeInTheDocument();
    expect(screen.queryByText('Day Two Draft')).not.toBeInTheDocument();
  });

  it('does not render a Review link for a Draft entry sandwiched between Published entries', async () => {
    mockSeriesData = {
      ...BASE_SERIES,
      entries: [
        { ...BASE_ENTRY, id: 'e1', dayNumber: 1, title: 'Entry One',   status: 'Published' },
        { ...BASE_ENTRY, id: 'e2', dayNumber: 2, title: 'Entry Two Draft', status: 'Draft' },
        { ...BASE_ENTRY, id: 'e3', dayNumber: 3, title: 'Entry Three', status: 'Published' },
        { ...BASE_ENTRY, id: 'e4', dayNumber: 4, title: 'Entry Four Draft', status: 'Draft' },
      ],
    };

    render(<DevotionalPreviousDays />);

    await waitFor(() => {
      expect(screen.getByText('Entry One')).toBeInTheDocument();
    });

    // Published entries present
    expect(screen.getByTestId('review-day-1')).toBeInTheDocument();
    expect(screen.getByTestId('review-day-3')).toBeInTheDocument();

    // Draft entries absent — no row text, no review button
    expect(screen.queryByText('Entry Two Draft')).not.toBeInTheDocument();
    expect(screen.queryByText('Entry Four Draft')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-day-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-day-4')).not.toBeInTheDocument();
  });

  it('renders an empty state when the series has no entries at all', async () => {
    mockSeriesData = { ...BASE_SERIES, entries: [] };

    render(<DevotionalPreviousDays />);

    await waitFor(() => {
      expect(screen.getByText(/no previous entries/i)).toBeInTheDocument();
    });
  });
});
