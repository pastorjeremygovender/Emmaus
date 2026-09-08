import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectDailyRhythmSteps } from "../daily-rhythm-content-access.ts";

const steps = [
  { day: 1, status: "Published" },
  { day: 2, status: "Published" },
  { day: 8, status: "Draft" },
  { day: 30, status: "Published" },
];

describe("Daily Rhythm content access", () => {
  it("returns every authored step to administrators without using progress", () => {
    assert.deepEqual(
      selectDailyRhythmSteps(steps, "admin", 1),
      steps,
    );
    assert.deepEqual(
      selectDailyRhythmSteps(steps, "superAdmin", 1),
      steps,
    );
  });

  it("keeps ordinary members limited to their server-authorized day", () => {
    assert.deepEqual(
      selectDailyRhythmSteps(steps, "user", 2),
      steps.slice(0, 2),
    );
    assert.deepEqual(
      selectDailyRhythmSteps(steps, "user", 1),
      steps.slice(0, 1),
    );
  });

  it("does not let member access widen when progress is absent", () => {
    assert.deepEqual(selectDailyRhythmSteps(steps, "user", 1), [steps[0]]);
  });
});