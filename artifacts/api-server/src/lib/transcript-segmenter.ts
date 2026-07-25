/**
 * Transcript Segmenter
 *
 * Parses WebVTT and SRT caption files preserving exact timing information,
 * normalises the text, then divides the sermon into searchable segments of
 * approximately 30–90 seconds / 100–300 words.
 *
 * Stores original and cleaned text separately.
 * Never loses the original timestamp mapping.
 */

// ─── Caption cue (raw) ────────────────────────────────────────────────────────

export interface CaptionCue {
  startSeconds: number;
  endSeconds: number;
  originalText: string;
  cleanedText: string;
}

// ─── VTT parser ───────────────────────────────────────────────────────────────

/**
 * Parse a WebVTT string into individual cues.
 * Handles both standard VTT (from YouTube) and extended VTT with positioning cues.
 */
export function parseVtt(vtt: string): CaptionCue[] {
  const cues: CaptionCue[] = [];
  const lines = vtt.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Look for timestamp line: "00:00:01.000 --> 00:00:04.000"
    const tsMatch = line.match(
      /^(\d{1,2}:\d{2}:\d{2}\.\d{3})\s+-->\s+(\d{1,2}:\d{2}:\d{2}\.\d{3})/
    );

    if (tsMatch) {
      const startSeconds = parseVttTime(tsMatch[1]);
      const endSeconds = parseVttTime(tsMatch[2]);

      // Collect text lines until blank line or next timestamp
      i++;
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i]);
        i++;
      }

      const originalText = textLines.join(" ").trim();
      const cleanedText = cleanCaptionText(originalText);

      if (cleanedText) {
        cues.push({ startSeconds, endSeconds, originalText, cleanedText });
      }
    } else {
      i++;
    }
  }

  return cues;
}

/** Parse "HH:MM:SS.mmm" or "MM:SS.mmm" to seconds */
function parseVttTime(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

// ─── SRT parser ───────────────────────────────────────────────────────────────

/**
 * Parse an SRT string into individual cues.
 */
export function parseSrt(srt: string): CaptionCue[] {
  const cues: CaptionCue[] = [];
  const blocks = srt.split(/\r?\n\r?\n/);

  for (const block of blocks) {
    const lines = block.trim().split(/\r?\n/);
    if (lines.length < 2) continue;

    // Find timestamp line
    let tsLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(" --> ")) { tsLine = i; break; }
    }
    if (tsLine < 0) continue;

    const tsMatch = lines[tsLine].match(
      /(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}[,\.]\d{3})/
    );
    if (!tsMatch) continue;

    const startSeconds = parseSrtTime(tsMatch[1]);
    const endSeconds = parseSrtTime(tsMatch[2]);
    const textLines = lines.slice(tsLine + 1);
    const originalText = textLines.join(" ").trim();
    const cleanedText = cleanCaptionText(originalText);

    if (cleanedText) {
      cues.push({ startSeconds, endSeconds, originalText, cleanedText });
    }
  }

  return cues;
}

/** Parse "HH:MM:SS,mmm" or "HH:MM:SS.mmm" to seconds */
function parseSrtTime(ts: string): number {
  const normalised = ts.replace(",", ".");
  const [timeStr] = normalised.split(".");
  const parts = timeStr.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

// ─── Auto-detect format and parse ─────────────────────────────────────────────

export function parseCaption(content: string): CaptionCue[] {
  const trimmed = content.trim();
  if (trimmed.startsWith("WEBVTT")) {
    return parseVtt(trimmed);
  }
  // Heuristic: SRT starts with "1\n" (block number)
  return parseSrt(trimmed);
}

// ─── Text cleaning ────────────────────────────────────────────────────────────

/**
 * Clean caption text:
 * - Strip HTML tags (YouTube adds <font>, <b>, etc.)
 * - Remove VTT positioning tags like {an8}
 * - Remove duplicate adjacent words (common in auto-captions)
 * - Normalise whitespace
 * - Trim
 */
export function cleanCaptionText(text: string): string {
  let t = text;

  // Strip HTML tags
  t = t.replace(/<[^>]+>/g, " ");

  // Strip VTT positioning cues
  t = t.replace(/\{[^}]+\}/g, " ");

  // Strip [MUSIC], [Applause], [inaudible] etc.
  t = t.replace(/\[[^\]]*\]/g, " ");

  // Remove double-hyphen stutters "-- "
  t = t.replace(/--\s*/g, "");

  // Collapse multiple spaces / newlines
  t = t.replace(/\s+/g, " ").trim();

  // Remove duplicate consecutive words (common in ASR captions)
  t = t.replace(/\b(\w+)\s+\1\b/gi, "$1");

  return t;
}

