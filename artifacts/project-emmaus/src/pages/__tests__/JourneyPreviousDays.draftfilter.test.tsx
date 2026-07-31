/**
 * JourneyPreviousDays.draftfilter.test.tsx
 *
 * Confirms that the Previous Days list for a Walk (Journey) never exposes a
 * link to a Draft step.
 *
 *  1. Mixed Published + Draft steps → only Published steps render in the list.
 *  2. Draft step sandwiched between Published steps → Draft row is absent.
 *  3. All steps are Draft → empty-state message is shown, no Review links.
 *  4. Published step at or after currentDay → not shown (availability gate).
 *
 * Mirrors the pattern established in DevotionalPreviousDays.draftfilter.test.tsx
 * and SermonCompanionPreviousDays.draftfilter.test.tsx.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ── wouter ────────────────────────────────────────────────────────────────────
const mockSetLocation = vi.fn();

vi.mock('wouter', () => ({
  useParams: () => ({ journeyId: 'journey-1' }),
  useLocation: () => ['/', mockSetLocation],
}));

// ── return-context ────────────────────────────────────────────────────────────
vi.mock('@/lib/return-context', () => ({
  resolveReturn: () => ({ path: '/journeys?tab=walks', label: 'Back to Next Steps' }),
}));

// ── JourneyContext ────────────────────────────────────────────────────────────
import type { Step } from '@/contexts/JourneyContext';

let mockSteps: Partial<Step>[];
let mockCurrentDay: number;
let mockCompletedDays: number[];

vi.mock('@/contexts/JourneyContext', () => ({
  useJourney: () => ({
    journeys: [
      { id: 'journey-1', title: 'Test Walk' },
    ],
    getStepsForJourney: (_id: string) => mockSteps,
    progress: {
      'journey-1': {
        currentDay: mockCurrentDay,
        completedDays: mockCompletedDays,
      },
    },
    loading: false,
  }),
}));

// ── BottomNav (avoid SVG/icon import noise) ───────────────────────────────────
vi.mock('@/components/BottomNav', () => ({
  BottomNav: () => <div data-testid="bottom-nav" />,
}));

// ─────────────────────────────────────────────────────────────────────────────

import JourneyPreviousDays from '../JourneyPreviousDays';

// ── Shared fixture helpers ────────────────────────────────────────────────────

function makeStep(day: number, status: string, title?: string): Partial<Step> {
  return {
    id: `step-${day}`,
    journeyId: 'journey-1',
    day,
    title: title ?? `Day ${day} Title`,
    scripture: 'John 1:1',
    status,
  } as Partial<Step>;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('JourneyPreviousDays — Draft step filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Large currentDay so all step days qualify as "previous" (day < currentDay).
    // All days are marked completed so Published steps render a "Review →" button.
    mockCurrentDay = 99;
    mockCompletedDays = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  });

  it('shows only Published steps when the journey has a mix of Published and Draft steps', () => {
    mockSteps = [
      makeStep(1, 'Published', 'Day One Published'),
      makeStep(2, 'Draft',     'Day Two Draft'),
      makeStep(3, 'Published', 'Day Three Published'),
    ];

    render(<JourneyPreviousDays />);

    // Published steps appear
    expect(screen.getByText('Day One Published')).toBeInTheDocument();
    expect(screen.getByText('Day Three Published')).toBeInTheDocument();

    // Draft step must NOT appear — no title, no review link
    expect(screen.queryByText('Day Two Draft')).not.toBeInTheDocument();

    // Review buttons exist only for Published days
    expect(screen.getByTestId('review-day-1')).toBeInTheDocument();
    expect(screen.getByTestId('review-day-3')).toBeInTheDocument();
    expect(screen.queryByTestId('review-day-2')).not.toBeInTheDocument();
  });

  it('shows no entries and no Review links when all steps are Draft', () => {
    mockSteps = [
      makeStep(1, 'Draft', 'Day One Draft'),
      makeStep(2, 'Draft', 'Day Two Draft'),
    ];

    render(<JourneyPreviousDays />);

    expect(screen.getByText(/no previous days/i)).toBeInTheDocument();

    // No Review links
    expect(screen.queryByTestId('review-day-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-day-2')).not.toBeInTheDocument();

    // Step titles must not appear in the list
    expect(screen.queryByText('Day One Draft')).not.toBeInTheDocument();
    expect(screen.queryByText('Day Two Draft')).not.toBeInTheDocument();
  });

  it('does not render a Review link for a Draft step sandwiched between Published steps', () => {
    mockSteps = [
      makeStep(1, 'Published', 'Step One'),
      makeStep(2, 'Draft',     'Step Two Draft'),
      makeStep(3, 'Published', 'Step Three'),
      makeStep(4, 'Draft',     'Step Four Draft'),
    ];

    render(<JourneyPreviousDays />);

    // Published steps present with review links (days 1 and 3 are in completedDays)
    expect(screen.getByText('Step One')).toBeInTheDocument();
    expect(screen.getByText('Step Three')).toBeInTheDocument();
    expect(screen.getByTestId('review-day-1')).toBeInTheDocument();
    expect(screen.getByTestId('review-day-3')).toBeInTheDocument();

    // Draft steps absent — no row text, no review button
    expect(screen.queryByText('Step Two Draft')).not.toBeInTheDocument();
    expect(screen.queryByText('Step Four Draft')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-day-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-day-4')).not.toBeInTheDocument();
  });

  it('does not show a Published step whose day meets or exceeds currentDay', () => {
    // currentDay = 3 → only days 1 and 2 qualify (day < currentDay)
    mockCurrentDay = 3;
    mockCompletedDays = [1, 2];
    mockSteps = [
      makeStep(1, 'Published', 'Day One'),
      makeStep(2, 'Published', 'Day Two'),
      makeStep(3, 'Published', 'Day Three Future'),
    ];

    render(<JourneyPreviousDays />);

    expect(screen.getByText('Day One')).toBeInTheDocument();
    expect(screen.getByText('Day Two')).toBeInTheDocument();

    // Day 3 is the current day — not yet eligible for Previous Days
    expect(screen.queryByText('Day Three Future')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-day-3')).not.toBeInTheDocument();
  });

  it('renders an empty state when the journey has no steps at all', () => {
    mockSteps = [];

    render(<JourneyPreviousDays />);

    expect(screen.getByText(/no previous days/i)).toBeInTheDocument();
  });
});
