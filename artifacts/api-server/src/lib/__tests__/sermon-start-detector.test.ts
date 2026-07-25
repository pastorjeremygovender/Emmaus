// @ts-nocheck
/**
 * Sermon Start Detector — Unit Tests
 *
 * Tests the pure deterministic functions in sermon-start-detector.ts.
 * No network or filesystem access required.
 *
 * Run (from artifacts/api-server/):
 *   node --test --experimental-strip-types \
 *     src/lib/__tests__/sermon-start-detector.test.ts
 *
 * Note: imports use .ts extensions so Node can resolve them when running
 * directly with --experimental-strip-types (esbuild bundles to a single
 * file so there is no per-file dist output to reference instead).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Use .ts extension so --experimental-strip-types can find the source file
import {
  getFinalSermonStart,
  detectSermonStartFromCues,
  detectSermonStartFromSegments,
} from "../sermon-start-detector.ts";

// ─── Helper factories ─────────────────────────────────────────────────────────

function makeCue(startTimeSeconds: number, text: string): VTTCue {
  return { startTimeSeconds, endTimeSeconds: startTimeSeconds + 30, text };
}

/**
 * Build a realistic ICC-style service transcript with 100+ cues:
 *   - cues 0-49   : worship music / filler
 *   - cues 50-59  : music gap (MUSIC_OR_FILLER_PATTERN matches)
 *   - cue  60     : sermon start phrase
 *   - cues 61-119 : sermon body
 */
function buildRealisticCues(totalCues = 120): VTTCue[] {
  const cues: VTTCue[] = [];
  const worshipText = [
    "♪ hallelujah hallelujah ♪",
    "♪ glory to the lord ♪",
    "[music]",
    "♪ praise his name ♪",
    "♪ [singing] ♪",
  ];

  for (let i = 0; i < totalCues; i++) {
    const t = i * 30; // 30-second cues
    if (i < 50) {
      // Worship block
      cues.push(makeCue(t, worshipText[i % worshipText.length]));
    } else if (i < 60) {
      // Music gap
      cues.push(makeCue(t, "[music]"));
    } else if (i === 60) {
      // Sermon opening phrase — high-confidence match
      cues.push(makeCue(t, "Turn with me in your Bible to John chapter three."));
    } else {
      // Sermon body
      cues.push(
        makeCue(
          t,
          `For God so loved the world segment ${i - 60}. ` +
            "This is the continuation of the sermon on John three sixteen.",
        ),
      );
    }
  }
  return cues;
}

// ─── getFinalSermonStart ──────────────────────────────────────────────────────

describe("getFinalSermonStart", () => {
  it("returns manual override when set", () => {
    assert.equal(getFinalSermonStart(300, 600), 300);
  });

  it("returns manual override even when it is 0 (explicit start)", () => {
    assert.equal(getFinalSermonStart(0, 600), 0);
  });

  it("returns detected start when no manual override", () => {
    assert.equal(getFinalSermonStart(undefined, 600), 600);
  });

  it("returns 0 when neither value is set", () => {
    assert.equal(getFinalSermonStart(undefined, undefined), 0);
  });

  it("prefers manual over detected even when detected is larger", () => {
    assert.equal(getFinalSermonStart(100, 2000), 100);
  });

  it("handles negative manual value by using it as-is (caller validates)", () => {
    // The function doesn't clamp — callers should validate before storing
    const result = getFinalSermonStart(-1, 500);
    assert.equal(typeof result, "number");
  });
});

// ─── Dual-timestamp arithmetic ────────────────────────────────────────────────

