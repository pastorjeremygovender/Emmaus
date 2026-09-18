export type DailyRhythmAccessRole = "user" | "admin" | "superAdmin";

/**
 * Admin authoring is a catalogue operation. Members may read every published
 * Daily Rhythm entry; calendar assignment controls today's progression, not
 * whether authored content can be opened.
 */
export function selectDailyRhythmSteps<T extends { day: number; status?: string }>(
  steps: T[],
  role: DailyRhythmAccessRole,
  _currentDay: number,
): T[] {
  if (role === "admin" || role === "superAdmin") return steps;
  return steps.filter((step) => step.status === "Published");
}