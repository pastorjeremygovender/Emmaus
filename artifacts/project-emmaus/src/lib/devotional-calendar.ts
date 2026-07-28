/**
 * devotional-calendar.ts — calendar-based unlock rules for Daily Devotionals.
 *
 * Day 1 is available on the day the member starts the series.
 * Day 2 becomes available on the next local calendar day.
 * Day N is available (N - 1) local calendar days after the start date.
 *
 * The calculation uses the member's local calendar date, not elapsed hours,
 * so a member who starts at 10 PM can read Day 2 after local midnight.
 *
 * In Development Mode all published entries are immediately unlocked.
 */

/**
 * Returns the day number the member currently has access to.
 *
 * @param startedAt       ISO timestamp or Date when the member started the series.
 * @param maxPublishedDay Highest day number that has a Published entry (0 → returns 1).
 * @param devMode         When true, bypasses the calendar lock — all days unlock immediately.
 */
export function calcAvailableDay(
  startedAt: string | Date,
  maxPublishedDay: number,
  devMode: boolean,
): number {
  const cap = Math.max(maxPublishedDay, 1);
  if (devMode) return cap;

  const startDate = toLocalDateString(new Date(startedAt));
  const todayDate = toLocalDateString(new Date());
  const daysDiff  = localDateDiff(startDate, todayDate);
  const available = daysDiff + 1;

  return Math.max(1, Math.min(available, cap));
}

/** Returns a YYYY-MM-DD string in the user's local timezone. */
export function toLocalDateString(d: Date): string {
  // en-CA locale reliably produces YYYY-MM-DD in every browser and Node environment.
  return d.toLocaleDateString('en-CA');
}

/** Whole calendar days between two YYYY-MM-DD strings (to - from, minimum 0). */
export function localDateDiff(from: string, to: string): number {
  const fromMs = new Date(from + 'T00:00:00').getTime();
  const toMs   = new Date(to   + 'T00:00:00').getTime();
  return Math.max(0, Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24)));
}
