// @ts-nocheck
/**
 * Completion Step Invariant — Unit Tests
 *
 * Covers the pure business logic that governs is_completion_step:
 *   A. Position guard: isCompletionStep=true is rejected when effectiveDay ≤ maxRegularDay
 *   B. Revalidation: a completion step that falls within the lesson range is cleared
 *   C. Renumber-plus-flag: effective day (body.day) is used, not the URL :day key
 *   D. Startup integrity scan: higher-day sibling clears a mis-flagged step
 *   E. Uniqueness: at most one completion step survives per journey
 *
 * All helpers are pure functions that mirror the logic in:
 *   - journey-store.ts → createStep / updateStep (position guard)
 *   - journey-store.ts → revalidateCompletionStepPosition (post-write revalidation)
 *   - startup-migrations.ts → generalised is_completion_step integrity scan
 *
 * Run (from artifacts/api-server/):
 *   node --test --experimental-strip-types \
 *     src/lib/__tests__/completion-step-invariant.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ─── Helpers (mirrors of store/migration logic) ───────────────────────────────

/**
 * Mirrors the position guard in createStep and updateStep.
 * Returns the flag value that should be written to the DB.
 *
 * @param isCompletionStepRequested  value sent by the caller
 * @param effectiveDay               target day (body.day when renumbering, else url :day)
 * @param maxRegularDay              MAX(day) of non-completion, non-deleted steps in the journey
 */
function resolveCompletionFlag(
  isCompletionStepRequested: boolean,
  effectiveDay: number,
  maxRegularDay: number,
): boolean {
  if (!isCompletionStepRequested) return false;
  // Valid only if the completion step sits beyond all regular lesson steps.
  return effectiveDay > maxRegularDay;
}

/**
 * Mirrors revalidateCompletionStepPosition.
 * Returns true if an existing completion-flagged step should be cleared.
 *
 * @param completionDay   day of the completion-flagged step
 * @param maxRegularDay   MAX(day) of non-completion, non-deleted steps (recomputed after write)
 */
function shouldClearAfterRevalidation(
  completionDay: number,
  maxRegularDay: number,
): boolean {
  return completionDay <= maxRegularDay;
}

/**
 * Mirrors the startup migration position scan.
 * Returns the day numbers that should have their flag cleared.
 *
 * A completion-flagged step must be the highest-day step in its journey.
 * If a higher-numbered non-deleted step exists, the flag is cleared.
 */
function startupScanClear(
  steps: Array<{ day: number; isCompletionStep: boolean }>,
): number[] {
  const maxDay = steps.reduce((m, s) => Math.max(m, s.day), 0);
  return steps
    .filter(s => s.isCompletionStep && s.day < maxDay)
    .map(s => s.day);
}

/**
 * Mirrors the startup uniqueness scan (after position cleanup).
 * Keeps only the highest-day completion step per journey.
 */
function startupUniquenessViolators(
  steps: Array<{ day: number; isCompletionStep: boolean }>,
): number[] {
  const completion = steps
    .filter(s => s.isCompletionStep)
    .sort((a, b) => b.day - a.day); // desc
  return completion.slice(1).map(s => s.day); // all but the highest
}

// ─── A. Position guard ────────────────────────────────────────────────────────

describe("A — Position guard (createStep / updateStep)", () => {
  it("A1. Regular day (day 2, maxRegular 5) → flag cleared", () => {
    assert.equal(resolveCompletionFlag(true, 2, 5), false);
  });

  it("A2. Valid completion position (day 6, maxRegular 5) → flag kept", () => {
    assert.equal(resolveCompletionFlag(true, 6, 5), true);
  });

  it("A3. Caller sends false → flag stays false regardless of position", () => {
    assert.equal(resolveCompletionFlag(false, 6, 5), false);
    assert.equal(resolveCompletionFlag(false, 1, 0), false);
  });

  it("A4. Higher Draft regular step exists (maxRegular includes Draft steps)", () => {
    // Journey: published days 1–3, draft day 4. maxRegular = 4.
    // Marking day 3 as completion → 3 ≤ 4 → cleared.
    assert.equal(resolveCompletionFlag(true, 3, 4), false);
  });

  it("A5. Stale durationDays = 0 (all-Draft journey) but maxRegular = 3", () => {
    // Even though durationDays would say 0, the live query returns 3.
    // Marking day 2 as completion → 2 ≤ 3 → cleared.
    assert.equal(resolveCompletionFlag(true, 2, 3), false);
  });

  it("A6. No regular steps yet (new journey, maxRegular = 0) → any day is valid", () => {
    assert.equal(resolveCompletionFlag(true, 1, 0), true);
  });

  it("A7. Exact boundary: effectiveDay equals maxRegular → cleared (must be BEYOND)", () => {
    assert.equal(resolveCompletionFlag(true, 5, 5), false);
  });
});

// ─── B. Revalidation after ordering change ────────────────────────────────────