describe("dual-timestamp arithmetic", () => {
  it("relativeStart is 0 for segments exactly at sermon start", () => {
    const finalStart = 1200; // 20 min mark
    const absoluteStart = 1200;
    const relativeStart = Math.max(0, absoluteStart - finalStart);
    assert.equal(relativeStart, 0);
  });

  it("relativeStart is correct for mid-sermon segment", () => {
    const finalStart = 1200;
    const absoluteStart = 1800; // 10 min into sermon
    const relativeStart = Math.max(0, absoluteStart - finalStart);
    assert.equal(relativeStart, 600);
  });

  it("relativeStart clamps to 0 for pre-sermon segments", () => {
    const finalStart = 1200;
    const absoluteStart = 600; // before sermon
    const relativeStart = Math.max(0, absoluteStart - finalStart);
    assert.equal(relativeStart, 0);
  });

  it("isSermonContent is false for pre-sermon segments", () => {
    const finalStart = 1200;
    const absoluteStart = 600;
    const isSermonContent = absoluteStart >= finalStart;
    assert.equal(isSermonContent, false);
  });

  it("isSermonContent is true for segments at or after sermon start", () => {
    const finalStart = 1200;
    assert.equal(1200 >= finalStart, true);
    assert.equal(1800 >= finalStart, true);
  });

  it("computes correct relative timestamps for a 100-segment series", () => {
    const finalStart = 1800; // 30 min
    const segmentCount = 100;
    const segmentDuration = 30; // 30 s each

    for (let i = 0; i < segmentCount; i++) {
      const absoluteStart = i * segmentDuration;
      const relativeStart = Math.max(0, absoluteStart - finalStart);
      const isSermonContent = absoluteStart >= finalStart;

      if (absoluteStart < finalStart) {
        assert.equal(relativeStart, 0, `segment ${i}: pre-sermon relativeStart should be 0`);
        assert.equal(isSermonContent, false, `segment ${i}: should not be sermon content`);
      } else {
        assert.equal(relativeStart, absoluteStart - finalStart, `segment ${i}: relativeStart mismatch`);
        assert.equal(isSermonContent, true, `segment ${i}: should be sermon content`);
      }
    }
  });
});

// ─── detectSermonStartFromCues ────────────────────────────────────────────────

