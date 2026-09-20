import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildScriptureRoute, resolveResourceRoute, validateModelResponse } from "../citation-validation.js";

const resources = [{
  type: "journey" as const,
  resourceId: "walk-1",
  title: "A Walk of Trust",
  route: "/journeys/walk-1",
  excerpts: [],
  provenance: "fixture",
  relevance: 10,
}];

describe("Ask Emmaus structured response contract", () => {
  it("accepts canonical IDs but never trusts a model route or title", () => {
    const result = validateModelResponse({
      answer: "Read more at /journeys/fake and https://example.test/private.",
      scriptureReferences: [{
        book: "John", chapter: 3, verseStart: 16, verseEnd: 16,
        reason: "God's love",
      }],
      resourceRecommendations: [
        { resourceType: "journey", resourceId: "walk-1", reason: "A gentle next step" },
        { resourceType: "journey", resourceId: "missing", reason: "Do not link this" },
        { resourceType: "unknown", resourceId: "walk-1", reason: "Do not link this" },
      ],
      prayer: null,
      nextStep: null,
    }, resources);

    assert.equal(result.resourceRecommendations?.length, 1);
    assert.equal(result.recommendations[0].path, "/journeys/walk-1");
    assert.equal(result.recommendations[0].title, "A Walk of Trust");
    assert.equal(result.scriptureReferences?.[0].book, "john");
    assert.equal(buildScriptureRoute(result.scriptureReferences![0]), "/bible/read/john/3?startVerse=16&endVerse=16");
  });

  it("rejects malformed, reversed, out-of-range, and invented Scripture", () => {
    const result = validateModelResponse({
      scriptureReferences: [
        { book: "John", chapter: 3, verseStart: 17, verseEnd: 16 },
        { book: "Madeup", chapter: 1, verseStart: 1 },
        { book: "John", chapter: 999, verseStart: 1 },
        { book: "John", chapter: 3, verseStart: 0 },
      ],
      resourceRecommendations: [],
    }, resources);
    assert.deepEqual(result.scriptureReferences, []);
    assert.equal(result.scripture, null);
  });

  it("does not make arbitrary legacy paths clickable", () => {
    const result = validateModelResponse({
      recommendations: [{ type: "journey", title: "Fake", path: "/journeys/fake" }],
    }, resources);
    assert.deepEqual(result.recommendations, []);
  });

  it("builds canonical destinations for the supported reference forms", () => {
    const cases = [
      ["John", 3, 16, "/bible/read/john/3?startVerse=16"],
      ["John", 4, 13, "/bible/read/john/4?startVerse=13"],
      ["Psalm", 23, undefined, "/bible/read/psalms/23"],
      ["1 Corinthians", 13, undefined, "/bible/read/1corinthians/13"],
      ["2 Corinthians", 5, 17, "/bible/read/2corinthians/5?startVerse=17"],
      ["1 Thessalonians", 5, 16, "/bible/read/1thessalonians/5?startVerse=16"],
      ["1 John", 1, 9, "/bible/read/1john/1?startVerse=9"],
    ] as const;
    for (const [book, chapter, verse, expected] of cases) {
      assert.equal(buildScriptureRoute({ book, chapter, verseStart: verse }), expected);
    }
  });

  it("resolves a resource only when type, ID, and parent agree", () => {
    assert.equal(resolveResourceRoute("journey", "walk-1", resources), "/journeys/walk-1");
    assert.equal(resolveResourceRoute("journey", "walk-1", resources, "other-parent"), null);
    assert.equal(resolveResourceRoute("journey", "missing", resources), null);
    assert.equal(resolveResourceRoute("invented", "walk-1", resources), null);
  });
});