describe("B — revalidateCompletionStepPosition", () => {
  it("B1. Existing completion at day 6, new regular at day 7 → cleared", () => {
    // After adding regular day 7, maxRegular = 7. Completion at 6 ≤ 7 → clear.
    assert.equal(shouldClearAfterRevalidation(6, 7), true);
  });

  it("B2. Completion at day 6, maxRegular = 5 → preserved", () => {
    assert.equal(shouldClearAfterRevalidation(6, 5), false);
  });

  it("B3. Completion at day 3 with regular at days 1–5 → cleared", () => {
    // Wrongly-flagged middle step; regular up to day 5.
    assert.equal(shouldClearAfterRevalidation(3, 5), true);
  });

  it("B4. No regular steps remain (maxRegular = 0) → completion preserved", () => {
    // Edge case: all regular steps deleted, only completion survives.
    assert.equal(shouldClearAfterRevalidation(1, 0), false);
  });
});

// ─── C. Renumber-plus-flag bypass ─────────────────────────────────────────────

describe("C — Renumber payload uses effectiveDay, not URL :day", () => {
  it("C1. PATCH /steps/99 body { day: 2, isCompletionStep: true }, maxRegular = 5 → cleared", () => {
    // URL :day is 99 (current completion slot). body.day renumbers to 2.
    // effectiveDay = 2; 2 ≤ 5 → flag must be cleared.
    const urlDay = 99;
    const bodyDay = 2;
    const effectiveDay = bodyDay !== urlDay ? bodyDay : urlDay;
    assert.equal(resolveCompletionFlag(true, effectiveDay, 5), false);
  });

  it("C2. PATCH /steps/3 body { day: 6, isCompletionStep: true }, maxRegular = 5 → kept", () => {
    // URL :day is 3. body.day renumbers to 6.
    // effectiveDay = 6; 6 > 5 → flag valid.
    const urlDay = 3;
    const bodyDay = 6;
    const effectiveDay = bodyDay !== urlDay ? bodyDay : urlDay;
    assert.equal(resolveCompletionFlag(true, effectiveDay, 5), true);
  });

  it("C3. PATCH /steps/6 body { title: 'Walk Complete' } (no day key) → effectiveDay = URL day", () => {
    // No renumber: body.day is undefined. effectiveDay stays at 6.
    const urlDay = 6;
    const bodyDay: number | undefined = undefined;
    const effectiveDay = bodyDay !== undefined && bodyDay !== urlDay ? bodyDay : urlDay;
    assert.equal(effectiveDay, 6);
    assert.equal(resolveCompletionFlag(true, effectiveDay, 5), true);
  });
});

// ─── D. Startup migration — position scan ─────────────────────────────────────

describe("D — Startup integrity scan (position invariant)", () => {
  it("D1. Completion at mid-journey (day 2 of 5) → cleared", () => {
    const steps = [
      { day: 1, isCompletionStep: false },
      { day: 2, isCompletionStep: true },  // wrongly flagged
      { day: 3, isCompletionStep: false },
      { day: 4, isCompletionStep: false },
      { day: 5, isCompletionStep: false },
    ];
    const toClear = startupScanClear(steps);
    assert.deepEqual(toClear, [2]);
  });

  it("D2. Completion at terminal day (day 6, highest day) → preserved", () => {
    const steps = [
      { day: 1, isCompletionStep: false },
      { day: 5, isCompletionStep: false },
      { day: 6, isCompletionStep: true },  // legitimate completion step
    ];
    const toClear = startupScanClear(steps);
    assert.deepEqual(toClear, []);
  });

  it("D3. No completion-flagged step → nothing cleared", () => {
    const steps = [
      { day: 1, isCompletionStep: false },
      { day: 2, isCompletionStep: false },
    ];
    assert.deepEqual(startupScanClear(steps), []);
  });

  it("D4. Two completion-flagged steps (days 2 and 6) → day 2 cleared, day 6 preserved", () => {
    const steps = [
      { day: 1, isCompletionStep: false },
      { day: 2, isCompletionStep: true },  // wrongly flagged
      { day: 3, isCompletionStep: false },
      { day: 5, isCompletionStep: false },
      { day: 6, isCompletionStep: true },  // legitimate
    ];
    const toClear = startupScanClear(steps);
    assert.deepEqual(toClear, [2]);
  });
});

// ─── E. Uniqueness invariant ──────────────────────────────────────────────────

describe("E — Startup uniqueness scan", () => {
  it("E1. Three completion-flagged steps → only highest-day survives", () => {
    const steps = [
      { day: 2, isCompletionStep: true },
      { day: 4, isCompletionStep: true },
      { day: 6, isCompletionStep: true },  // should survive
    ];
    const violators = startupUniquenessViolators(steps);
    assert.deepEqual(violators.sort((a, b) => a - b), [2, 4]);
  });

  it("E2. One completion step → no uniqueness violation", () => {
    const steps = [
      { day: 1, isCompletionStep: false },
      { day: 6, isCompletionStep: true },
    ];
    assert.deepEqual(startupUniquenessViolators(steps), []);
  });

  it("E3. No completion steps → no uniqueness violation", () => {
    const steps = [
      { day: 1, isCompletionStep: false },
      { day: 2, isCompletionStep: false },
    ];
    assert.deepEqual(startupUniquenessViolators(steps), []);
  });
});
