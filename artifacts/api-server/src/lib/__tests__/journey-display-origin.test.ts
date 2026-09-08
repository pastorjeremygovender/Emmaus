import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { authoritativeDisplayOrigin } from "../journey-store.js";

describe("authoritative journey display origin", () => {
  it("classifies collection-backed Walks as Journeys regardless of route origin", () => {
    assert.equal(authoritativeDisplayOrigin({
      journeyType: "walk",
      collectionId: "collection-a",
    }), "journey");
  });

  it("keeps a genuinely standalone Walk in Walks", () => {
    assert.equal(authoritativeDisplayOrigin({
      journeyType: "walk",
      collectionId: undefined,
    }), "walk");
  });

  it("keeps non-Walk growth content in Journeys", () => {
    assert.equal(authoritativeDisplayOrigin({
      journeyType: "journey",
      collectionId: undefined,
    }), "journey");
  });
});