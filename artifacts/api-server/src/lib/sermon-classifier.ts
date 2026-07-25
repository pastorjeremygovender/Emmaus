/**
 * Sermon Classifier
 *
 * Deterministic metadata-based classification distinguishing likely sermons from
 * other channel content (worship, announcements, trailers, etc.).
 * AI-assisted classification is NOT used here — deterministic rules only.
 * The Admin Portal allows overriding any automated classification.
 */

import type { ContentType } from "./sermon-store.js";

// ─── Classification result ────────────────────────────────────────────────────

export interface ClassificationResult {
  contentType: ContentType;
  sermonLikelihood: number;    // 0.0–1.0
  reason: string;
}

// ─── Rules ────────────────────────────────────────────────────────────────────

// Duration thresholds
const MIN_SERMON_SECONDS = 600;    // 10 minutes
const MAX_SERMON_SECONDS = 7200;   // 2 hours (beyond this, likely a special event)
const SHORT_THRESHOLD = 120;       // <2 min → short/announcement

// Title signals — these are matched case-insensitively
const SERMON_TITLE_SIGNALS = [
  "sermon",
  "preaching",
  "message from",
  "sunday service",
  "sunday morning",
  "sunday evening",
  "midweek service",
  "prayer meeting",
  "devotion",
  "word of god",
  "the word",
  "pastor",
  "rev ",
  "reverend",
  "ephesians",
  "philippians",
  "colossians",
  "thessalonians",
  "galatians",
  "corinthians",
  "romans",
  "genesis",
  "exodus",
  "leviticus",
  "deuteronomy",
  "joshua",
  "judges",
  "psalms",
  "proverbs",
  "isaiah",
  "jeremiah",
  "ezekiel",
  "matthew",
  "mark",
  "luke",
  "john ",
  "acts",
  "revelation",
  "chapter",
  "gospel",
  "faith",
  "grace",
  "salvation",
  "redemption",
  "kingdom",
];

const NON_SERMON_TITLE_SIGNALS = [
  "worship",
  "praise",
  "song",
  "hymn",
  "choir",
  "announcement",
  "announcements",
  "trailer",
  "promo",
  "kids",
  "children",
  "youth",
  "livestream test",
  "test stream",
  "sound check",
  "shorts",
  "#shorts",
  "highlight",
  "clip",
  "compilation",
];

// Description signals
const SERMON_DESC_SIGNALS = [
  "preached by",
  "speaker:",
  "series:",
  "scripture:",
  "text:",
  "passage:",
  "sunday service",
  "message preached",
];

// ─── Book abbreviation / reference detection ──────────────────────────────────

const BOOK_NAME_PATTERN = /\b(genesis|exodus|leviticus|numbers|deuteronomy|joshua|judges|ruth|samuel|kings|chronicles|ezra|nehemiah|esther|job|psalms?|proverbs|ecclesiastes|isaiah|jeremiah|lamentations|ezekiel|daniel|hosea|joel|amos|obadiah|jonah|micah|nahum|habakkuk|zephaniah|haggai|zechariah|malachi|matthew|mark|luke|john|acts|romans|corinthians|galatians|ephesians|philippians|colossians|thessalonians|timothy|titus|philemon|hebrews|james|peter|jude|revelation)\b/i;

// Scripture reference pattern: "John 3:16" or "Romans 8" or "1 Cor. 13"
const SCRIPTURE_REF_PATTERN = /\b(\d\s+)?(genesis|exodus|leviticus|numbers|deuteronomy|joshua|judges|ruth|samuel|kings|chronicles|ezra|nehemiah|esther|job|psalms?|proverbs|ecclesiastes|isaiah|jeremiah|lamentations|ezekiel|daniel|hosea|joel|amos|obadiah|jonah|micah|nahum|habakkuk|zephaniah|haggai|zechariah|malachi|matthew|mark|luke|john|acts|romans|corinthians|galatians|ephesians|philippians|colossians|thessalonians|timothy|titus|philemon|hebrews|james|peter|jude|revelation)\s+\d+/i;

