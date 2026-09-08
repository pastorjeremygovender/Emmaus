import { describe, expect, it } from 'vitest';
import { isGatedByDailyGate } from '@/lib/daily-gate';

describe('Daily Rhythm navigation gate', () => {
  it('never gates member content before Daily Rhythm is completed', () => {
    expect(isGatedByDailyGate({
      id: 'walk-1',
      journeyType: 'walk',
      requiresDailyGate: true,
    } as never)).toBe(false);
  });
});