// ─── Segmentation ─────────────────────────────────────────────────────────────

export interface TranscriptSegment {
  sequenceNumber: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  originalText: string;
  cleanedText: string;
  wordCount: number;
}

const TARGET_SEGMENT_SECONDS = 60;   // aim for ~1-minute windows
const MIN_SEGMENT_SECONDS = 20;      // don't create tiny slivers
const MAX_SEGMENT_SECONDS = 120;     // cap at 2 minutes per segment
const MIN_SEGMENT_WORDS = 30;        // don't create nearly-empty segments
const TARGET_SEGMENT_WORDS = 200;    // ~200 words / segment

/**
 * Group caption cues into segments of approximately TARGET_SEGMENT_SECONDS.
 *
 * Uses natural boundaries: if a cue ends near a sentence boundary (period,
 * question mark, exclamation) and we've accumulated enough content, close
 * the segment there.
 */
export function segmentCues(cues: CaptionCue[]): TranscriptSegment[] {
  if (cues.length === 0) return [];

  const segments: TranscriptSegment[] = [];
  let seqNum = 0;
  let bufferStart = cues[0].startSeconds;
  let bufferOriginal: string[] = [];
  let bufferCleaned: string[] = [];
  let wordCount = 0;

  const flush = (endSeconds: number) => {
    const originalText = bufferOriginal.join(" ").trim();
    const cleanedText = bufferCleaned.join(" ").trim();
    if (cleanedText && wordCount >= MIN_SEGMENT_WORDS) {
      segments.push({
        sequenceNumber: seqNum++,
        startTimeSeconds: Math.round(bufferStart),
        endTimeSeconds: Math.round(endSeconds),
        originalText,
        cleanedText,
        wordCount,
      });
    }
  };

  for (const cue of cues) {
    const elapsed = cue.endSeconds - bufferStart;
    const wordCountNow = wordCount + cue.cleanedText.split(/\s+/).length;
    const atNaturalBoundary = /[.!?]["'»]?\s*$/.test(cue.cleanedText);

    // Decide whether to flush before adding this cue
    const shouldFlush =
      (elapsed >= TARGET_SEGMENT_SECONDS && atNaturalBoundary) ||
      elapsed >= MAX_SEGMENT_SECONDS ||
      wordCountNow >= TARGET_SEGMENT_WORDS;

    if (shouldFlush && bufferCleaned.length > 0) {
      flush(cue.startSeconds);
      bufferStart = cue.startSeconds;
      bufferOriginal = [];
      bufferCleaned = [];
      wordCount = 0;
    }

    bufferOriginal.push(cue.originalText);
    bufferCleaned.push(cue.cleanedText);
    wordCount += cue.cleanedText.split(/\s+/).filter(Boolean).length;
  }

  // Flush remainder
  if (bufferCleaned.length > 0) {
    const lastCue = cues[cues.length - 1];
    flush(lastCue.endSeconds);
  }

  return segments;
}

/**
 * Full pipeline: parse caption content → clean → segment.
 */
export function processCaption(content: string): {
  cues: CaptionCue[];
  segments: TranscriptSegment[];
  fullText: string;
  fullCleanedText: string;
} {
  const cues = parseCaption(content);
  const segments = segmentCues(cues);
  const fullText = cues.map((c) => c.originalText).join(" ");
  const fullCleanedText = cues.map((c) => c.cleanedText).join(" ");

  return { cues, segments, fullText, fullCleanedText };
}
