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
    assert.equal(routeAskEmmausRequest("devotional").intent, "DIRECT_ACTION");
    assert.equal(routeAskEmmausRequest("devotional").requestedCapability, "daily-devotional");
    assert.equal(routeAskEmmausRequest("today's devotional").requestedOperation, "READ");
    assert.deepEqual(
      routeAskEmmausRequest("Read today's devotional").requestedCapability,
      "daily-devotional",
    );
    assert.equal(routeAskEmmausRequest("Continue reading my Bible").intent, "BIBLE_CONTINUE");
    assert.equal(routeAskEmmausRequest("Continue my Walk").requestedCapability, "walks");
    assert.equal(routeAskEmmausRequest("Continue my Journey").requestedCapability, "journeys");
    assert.equal(routeAskEmmausRequest("Take me to the Bible").requestedCapability, "my-bible");
    assert.equal(routeAskEmmausRequest("Can you open my devotional?").requestedCapability, "daily-devotional");
    assert.equal(routeAskEmmausRequest("I want to continue my current walk").requestedCapability, "walks");
    assert.equal(routeAskEmmausRequest("What journey am I busy with?").requestedCapability, "active-progress");
    assert.equal(routeAskEmmausRequest("What's in my Journey?").requestedCapability, "active-progress");
    assert.equal(routeAskEmmausRequest("Which walk am I currently on?").requestedCapability, "active-progress");
    assert.equal(
      routeAskEmmausRequest("Which Walk or Journey am I currently doing?").requestedCapability,
      "active-progress",
    );
    assert.equal(routeAskEmmausRequest("What should I do today?").requestedCapability, "todays-steps");
    assert.equal(routeAskEmmausRequest("Continue where I left off").intent, "BIBLE_CONTINUE");
  });

  it("requires an explicit read/open command for Bible navigation", () => {
    const read = routeAskEmmausRequest("Read Psalm 23");
    assert.equal(read.intent, "BIBLE_READ");
    assert.equal(read.bibleReference?.bookId, "psalms");
    assert.equal(read.bibleReference?.chapter, 23);
    assert.equal(routeAskEmmausRequest("What does Psalm 23 mean?").intent, "GENERAL_BIBLICAL_QUESTION");
  });

  it("preserves exact starting verses, ranges, capitalization, and spoken aliases", () => {
    const cases = [
      ["Read John 3:16", "john", 3, 16, undefined],
      ["READ JOHN CHAPTER 3 VERSE 16", "john", 3, 16, undefined],
      ["Read John 3:16–18", "john", 3, 16, 18],
      ["Read First Corinthians 13", "1corinthians", 13, undefined, undefined],
      ["Read Second Thessalonians chapter three verses six through ten", "2thessalonians", 3, 6, 10],
      ["Read Song of Songs 2:1", "songofsolomon", 2, 1, undefined],
    ] as const;
    for (const [message, bookId, chapter, verse, verseEnd] of cases) {
      const result = routeAskEmmausRequest(message);
      assert.equal(result.intent, "BIBLE_READ", message);
      assert.equal(result.bibleReference?.bookId, bookId, message);
      assert.equal(result.bibleReference?.chapter, chapter, message);
      assert.equal(result.bibleReference?.verse, verse, message);
      assert.equal(result.bibleReference?.verseEnd, verseEnd, message);
    }
  });

  it("routes resource discovery to shared capabilities rather than invented links", () => {
    assert.equal(routeAskEmmausRequest("Find Bible Studies about forgiveness").requestedCapability, "bible-studies");
    assert.equal(routeAskEmmausRequest("Show me resources that can help when I feel anxious").requestedCapability, "discover");
    assert.equal(routeAskEmmausRequest("Has Emmaus preached on the lost son?").requestedCapability, "sermons");
    assert.equal(
      routeAskEmmausRequest("Please show me the covenant lantern teaching in John 3.").requestedCapability,
      "sermons",
    );
    assert.equal(
      routeAskEmmausRequest("What did Pastor Jeremy preach about grace?").requestedCapability,
      "sermons",
    );
  });

  it("does not send ordinary application questions to sermon retrieval", () => {
    assert.notEqual(routeAskEmmausRequest("Where can I find devotionals?").intent, "RESOURCE_SEARCH");
    assert.equal(routeAskEmmausRequest("Find sermons about hope").intent, "RESOURCE_SEARCH");
  });
});