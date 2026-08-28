import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { routeAskEmmausRequest } from "../intent-router.ts";

describe("typed Ask Emmaus request router", () => {
  it("recognises app-help requests without treating them as Bible questions", () => {
    const result = routeAskEmmausRequest("Where can I find devotionals?");
    assert.equal(result.intent, "APP_HELP");
    assert.equal(result.requestedCapability, "daily-devotional");
    assert.equal(result.requestedOperation, "DESCRIBE");
  });

  it("recognises direct canonical actions", () => {
    assert.deepEqual(
      routeAskEmmausRequest("Read today's devotional").requestedCapability,
      "daily-devotional",
    );
    assert.equal(routeAskEmmausRequest("Continue reading my Bible").intent, "BIBLE_CONTINUE");
    assert.equal(routeAskEmmausRequest("Continue my Walk").requestedCapability, "walks");
    assert.equal(routeAskEmmausRequest("Continue my Journey").requestedCapability, "journeys");
  });

  it("requires an explicit read/open command for Bible navigation", () => {
    const read = routeAskEmmausRequest("Read Psalm 23");
    assert.equal(read.intent, "BIBLE_READ");
    assert.equal(read.bibleReference?.bookId, "psalms");
    assert.equal(read.bibleReference?.chapter, 23);
    assert.equal(routeAskEmmausRequest("What does Psalm 23 mean?").intent, "GENERAL_BIBLICAL_QUESTION");
  });

  it("does not send ordinary application questions to sermon retrieval", () => {
    assert.notEqual(routeAskEmmausRequest("Where can I find devotionals?").intent, "RESOURCE_SEARCH");
    assert.equal(routeAskEmmausRequest("Find sermons about hope").intent, "RESOURCE_SEARCH");
  });
});