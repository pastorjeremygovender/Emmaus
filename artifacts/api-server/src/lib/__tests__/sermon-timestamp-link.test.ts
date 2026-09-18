// @ts-nocheck
/**
 * buildSermonLink — Unit Tests
 *
 * Tests the timestamp link builder used by the sermon companion generation
 * pipeline to store per-step sermon seek positions.
 *
 * Run (from artifacts/api-server/):
 *   node --test --experimental-strip-types \
 *     src/lib/__tests__/sermon-timestamp-link.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildSermonLink, buildSermonTimeline } from "../sermon-timestamp-utils.ts";

// ─── buildSermonLink ──────────────────────────────────────────────────────────

describe("buildSermonLink — YouTube path", () => {
  it("returns absolute YouTube URL with t= fragment", () => {
    const url = buildSermonLink("dQw4w9WgXcQ", 1200);
    assert.equal(url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1200s");
  });

  it("keeps absolute seconds even when sermonStartSecs is nonzero", () => {
    // YouTube deep-links must be absolute — sermon start offset must NOT be
    // subtracted from the YouTube ?t= parameter.
    const url = buildSermonLink("dQw4w9WgXcQ", 1200, 1080);
    assert.equal(url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1200s");
  });

  it("floors fractional seconds", () => {
    const url = buildSermonLink("abc", 75.9);
    assert.equal(url, "https://www.youtube.com/watch?v=abc&t=75s");
  });

  it("returns '' when startSeconds is null", () => {
    assert.equal(buildSermonLink("abc", null), "");
  });

  it("returns '' when startSeconds is negative", () => {
    assert.equal(buildSermonLink("abc", -5), "");
  });
});

describe("buildSermonLink — audio-only path (no videoId)", () => {
  it("returns MM:SS string when no videoId and sermonStartSecs is 0", () => {
    // 120 seconds + 0 offset = 2:00
    const link = buildSermonLink("", 120, 0);
    assert.equal(link, "2:00");
  });

  it("adds sermonStartSecs offset to produce absolute position in full recording", () => {
    // AI estimated 120s into trimmed sermon transcript.
    // Sermon starts at 1080s in the full recording.
    // Stored value must be 1080 + 120 = 1200s = 20:00 so the full audio seeks correctly.
    const link = buildSermonLink("", 120, 1080);
    assert.equal(link, "20:00");
  });

  it("zero-pads seconds", () => {
    const link = buildSermonLink("", 65, 0);
    assert.equal(link, "1:05");
  });

  it("returns '' when startSeconds is null", () => {
    assert.equal(buildSermonLink("", null, 1080), "");
  });

  it("returns '' when startSeconds is undefined", () => {
    assert.equal(buildSermonLink("", undefined, 0), "");
  });

  it("defaults sermonStartSecs to 0 when omitted", () => {
    // No timed cues and no offset provided — AI estimate stored as-is.
    const link = buildSermonLink("", 90);
    assert.equal(link, "1:30");
  });
});

// ─── buildSermonTimeline ──────────────────────────────────────────────────────

describe("buildSermonTimeline", () => {
  /** Make a minimal timed cue. */
  function cue(startSecs, text) {
    return { startSecs, endSecs: startSecs + 10, text, vttLine: text };
  }

  it("returns empty array when timedCues is empty", () => {
    const result = buildSermonTimeline([], 0, 600);
    assert.deepEqual(result, []);
  });

  it("filters cues to the sermon window", () => {
    const cues = [
      cue(0,   "Announcements"),
      cue(300, "Welcome everyone"),  // sermon start = 300
      cue(420, "Today's passage"),
      cue(700, "Closing"),           // after sermon end = 600
    ];
    const result = buildSermonTimeline(cues, 300, 600);
    assert.ok(result.every(l => l.secs >= 300 && l.secs <= 600),
      "All landmarks must be within [sermonStartSecs, sermonEndSecs]");
  });

  it("includes the first cue at or after sermonStart", () => {
    const cues = [cue(60, "Pre-sermon"), cue(300, "Sermon opens"), cue(600, "Mid sermon")];
    const result = buildSermonTimeline(cues, 300, 999);
    assert.ok(result.length >= 1, "At least one landmark expected");
    assert.equal(result[0].secs, 300);
  });

  it("spaces landmarks at least 120 seconds apart", () => {
    // Cues every 30 seconds — landmarks should not be closer than 2 minutes.
    const cues = Array.from({ length: 30 }, (_, i) => cue(i * 30, `cue${i}`));
    const result = buildSermonTimeline(cues, 0, 900);
    for (let i = 1; i < result.length; i++) {
      assert.ok(
        result[i].secs - result[i - 1].secs >= 120,
        `Landmarks too close: ${result[i - 1].secs}s → ${result[i].secs}s`
      );
    }
  });
});
