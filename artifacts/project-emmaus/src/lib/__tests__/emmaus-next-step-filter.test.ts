import { describe, expect, it } from 'vitest';
import {
  filterDuplicateSermonNextSteps,
  type NextStepItem,
} from '../emmaus-client';

describe('Ask Emmaus sermon next-step identity filtering', () => {
  it('suppresses only the represented sermon and preserves different or non-listen steps', () => {
    const steps: NextStepItem[] = [
      { type: 'listen', sermonId: 'sermon-a', text: 'Same title' },
      { type: 'listen', sermonId: 'sermon-b', text: 'Same title' },
      { type: 'listen', resourceId: 'resource-a', text: 'Resource identity' },
      { type: 'read', text: 'Read Psalm 23' },
      { type: 'pray', text: 'Pray for peace' },
    ];

    const filtered = filterDuplicateSermonNextSteps(steps, [
      { sermonId: 'sermon-a' },
      { resourceId: 'resource-a' },
    ]);

    expect(filtered).toEqual([steps[1], steps[3], steps[4]]);
  });

  it('does not use matching titles as identity', () => {
    const step: NextStepItem = { type: 'listen', sermonId: 'different-id', text: 'Same title' };
    expect(filterDuplicateSermonNextSteps([step], [{ sermonId: 'trusted-id' }])).toEqual([step]);
  });
});