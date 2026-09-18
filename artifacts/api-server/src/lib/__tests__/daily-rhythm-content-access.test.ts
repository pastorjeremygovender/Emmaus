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

  it("returns every published day to ordinary members", () => {
    assert.deepEqual(
      selectDailyRhythmSteps(steps, "user", 2),
      [steps[0], steps[1], steps[3]],
    );
    assert.deepEqual(
      selectDailyRhythmSteps(steps, "user", 1),
      [steps[0], steps[1], steps[3]],
    );
  });

  it("does not expose draft authoring entries to members", () => {
    assert.ok(selectDailyRhythmSteps(steps, "user", 1).every(step => step.status === "Published"));
  });
});