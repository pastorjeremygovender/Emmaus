import { afterEach, describe, expect, it } from 'vitest';
import {
  hasPresentedDailyRhythmDay,
  rememberPresentedDailyRhythmDay,
} from '@/lib/daily-rhythm-presentation';

describe('Daily Rhythm first-open presentation', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('treats widget, icon, and completion as the same day marker', () => {
    expect(hasPresentedDailyRhythmDay('member-1', 26)).toBe(false);
    rememberPresentedDailyRhythmDay('member-1', 26);
    expect(hasPresentedDailyRhythmDay('member-1', 26)).toBe(true);
  });

  it('resets when the assigned calendar day advances', () => {
    rememberPresentedDailyRhythmDay('member-1', 26);
    expect(hasPresentedDailyRhythmDay('member-1', 27)).toBe(false);
  });

  it('does not share the marker across accounts', () => {
    rememberPresentedDailyRhythmDay('member-1', 26);
    expect(hasPresentedDailyRhythmDay('member-2', 26)).toBe(false);
  });
});
