import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildScriptureRoute, normalizeBibleBook, validateCitations } from "../citation-validation.js";
import type { EmmausResponseMetadata } from "../firestore-model.js";

describe("Ask Emmaus citation validation", () => {
  it("normalizes numbered books and common aliases", () => {
    assert.equal(normalizeBibleBook("1 John"), "1john");
    assert.equal(normalizeBibleBook("Song of Solomon"), "songofsolomon");
    assert.equal(normalizeBibleBook("not a bible book"), null);
  });

  it("creates a safe deep link including the first verse", () => {
    assert.equal(buildScriptureRoute({ book: "1 John", chapter: 4, verseStart: 7 }), "/bible/read/1john/4?startVerse=7");
    assert.equal(buildScriptureRoute({ book: "Psalm", chapter: 42 }), "/bible/read/psalms/42");
  });

  it("removes fabricated resources and invalid Scripture", () => {
    const metadata: EmmausResponseMetadata = {
      scripture: { reference: "Madeup 99:1", book: "Madeup", chapter: 99 },
      nextStep: null,
      nextSteps: [],
      recommendations: [
        { type: "journey", title: "Real", path: "/journey/j1/day/1" },
        { type: "journey", title: "Fabricated", path: "/journeys/does-not-exist/1" },
      ],
      followUpPrompts: [],
      handoffType: null,
    };
    const result = validateCitations(metadata, [{
      type: "journey", resourceId: "s1", parentId: "j1", title: "Real",
      route: "/journey/j1/day/1", excerpts: [], provenance: "test", relevance: 1,
    }]);
    assert.equal(result.scripture, null);
    assert.equal(result.recommendations.length, 1);
    assert.equal(result.recommendations[0].path, "/journey/j1/day/1");
  });
});