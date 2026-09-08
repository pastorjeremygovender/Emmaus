/**
 * devotional-completion-pct.test.ts
 *
 * Guards the business-logic used by getDiscipleshipAnalytics() to compute
 * devotionalAvgCompletionPct.  The SQL mirrors this function exactly:
 *
 *   CASE
 *     WHEN dp.status = 'completed' THEN 100
 *     WHEN ec.total > 0 THEN
 *       LEAST(100, GREATEST(0,
 *         (count of published entries with day_number < dp.current_day)
 *           / ec.total * 100
 *       ))
 *     ELSE 0
 *   END
 *
 * Non-sequential day numbers are the critical edge case: a series might store
 * entries at day_number 1, 3, 7, 100 ... The raw (current_day - 1) approach
 * would explode for a 2-entry series [1, 100] where current_day=100 after
 * completing day 1 — giving 4900% instead of 50%.
 *
 * Run:
 *   node --test --experimental-strip-types \
 *     src/lib/__tests__/devotional-completion-pct.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ─── Pure mirror of the SQL expression ───────────────────────────────────────

/**
 * Compute the completion percentage for a single devotional progress row.
 *
 * @param status        - 'active' | 'paused' | 'completed'
 * @param currentDay    - server-authoritative next day to complete (1-based day number)
 * @param publishedDays - day_number values of all Published entries in the series
 */
function computeCompletionPct(
  status: string,
  currentDay: number,
  publishedDays: number[],
): number {
  if (status === "completed") return 100;
  const total = publishedDays.length;
  if (total === 0) return 0;
  // Count entries that have been passed (day_number < current_day)
  const before = publishedDays.filter((d) => d < currentDay).length;
  return Math.min(100, Math.max(0, Math.round((before / total) * 100)));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("computeCompletionPct", () => {
  // ── Sequential day numbering (1, 2, 3, …) ──────────────────────────────────

  it("returns 0% when current_day is 1 and no entries have been passed", () => {
    // Series: days [1, 2, 3, 4, 5]; current_day = 1 means zero entries done.
    assert.equal(computeCompletionPct("active", 1, [1, 2, 3, 4, 5]), 0);
  });

  it("returns 40% after completing 2 of 5 sequential days", () => {
    // After days 1 and 2 done, current_day advances to 3.
    assert.equal(computeCompletionPct("active", 3, [1, 2, 3, 4, 5]), 40);
  });

  it("returns 80% after completing 4 of 5 sequential days", () => {
    assert.equal(computeCompletionPct("active", 5, [1, 2, 3, 4, 5]), 80);
  });

  // ── Non-contiguous day numbers ─────────────────────────────────────────────

  it("handles a 2-entry series at day_number [1, 100] — 0% before start", () => {
    // No entries passed when current_day = 1 (first entry).
    assert.equal(computeCompletionPct("active", 1, [1, 100]), 0);
  });

  it("handles a 2-entry series at day_number [1, 100] — 50% after first entry", () => {
    // After completing day 1, current_day advances to 100.
    // Only one entry has day_number < 100 (day 1 itself).
    assert.equal(computeCompletionPct("active", 100, [1, 100]), 50);
  });

  it("handles entries with a start offset (day 3 is the first entry)", () => {
    // Series entries: [3, 5, 10]; current_day = 3 → 0 entries passed.
    assert.equal(computeCompletionPct("active", 3, [3, 5, 10]), 0);
    // After day 3 done, current_day = 5 → 1 of 3 = 33%.
    assert.equal(computeCompletionPct("active", 5, [3, 5, 10]), 33);
    // After days 3 and 5 done, current_day = 10 → 2 of 3 = 67%.
    assert.equal(computeCompletionPct("active", 10, [3, 5, 10]), 67);
  });

  it("handles a large gap series [1, 50, 100] at various positions", () => {
    assert.equal(computeCompletionPct("active", 1, [1, 50, 100]), 0);  // 0/3
    assert.equal(computeCompletionPct("active", 50, [1, 50, 100]), 33); // 1/3
    assert.equal(computeCompletionPct("active", 100, [1, 50, 100]), 67); // 2/3
  });

  // ── Completed series ───────────────────────────────────────────────────────

  it("returns 100% for completed status regardless of current_day", () => {
    assert.equal(computeCompletionPct("completed", 5, [1, 2, 3, 4, 5]), 100);
  });

  it("returns 100% for completed status even with non-sequential days", () => {
    assert.equal(computeCompletionPct("completed", 1, [1, 100]), 100);
  });

  it("returns 100% for completed status with any current_day value", () => {
    // current_day could be the last day value when all are done
    assert.equal(computeCompletionPct("completed", 100, [1, 100]), 100);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it("returns 0% when published entry list is empty", () => {
    assert.equal(computeCompletionPct("active", 1, []), 0);
  });

  it("clamps result to [0, 100] even if current_day is unexpectedly high", () => {
    // current_day beyond all entries: all 3 entries < current_day → 100%
    assert.equal(computeCompletionPct("active", 9999, [1, 2, 3]), 100);
  });

  it("returns 0% for a paused series at day 1", () => {
    assert.equal(computeCompletionPct("paused", 1, [1, 2, 3, 4, 5]), 0);
  });

  it("paused series at day 3 of 5 returns 40%", () => {
    // 2 entries passed (days 1 and 2) out of 5 total
    assert.equal(computeCompletionPct("paused", 3, [1, 2, 3, 4, 5]), 40);
  });
});
