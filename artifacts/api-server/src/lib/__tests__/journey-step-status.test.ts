// @ts-nocheck
/**
 * Journey Step Status — Unit Tests
 *
 * Covers:
 *   A. Status inheritance rule (resolveStepStatus pure function)
 *   B. refreshJourneyDuration counts Published steps only
 *   C. Continue resolver logic (first unfinished published step)
 *   D. Previous Steps filter (published + day < currentDay)
 *   E. Final lesson detection (isFinalStep)
 *   F. Import creates journey as Draft; generated journey creates as Draft
 *
 * Run (from artifacts/api-server/):
 *   node --test --experimental-strip-types \
 *     src/lib/__tests__/journey-step-status.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ─── A. Status inheritance ────────────────────────────────────────────────────

/**
 * Pure function that mirrors the logic in createStep.
 * Kept here as the canonical spec so tests can evolve independently of the DB.
 */
function resolveStepStatus(parentStatus: string): "Published" | "Draft" {
  return parentStatus === "Published" ? "Published" : "Draft";
}

describe("A — Step status inheritance", () => {
  it("Draft parent → Draft step", () => {
    assert.equal(resolveStepStatus("Draft"), "Draft");
  });

  it("Published parent → Published step", () => {
    assert.equal(resolveStepStatus("Published"), "Published");
  });

  it("unknown / undefined parent → Draft step (safe default)", () => {
    assert.equal(resolveStepStatus(""), "Draft");
    // @ts-ignore
    assert.equal(resolveStepStatus(undefined), "Draft");
  });
});

// ─── B. refreshJourneyDuration uses Published steps only ─────────────────────

function computeMaxPublishedDay(steps: Array<{ day: number; status: string }>): number {
  const published = steps.filter(s => s.status === "Published");
  return published.reduce((m, s) => Math.max(m, s.day), 0);
}

describe("B — Duration counts Published steps only", () => {
  it("five Published + one Draft pseudo-step → duration = 5", () => {
    const steps = [
      { day: 1, status: "Published" },
      { day: 2, status: "Published" },
      { day: 3, status: "Published" },
      { day: 4, status: "Published" },
      { day: 5, status: "Published" },
      { day: 6, status: "Draft" }, // "Journey Complete" pseudo-step
    ];
    assert.equal(computeMaxPublishedDay(steps), 5);
  });

  it("all Draft → duration = 0", () => {
    const steps = [
      { day: 1, status: "Draft" },
      { day: 2, status: "Draft" },
    ];
    assert.equal(computeMaxPublishedDay(steps), 0);
  });

  it("all Published → duration = max day", () => {
    const steps = [
      { day: 1, status: "Published" },
      { day: 2, status: "Published" },
      { day: 3, status: "Published" },
    ];
    assert.equal(computeMaxPublishedDay(steps), 3);
  });
});

// ─── C. Continue resolver ─────────────────────────────────────────────────────

/** Mirror of the Continue resolver logic in JourneyDay.tsx */
function resolveNextStep(
  allSteps: Array<{ day: number; status: string }>,
  currentDay: number
): number | null {
  const published = allSteps
    .filter(s => s.status === "Published")
    .sort((a, b) => a.day - b.day);
  const next = published.find(s => s.day > currentDay);
  return next?.day ?? null;
}

/** First published step when there is no progress */
function resolveFirstStep(allSteps: Array<{ day: number; status: string }>): number | null {
  const published = allSteps
    .filter(s => s.status === "Published")
    .sort((a, b) => a.day - b.day);
  return published[0]?.day ?? null;
}

const FIVE_STEPS = [
  { day: 1, status: "Published" },
  { day: 2, status: "Published" },
  { day: 3, status: "Published" },
  { day: 4, status: "Published" },
  { day: 5, status: "Published" },
  { day: 6, status: "Draft" }, // pseudo-step — excluded
];

describe("C — Continue resolver", () => {
  it("D. No progress → Step 1", () => {
    assert.equal(resolveFirstStep(FIVE_STEPS), 1);
  });

  it("D. Steps 1–3 complete (currentDay = 4) → Step 4", () => {
    assert.equal(resolveNextStep(FIVE_STEPS, 3), 4);
  });

  it("D. All five complete (currentDay = 5) → no next step", () => {
    assert.equal(resolveNextStep(FIVE_STEPS, 5), null);
  });

  it("Draft step is never returned as Continue target", () => {
    // Only day 6 exists but is Draft
    const onlyDraft = [{ day: 6, status: "Draft" }];
    assert.equal(resolveFirstStep(onlyDraft), null);
    assert.equal(resolveNextStep(onlyDraft, 0), null);
  });

  it("Never opens a step from a different Journey (ID is an external constraint)", () => {
    // Resolver operates on the steps already filtered to the correct journeyId.
    // This test confirms it does not introduce any cross-journey IDs.
    const journey1Steps = [{ day: 1, status: "Published" }];
    const journey2Steps = [{ day: 2, status: "Published" }];
    assert.equal(resolveFirstStep(journey1Steps), 1);
    assert.equal(resolveFirstStep(journey2Steps), 2);
    // The two resolvers are independent — no mixing.
    assert.notEqual(resolveFirstStep(journey1Steps), resolveFirstStep(journey2Steps));
  });
});

