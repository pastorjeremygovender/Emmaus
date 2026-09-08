/**
 * step-label.ts — single source of truth for step / day display labels.
 *
 * Rules (in priority order):
 *  1. If the step / entry has an explicit `displayLabel`, use it verbatim.
 *  2. Otherwise compute `"{prefix} {day}"` where `prefix` is:
 *       a. `journey.stepLabelPrefix` (when the admin has set one explicitly), or
 *       b. "Day"  for `journeyType === 'daily-rhythm'`
 *          "Step" for every other journey type.
 *
 * `getDevotionalLabel` follows the same rule for devotional entries;
 * devotional series always default to "Day" (they are date-keyed reading plans).
 *
 * Internal `day` integers are NEVER changed — routing, progress tracking, and
 * ordering all continue to use them. Only the rendered label changes.
 */

/**
 * Resolve the display label prefix for a journey's steps.
 * Returns the admin-configured prefix, or auto-derives one from journeyType.
 */
export function resolveStepPrefix(
  journey?: { journeyType?: string; stepLabelPrefix?: string | null } | null,
): string {
  if (journey?.stepLabelPrefix?.trim()) {
    return journey.stepLabelPrefix.trim();
  }
  // Auto-derive: Daily Rhythm keeps "Day"; walks and everything else uses "Step"
  return journey?.journeyType === 'daily-rhythm' ? 'Day' : 'Step';
}

/**
 * Compute the display label for a journey step.
 *
 * Returns `step.displayLabel` if set and non-empty; otherwise `"{prefix} {day}"`.
 */
export function getStepLabel(
  step: { day: number; displayLabel?: string | null },
  journey?: { journeyType?: string; stepLabelPrefix?: string | null } | null,
): string {
  if (step.displayLabel?.trim()) return step.displayLabel.trim();
  return `${resolveStepPrefix(journey)} ${step.day}`;
}

/**
 * Compute the display label for a devotional series entry.
 *
 * Returns `entry.displayLabel` if set and non-empty; otherwise `"Day {dayNumber}"`.
 * Devotional series always default to "Day" regardless of any series setting.
 */
export function getDevotionalLabel(
  entry: { dayNumber: number; displayLabel?: string | null },
): string {
  if (entry.displayLabel?.trim()) return entry.displayLabel.trim();
  return `Day ${entry.dayNumber}`;
}
