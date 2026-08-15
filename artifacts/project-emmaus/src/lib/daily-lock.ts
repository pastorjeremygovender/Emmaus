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
  // P2-10: use explicit YYYY-MM-DD format rather than toLocaleDateString()
  // which varies by environment/locale and produces brittle comparisons.
  const d = new Date(lastCompletedAt);
  const completedKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return completedKey === localDateKey();
}

/**
 * Always returns true — the next day is always available regardless of when
 * the last step was completed. Calendar-day gating has been removed.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function isNextDayAvailable(_lastCompletedAt: string | null | undefined): boolean {
  return true;
}

/** Friendly "available tomorrow" label. */
export function availableTomorrowLabel(): string {
  return 'Available tomorrow';
}
