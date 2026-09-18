import { describe, expect, it, vi } from 'vitest';
import { buildEmmausScreenContext } from '../emmaus-screen-context';

describe('Emmaus screen context', () => {
  const journeys = [
    { id: 'walk-b', title: 'Walk B', journeyType: 'walk' },
    { id: 'journey-a', title: 'Journey A', journeyType: 'journey' },
  ];
  const progress = { 'walk-b': { currentDay: 3 } };
  const getStep = vi.fn((journeyId: string, day: number) => ({
    title: `${journeyId} step ${day}`,
  }));

  it('carries the exact visible Walk and day into Ask Emmaus', () => {
    expect(buildEmmausScreenContext('/journey/walk-b/day/2', {
      journeys,
      progress,
      getStep,
    })).toMatchObject({
      entryPoint: 'walk',
      journeyId: 'walk-b',
      journeyTitle: 'Walk B',
      journeyType: 'walk',
      currentDay: 2,
    });
  });

  it('carries the exact visible sermon ID instead of falling back to the latest sermon', () => {
    expect(buildEmmausScreenContext('/sermon/sermon-a', {
      journeys,
      progress,
      getStep,
    })).toEqual({
      entryPoint: 'sermons',
      sermonId: 'sermon-a',
    });
  });

  it('does not invent a content ID on generic hubs', () => {
    expect(buildEmmausScreenContext('/journeys', {
      journeys,
      progress,
      getStep,
    })).toEqual({ entryPoint: 'journeys' });
  });
});