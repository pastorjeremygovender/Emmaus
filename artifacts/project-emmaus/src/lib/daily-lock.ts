/**
 * Daily lock utilities — calendar-day-based progress gating.
 *
 * "Completed today" uses the user's local calendar date (midnight boundary),
 * never a rolling 24-hour window.
 */

/** Returns today's date as 'YYYY-MM-DD' in the user's local timezone. */
export function localDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Returns true if the given ISO timestamp falls on today's local calendar date.
 * Uses toLocaleDateString so it respects the user's device timezone.
 */
export function isCompletedToday(lastCompletedAt: string | null | undefined): boolean {
  if (!lastCompletedAt) return false;
  const completed = new Date(lastCompletedAt).toLocaleDateString();
  const today = new Date().toLocaleDateString();
  return completed === today;
}

/**
 * Returns true if a journey's next new day is available.
 * For daily-locked journeys (core, devotional): the next new step only unlocks
 * on the following local calendar day after the last completion.
 */
export function isNextDayAvailable(lastCompletedAt: string | null | undefined): boolean {
  if (!lastCompletedAt) return true; // never started — always available
  return !isCompletedToday(lastCompletedAt);
}

/** Friendly "available tomorrow" label. */
export function availableTomorrowLabel(): string {
  return 'Available tomorrow';
}
