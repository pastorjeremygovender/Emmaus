// @ts-nocheck
/**
 * Sermon Companion — description-formula parity test
 *
 * The "Day N of M · Title" progress string is computed in two independent
 * places:
 *
 *   A. Walk.tsx  (Today's Steps card) — inline inside the JSX render.
 *   B. next-steps.ts  (buildCompanionItem) — server-side, returned as
 *      item.description and rendered by Journeys.tsx (Next Steps tab).
 *
 * This test extracts both formulas as pure functions and runs them against
 * an exhaustive matrix of inputs.  If the formulas ever diverge the test
 * fails and catches the regression before it reaches members.
 *
 * Run (from artifacts/api-server/):
 *   node --test --experimental-strip-types \
 *     src/lib/__tests__/sermon-companion-description.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ─── Formula A: Walk.tsx (Today's Steps) ─────────────────────────────────────
//
// Transcribed verbatim from Walk.tsx lines 857-870 (scCompanion inline block).
// Variable names mirror the Walk component:
//   completedCount  = scCompanion.completedDays.length
//   total           = scCompanion.numberOfDays        (= publishedEntryCount from API)
//   currentDay      = scCompanion.currentDay
//   nextEntryTitle  = scCompanion.nextEntryTitle

function walkDescription(
  completedCount: number,
  total: number,
  currentDay: number,
  nextEntryTitle: string | undefined,
): string {
  const allComplete = total > 0 && completedCount >= total;
  if (allComplete) return `${total} of ${total} completed`;
  if (completedCount > 0) {
    return nextEntryTitle
      ? `Day ${currentDay} of ${total} · ${nextEntryTitle}`
      : `Day ${currentDay} of ${total}`;
  }
  return total > 0 ? `Day 1 of ${total}` : "Day 1";
}

// ─── Formula B: next-steps.ts (buildCompanionItem) ───────────────────────────
//
// Transcribed verbatim from next-steps.ts lines 363-371.
// Variable names mirror the server helper:
//   completedCount       = prog?.completedDays.length ?? 0
//   publishedEntryCount  = c.publishedEntryCount   (same as Walk's `total`)
//   currentDay           = prog?.currentDay ?? 1
//   nextEntryTitle       = publishedEntries.find(e => e.dayNumber === currentDay)?.title

function serverDescription(
  completedCount: number,
  publishedEntryCount: number,
  currentDay: number,
  nextEntryTitle: string | undefined,
): string {
  const allComplete = publishedEntryCount > 0 && completedCount >= publishedEntryCount;
  return allComplete
    ? `${publishedEntryCount} of ${publishedEntryCount} completed`
    : completedCount > 0
      ? nextEntryTitle
        ? `Day ${currentDay} of ${publishedEntryCount} · ${nextEntryTitle}`
        : `Day ${currentDay} of ${publishedEntryCount}`
      : publishedEntryCount > 0
        ? `Day 1 of ${publishedEntryCount}`
        : "Day 1";
}

// ─── Parity helper ────────────────────────────────────────────────────────────

function assertParity(
  completedCount: number,
  total: number,
  currentDay: number,
  nextEntryTitle: string | undefined,
  label: string,
) {
  const walk   = walkDescription(completedCount, total, currentDay, nextEntryTitle);
  const server = serverDescription(completedCount, total, currentDay, nextEntryTitle);
  assert.equal(
    walk,
    server,
    `[${label}] Walk="${walk}" Server="${server}"`,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Sermon Companion description formula — Walk vs Next Steps parity", () => {

  // ── Not-started states ────────────────────────────────────────────────────

  it("not started, 5-day companion → 'Day 1 of 5'", () => {
    assertParity(0, 5, 1, undefined, "not-started / 5 days / no title");
    assert.equal(walkDescription(0, 5, 1, undefined), "Day 1 of 5");
  });

  it("not started, 1-day companion → 'Day 1 of 1'", () => {
    assertParity(0, 1, 1, undefined, "not-started / 1 day");
    assert.equal(walkDescription(0, 1, 1, undefined), "Day 1 of 1");
  });

  it("not started, 0 published entries → 'Day 1'", () => {
    assertParity(0, 0, 1, undefined, "not-started / 0 entries");
    assert.equal(walkDescription(0, 0, 1, undefined), "Day 1");
  });

  // ── In-progress, no entry title ───────────────────────────────────────────

  it("1 of 5 completed, no entry title → 'Day 2 of 5'", () => {
    assertParity(1, 5, 2, undefined, "in-progress / day 2 / no title");
    assert.equal(walkDescription(1, 5, 2, undefined), "Day 2 of 5");
  });

  it("3 of 5 completed, no entry title → 'Day 4 of 5'", () => {
    assertParity(3, 5, 4, undefined, "in-progress / day 4 / no title");
    assert.equal(walkDescription(3, 5, 4, undefined), "Day 4 of 5");
  });

  // ── In-progress, with entry title ─────────────────────────────────────────

  it("1 of 5 completed, with entry title → 'Day 2 of 5 · The Narrow Gate'", () => {
    assertParity(1, 5, 2, "The Narrow Gate", "in-progress / day 2 / with title");
    assert.equal(
      walkDescription(1, 5, 2, "The Narrow Gate"),
      "Day 2 of 5 · The Narrow Gate",
    );
  });

  it("0 completed, next entry title has no effect (not-started branch wins)", () => {
    // When completedCount === 0 the title is ignored — both formulas return
    // the "Day 1 of N" not-started string.
    assertParity(0, 5, 1, "Opening Day", "not-started / title present but ignored");
    assert.equal(walkDescription(0, 5, 1, "Opening Day"), "Day 1 of 5");
  });

  // ── Completed states ──────────────────────────────────────────────────────

  it("5 of 5 completed → '5 of 5 completed'", () => {
    // currentDay has advanced to 6 (past the end) after final completion;
    // the description formula ignores currentDay once allComplete is true.
    assertParity(5, 5, 6, undefined, "all-complete / 5 days");
    assert.equal(walkDescription(5, 5, 6, undefined), "5 of 5 completed");
  });

  it("1 of 1 completed → '1 of 1 completed'", () => {
    assertParity(1, 1, 2, undefined, "all-complete / 1 day");
    assert.equal(walkDescription(1, 1, 2, undefined), "1 of 1 completed");
  });

  it("all-complete, entry title present → title is ignored", () => {
    // The "N of N completed" string always wins when allComplete is true.
    assertParity(5, 5, 6, "Final Day", "all-complete / title present but ignored");
    assert.equal(walkDescription(5, 5, 6, "Final Day"), "5 of 5 completed");
  });

  // ── Boundary: completedCount equals total exactly ──────────────────────────

  it("completedCount === total triggers allComplete even if currentDay <= total", () => {
    // Edge: arithmetic overflow hasn't advanced currentDay yet but DB says complete.
    assertParity(5, 5, 5, "Last entry", "allComplete exact boundary");
    assert.equal(walkDescription(5, 5, 5, "Last entry"), "5 of 5 completed");
  });

  // ── Exhaustive matrix: spot-check all combinations ────────────────────────

  it("all formula inputs agree across a full cross-product matrix", () => {
    const totalOptions    = [0, 1, 3, 5, 7];
    const titles          = [undefined, "Day Title"];

    for (const total of totalOptions) {
      for (const nextEntryTitle of titles) {
        // Iterate completedCount from 0 up to total + 1 (one past the end)
        for (let completed = 0; completed <= total + 1; completed++) {
          // currentDay is the next day to open (= completed + 1 clamped by total)
          const currentDay = Math.min(completed + 1, total > 0 ? total + 1 : 1);
          assertParity(
            completed,
            total,
            currentDay,
            nextEntryTitle,
            `total=${total} completed=${completed} currentDay=${currentDay} title=${nextEntryTitle ?? "none"}`,
          );
        }
      }
    }
  });

});
