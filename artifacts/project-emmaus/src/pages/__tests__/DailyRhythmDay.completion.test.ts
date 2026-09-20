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
    expect(source).toContain("new CustomEvent('emmaus:opening-completed'");
    expect(source).toContain('detail: { decision: completion.dailyRhythmStartup }');
    expect(source).toContain('returnLabel="Back to My Emmaus"');
    expect(source).toContain('onReturn={() => goBackOrFallback(postCompletionDestination, setLocation)}');
    expect(source).not.toContain('setTimeout(() => setLocation(\'/walk\')');
    expect(source).not.toContain('Returning to Today\'s Steps…');
    expect(source).not.toContain('Continue to ${getStepLabel(nextStep, journey)}');
    expect(source).not.toContain('day + 1?from=walk');
  });

  it('refreshes authoritative progress before applying the future-day guard', () => {
    expect(source).toContain("const isDailyRhythmJourney = journey?.journeyType === 'daily-rhythm';");
    expect(source).toContain('getDailyRhythmState()');
    expect(source).toContain('dailyProgressLoading');
    expect(source).toContain('if (isDailyRhythmJourney && (dailyProgressLoading || stepsLoading))');
  });

  it('keeps widget routing safe while the step catalogue is loading', () => {
    expect(source).toContain('const currentDay =');
    expect(source).toContain('const stepsLoading = Boolean(isDailyRhythmJourney && journeysLoading);');
    expect(source).toContain('if (isDailyRhythmJourney && (dailyProgressLoading || stepsLoading))');
    expect(source).toContain('stepsLoading ||');
  });

  it('does not keep a future-day guard or infer replay from the assigned day', () => {
    expect(source).not.toContain('isAhead');
    expect(source).not.toContain('AheadOfRhythmDevOnly');
    expect(source).toContain('const isReplay = alreadyCompleted;');
  });
});