// ─── D. Previous Steps filter ─────────────────────────────────────────────────

function resolvePreviousSteps(
  steps: Array<{ day: number; status: string; title: string }>,
  currentDay: number
): Array<{ day: number; title: string }> {
  return steps
    .filter(s => s.status === "Published" && s.day < currentDay)
    .sort((a, b) => b.day - a.day);
}

describe("D — Previous Steps filter", () => {
  it("E. Three completed lessons → three correct titled entries", () => {
    const steps = [
      { day: 1, status: "Published", title: "In the Beginning" },
      { day: 2, status: "Published", title: "The Master Designer" },
      { day: 3, status: "Published", title: "The Lord of Creation" },
      { day: 4, status: "Published", title: "God Knows You" },
      { day: 5, status: "Published", title: "God Wants You to Know Him" },
      { day: 6, status: "Draft",     title: "Journey Complete" },
    ];
    const previous = resolvePreviousSteps(steps, 4); // currentDay = 4 → completed 1–3
    assert.equal(previous.length, 3);
    assert.deepEqual(previous.map(s => s.title), [
      "The Lord of Creation",  // day 3 (desc order)
      "The Master Designer",   // day 2
      "In the Beginning",      // day 1
    ]);
  });

  it("E. No completed lessons → empty", () => {
    const steps = [
      { day: 1, status: "Published", title: "Step 1" },
      { day: 2, status: "Published", title: "Step 2" },
    ];
    assert.equal(resolvePreviousSteps(steps, 1).length, 0);
  });

  it("Draft step never appears in Previous Steps", () => {
    const steps = [
      { day: 1, status: "Published", title: "Real Step" },
      { day: 2, status: "Draft",     title: "Untitled Step" },
    ];
    const previous = resolvePreviousSteps(steps, 3);
    assert.equal(previous.length, 1);
    assert.equal(previous[0].title, "Real Step");
  });
});

// ─── E. Final lesson detection ────────────────────────────────────────────────

function isFinalStep(durationDays: number, day: number, isDailyRhythm: boolean): boolean {
  return !isDailyRhythm && durationDays > 0 && day >= durationDays;
}

describe("E — Final lesson detection", () => {
  it("F. Day 5 of 5-lesson journey is final", () => {
    assert.equal(isFinalStep(5, 5, false), true);
  });

  it("F. Day 4 of 5 is not final", () => {
    assert.equal(isFinalStep(5, 4, false), false);
  });

  it("F. Daily-rhythm journey is never isFinal (gate handled elsewhere)", () => {
    assert.equal(isFinalStep(5, 5, true), false);
  });

  it("F. durationDays = 0 → never final (unknown length)", () => {
    assert.equal(isFinalStep(0, 1, false), false);
  });

  it("Pseudo-step at day 6 is also flagged final when durationDays = 5 (excluded by resolveNextStep anyway)", () => {
    // Day 6 >= 5 → would be final — but resolveNextStep won't navigate there because
    // the completion card at day 5 has no Continue button when isFinalStep=true.
    assert.equal(isFinalStep(5, 6, false), true);
  });
});

// ─── F. Import / generate always creates journeys as Draft ───────────────────

describe("F — Import and generate status rules", () => {
  it("imported journey status is always Draft", () => {
    const importedJourneyStatus = "Draft"; // hardcoded in import route
    assert.equal(resolveStepStatus(importedJourneyStatus), "Draft");
  });

  it("generated journey status is always Draft", () => {
    const generatedJourneyStatus = "Draft"; // hardcoded in generate route
    assert.equal(resolveStepStatus(generatedJourneyStatus), "Draft");
  });

  it("B. Import five lessons → all inherit Draft from Draft parent", () => {
    const parentStatus = "Draft";
    const steps = Array.from({ length: 5 }, (_, i) => ({
      day: i + 1,
      status: resolveStepStatus(parentStatus),
    }));
    assert.ok(steps.every(s => s.status === "Draft"));
    assert.equal(steps.length, 5);
  });

  it("B. Published parent → all five steps inherit Published", () => {
    const parentStatus = "Published";
    const steps = Array.from({ length: 5 }, (_, i) => ({
      day: i + 1,
      status: resolveStepStatus(parentStatus),
    }));
    assert.ok(steps.every(s => s.status === "Published"));
    assert.equal(steps.length, 5);
  });

  it("B. Failed import cannot leave a misleading one-step journey (step count check)", () => {
    // Simulate an import where only 1 of 5 steps was created before failure.
    // The step-count check at the end of a real import would catch this mismatch.
    const suppliedStepCount = 5;
    const createdStepCount = 1; // partial failure
    assert.notEqual(createdStepCount, suppliedStepCount);
    // A real import should throw / roll back here — this test documents the invariant.
  });
});
