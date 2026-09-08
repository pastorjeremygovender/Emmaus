/**
 * The single client-side interpretation of Daily Rhythm calendar state.
 *
 * The server startup/state response is authoritative.  This module deliberately
 * does not inspect Date, localStorage, or progress timestamps.
 */
import type { DailyRhythmStartup, DailyRhythmState, Progress, Step } from '@/lib/journeys-api';

export type DailyRhythmHistoryStatus = 'Completed' | 'Open' | 'Missed';

export interface DailyRhythmResolution {
  currentDay: number;
  assignedDay: number;
  completedToday: boolean;
  currentStepCompleted: boolean;
  nextStepLocked: boolean;
  progress: Progress | null;
  localDate?: string | null;
  localTimezone?: string;
}

export function resolveDailyRhythmCalendar(
  startup?: DailyRhythmStartup | null,
  state?: DailyRhythmState | null,
): DailyRhythmResolution | null {
  const currentDay = state?.currentDayNumber ?? startup?.currentDay ?? startup?.assignedDay;
  const assignedDay = startup?.assignedDay ?? state?.currentDayNumber;
  if (typeof currentDay !== 'number' || !Number.isInteger(currentDay) ||
      typeof assignedDay !== 'number' || !Number.isInteger(assignedDay) ||
      currentDay < 1 || assignedDay < 1) {
    return null;
  }
  return {
    currentDay,
    assignedDay,
    completedToday: Boolean(startup?.completedToday),
    currentStepCompleted: Boolean(state?.currentStepCompleted ?? startup?.completedToday),
    nextStepLocked: Boolean(state?.nextStepLocked),
    progress: state?.progress ?? startup?.progress ?? null,
    localDate: state?.localDate ?? startup?.localDate,
    localTimezone: state?.localTimezone ?? startup?.localTimezone,
  };
}

/** History status is a display contract, not a guess based on browser time. */
export function dailyRhythmHistoryStatus(
  day: number,
  resolution: DailyRhythmResolution,
): DailyRhythmHistoryStatus {
  if (resolution.progress?.completedDays.includes(day)) return 'Completed';
  if (day === resolution.currentDay && !resolution.currentStepCompleted) return 'Open';
  return day < resolution.currentDay ? 'Missed' : 'Open';
}

/** Only published entries may be selected for a Daily Rhythm destination. */
export function publishedDailyRhythmStep(steps: Step[], day: number): Step | null {
  return steps.find(step => step.status === 'Published' && !step.isCompletionStep && step.day === day) ?? null;
}