import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildJarvisResponseContract } from "../jarvis-contract.ts";

describe("Jarvis response contract", () => {
  it("keeps pastoral prose separate from server-owned actions and content references", () => {
    const result = buildJarvisResponseContract({
      intent: "BIBLE_READ",
      pastoralText: "God meets us with patience.",
      metadata: {
        scriptureReferences: [{
          reference: "John 3:16",
          book: "john",
          chapter: 3,
          verseStart: 16,
        }],
        recommendations: [{
          type: "walk",
          title: "A Walk of Trust",
          description: "A published Walk.",
          resourceId: "walk-1",
        }],
        resourceActions: [{
          kind: "OPEN",
          resourceType: "walk",
          resourceId: "walk-1",
          route: "/journey/walk-1/day/1",
        }],
        capabilityActions: [],
        nextStep: null,
        handoffType: null,
        retrievalFailures: ["sermons"],
      },
    });

    assert.equal(result.contractVersion, "jarvis.v1");
    assert.equal(result.pastoralText, "God meets us with patience.");
    assert.equal(result.scriptureReferences[0]?.reference, "John 3:16");
    assert.equal(result.contentReferences[0]?.resourceId, "walk-1");
    assert.equal(result.suggestedNextAction?.route, "/journey/walk-1/day/1");
    assert.deepEqual(result.retrievalFailures, ["sermons"]);
  });

  it("does not invent an action when no validated route exists", () => {
    const result = buildJarvisResponseContract({
      intent: "ASK",
      pastoralText: "A Scripture-first answer.",
      metadata: {
        scriptureReferences: [],
        recommendations: [{
          type: "journey",
          title: "Unresolved journey",
        }],
        resourceActions: [],
        capabilityActions: [],
        nextStep: null,
        handoffType: null,
      },
    });

    assert.equal(result.contentReferences.length, 0);
    assert.equal(result.actions.length, 0);
    assert.equal(result.suggestedNextAction, null);
  });
});