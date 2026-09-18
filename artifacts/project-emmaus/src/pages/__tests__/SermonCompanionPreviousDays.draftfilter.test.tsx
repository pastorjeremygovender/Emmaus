/**
 * SermonCompanionPreviousDays.draftfilter.test.tsx
 *
 * Confirms that the Previous Reflections list for a Sermon Companion never
 * exposes a link to a Draft entry.
 *
 *  1. Mixed Published + Draft entries → only Published entries render.
 *  2. Draft entry sandwiched between Published entries → Draft row is absent.
 *  3. All entries are Draft → empty-state message, no Review links.
 *  4. Published entries at or after currentDay → not shown (availability gate).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// ── wouter ────────────────────────────────────────────────────────────────────
const mockSetLocation = vi.fn();

vi.mock('wouter', () => ({
  useParams: () => ({ id: 'companion-1' }),
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

// ── return-context ────────────────────────────────────────────────────────────
vi.mock('@/lib/return-context', () => ({
  resolveReturn: () => ({ path: '/journeys?tab=sermons', label: 'Back to Next Steps' }),
}));

// ─────────────────────────────────────────────────────────────────────────────

import SermonCompanionPreviousDays from '../SermonCompanionPreviousDays';

// ── Shared fixture helpers ────────────────────────────────────────────────────

interface SCEntry {
  id: string;
  dayNumber: number;
  title: string;
  scriptureReference: string;
  status: string;
}

function makeEntry(dayNumber: number, status: string, title?: string): SCEntry {
  return {
    id: `entry-${dayNumber}`,
    dayNumber,
    title: title ?? `Day ${dayNumber} Title`,
    scriptureReference: 'John 1:1',
    status,
  };
}

function makeCompanionResponse(entries: SCEntry[], currentDay = 99) {
  return {
    id: 'companion-1',
    title: 'Test Companion',
    numberOfDays: entries.length,
    entries,
    progress: {
      currentDay,
      completedDays: Array.from({ length: currentDay - 1 }, (_, i) => i + 1),
    },
  };
}

// ── fetch mock ────────────────────────────────────────────────────────────────

let mockCompanionPayload: object;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', async (_url: string) => ({
    ok: true,
    json: async () => mockCompanionPayload,
  }));
});

// ─────────────────────────────────────────────────────────────────────────────

describe('SermonCompanionPreviousDays — Draft entry filtering', () => {
  it('shows only Published entries when the companion has a mix of Published and Draft', async () => {
    mockCompanionPayload = makeCompanionResponse([
      makeEntry(1, 'Published', 'Reflection One Published'),
      makeEntry(2, 'Draft',     'Reflection Two Draft'),
      makeEntry(3, 'Published', 'Reflection Three Published'),
    ]);

    render(<SermonCompanionPreviousDays />);

    await waitFor(() => {
      expect(screen.getByText('Reflection One Published')).toBeInTheDocument();
    });

    // Published entries present
    expect(screen.getByText('Reflection One Published')).toBeInTheDocument();
    expect(screen.getByText('Reflection Three Published')).toBeInTheDocument();

    // Draft entry absent — no title text, no review link
    expect(screen.queryByText('Reflection Two Draft')).not.toBeInTheDocument();

    // Review links only for Published days that are < currentDay (99)
    expect(screen.getByTestId('review-day-1')).toBeInTheDocument();
    expect(screen.getByTestId('review-day-3')).toBeInTheDocument();
    expect(screen.queryByTestId('review-day-2')).not.toBeInTheDocument();
  });

  it('shows no entries and no Review links when all entries are Draft', async () => {
    mockCompanionPayload = makeCompanionResponse([
      makeEntry(1, 'Draft', 'Hidden Day One'),
      makeEntry(2, 'Draft', 'Hidden Day Two'),
    ]);

    render(<SermonCompanionPreviousDays />);

    await waitFor(() => {
      expect(screen.getByText(/no previous companion steps are available yet/i)).toBeInTheDocument();
    });

    expect(screen.queryByText('Hidden Day One')).not.toBeInTheDocument();
    expect(screen.queryByText('Hidden Day Two')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-day-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-day-2')).not.toBeInTheDocument();
  });

  it('does not render a Review link for a Draft entry between Published entries', async () => {
    mockCompanionPayload = makeCompanionResponse([
      makeEntry(1, 'Published', 'Reflection A'),
      makeEntry(2, 'Draft',     'Draft Middle'),
      makeEntry(3, 'Published', 'Reflection C'),
      makeEntry(4, 'Draft',     'Draft End'),
    ]);

    render(<SermonCompanionPreviousDays />);

    await waitFor(() => {
      expect(screen.getByText('Reflection A')).toBeInTheDocument();
    });

    expect(screen.getByTestId('review-day-1')).toBeInTheDocument();
    expect(screen.getByTestId('review-day-3')).toBeInTheDocument();

    expect(screen.queryByText('Draft Middle')).not.toBeInTheDocument();
    expect(screen.queryByText('Draft End')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-day-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-day-4')).not.toBeInTheDocument();
  });

  it('does not show a Published entry whose dayNumber meets or exceeds currentDay', async () => {
    // currentDay = 3 means only days 1 and 2 are eligible (dayNumber < currentDay)
    mockCompanionPayload = makeCompanionResponse(
      [
        makeEntry(1, 'Published', 'Day One'),
        makeEntry(2, 'Published', 'Day Two'),
        makeEntry(3, 'Published', 'Day Three Future'),
      ],
      3, // currentDay
    );

    render(<SermonCompanionPreviousDays />);

    await waitFor(() => {
      expect(screen.getByText('Day One')).toBeInTheDocument();
    });

    expect(screen.getByText('Day One')).toBeInTheDocument();
    expect(screen.getByText('Day Two')).toBeInTheDocument();

    // Day 3 is the current day — not yet eligible for "Previous Reflections"
    expect(screen.queryByText('Day Three Future')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-day-3')).not.toBeInTheDocument();
  });

  it('renders an empty state when the API returns no entries', async () => {
    mockCompanionPayload = makeCompanionResponse([]);

    render(<SermonCompanionPreviousDays />);

    await waitFor(() => {
      expect(screen.getByText(/no previous companion steps are available yet/i)).toBeInTheDocument();
    });
  });
});