// ─── Classifier ───────────────────────────────────────────────────────────────

export function classifyVideo(
  title: string,
  description: string,
  durationSeconds: number,
): ClassificationResult {
  const titleLower = title.toLowerCase();
  const descLower = description.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  // ── Duration checks ───────────────────────────────────────────────────────

  if (durationSeconds < SHORT_THRESHOLD) {
    return {
      contentType: "announcement",
      sermonLikelihood: 0.05,
      reason: `Very short video (${Math.round(durationSeconds)}s) — likely announcement or clip`,
    };
  }

  if (durationSeconds >= MIN_SERMON_SECONDS) {
    score += 30;
    reasons.push(`duration ${Math.round(durationSeconds / 60)}min ≥ 10min`);
  } else {
    score -= 10;
    reasons.push(`duration ${Math.round(durationSeconds / 60)}min < 10min`);
  }

  // ── Title signals ─────────────────────────────────────────────────────────

  for (const signal of SERMON_TITLE_SIGNALS) {
    if (titleLower.includes(signal)) {
      score += 8;
      reasons.push(`title:"${signal}"`);
      break; // only count once
    }
  }

  let hasNonSermonSignal = false;
  for (const signal of NON_SERMON_TITLE_SIGNALS) {
    if (titleLower.includes(signal)) {
      score -= 20;
      reasons.push(`non-sermon title signal:"${signal}"`);
      hasNonSermonSignal = true;
      break;
    }
  }

  // Bible book in title — strong sermon indicator
  if (!hasNonSermonSignal && BOOK_NAME_PATTERN.test(title)) {
    score += 15;
    reasons.push("Bible book name in title");
  }

  // Scripture reference in title
  if (!hasNonSermonSignal && SCRIPTURE_REF_PATTERN.test(title)) {
    score += 10;
    reasons.push("Scripture reference in title");
  }

  // ── Description signals ────────────────────────────────────────────────────

  for (const signal of SERMON_DESC_SIGNALS) {
    if (descLower.includes(signal)) {
      score += 5;
      reasons.push(`desc:"${signal}"`);
      break;
    }
  }

  if (SCRIPTURE_REF_PATTERN.test(description)) {
    score += 8;
    reasons.push("Scripture reference in description");
  }

  // ── Normalise score to likelihood ──────────────────────────────────────────

  // Score range roughly: -30 (clearly not) to +70 (definitely sermon)
  // Map to 0–1 sigmoid-like
  const clampedScore = Math.max(-30, Math.min(70, score));
  const likelihood = (clampedScore + 30) / 100; // 0–1 linear in that range

  // ── Content type classification ────────────────────────────────────────────

  let contentType: ContentType;
  if (hasNonSermonSignal && durationSeconds < MIN_SERMON_SECONDS) {
    if (NON_SERMON_TITLE_SIGNALS.some((s) => ["worship", "praise", "song", "hymn", "choir"].includes(s) && titleLower.includes(s))) {
      contentType = "worship";
    } else {
      contentType = "announcement";
    }
  } else if (likelihood >= 0.6) {
    contentType = "sermon";
  } else if (likelihood >= 0.3) {
    contentType = "unknown";
  } else {
    contentType = "other";
  }

  return {
    contentType,
    sermonLikelihood: Math.round(likelihood * 100) / 100,
    reason: reasons.slice(0, 5).join("; ") || "no strong signals",
  };
}

/**
 * Determine whether a classified video should be auto-approved without admin review.
 * High-confidence sermons (long duration + strong title/description signals) can be
 * auto-approved. Uncertain ones always go to pending review.
 */
export function shouldAutoApprove(
  likelihood: number,
  durationSeconds: number,
): boolean {
  return likelihood >= 0.8 && durationSeconds >= MIN_SERMON_SECONDS;
}
