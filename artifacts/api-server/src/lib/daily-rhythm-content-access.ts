export type DailyRhythmAccessRole = "user" | "admin" | "superAdmin";

/**
 * Admin authoring is a catalogue operation. Members are still limited to the
 * days made available by their server-side progression state.
 */
export function selectDailyRhythmSteps<T extends { day: number }>(
  steps: T[],
  role: DailyRhythmAccessRole,
  currentDay: number,
): T[] {
  if (role === "admin" || role === "superAdmin") return steps;
  return steps.filter((step) => step.day <= currentDay);
}