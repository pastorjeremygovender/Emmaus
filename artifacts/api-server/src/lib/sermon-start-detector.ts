/**
 * Sermon Start Detector
 *
 * Analyses VTT caption cues (or existing segments) from a full-service video
 * to identify the timestamp where the sermon proper begins — after worship and
 * announcements have ended.
 *
 * Methods, in priority order:
 *   1. phrase  — explicit sermon-opening phrase in the transcript
 *   2. music-gap — sustained silence / music-only section followed by speech
 *   3. duration-estimate — falls back to 20% of video duration for long services
 *
 * Called by processVideoInternal (from cues) and the repair pipeline (from segments).
 */

// ─── Input types ──────────────────────────────────────────────────────────────

export interface VTTCue {
  startTimeSeconds: number;
  endTimeSeconds: number;
  text: string;            // cleaned, lowercased for matching; originalText preserved by caller
}

export interface SermonStartResult {
  detectedStartSeconds: number;
  confidence: number;       // 0.0–1.0
  method: "phrase" | "music-gap" | "duration-estimate";
  reason: string;
}

// ─── Phrase patterns ──────────────────────────────────────────────────────────

// Bible book names — shared regex fragment used in multiple patterns.
const BIBLE_BOOK = `(?:genesis|exodus|leviticus|numbers|deuteronomy|joshua|judges|ruth|(?:first|second|1st|2nd|1|2)\\s*samuel|(?:first|second|1st|2nd|1|2)\\s*kings|(?:first|second|1st|2nd|1|2)\\s*chronicles|ezra|nehemiah|esther|job|psalms?|proverbs|ecclesiastes|song\\s+of\\s+solomon|isaiah|jeremiah|lamentations|ezekiel|daniel|hosea|joel|amos|obadiah|jonah|micah|nahum|habakkuk|zephaniah|haggai|zechariah|malachi|matthew|mark|luke|john|acts|romans|(?:first|second|1st|2nd|1|2)\\s*corinthians|galatians|ephesians|philippians|colossians|(?:first|second|1st|2nd|1|2)\\s*thessalonians|(?:first|second|1st|2nd|1|2)\\s*timothy|titus|philemon|hebrews|james|(?:first|second|1st|2nd|1|2)\\s*peter|(?:first|second|third|1st|2nd|3rd|1|2|3)\\s*john|jude|revelation)`;

// Shared time-of-service markers
const SERVICE_TIME = `(?:today|tonight|this\\s+(?:morning|evening|afternoon|week|sunday))`;

