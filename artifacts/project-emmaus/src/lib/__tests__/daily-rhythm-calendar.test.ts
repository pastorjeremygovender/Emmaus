import { describe, expect, it } from 'vitest';
import {
  dailyRhythmHistoryStatus,
  publishedDailyRhythmStep,
  resolveDailyRhythmCalendar,
} from '@/lib/daily-rhythm-calendar';

describe('Daily Rhythm calendar contract', () => {
  it('uses the authoritative state instead of browser time or cached progress', () => {
    const resolution = resolveDailyRhythmCalendar(
      {
        state: 'OPENING_REQUIRED',
        destination: '/daily-rhythm/day/4',
        assignedDay: 4,
        todayAvailableDay: 4,
        currentDay: 4,
        completedToday: false,
        openingState: 'OPENING_REQUIRED',
        progress: {
          journeyId: 'rhythm',
          currentDay: 1,
          completedDays: [],
          startedAt: '2026-01-01T00:00:00.000Z',
          lastCompletedAt: null,
        },
        journeyId: 'rhythm',
        targetStepId: 'step-4',
        localTimezone: 'Africa/Johannesburg',
        localDate: '2026-01-04',
        reason: 'daily_rhythm_due',
        decisionId: 'decision-4',
        launchSessionId: 'session-4',
      },
      null,
    );

    expect(resolution?.currentDay).toBe(4);
    expect(resolution?.assignedDay).toBe(4);
    expect(resolution?.progress?.currentDay).toBe(1);
  });

  it('keeps a completed day current until the next server calendar decision', () => {
    const resolution = resolveDailyRhythmCalendar(null, {
      journeyId: 'rhythm',
      currentStepId: 'step-2',
      currentDayNumber: 2,
      currentStepTitle: 'Day Two',
      currentStepCompleted: true,
      completedStepIds: ['step-1', 'step-2'],
      availableStepIds: ['step-1', 'step-2'],
      reviewableStepIds: ['step-1', 'step-2'],
      nextStepLocked: true,
      nextEligibleUnlockDate: '2026-01-03',
      todayAvailableDay: 2,
      assignedDay: 2,
      openingState: 'COMPLETED',
      localTimezone: 'Africa/Johannesburg',
      localDate: '2026-01-02',
      progress: {
        journeyId: 'rhythm',
        currentDay: 2,
        completedDays: [1, 2],
        startedAt: '2026-01-01T00:00:00.000Z',
        lastCompletedAt: '2026-01-02T08:00:00.000Z',
      },
    });

    expect(resolution?.currentDay).toBe(2);
    expect(resolution?.completedToday).toBe(false);
    expect(resolution?.currentStepCompleted).toBe(true);
    expect(resolution?.nextStepLocked).toBe(true);
  });

  it('represents missed and opened history without blocking review', () => {
    const resolution = {
      currentDay: 4,
      assignedDay: 4,
      completedToday: false,
      currentStepCompleted: false,
      nextStepLocked: false,
      progress: {
        journeyId: 'rhythm',
        currentDay: 4,
        completedDays: [1],
        startedAt: '2026-01-01T00:00:00.000Z',
        lastCompletedAt: '2026-01-01T08:00:00.000Z',
      },
    };

    expect(dailyRhythmHistoryStatus(1, resolution)).toBe('Completed');
    expect(dailyRhythmHistoryStatus(2, resolution)).toBe('Open');
    expect(dailyRhythmHistoryStatus(4, resolution)).toBe('Open');
  });

  it('never selects a draft or completion entry for a member destination', () => {
    const steps = [
      { day: 8, status: 'Draft' },
      { day: 9, status: 'Published', isCompletionStep: true },
      { day: 10, status: 'Published' },
    ] as never[];

    expect(publishedDailyRhythmStep(steps, 8)).toBeNull();
    expect(publishedDailyRhythmStep(steps, 9)).toBeNull();
  });
});