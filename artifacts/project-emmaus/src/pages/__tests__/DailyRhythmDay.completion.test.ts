import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(process.cwd(), 'src/pages/DailyRhythmDay.tsx'),
  'utf8',
);

describe('DailyRhythmDay completion contract', () => {
  it('keeps the completion decision visible until the member chooses', () => {
    expect(source).toContain('setJustCompleted(true)');
    expect(source).toContain('returnLabel="Back to Today\'s Steps"');
    expect(source).toContain('onReturn={goBack}');
    expect(source).not.toContain('setTimeout(() => setLocation(\'/walk\')');
    expect(source).not.toContain('Returning to Today\'s Steps…');
    expect(source).not.toContain('Continue to ${getStepLabel(nextStep, journey)}');
    expect(source).not.toContain('day + 1?from=walk');
  });
});