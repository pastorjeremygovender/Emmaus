/**
 * devotional-calendar.test.ts
 *
 * Unit tests for calcAvailableDaySelfPaced — the shared position helper that
 * drives Today's Steps (Walk.tsx).  The DevotionalNavigatorPage uses its own
 * resolveCurrentIdx which must produce consistent results; that alignment is
 * verified in the "surface alignment" suite at the bottom.
 *
 * Key edge cases:
 *   1. No progress yet          → day 1
 *   2. After completing day N   → day N+1
 *   3. Non-sequential dayNumbers (e.g. 3,4,5…16 in a 14-entry series)
 *   4. All entries completed    → last published day (all-done state)
 *   5. Dev mode bypass          → last published day immediately
 *
 * The "all complete" case is the most critical: each surface must show the
 * same all-done state, not one pinning to day 1 while another pins to the
 * last day.
 */

import { describe, it, expect } from 'vitest';
import { calcAvailableDaySelfPaced } from '../devotional-calendar';

// ─── Helper that mirrors DevotionalNavigatorPage's resolveCurrentIdx ──────────
// Kept here to verify alignment without importing the page component.
function resolveCurrentIdx(
  sortedDayNumbers: number[],
  completedDays: number[],
): number {
  const completedSet = new Set(completedDays);
  const nextIdx = sortedDayNumbers.findIndex(d => !completedSet.has(d));
  if (nextIdx !== -1) return nextIdx;
  // All complete — pin to last entry index
  return sortedDayNumbers.length - 1;
}

// ─── calcAvailableDaySelfPaced ────────────────────────────────────────────────

describe('calcAvailableDaySelfPaced', () => {
  const DEV_OFF = false;
  const DEV_ON  = true;

  describe('sequential day numbers (1…N)', () => {
    it('returns 1 when no entries have been completed', () => {
      expect(calcAvailableDaySelfPaced([], 7, DEV_OFF)).toBe(1);
    });

    it('returns the next day after completing day 1', () => {
      expect(calcAvailableDaySelfPaced([1], 7, DEV_OFF)).toBe(2);
    });

    it('returns the next day after completing several entries in order', () => {
      expect(calcAvailableDaySelfPaced([1, 2, 3], 7, DEV_OFF)).toBe(4);
    });

    it('returns the last published day when ALL entries are completed', () => {
      // 5-entry series; member has completed all 5
      expect(calcAvailableDaySelfPaced([1, 2, 3, 4, 5], 5, DEV_OFF)).toBe(5);
    });

    it('returns 1 (not 0) when maxPublishedDay is 0 and no completedDays', () => {
      expect(calcAvailableDaySelfPaced([], 0, DEV_OFF)).toBe(1);
    });

    it('returns 1 when there is exactly 1 entry and it has not been completed', () => {
      expect(calcAvailableDaySelfPaced([], 1, DEV_OFF)).toBe(1);
    });

    it('returns 1 (last = only entry) when the single entry is completed', () => {
      expect(calcAvailableDaySelfPaced([1], 1, DEV_OFF)).toBe(1);
    });
  });

  describe('non-sequential day numbers (publishedDayNumbers list supplied)', () => {
    // Series with dayNumbers [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
    // i.e. 14 published entries starting at day 3
    const nonSeqDays = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    const maxDay = 16;

    it('returns the first day (3) when nothing is completed', () => {
      expect(calcAvailableDaySelfPaced([], maxDay, DEV_OFF, nonSeqDays)).toBe(3);
    });

    it('returns day 5 after completing days 3 and 4', () => {
      expect(calcAvailableDaySelfPaced([3, 4], maxDay, DEV_OFF, nonSeqDays)).toBe(5);
    });

    it('returns last day (16) when all entries are completed', () => {
      expect(calcAvailableDaySelfPaced(nonSeqDays, maxDay, DEV_OFF, nonSeqDays)).toBe(16);
    });
  });

  describe('dev mode bypass', () => {
    it('returns maxPublishedDay immediately in dev mode (all unlocked)', () => {
      expect(calcAvailableDaySelfPaced([], 14, DEV_ON)).toBe(14);
    });

    it('returns at least 1 even when maxPublishedDay is 0 in dev mode', () => {
      expect(calcAvailableDaySelfPaced([], 0, DEV_ON)).toBe(1);
    });
  });
});

// ─── Surface alignment: Walk.tsx ↔ DevotionalNavigatorPage ───────────────────
//
// Both surfaces must report the same "current" day from the same completedDays.
// calcAvailableDaySelfPaced returns a day number; resolveCurrentIdx returns an
// index into the sorted array.  We derive the day from the index for comparison.

describe('Surface alignment — Walk card vs Navigator page', () => {
  function walkDay(completedDays: number[], publishedDays: number[]): number {
    const maxDay = Math.max(...publishedDays, 1);
    return calcAvailableDaySelfPaced(completedDays, maxDay, false, publishedDays);
  }

  function navigatorDay(completedDays: number[], publishedDays: number[]): number {
    const sorted = [...publishedDays].sort((a, b) => a - b);
    const idx = resolveCurrentIdx(sorted, completedDays);
    return sorted[idx];
  }

  const DAYS_5  = [1, 2, 3, 4, 5];
  const DAYS_14 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

  it('both agree on day 1 when nothing is completed', () => {
    expect(walkDay([], DAYS_5)).toBe(navigatorDay([], DAYS_5));
    expect(walkDay([], DAYS_5)).toBe(1);
  });

  it('both advance to the same next entry after one completion', () => {
    const completed = [1];
    expect(walkDay(completed, DAYS_5)).toBe(navigatorDay(completed, DAYS_5));
    expect(walkDay(completed, DAYS_5)).toBe(2);
  });

  it('both advance to day 4 after completing days 1–3', () => {
    const completed = [1, 2, 3];
    expect(walkDay(completed, DAYS_5)).toBe(navigatorDay(completed, DAYS_5));
    expect(walkDay(completed, DAYS_5)).toBe(4);
  });

  it('all-complete: both pin to the last published day, not day 1', () => {
    // This is the critical regression case: one surface must not reset to 1
    // while another stays on the last day.
    expect(walkDay(DAYS_5, DAYS_5)).toBe(navigatorDay(DAYS_5, DAYS_5));
    expect(walkDay(DAYS_5, DAYS_5)).toBe(5);
  });

  it('all-complete with non-sequential days: both agree on the last day (16)', () => {
    expect(walkDay(DAYS_14, DAYS_14)).toBe(navigatorDay(DAYS_14, DAYS_14));
    expect(walkDay(DAYS_14, DAYS_14)).toBe(16);
  });

  it('partially complete non-sequential series: both agree on next uncompleted day', () => {
    const completed = [3, 4, 5];
    expect(walkDay(completed, DAYS_14)).toBe(navigatorDay(completed, DAYS_14));
    expect(walkDay(completed, DAYS_14)).toBe(6);
  });
});
