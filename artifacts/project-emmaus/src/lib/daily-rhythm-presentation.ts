import { accountStorageKey } from './account-storage';

export const DAILY_RHYTHM_PRESENTED_DAY_KEY = 'emmaus_daily_rhythm_presented_day_v1';

function markerKey(subject: string): string {
  return accountStorageKey(DAILY_RHYTHM_PRESENTED_DAY_KEY, subject);
}

export function getPresentedDailyRhythmDay(subject: string): number | null {
  if (!subject) return null;
  try {
    const raw = window.localStorage.getItem(markerKey(subject));
    if (raw === null || raw.trim() === '') return null;
    const day = Number(raw);
    return Number.isInteger(day) && day >= 1 ? day : null;
  } catch {
    return null;
  }
}

export function hasPresentedDailyRhythmDay(subject: string, assignedDay: number | null | undefined): boolean {
  return Number.isInteger(assignedDay) &&
    Number(assignedDay) >= 1 &&
    getPresentedDailyRhythmDay(subject) === Number(assignedDay);
}

export function rememberPresentedDailyRhythmDay(subject: string, assignedDay: number | null | undefined): void {
  if (!subject || !Number.isInteger(assignedDay) || Number(assignedDay) < 1) return;
  try {
    window.localStorage.setItem(markerKey(subject), String(assignedDay));
  } catch {
    // An unavailable cache must not change the server-authoritative opening flow.
  }
}