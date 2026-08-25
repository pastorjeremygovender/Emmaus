import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectSermonResult } from "../voice.js";

const results = [
  { openPath: "/sermon/one", title: "One" },
  { openPath: "/sermon/two", title: "Two" },
  { openPath: "/sermon/three", title: "Three" },
];

describe("Voice sermon search selection", () => {
  it("selects the first, second, and third verified result", () => {
    assert.equal(selectSermonResult(results, "the first one")?.openPath, "/sermon/one");
    assert.equal(selectSermonResult(results, "the second one")?.openPath, "/sermon/two");
    assert.equal(selectSermonResult(results, "the third one")?.openPath, "/sermon/three");
  });

  it("accepts numeric ordinals and never fabricates a route", () => {
    assert.equal(selectSermonResult(results, "2nd")?.openPath, "/sermon/two");
    assert.equal(selectSermonResult(results, "the fourth one")?.openPath, "/sermon/one");
    assert.equal(selectSermonResult([], "the second one"), undefined);
    assert.ok(results.every(({ openPath }) => /^\/sermon\/[^/]+$/.test(openPath)));
    assert.ok(results.every(({ openPath }) => !openPath.includes("discover")));
  });
});