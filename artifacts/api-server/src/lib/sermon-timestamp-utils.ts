/**
 * sermon-timestamp-utils.ts — Pure helpers for building sermon companion timestamp links.
 *
 * Extracted into a separate file so unit tests can import these with
 * Node's --experimental-strip-types (which cannot handle the class constructor
 * parameter properties elsewhere in sermon-generator.ts).
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface TimedCue {
  /** Absolute seconds from start of the full recording. */
  startSecs: number;
  text: string;
  /** Optional — present in fully-parsed VTT cues; may be absent for plain-text segments. */
  endSecs?: number;
  vttLine?: string;
}

// ─── buildSermonLink ──────────────────────────────────────────────────────────

/**
 * Build a timestamped sermon link from a videoId and start time in seconds.
 *
 * - If videoId is provided → YouTube URL with ?t= fragment (absolute seconds, correct for YouTube)
 * - If videoId is absent   → plain "MM:SS" string that is absolute in the full uploaded audio
 *   file. `startSeconds` is the AI's 0-based estimate relative to the trimmed sermon transcript;
 *   adding `sermonStartSecs` converts it to an absolute offset into the full recording so the
 *   member audio player seeks the right moment.
 * - Returns '' when startSeconds is missing or invalid
 *
 * Contract: YouTube URL stores ABSOLUTE seconds from start of recording.
 *           MM:SS stores ABSOLUTE seconds from start of the full uploaded audio file.
 *
 * Note: `sermonLink` is NOT populated for audio-first companions (no VTT cues) because
 *       without real timestamps the AI's estimates are too unreliable — see generateCompanion.
 *       This function is called only when `hasRealTimestamps` is true.
 */
export function buildSermonLink(
  videoId: string,
  startSeconds: number | null | undefined,
  sermonStartSecs?: number | null,
): string {
  if (startSeconds == null || !isFinite(startSeconds) || startSeconds < 0) return '';
  const secs = Math.floor(startSeconds);
  if (!videoId) {
    // Add the sermon start offset so the stored value is absolute in the full audio recording.
    // Audio-first AI estimates are 0-based relative to the already-trimmed transcript;
    // adding sermonStartSecs converts them to absolute seconds in the original uploaded file.
    const absSecs = secs + Math.floor(sermonStartSecs ?? 0);
    const m = Math.floor(absSecs / 60);
    const s = absSecs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  // YouTube: keep absolute seconds — ?t= deep-links into the full video correctly.
  return `https://www.youtube.com/watch?v=${videoId}&t=${secs}s`;
}

// ─── buildSermonTimeline ──────────────────────────────────────────────────────

/**
 * Build a compact list of timed landmark points from VTT cues that fall within
 * the sermon section. Each landmark is ~2 minutes apart and carries the actual
 * seconds value from the caption track so the companion generator can anchor
 * `sources[0].startSeconds` to real timestamps rather than guessing.
 *
 * Returns an empty array when no timedCues are available.
 */
export function buildSermonTimeline(
  timedCues: TimedCue[],
  sermonStartSecs: number | null,
  sermonEndSecs: number | null,
): Array<{ secs: number; mmss: string; preview: string }> {
  if (!timedCues.length) return [];

  const from = sermonStartSecs ?? 0;
  const to   = sermonEndSecs   ?? Infinity;
  const INTERVAL_SECS = 120; // landmark every ~2 minutes

  const relevant = timedCues.filter(c => c.startSecs >= from && c.startSecs <= to);
  if (!relevant.length) return [];

  const landmarks: Array<{ secs: number; mmss: string; preview: string }> = [];
  let lastSecs = from - INTERVAL_SECS; // ensure first relevant cue is always included

  for (const cue of relevant) {
    if (cue.startSecs - lastSecs >= INTERVAL_SECS) {
      const m = Math.floor(cue.startSecs / 60);
      const s = Math.floor(cue.startSecs % 60);
      landmarks.push({
        secs:    cue.startSecs,
        mmss:    `${m}:${String(s).padStart(2, '0')}`,
        preview: cue.text.split(/\s+/).slice(0, 10).join(' '),
      });
      lastSecs = cue.startSecs;
    }
  }

  return landmarks;
}