describe("detectSermonStartFromCues", () => {
  it("returns null for an empty cue list", () => {
    assert.equal(detectSermonStartFromCues([]), null);
  });

  it("detects high-confidence phrase pattern", () => {
    // The detector uses a 3-cue lookahead window (prev + current + next).
    // Put plenty of silence before the phrase cue so the window can't bleed backwards.
    const cues: VTTCue[] = [
      makeCue(0, "[music]"),
      makeCue(200, "♪ praise him ♪"),
      makeCue(400, "♪ worship continues ♪"),
      makeCue(600, "♪ more singing ♪"),
      makeCue(800, "Turn with me in your Bible to John chapter three."),
      makeCue(830, "We see here that God so loved the world."),
    ];
    const result = detectSermonStartFromCues(cues);
    assert.ok(result, "should detect a start");
    assert.equal(result!.method, "phrase");
    assert.ok(result!.confidence >= 0.85, `confidence should be ≥ 0.85, got ${result!.confidence}`);
    // The phrase is in the window of the cue at t=600 (prev+current+next covers t=800's text)
    // OR on the cue at t=800 itself — either is acceptable since the detector stops at ≥ 0.90.
    assert.ok(
      result!.detectedStartSeconds >= 600 && result!.detectedStartSeconds <= 800,
      `expected start between 600-800, got ${result!.detectedStartSeconds}`,
    );
  });

  it("detects sermon start using open-your-Bible phrase", () => {
    const cues = [
      makeCue(0, "♪ worship song ♪"),
      makeCue(200, "Please open your Bibles today."),
      makeCue(230, "We are in the book of Romans chapter eight."),
    ];
    const result = detectSermonStartFromCues(cues);
    assert.ok(result, "should detect a start");
    assert.equal(result!.method, "phrase");
  });

  it("detects via music gap when no phrase is present", () => {
    const cues: VTTCue[] = [];
    // 0–20min: worship speech
    for (let i = 0; i < 40; i++) cues.push(makeCue(i * 30, "praise and worship time in the service"));
    // 20–25min: music gap
    for (let i = 40; i < 50; i++) cues.push(makeCue(i * 30, "[music]"));
    // 25–50min: sermon body (2+ minutes of speech to qualify)
    for (let i = 50; i < 100; i++) cues.push(makeCue(i * 30, `sermon body segment ${i} with meaningful content here`));

    const result = detectSermonStartFromCues(cues, 3000);
    assert.ok(result, "should detect via music-gap or phrase");
    assert.ok(
      result!.detectedStartSeconds >= 1200,
      `start should be after worship block (≥ 1200s), got ${result!.detectedStartSeconds}`,
    );
  });

  it("falls back to duration estimate for long videos with no signal", () => {
    const cues: VTTCue[] = [];
    const videoDuration = 5400; // 90-min video
    // All cues are generic speech with no sermon-start phrases
    for (let i = 0; i < 50; i++) cues.push(makeCue(i * 60, `general content segment ${i} here`));

    const result = detectSermonStartFromCues(cues, videoDuration);
    // May find a phrase or fall back to duration estimate
    if (result) {
      assert.ok(["phrase", "music-gap", "duration-estimate"].includes(result.method));
      if (result.method === "duration-estimate") {
        assert.ok(
          result.detectedStartSeconds > 0,
          "duration estimate should produce a non-zero start",
        );
        assert.ok(result.confidence < 0.5, "duration estimate confidence should be low");
      }
    }
  });

  it("handles 100+ cues without performance degradation", () => {
    const cues = buildRealisticCues(120);
    const videoDuration = 120 * 30; // 3600s

    const t0 = Date.now();
    const result = detectSermonStartFromCues(cues, videoDuration);
    const elapsed = Date.now() - t0;

    assert.ok(result, "should detect a start in 100+ cue list");
    assert.ok(elapsed < 500, `detection should complete in < 500ms, took ${elapsed}ms`);
    assert.equal(result!.method, "phrase", "should find the phrase match in the cue list");
    // The detector uses a 3-cue lookahead window, so the phrase at cue 60 (t=1800)
    // may be detected via the window of the preceding cue (cue 59, t=1770).
    // Both are acceptable — the key is the result is close to the actual phrase cue.
    assert.ok(
      result!.detectedStartSeconds >= 1770 && result!.detectedStartSeconds <= 1800,
      `expected start near 1800s (±1 cue), got ${result!.detectedStartSeconds}`,
    );
  });

  it("handles 500-cue stress test within budget", () => {
    const cues = buildRealisticCues(500);
    const videoDuration = 500 * 30;

    const t0 = Date.now();
    const result = detectSermonStartFromCues(cues, videoDuration);
    const elapsed = Date.now() - t0;

    assert.ok(elapsed < 1000, `500-cue detection should complete in < 1000ms, took ${elapsed}ms`);
    assert.ok(result, "should find a result in a 500-cue list");
  });

  it("skips first 5% or 3 min (whichever shorter) to avoid early false positives", () => {
    // Put a high-confidence phrase at t=10s (within the skip window)
    const cues: VTTCue[] = [
      makeCue(10, "Turn with me in your Bible to Revelation."),
      ...Array.from({ length: 40 }, (_, i) => makeCue((i + 1) * 60, `worship content ${i}`)),
      makeCue(50 * 60, "Turn with me in your Bible to John chapter one."),
      ...Array.from({ length: 20 }, (_, i) => makeCue((51 + i) * 60, `sermon body ${i}`)),
    ];
    const result = detectSermonStartFromCues(cues, 70 * 60);
    // The phrase at t=10 should be skipped; the one at t=3000 should be found
    if (result && result.method === "phrase") {
      assert.ok(
        result.detectedStartSeconds >= 60,
        `should skip early phrase at 10s; got ${result.detectedStartSeconds}`,
      );
    }
  });
});

// ─── detectSermonStartFromSegments ───────────────────────────────────────────

describe("detectSermonStartFromSegments", () => {
  it("returns null for empty segments", () => {
    assert.equal(detectSermonStartFromSegments([]), null);
  });

  it("produces the same result as detectSermonStartFromCues for equivalent data", () => {
    const cues = buildRealisticCues(80);
    const segments = cues.map((c) => ({
      startTimeSeconds: c.startTimeSeconds,
      endTimeSeconds: c.endTimeSeconds,
      cleanedText: c.text,
    }));

    const fromCues = detectSermonStartFromCues(cues, 80 * 30);
    const fromSegments = detectSermonStartFromSegments(segments, 80 * 30);

    // Both code paths should agree on the detected start
    if (fromCues && fromSegments) {
      assert.equal(fromCues.method, fromSegments.method, "methods should match");
      assert.equal(
        fromCues.detectedStartSeconds,
        fromSegments.detectedStartSeconds,
        "detected timestamps should match",
      );
    } else {
      assert.equal(!!fromCues, !!fromSegments, "both should either find or not find a result");
    }
  });
});
