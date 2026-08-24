import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../DailyRhythmDay.tsx', import.meta.url),
  'utf8',
);

describe('DailyRhythmDay completion contract', () => {
  it('returns to Today’s Steps instead of offering the next day', () => {
    expect(source).toContain("setLocation('/walk')");
    expect(source).toContain('Returning to Today\'s Steps…');
    expect(source).not.toContain('Continue to ${getStepLabel(nextStep, journey)}');
    expect(source).not.toContain('day + 1?from=walk');
  });
});