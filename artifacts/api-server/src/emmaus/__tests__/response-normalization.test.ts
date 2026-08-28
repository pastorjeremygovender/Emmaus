import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeEmmausResponse } from "../response-normalization.js";
import type { EmmausResponseMetadata } from "../firestore-model.js";

const baseMetadata = (): EmmausResponseMetadata => ({
  answer: "",
  scripture: null,
  scriptureReferences: [],
  nextStep: null,
  nextSteps: [],
  recommendations: [
    {
      type: "walk",
      title: "Quartz Lantern Walk",
      resourceId: "walk-1",
      path: "/journeys/walk-1",
    },
    {
      type: "walk",
      title: "Quartz Lantern Walk",
      resourceId: "walk-1",
      path: "/journeys/walk-1",
    },
  ],
  sermonRecommendations: [
    {
      sermonId: "sermon-1",
      source: "archive",
      title: "Grace in the Wilderness",
      speaker: "Jeremy Govender",
      sermonDate: "2026-01-01",
      excerpt: "Grace meets us in the wilderness.",
      reason: "Matches the theme.",
      listenAvailable: false,
    },
    {
      sermonId: "sermon-1",
      source: "canonical",
      title: "Grace in the Wilderness",
      speaker: "Jeremy Govender",
      sermonDate: "2026-01-01",
      excerpt: "Grace meets us in the wilderness.",
      reason: "Published sermon match.",
      listenAvailable: false,
      openPath: "/sermons/sermon-1",
    },
  ],
  followUpPrompts: ["What does this mean for me?", "What does this mean for me?"],
  handoffType: null,
});

describe("Ask Emmaus final response normalization", () => {
  it("canonicalizes prose references and recovers exact routes", () => {
    const result = normalizeEmmausResponse({
      answer: "Trust God in john 3:16–18. You can also read ps 23 or John chapter 4 verse 1.",
      metadata: baseMetadata(),
      resources: [{
        type: "walk",
        resourceId: "walk-1",
        title: "Quartz Lantern Walk",
        route: "/journeys/walk-1",
      }],
    });

    assert.match(result.displayAnswer, /John 3:16–18/);
    assert.match(result.displayAnswer, /Psalm 23/);
    assert.match(result.displayAnswer, /John 4:1/);
    assert.deepEqual(
      result.metadata.scriptureReferences?.map((ref) => ref.reference),
      ["John 3:16–18", "Psalm 23", "John 4:1"],
    );
    assert.equal(result.metadata.scriptureReferences?.[0]?.displayText, "John 3:16–18");
  });

  it("removes unsupported named resource claims and deduplicates sermon cards", () => {
    const result = normalizeEmmausResponse({
      answer: "The Quartz Lantern Walk can help you take a next step. Try the Ember Journey today. Pastor Jeremy Govender preached this message.",
      metadata: baseMetadata(),
      resources: [{
        type: "walk",
        resourceId: "walk-1",
        title: "Quartz Lantern Walk",
        route: "/journeys/walk-1",
      }],
    });

    assert.match(result.displayAnswer, /Quartz Lantern Walk/);
    assert.doesNotMatch(result.displayAnswer, /Ember Journey/);
    assert.match(result.displayAnswer, /Pastor Jeremy/);
    assert.equal(result.metadata.recommendations.length, 1);
    assert.equal(result.metadata.sermonRecommendations?.length, 1);
    assert.equal(result.metadata.sermonRecommendations?.[0]?.source, "canonical");
    assert.equal(result.metadata.followUpPrompts?.length, 1);
    assert.equal(result.metadata.displayAnswer, result.displayAnswer);
    assert.equal(result.metadata.speakableAnswer, result.speakableAnswer);
  });
});