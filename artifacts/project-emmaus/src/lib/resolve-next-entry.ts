/**
 * resolve-next-entry — platform-wide Continue rule.
 *
 * Emmaus rule (spec-locked — permanent):
 *   "A user must NEVER be shown a Continue button unless a valid next item exists."
 *
 * Every sequential content type (Daily Devotionals, Sermon Companions, Journeys,
 * and any future type) must use these helpers to enforce the rule.
 * No page may duplicate this logic inline.
 *
 * Usage:
 *   resolveNextEntry — Devotionals, Sermon Companions  (field: dayNumber)
 *   resolveNextStep  — Journeys                        (field: day)
 */

/**
 * Returns the next published entry after `currentDay`, or `null` if none exists.
 *
 * For content types whose entries carry a `dayNumber` field:
 * Daily Devotionals, Sermon Companions (and any future type with `dayNumber`).
 *
 * @param entries    Full list of entries — may include unpublished
 * @param currentDay The day the member just completed
 */
export function resolveNextEntry<T extends { dayNumber: number; status: string }>(
  entries: T[],
  currentDay: number,
): T | null {
  return (
    entries
      .filter(e => e.status === 'Published' && e.dayNumber > currentDay)
      .sort((a, b) => a.dayNumber - b.dayNumber)[0] ?? null
  );
}

/**
 * Returns the next published step after `currentDay`, or `null` if none exists.
 *
 * For Journeys, whose steps carry a `day` field (not `dayNumber`).
 * Members only receive Published steps from the API, but this helper explicitly
 * guards against Draft steps in case the caller passes an unfiltered list.
 *
 * @param steps      Full list of steps for the journey — may include unpublished
 * @param currentDay The day the member just completed
 */
export function resolveNextStep<T extends { day: number; status: string }>(
  steps: T[],
  currentDay: number,
): T | null {
  return (
    steps
      .filter(s => s.status === 'Published' && s.day > currentDay)
      .sort((a, b) => a.day - b.day)[0] ?? null
  );
}
