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
    assert.equal(buildScriptureRoute({ book: "John", chapter: 3, verseStart: 16, verseEnd: 18 }), "/bible/read/john/3?startVerse=16&endVerse=18");
    assert.equal(buildScriptureRoute({ book: "Song of Songs", chapter: 2, verseStart: 1 }), "/bible/read/songofsolomon/2?startVerse=1");
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

  it("covers production reference forms and preserves every valid occurrence", () => {
    const refs = extractValidatedScriptureReferences(
      "Psalm 91:1–2 gives shelter. Hebrews 11:1 defines faith. " +
      "John 20:30–31 points to belief. Genesis 50:1–14 and Luke 15:11–32 " +
      "also speak here. See 1 Sam 17:45, 2 Kgs 5:1, and 1 Chr 16:8.",
    );
    assert.deepEqual(refs.map(ref => ref.reference), [
      "Psalm 91:1–2",
      "Hebrews 11:1",
      "John 20:30–31",
      "Genesis 50:1–14",
      "Luke 15:11–32",
      "1 Samuel 17:45",
      "2 Kings 5:1",
      "1 Chronicles 16:8",
    ]);
    assert.equal(buildScriptureRoute(refs[0]), "/bible/read/psalms/91?startVerse=1&endVerse=2");
    assert.equal(buildScriptureRoute(refs[4]), "/bible/read/luke/15?startVerse=11&endVerse=32");
  });

  it("understands spoken references without turning dates or step numbers into Scripture", () => {
    const refs = extractValidatedScriptureReferences(
      "Read Psalm chapter ninety-one verses one through two, then Hebrews chapter eleven verse one. " +
      "The meeting is on 29 March 2026; this is Day 3 and Step 5.",
    );
    assert.deepEqual(refs.map(ref => ref.reference), ["Psalm 91:1–2", "Hebrews 11:1"]);
  });
});