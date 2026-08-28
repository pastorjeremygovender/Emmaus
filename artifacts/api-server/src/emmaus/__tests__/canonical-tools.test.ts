import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveCanonicalAskRequest } from "../canonical-tools.ts";

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
});