import { describe, expect, it } from 'vitest';
import { projectTodaysJourneys, type StartedJourney } from '../todays-journey-projection';

function started(id: string, collectionId?: string, startedAt = '2026-08-01T00:00:00.000Z'): StartedJourney {
  return {
    journey: {
      id,
      title: id,
      description: '',
      journeyType: 'walk',
      status: 'Published',
      collectionId,
    },
    prog: {
      journeyId: id,
      currentDay: 1,
      completedDays: [],
      startedAt,
      lastCompletedAt: null,
      status: 'active',
    },
    currentStep: null,
    totalPublishedSteps: 3,
  };
}

const collections = [
  { id: 'collection-a', title: 'Alpha', description: '', status: 'Published' as const },
  { id: 'collection-b', title: 'Beta', description: '', status: 'Published' as const },
];

describe('My Emmaus journey projection', () => {
  it('does not create cards when the member has only browsed', () => {
    expect(projectTodaysJourneys([], collections)).toEqual({
      standaloneWalks: [],
      standaloneJourneys: [],
      collectionCards: [],
    });
  });

  it('keeps a standalone Walk in Walks', () => {
    const result = projectTodaysJourneys([started('standalone')], collections);
    expect(result.standaloneWalks.map(item => item.journey.id)).toEqual(['standalone']);
    expect(result.collectionCards).toHaveLength(0);
  });

  it('projects one collection Walk as one parent card', () => {
    const result = projectTodaysJourneys([started('walk-a', 'collection-a')], collections);
    expect(result.standaloneWalks).toHaveLength(0);
    expect(result.collectionCards[0].collection.id).toBe('collection-a');
    expect(result.collectionCards[0].active.journey.id).toBe('walk-a');
  });

  it('groups two Walks in one collection and resumes the most recently started child', () => {
    const result = projectTodaysJourneys([
      started('older', 'collection-a', '2026-08-01T00:00:00.000Z'),
      started('newer', 'collection-a', '2026-08-02T00:00:00.000Z'),
    ], collections);
    expect(result.collectionCards).toHaveLength(1);
    expect(result.collectionCards[0].children).toHaveLength(2);
    expect(result.collectionCards[0].active.journey.id).toBe('newer');
  });

  it('keeps Walks from two collections as two parent cards', () => {
    const result = projectTodaysJourneys([
      started('walk-a', 'collection-a'),
      started('walk-b', 'collection-b'),
    ], collections);
    expect(result.collectionCards.map(card => card.collection.id)).toEqual(['collection-a', 'collection-b']);
  });

  it('keeps unresolved collection progress actionable as a child Journey card', () => {
    const result = projectTodaysJourneys([
      started('walk-from-missing-parent', 'missing-collection'),
    ], collections);
    expect(result.collectionCards).toHaveLength(0);
    expect(result.standaloneJourneys.map(item => item.journey.id)).toEqual([
      'walk-from-missing-parent',
    ]);
  });

  it('is deterministic after progress is reloaded in a different order', () => {
    const first = projectTodaysJourneys([
      started('older', 'collection-a', '2026-08-01T00:00:00.000Z'),
      started('newer', 'collection-a', '2026-08-02T00:00:00.000Z'),
    ], collections);
    const reopened = projectTodaysJourneys([
      started('newer', 'collection-a', '2026-08-02T00:00:00.000Z'),
      started('older', 'collection-a', '2026-08-01T00:00:00.000Z'),
    ], collections);
    expect(reopened.collectionCards[0].active.journey.id).toBe(first.collectionCards[0].active.journey.id);
  });
});