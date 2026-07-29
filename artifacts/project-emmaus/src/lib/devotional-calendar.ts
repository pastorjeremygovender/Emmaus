/**
 * devotional-calendar.ts — progression and action-label helpers for self-paced content.
 *
 * ═══ PACING RULE ════════════════════════════════════════════════════════════
 * Daily Devotionals are SELF-PACED.
 * Members advance by completing entries — not by waiting for the calendar.
 * Completing one entry immediately unlocks the next published entry.
 *
 * Daily Rhythm (10 Minutes with Jesus) remains CALENDAR-PACED; its gating
 * lives in daily-lock.ts and is unaffected by this module.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export type PacingMode = 'calendar-paced' | 'self-paced';

/**
 * Returns the pacing mode for a given journey/content type.
 *
 * Only Daily Rhythm (daily-rhythm / core legacy alias) is calendar-paced.
 * Everything else is self-paced by default.
 */
export function getPacingMode(contentType: string): PacingMode {
  if (contentType === 'daily-rhythm' || contentType === 'core') return 'calendar-paced';
  return 'self-paced';
}

/**
 * Self-paced available day — derived from the member's completed entries,
 * not the calendar.
 *
 * Rules:
 *   - If no days have been completed: day 1 is available.
 *   - After completing day N: day N+1 is immediately available.
 *   - Clamped to the highest published day number (cannot go beyond published content).
 *   - In Development Mode all published entries are immediately unlocked.
 *
 * @param completedDays    Array of day numbers the member has already completed.
 * @param maxPublishedDay  Highest day number with a Published entry (0 → returns 1).
 * @param devMode          When true bypasses the lock — all days unlock immediately.
 */
export function calcAvailableDaySelfPaced(
  completedDays: number[],
  maxPublishedDay: number,
  devMode: boolean,
): number {
  const cap = Math.max(maxPublishedDay, 1);
  if (devMode) return cap;
  if (completedDays.length === 0) return 1;
  const highest = Math.max(...completedDays);
  return Math.min(highest + 1, cap);
}

// ─── Action-label resolver ────────────────────────────────────────────────────

/**
 * Returns the single canonical green-button label for sequential content.
 *
 * Rule:
 *   self-paced  →  "Continue"  (always, regardless of started/in-progress/completed)
 *   calendar-paced (Daily Rhythm)  →  caller must supply its own state-aware label
 *
 * Usage:
 *   primaryActionLabel={getSelfPacedActionLabel(getPacingMode(journey.journeyType))}
 *   // or simply: primaryActionLabel="Continue"
 *   // for any place where the content is known to be self-paced at compile time.
 */
export function getSelfPacedActionLabel(mode: PacingMode = 'self-paced'): string {
  if (mode === 'self-paced') return 'Continue';
  // calendar-paced: caller (Daily Rhythm card) provides its own label — this is a safety fallback.
  return 'Continue';
}

// ─── Calendar helpers (kept for Daily Rhythm usage if ever needed) ────────────

/** Returns a YYYY-MM-DD string in the user's local timezone. */
export function toLocalDateString(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

/** Whole calendar days between two YYYY-MM-DD strings (to - from, minimum 0). */
export function localDateDiff(from: string, to: string): number {
  const fromMs = new Date(from + 'T00:00:00').getTime();
  const toMs   = new Date(to   + 'T00:00:00').getTime();
  return Math.max(0, Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24)));
}
