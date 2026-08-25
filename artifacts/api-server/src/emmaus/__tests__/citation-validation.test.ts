import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildScriptureRoute,
  extractValidatedScriptureReferences,
  normalizeBibleBook,
  validateCitations,
} from "../citation-validation.js";
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

  it("recovers valid references from prose and ignores numeric false positives", () => {
    const refs = extractValidatedScriptureReferences(
      "Faith is described in Hebrews 11:1. Read John 4:43–54 and Psalm 23. " +
      "This happened on 29 March 2026 at 46:56; see Day 3 and Step 5.",
    );
    assert.deepEqual(refs.map(ref => ref.reference), [
      "Hebrews 11:1",
      "John 4:43–54",
      "Psalm 23",
    ]);
    assert.equal(buildScriptureRoute(refs[1]), "/bible/read/john/4?startVerse=43&endVerse=54");
  });

  it("accepts first-book aliases while producing canonical internal IDs", () => {
    const refs = extractValidatedScriptureReferences("First Corinthians 13 and First John 1:9.");
    assert.deepEqual(refs.map(ref => ref.book), ["1corinthians", "1john"]);
  });
});