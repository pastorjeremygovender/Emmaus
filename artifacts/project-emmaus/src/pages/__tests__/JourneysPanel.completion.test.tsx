/**
 * JourneysPanel.completion.test.tsx
 *
 * Guards the walk-completion count displayed on collection cards in the
 * Journeys tab. The count comes from the client-side `progress` prop
 * (JourneyContext), NOT from the server's next-steps cache.
 *
 * This means the count must be accurate immediately after a walk is
 * completed — even before the next-steps API re-fetches — and must
 * survive a full page reload (where progress is loaded fresh from the
 * server into JourneyContext).
 *
 * Cases tested:
 *   1. "1 of 3 walks completed" — one walk's completedDays ≥ durationDays
 *   2. "0 of 3 walks completed" — member has started a walk (record exists)
 *      but completedDays is empty
 *   3. "3 Walks · Completed" + state='completed' — all walks are done
 *   4. "3 Walks" — no progress at all (never started)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JourneysPanel } from '../Journeys';
import type { JourneyCollectionGroup } from '@/lib/next-steps-api';

// ── Minimal NextStepsItem factory ──────────────────────────────────────────────

function makeWalk(id: string, durationDays: number): JourneyCollectionGroup['journeys'][number] {
  return {
    id,
    title: `Walk ${id}`,
    contentType: 'journey',
    memberProgressState: 'not-started',
    metadata: { durationDays },
    route: `/journey/${id}`,
    primaryActionLabel: 'Start',
    badge: null,
  };
}

// ── Collection factory ─────────────────────────────────────────────────────────

function makeCollection(id: string, walks: JourneyCollectionGroup['journeys']): JourneyCollectionGroup {
  return { id, title: `Collection ${id}`, journeys: walks };
}

// ── Shared render helper ───────────────────────────────────────────────────────

function renderPanel(
  collections: JourneyCollectionGroup[],
  progress: Record<string, { completedDays: number[] }>,
) {
  render(
    <JourneysPanel
      collections={collections}
      onOpenJourney={vi.fn()}
      isGated={false}
      onGate={vi.fn()}
      progress={progress}
    />,
  );
}

// ─────────────────────────────────────────────────────────────────────────────

describe('JourneysPanel — walk completion count on collection cards', () => {
  it('shows "1 of 3 walks completed" when one walk has completedDays ≥ durationDays', () => {
    const walks = [makeWalk('w1', 5), makeWalk('w2', 5), makeWalk('w3', 5)];
    const collections = [makeCollection('col-1', walks)];

    // w1 is fully completed; w2 and w3 have no progress.
    const progress: Record<string, { completedDays: number[] }> = {
      w1: { completedDays: [1, 2, 3, 4, 5] }, // length(5) >= durationDays(5) → completed
    };

    renderPanel(collections, progress);

    expect(screen.getByText('1 of 3 walks completed')).toBeInTheDocument();
  });

  it('shows "0 of 3 walks completed" when completedDays is empty (started but not finished)', () => {
    const walks = [makeWalk('w1', 5), makeWalk('w2', 5), makeWalk('w3', 5)];
    const collections = [makeCollection('col-1', walks)];

    // w1 has been started (progress record exists) but no days are done.
    const progress: Record<string, { completedDays: number[] }> = {
      w1: { completedDays: [] }, // started but 0 < 5 → in-progress, not completed
    };

    renderPanel(collections, progress);

    expect(screen.getByText('0 of 3 walks completed')).toBeInTheDocument();
  });

  it('shows "3 Walks · Completed" and state is completed when all walks are done', () => {
    const walks = [makeWalk('w1', 3), makeWalk('w2', 3), makeWalk('w3', 3)];
    const collections = [makeCollection('col-1', walks)];

    const progress: Record<string, { completedDays: number[] }> = {
      w1: { completedDays: [1, 2, 3] },
      w2: { completedDays: [1, 2, 3] },
      w3: { completedDays: [1, 2, 3] },
    };

    renderPanel(collections, progress);

    expect(screen.getByText('3 Walks · Completed')).toBeInTheDocument();

    // The completed checkmark badge (✓) appears next to the card title
    // when state === 'completed'.
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('shows "3 Walks" (no count) when the member has never started any walk', () => {
    const walks = [makeWalk('w1', 5), makeWalk('w2', 5), makeWalk('w3', 5)];
    const collections = [makeCollection('col-1', walks)];

    // No progress records at all — member has not started anything.
    renderPanel(collections, {});

    expect(screen.getByText('3 Walks')).toBeInTheDocument();
    // Must not show a "0 of 3" count when there is genuinely no activity.
    expect(screen.queryByText(/of 3 walks completed/i)).not.toBeInTheDocument();
  });
});