// These are strong indicators that the sermon proper is beginning.
const SERMON_START_PATTERNS: { pattern: RegExp; confidence: number; label: string }[] = [
  // ── Explicit Bible-opening phrases (highest confidence) ──────────────────
  { pattern: /turn\s+(?:with\s+me\s+)?(?:in\s+)?(?:your|our)\s+bible/i,       confidence: 0.97, label: "turn in your Bibles" },
  { pattern: /open\s+(?:up\s+)?(?:your|our)\s+bible/i,                         confidence: 0.96, label: "open your Bibles" },
  { pattern: /let[''']?s\s+(?:go\s+ahead\s+and\s+)?open\s+(?:our|the|your)\s+bible/i, confidence: 0.95, label: "let's open our Bibles" },
  { pattern: /please\s+open\s+(?:your|our)\s+bible/i,                          confidence: 0.95, label: "please open your Bibles" },
  { pattern: /take\s+(?:out\s+)?(?:your|a)\s+bible/i,                          confidence: 0.93, label: "take out your Bible" },
  { pattern: /open\s+(?:your\s+)?bible\s+(?:app|to)/i,                         confidence: 0.93, label: "open Bible app" },

  // ── Message / sermon title announcement ──────────────────────────────────
  { pattern: /the\s+title\s+of\s+(?:my|this|our|tonight[''']?s?|this\s+(?:morning|evening)[''']?s?)\s+(?:message|sermon|word)/i, confidence: 0.94, label: "title of message" },
  { pattern: /i[''']?ve?\s+titled\s+(?:this|tonight[''']?s?|this\s+(?:morning|evening)[''']?s?)\s+(?:message|sermon|word)/i,    confidence: 0.93, label: "I've titled this message" },
  { pattern: /(?:my|the|our)\s+(?:message|sermon|word)\s+(?:for\s+)?today/i,   confidence: 0.90, label: "message for today" },
  { pattern: /(?:our|my|the)\s+(?:focus|subject|topic|theme)\s+(?:for\s+)?today/i, confidence: 0.88, label: "topic for today" },

  // ── "I want to preach / speak" ────────────────────────────────────────────
  { pattern: /i\s+want\s+to\s+(?:preach|speak)\s+(?:to\s+you\s+)?(?:from|on|about)/i, confidence: 0.90, label: "I want to preach" },
  { pattern: /(?:i[''']?m\s+going\s+to\s+)?preach\s+(?:from|on|about|a\s+message)/i,  confidence: 0.88, label: "preach from/on" },
  { pattern: /i\s+want\s+to\s+share\s+(?:with\s+you\s+)?(?:from|today|tonight|this\s+morning)/i, confidence: 0.84, label: "I want to share" },
  { pattern: /let\s+me\s+(?:just\s+)?(?:share|talk|speak)\s+(?:with\s+you\s+)?(?:from|about|on)\s+/i, confidence: 0.83, label: "let me share from" },

  // ── Our text / passage ────────────────────────────────────────────────────
  { pattern: /(?:our|this|the)\s+text\s+(?:for\s+)?(?:today|this\s+morning|this\s+evening|tonight)/i, confidence: 0.93, label: "our text today" },
  { pattern: /(?:the\s+)?passage\s+before\s+us/i,                              confidence: 0.91, label: "passage before us" },
  { pattern: /(?:our|the)\s+scripture\s+(?:for\s+)?(?:today|this\s+morning|tonight)/i, confidence: 0.91, label: "our scripture today" },
  { pattern: /(?:the\s+)?(?:word|scripture|verse)\s+(?:for\s+)?today\s+(?:comes?\s+from|is\s+found\s+in|is\s+taken\s+from)/i, confidence: 0.91, label: "scripture for today is" },

  // ── Reading from a specific Bible book ───────────────────────────────────
  { pattern: new RegExp(`(?:we\\s+)?(?:read|look)\\s+(?:with\\s+me\\s+)?(?:at\\s+)?(?:from\\s+)?(?:the\\s+book\\s+of\\s+)?${BIBLE_BOOK}\\s+chapter\\s+\\d`, "i"), confidence: 0.89, label: "reading book chapter" },
  { pattern: new RegExp(`\\bin\\s+${BIBLE_BOOK}\\s+chapter\\s+\\d`, "i"),      confidence: 0.86, label: "in book chapter N" },
  { pattern: new RegExp(`(?:turn\\s+(?:with\\s+me\\s+)?)?to\\s+${BIBLE_BOOK}\\s+(?:chapter\\s+)?\\d+`, "i"), confidence: 0.85, label: "turn to book N" },
  { pattern: new RegExp(`(?:let(?:'?s|\\s+us)\\s+)?(?:read|look\\s+at)\\s+${BIBLE_BOOK}\\s+(?:chapter\\s+)?\\d+`, "i"), confidence: 0.85, label: "let's read book N" },

  // ── Tonight / this morning we're looking at ───────────────────────────────
  { pattern: new RegExp(`${SERVICE_TIME}\\s+we(?:'re|'re|\\s+are)\\s+(?:going\\s+to\\s+(?:be\\s+)?(?:looking\\s+at|studying|in|talking\\s+about)|looking\\s+at|in)`, "i"), confidence: 0.82, label: "tonight we're looking at" },
  { pattern: new RegExp(`${SERVICE_TIME}\\s+i\\s+(?:want\\s+to|would\\s+like\\s+to|am\\s+going\\s+to)\\s+(?:look|talk|speak|preach|share|bring)`, "i"), confidence: 0.81, label: "tonight I want to preach" },

  // ── Series / part announcement ────────────────────────────────────────────
  { pattern: /we(?:'re|'re|\s+are)\s+in\s+(?:a\s+)?(?:series|message\s+series|study)\s+(?:called|titled|on|about)?/i, confidence: 0.81, label: "series announcement" },
  { pattern: /this\s+is\s+(?:part|week|message)\s+\d+\s+(?:of|in)\s+(?:our\s+)?(?:series|study|journey)/i, confidence: 0.82, label: "series part N" },

  // ── Take notes / open notes ───────────────────────────────────────────────
  { pattern: /(?:you\s+(?:can\s+|may\s+)?)?(?:take|grab|get)\s+(?:out\s+)?(?:your\s+)?(?:notes?|pen(?:cil)?|paper)\s+(?:as\s+we|because\s+we|because\s+i)/i, confidence: 0.82, label: "take your notes" },

  // ── Let us look at / I want us to look at ────────────────────────────────
  { pattern: /(?:let\s+(?:us|me)|i\s+want\s+(?:us\s+to|to))\s+(?:look\s+at|go\s+to|turn\s+to)\s+/i, confidence: 0.80, label: "let us look at" },

  // ── Please stand for the reading ──────────────────────────────────────────
  { pattern: /please\s+(?:stand|rise)\s+(?:for\s+(?:the\s+)?(?:reading|word)|as\s+we\s+read)/i, confidence: 0.88, label: "please stand for the reading" },

  // ── Open / read the Word of God ───────────────────────────────────────────
  { pattern: /(?:we\s+)?(?:open|read)\s+(?:from\s+)?(?:the\s+)?word\s+of\s+god/i, confidence: 0.86, label: "open the word of God" },
  { pattern: /(?:the\s+)?word\s+of\s+(?:the\s+)?lord\s+(?:says?|declares?|tells?\s+us)/i, confidence: 0.83, label: "the word of the Lord says" },

  // ── Preacher/speaker introduction by MC ──────────────────────────────────
  { pattern: /(?:please\s+)?(?:welcome|receive|give\s+(?:a\s+(?:hand|round\s+of\s+applause)|an\s+applause)\s+(?:for|to))\s+(?:pastor|reverend|rev\.?|brother|sister|elder|deacon|bishop|prophet|apostle)/i, confidence: 0.76, label: "welcome preacher" },
  { pattern: /(?:pastor|reverend|rev\.?|elder|bishop|prophet|apostle)\s+\w+\s+(?:is\s+going\s+to|will\s+(?:now\s+)?(?:come|preach|bring|share|minister)|now\s+comes)/i, confidence: 0.75, label: "pastor will now preach" },

  // ── Congregation-address opening after worship ────────────────────────────
  // Moderate confidence — ICC preachers often open with "Good morning/evening, church"
  { pattern: /(?:good\s+(?:morning|afternoon|evening|day))[,!]?\s+(?:church|everyone|family|beloved|saints|congregation)/i, confidence: 0.72, label: "good morning church" },
  { pattern: /(?:church|family|beloved|saints|congregation)[,!]\s+(?:good\s+(?:morning|afternoon|evening)|how\s+(?:are\s+you|is\s+everyone)|what\s+a)/i, confidence: 0.70, label: "church greeting" },

  // ── Opening prayer marker (often precedes sermon) ─────────────────────────
  { pattern: /(?:let\s+me|let\s+us|let[''']?s)\s+(?:go\s+(?:to\s+)?)?(?:bow|open\s+with|have)\s+(?:a\s+)?(?:word\s+of\s+)?pray(?:er)?/i, confidence: 0.70, label: "let us pray before sermon" },
  { pattern: /before\s+(?:i|we)\s+(?:begin|start|preach|dive\s+in|get\s+started)[,!]?\s+(?:let(?:\s+me|\s+us|[''']?s)\s+(?:pray|go\s+to\s+(?:the\s+)?lord))/i, confidence: 0.74, label: "before I begin let us pray" },
];

// Cues with only these words are likely music / filler — no spoken content
const MUSIC_OR_FILLER_PATTERN = /^[\s\[♪♫\]]*(?:\[music\]|\[applause\]|\[singing\]|\[song\]|\[instrumental\]|♪|♫|amen|hallelujah)*[\s\[♪♫\]]*$/i;

// ─── Phrase-based detection ────────────────────────────────────────────────────

/**
 * Scan VTT cues for the first strong sermon-opening phrase.
 *
 * Strategy: concatenate each cue with its 2 neighbours (before + after) to
 * handle phrases that span caption boundaries. Skip the very opening to
 * avoid announcements, but do not skip too aggressively for ICC services
 * where the preacher sometimes opens immediately after worship.
 */
function detectByPhrase(cues: VTTCue[]): SermonStartResult | null {
  const lastCueTime = cues[cues.length - 1]?.endTimeSeconds ?? 0;

  // Skip the first 5% or 3 min, whichever is shorter.
  // ICC worship blocks are usually 20-40 min — so a false positive in the
  // first 3 min of a 1.5-hour service would be very unusual.
  const skipUntil = Math.min(lastCueTime * 0.05, 180);

  let bestResult: SermonStartResult | null = null;

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (cue.startTimeSeconds < skipUntil) continue;

    // Build a window: join this cue + 1 previous + 1 next for cross-boundary phrases
    const window = [
      cues[i - 1]?.text ?? "",
      cue.text,
      cues[i + 1]?.text ?? "",
    ].join(" ");

    for (const { pattern, confidence, label } of SERMON_START_PATTERNS) {
      if (pattern.test(window)) {
        const result: SermonStartResult = {
          detectedStartSeconds: cue.startTimeSeconds,
          confidence,
          method: "phrase",
          reason: `Detected phrase "${label}" at ${formatTs(cue.startTimeSeconds)}`,
        };
        // Keep the highest-confidence match; once we hit ≥ 0.90 stop scanning
        if (!bestResult || confidence > bestResult.confidence) {
          bestResult = result;
        }
        if (confidence >= 0.90) return bestResult;
        break; // only one pattern match per cue
      }
    }
  }
  return bestResult;
}

// ─── Music-gap detection ──────────────────────────────────────────────────────

/**
 * Find a significant music/silence gap followed by spoken content.
 *
 * For ICC services, worship blocks can last 20-40 min followed by a transition
 * into announcements or the sermon. We look for the LAST substantial music
 * block before consistent speech (rather than the first), because that is
 * more likely to be the worship→sermon boundary.
 */
function detectByMusicGap(cues: VTTCue[]): SermonStartResult | null {
  if (cues.length < 10) return null;
  const lastCueTime = cues[cues.length - 1]?.endTimeSeconds ?? 0;
  const skipUntil = Math.min(lastCueTime * 0.08, 300); // must be past the very opening

  // We'll track ALL music gaps ≥ threshold and return the best candidate.
  // "Best" = last gap with meaningful spoken content afterwards (≥ 60 s of speech).
  const MIN_GAP_SECONDS = 30; // lowered from 45 — ICC may have shorter music transitions

  const candidates: SermonStartResult[] = [];

  let inMusicGap = false;
  let gapStartTime = 0;
  let gapLength = 0;

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (cue.startTimeSeconds < skipUntil) continue;

    const isMusic = MUSIC_OR_FILLER_PATTERN.test(cue.text);

    if (isMusic) {
      if (!inMusicGap) { inMusicGap = true; gapStartTime = cue.startTimeSeconds; }
      gapLength = cue.endTimeSeconds - gapStartTime;
    } else if (inMusicGap) {
      if (gapLength >= MIN_GAP_SECONDS) {
        // Verify there's ≥ 60 s of actual speech after this gap
        // (to filter out brief spoken interludes between songs)
        let speechAfter = 0;
        for (let j = i; j < Math.min(i + 40, cues.length); j++) {
          if (!MUSIC_OR_FILLER_PATTERN.test(cues[j].text)) {
            speechAfter += (cues[j].endTimeSeconds - cues[j].startTimeSeconds);
          }
          if (speechAfter >= 60) break;
        }
        if (speechAfter >= 60) {
          // Confidence is higher for longer gaps (more certain it's a worship→sermon boundary)
          const confidence = gapLength >= 90 ? 0.72 : gapLength >= 60 ? 0.68 : 0.63;
          candidates.push({
            detectedStartSeconds: cue.startTimeSeconds,
            confidence,
            method: "music-gap",
            reason: `${Math.round(gapLength)}s music block ending at ${formatTs(cue.startTimeSeconds)}`,
          });
        }
      }
      inMusicGap = false;
      gapLength = 0;
    }
  }

  if (candidates.length === 0) return null;

  // Return the LAST eligible gap before the 80% mark.
  // Candidates are appended in chronological order (earliest first), so the
  // last element of the filtered array is the one furthest into the service —
  // which is the worship→sermon boundary in a typical ICC full-service recording.
  // (Do NOT re-sort or reduce by confidence: that would bias back toward earlier,
  // longer worship sections and defeat the purpose of multi-candidate collection.)
  const cutoff = lastCueTime * 0.80;
  const eligible = candidates.filter((c) => c.detectedStartSeconds < cutoff);
  // Fall back to the last candidate overall if all are past the cutoff
  return eligible.length > 0 ? eligible[eligible.length - 1] : candidates[candidates.length - 1];
}

// ─── Duration estimate fallback ────────────────────────────────────────────────

/**
 * Last resort: estimate sermon start by video length when no other signal found.
 *
 * ICC service structure (approximate):
 *   < 45 min   — probably not a full service; skip
 *   45–75 min  — short service: worship ≈ 15 min → 20% mark
 *   75–100 min — standard:      worship ≈ 25 min → 25% mark
 *  100–130 min — long service:  worship ≈ 35 min → 28% mark
 *  130+ min    — very long:     worship ≈ 40 min → 30% mark
 */
function detectByDurationEstimate(_cues: VTTCue[], videoDurationSeconds: number): SermonStartResult | null {
  const mins = videoDurationSeconds / 60;
  if (mins < 45) return null; // too short to be a full service

  let pct: number;
  if      (mins < 75)  pct = 0.20;
  else if (mins < 100) pct = 0.25;
  else if (mins < 130) pct = 0.28;
  else                 pct = 0.30;

  const estimated = Math.round(videoDurationSeconds * pct);
  return {
    detectedStartSeconds: estimated,
    confidence: 0.32,
    method: "duration-estimate",
    reason: `No pattern found — estimated ${Math.round(pct * 100)}% mark (${formatTs(estimated)}) for ${Math.round(mins)} min service`,
  };
}

// ─── Public API (from raw VTT cues) ───────────────────────────────────────────

/**
 * Detect sermon start from raw VTT cues (called during caption processing).
 * @param cues - Ordered list of VTT cues with startTimeSeconds and text
 * @param videoDurationSeconds - Total video duration (optional, for fallback)
 */
export function detectSermonStartFromCues(
  cues: VTTCue[],
  videoDurationSeconds?: number,
): SermonStartResult | null {
  if (cues.length === 0) return null;

  // 1. Try phrase detection (highest confidence)
  const phraseResult = detectByPhrase(cues);

  // High-confidence phrase match — return immediately
  if (phraseResult && phraseResult.confidence >= 0.85) return phraseResult;

  // 2. Try music gap detection
  const gapResult = detectByMusicGap(cues);

  if (phraseResult && gapResult) {
    // Both found: prefer the one that comes LATER (closer to the sermon) while
    // still giving phrase detection the nod when confidence is similar.
    // Rationale: an early phrase result may be in announcements; a music gap
    // that ends AFTER a phrase result likely marks the real worship→sermon break.
    if (gapResult.detectedStartSeconds > phraseResult.detectedStartSeconds + 300) {
      // Gap is >5 min later — trust the gap (ICC announcements can contain phrases)
      return gapResult;
    }
    // Otherwise trust the phrase result (it's more specific)
    return phraseResult;
  }

  if (gapResult) return gapResult;

  // 3. Return phrase result even if low confidence
  if (phraseResult) return phraseResult;

  // 4. Duration estimate as last resort
  if (videoDurationSeconds !== undefined) {
    return detectByDurationEstimate(cues, videoDurationSeconds);
  }

  return null;
}

// ─── Public API (from stored segments) ────────────────────────────────────────

/**
 * Re-detect sermon start from already-stored segments (repair pipeline).
 * Uses cleanedText as a proxy for the original transcript.
 */
export function detectSermonStartFromSegments(
  segments: Array<{ startTimeSeconds: number; endTimeSeconds: number; cleanedText: string }>,
  videoDurationSeconds?: number,
): SermonStartResult | null {
  if (segments.length === 0) return null;

  // Convert segments to cue-like objects
  const cues: VTTCue[] = segments.map((s) => ({
    startTimeSeconds: s.startTimeSeconds,
    endTimeSeconds: s.endTimeSeconds,
    text: s.cleanedText,
  }));

  return detectSermonStartFromCues(cues, videoDurationSeconds);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format seconds as M:SS for logging. */
function formatTs(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Compute the effective sermon start seconds for a video.
 * Manual override takes priority over auto-detected value.
 * Returns 0 if neither is set (treats the whole video as sermon content).
 */
export function getFinalSermonStart(
  manualSermonStartSeconds?: number,
  detectedSermonStartSeconds?: number,
): number {
  if (manualSermonStartSeconds !== undefined && manualSermonStartSeconds >= 0) {
    return manualSermonStartSeconds;
  }
  return detectedSermonStartSeconds ?? 0;
}
