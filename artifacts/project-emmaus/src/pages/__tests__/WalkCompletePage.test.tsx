/**
 * WalkCompletePage.test.tsx
 *
 * Covers the next-Walk CTA visibility logic in Task 205:
 *
 *  1. nextJourneyId → Published walk   : "Start [title]" CTA is shown;
 *                                        "Back to Walk" is rendered as a secondary link.
 *  2. nextJourneyId → Draft walk       : CTA is hidden; only "Back to Walk" button shown.
 *  3. nextJourneyId → unknown walk     : CTA is hidden; only "Back to Walk" button shown.
 *  4. nextJourneyId absent / empty     : CTA is hidden; only "Back to Walk" button shown.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import WalkCompletePage from '../WalkCompletePage';

// ── wouter ────────────────────────────────────────────────────────────────────
const mockSetLocation = vi.fn();

vi.mock('wouter', () => ({
  useParams: () => ({ journeyId: 'journey-1' }),
  useLocation: () => ['/', mockSetLocation],
}));

// ── JourneyContext ─────────────────────────────────────────────────────────────
type MockJourney = {
  id: string;
  title: string;
  status: 'Published' | 'Draft';
  nextJourneyId?: string;
  completionMessage?: string;
};

let mockJourneys: Record<string, MockJourney> = {};

vi.mock('@/contexts/JourneyContext', () => ({
  useJourney: () => ({
    loading: false,
    getJourney: (id: string) => mockJourneys[id] ?? undefined,
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────

describe('WalkCompletePage — next-Walk CTA visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJourneys = {};
  });

  it('shows the "Start [title]" CTA when nextJourneyId points to a Published walk', () => {
    mockJourneys = {
      'journey-1': {
        id: 'journey-1',
        title: 'Walk One',
        status: 'Published',
        nextJourneyId: 'journey-2',
      },
      'journey-2': {
        id: 'journey-2',
        title: 'Walk Two',
        status: 'Published',
      },
    };

    render(<WalkCompletePage />);

    // Primary CTA must mention the next walk's title
    expect(screen.getByRole('button', { name: /start walk two/i })).toBeInTheDocument();

    // "Back to Walk" should still be reachable (secondary link)
    expect(screen.getByText(/back to walk/i)).toBeInTheDocument();
  });

  it('hides the CTA and shows only "Back to Walk" when nextJourneyId points to a Draft walk', () => {
    mockJourneys = {
      'journey-1': {
        id: 'journey-1',
        title: 'Walk One',
        status: 'Published',
        nextJourneyId: 'journey-draft',
      },
      'journey-draft': {
        id: 'journey-draft',
        title: 'Unreleased Walk',
        status: 'Draft',
      },
    };

    render(<WalkCompletePage />);

    // No "Start …" CTA
    expect(screen.queryByRole('button', { name: /start/i })).not.toBeInTheDocument();

    // "Back to Walk" is the sole primary button
    expect(screen.getByRole('button', { name: /back to walk/i })).toBeInTheDocument();
  });

  it('hides the CTA and shows only "Back to Walk" when nextJourneyId points to an unknown walk', () => {
    mockJourneys = {
      'journey-1': {
        id: 'journey-1',
        title: 'Walk One',
        status: 'Published',
        nextJourneyId: 'does-not-exist',
      },
      // 'does-not-exist' is intentionally absent from the map
    };

    render(<WalkCompletePage />);

    expect(screen.queryByRole('button', { name: /start/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to walk/i })).toBeInTheDocument();
  });

  it('hides the CTA and shows only "Back to Walk" when nextJourneyId is absent', () => {
    mockJourneys = {
      'journey-1': {
        id: 'journey-1',
        title: 'Walk One',
        status: 'Published',
        // no nextJourneyId
      },
    };

    render(<WalkCompletePage />);

    expect(screen.queryByRole('button', { name: /start/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to walk/i })).toBeInTheDocument();
  });

  it('hides the CTA and shows only "Back to Walk" when nextJourneyId is an empty string', () => {
    mockJourneys = {
      'journey-1': {
        id: 'journey-1',
        title: 'Walk One',
        status: 'Published',
        nextJourneyId: '   ', // whitespace-only, treated as empty by the page
      },
    };

    render(<WalkCompletePage />);

    expect(screen.queryByRole('button', { name: /start/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to walk/i })).toBeInTheDocument();
  });
});
