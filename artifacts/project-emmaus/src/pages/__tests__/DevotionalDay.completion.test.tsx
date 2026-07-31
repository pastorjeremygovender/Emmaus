/**
 * DevotionalDay.completion.test.tsx
 *
 * Confirms the next-entry CTA visibility on the DevotionalDay completion card.
 *
 *  1. Next entry Published  → "Continue to Next Devotional" CTA is shown.
 *  2. Next entry Draft      → CTA is hidden; only the return button is shown.
 *  3. Next entry missing    → CTA is hidden; only the return button is shown.
 *
 * Tests use the `alreadyCompleted` path (day already in completedDays) so no
 * button interaction is needed to reach the completion card.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// ── DevotionalReading — render only the actionButton ──────────────────────────
vi.mock('@/components/DevotionalReading', () => ({
  DevotionalReading: ({ actionButton }: { actionButton: React.ReactNode }) => (
    <div data-testid="reading-area">{actionButton}</div>
  ),
}));

// ── devotionals-api ───────────────────────────────────────────────────────────
import type { SeriesWithEntries, DevotionalProgress } from '@/lib/devotionals-api';

let mockSeriesData: SeriesWithEntries;
let mockProgressData: DevotionalProgress;

vi.mock('@/lib/devotionals-api', () => ({
  getSeriesWithEntries: async () => mockSeriesData,
  getProgress: async () => mockProgressData,
  startSeries: async () => mockProgressData,
  markDayComplete: async () => mockProgressData,
}));

// ─────────────────────────────────────────────────────────────────────────────

import DevotionalDay from '../DevotionalDay';

const BASE_ENTRY = {
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
};

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

const BASE_PROGRESS: DevotionalProgress = {
  id: 'prog-1',
  userId: 'user-1',
  seriesId: 'series-1',
  // Day 1 already completed — triggers the alreadyCompleted path in DevotionalDay
  currentDay: 1,
  completedDays: [1],
  startedAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

describe('DevotionalDay — completion card next-entry CTA visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProgressData = { ...BASE_PROGRESS };
  });

  it('shows "Continue to Next Devotional" when the next entry is Published', async () => {
    mockSeriesData = {
      ...BASE_SERIES,
      entries: [
        { ...BASE_ENTRY, dayNumber: 1, status: 'Published' },
        { ...BASE_ENTRY, id: 'e2', dayNumber: 2, title: 'Day Two', status: 'Published' },
      ],
    };

    render(<DevotionalDay />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /continue to next devotional/i })).toBeInTheDocument();
    });

    // Return link is rendered as a secondary text link (not the primary button)
    expect(screen.getByText(/back to next steps/i)).toBeInTheDocument();
  });

  it('hides the CTA and shows only the return button when the next entry is Draft', async () => {
    mockSeriesData = {
      ...BASE_SERIES,
      entries: [
        { ...BASE_ENTRY, dayNumber: 1, status: 'Published' },
        { ...BASE_ENTRY, id: 'e2', dayNumber: 2, title: 'Day Two', status: 'Draft' },
      ],
    };

    render(<DevotionalDay />);

    await waitFor(() => {
      // "Continue" must NOT appear
      expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();
    });

    // Only the primary return button
    expect(screen.getByRole('button', { name: /back to next steps/i })).toBeInTheDocument();
  });

  it('hides the CTA and shows only the return button when there is no next entry', async () => {
    mockSeriesData = {
      ...BASE_SERIES,
      entries: [
        { ...BASE_ENTRY, dayNumber: 1, status: 'Published' },
        // No day 2 entry at all
      ],
    };

    render(<DevotionalDay />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /back to next steps/i })).toBeInTheDocument();
  });
});
