import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalFailureMetadata,
  resolveCanonicalAskRequest,
  resolveContextualFollowUp,
  resolveCurrentDevotionalEntry,
  resolveDateAllocatedDevotionalEntry,
} from "../canonical-tools.ts";

describe("canonical Ask Emmaus tools", () => {
  it("returns a capability-owned location for application help", async () => {
    const result = await resolveCanonicalAskRequest("Where can I find devotionals?", "member-1");
    assert.equal(result.handled, true);
    if (!result.handled) return;
    assert.equal(result.metadata.nextStep?.path, "/journeys?tab=devotionals");
    assert.equal(result.metadata.capabilityActions?.[0]?.capabilityId, "daily-devotional");
    assert.equal(result.metadata.recommendations[0]?.type, "devotional");
  });

  it("reads an exact Bible reference and issues the canonical Bible route", async () => {
    const result = await resolveCanonicalAskRequest("Read John 3:16", "member-1");
    assert.equal(result.handled, true);
    if (!result.handled) return;
    assert.equal(result.metadata.scripture?.reference, "John 3:16");
    assert.equal(result.metadata.nextStep?.path, "/bible/read/john/3?startVerse=16&endVerse=16");
    assert.match(result.metadata.answer ?? "", /For God so loved the world/i);
    assert.equal(result.metadata.recommendations.length, 0);
  });

  it("rejects an invalid chapter without inventing a destination", async () => {
    const result = await resolveCanonicalAskRequest("Read John 999", "member-1");
    assert.equal(result.handled, true);
    if (!result.handled) return;
    assert.equal(result.metadata.nextStep, null);
    assert.match(result.metadata.answer ?? "", /validate/i);
  });

  it("resolves a devotional to the first published day not yet completed", () => {
    const entries = [
      { status: "Published", dayNumber: 240, scripture: "Psalm 91" },
      { status: "Published", dayNumber: 241, scripture: "Psalm 92" },
      { status: "Draft", dayNumber: 242, scripture: "Psalm 93" },
    ];

    const entry = resolveCurrentDevotionalEntry(entries, [240]);

    assert.equal(entry?.dayNumber, 241);
    assert.equal(entry?.scripture, "Psalm 92");
  });

  it("resolves a date-allocated devotional by today's date even when it is completed", () => {
    const entries = [
      { status: "Published", dayNumber: 240, displayLabel: "28 August", scripture: "Psalm 91" },
      { status: "Published", dayNumber: 241, displayLabel: "29 August", scripture: "Psalm 92" },
      { status: "Published", dayNumber: 242, displayLabel: "30 August", scripture: "Psalm 93" },
    ];

    const entry = resolveDateAllocatedDevotionalEntry(
      entries,
      new Date("2026-08-28T22:30:00.000Z"),
      "Africa/Johannesburg",
    );

    assert.equal(entry?.dayNumber, 241);
    assert.equal(entry?.scripture, "Psalm 92");
  });

  it("supports generated date-label formats and ignores non-date labels", () => {
    const entries = [
      { status: "Published", dayNumber: 1, displayLabel: "28 Aug 2026" },
      { status: "Published", dayNumber: 2, displayLabel: "29/08" },
      { status: "Published", dayNumber: 3, displayLabel: "Easter Sunday" },
    ];

    const entry = resolveDateAllocatedDevotionalEntry(
      entries,
      new Date("2026-08-29T12:00:00.000Z"),
      "Africa/Johannesburg",
    );

    assert.equal(entry?.dayNumber, 2);
  });

  it("resolves a pronoun follow-up only from a previous verified resource action", async () => {
    const metadata = await resolveContextualFollowUp("Open it", {
      scripture: null,
      nextStep: {
        action: "Untrusted legacy path",
        primaryButtonText: "Wrong",
        path: "https://example.com/wrong",
      },
      nextSteps: [],
      recommendations: [{
        type: "walk",
        title: "Coming to Jesus",
        resourceId: "walk-1",
        path: "/journey/walk-1/day/2",
      }],
      resourceRecommendations: [{
        resourceType: "walk",
        resourceId: "walk-1",
        reason: "Previously verified result.",
      }],
      resourceActions: [{
        kind: "OPEN",
        resourceType: "walk",
        resourceId: "walk-1",
        route: "/journey/walk-1/day/2",
      }],
      followUpPrompts: [],
      handoffType: null,
    });

    assert.equal(metadata?.nextStep?.path, "/journey/walk-1/day/2");
    assert.equal(metadata?.resourceActions?.[0]?.resourceId, "walk-1");
    assert.equal(metadata?.recommendations[0]?.title, "Coming to Jesus");
  });

  it("does not turn client or model prose paths into contextual actions", async () => {
    const metadata = await resolveContextualFollowUp("Open it", {
      scripture: null,
      nextStep: {
        action: "Open an unverified destination",
        primaryButtonText: "Open",
        path: "/admin",
      },
      nextSteps: [],
      recommendations: [],
      followUpPrompts: [],
      handoffType: null,
    });

    assert.equal(metadata, null);
  });

  it("uses the previous verified Scripture reference for next-chapter follow-ups", async () => {
    const metadata = await resolveContextualFollowUp("Read the next chapter", {
      scripture: {
        reference: "John 3",
        book: "john",
        chapter: 3,
      },
      scriptureReferences: [{
        reference: "John 3",
        book: "john",
        chapter: 3,
      }],
      nextStep: null,
      nextSteps: [],
      recommendations: [],
      followUpPrompts: [],
      handoffType: null,
    });

    assert.equal(metadata?.scripture?.reference, "John 4");
    assert.equal(metadata?.nextStep?.path, "/bible/read/john/4");
  });

  it("fails closed when a canonical Emmaus action source is unavailable", () => {
    const metadata = canonicalFailureMetadata({
      intent: "DIRECT_ACTION",
      requestedCapability: "walks",
      requestedOperation: "CONTINUE",
      confidence: 0.99,
      clarificationRequired: false,
    });

    assert.match(metadata.answer ?? "", /couldn't safely access/i);
    assert.deepEqual(metadata.retrievalFailures, ["walks"]);
    assert.equal(metadata.nextStep, null);
    assert.equal(metadata.recommendations.length, 0);
  });
});