import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountStorageKey } from '@/lib/account-storage';
import { resolveDailyOpenRoute } from '@/lib/entry-route';

describe('Daily Rhythm launch contract', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-23T07:00:00'));
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  const journeys = [{ id: 'daily-rhythm-id', journeyType: 'daily-rhythm' }];
  const steps = [{ day: 1 }, { day: 2 }, { day: 3 }, { day: 4 }];

  it('opens the member current step on the first opening of a new day', () => {
    const route = resolveDailyOpenRoute(
      'member-a',
      journeys,
      { 'daily-rhythm-id': { currentDay: 3, completedDays: [1, 2] } },
      () => steps,
    );

    expect(route).toBe('/daily-rhythm/day/3');
    expect(localStorage.getItem(accountStorageKey('emmaus_last_opened_v3', 'member-a')))
      .toBe('2026-08-23');
  });

  it('falls back to Today’s Steps on later same-day openings', () => {
    const key = accountStorageKey('emmaus_last_opened_v3', 'member-a');
    localStorage.setItem(key, '2026-08-23');

    expect(resolveDailyOpenRoute('member-a', journeys, {}, () => steps)).toBeNull();
    expect(localStorage.getItem(key)).toBe('2026-08-23');
  });

  it('opens again on the first entry of the following day', () => {
    const key = accountStorageKey('emmaus_last_opened_v3', 'member-a');
    localStorage.setItem(key, '2026-08-23');
    vi.setSystemTime(new Date('2026-08-24T07:00:00'));

    expect(resolveDailyOpenRoute(
      'member-a',
      journeys,
      { 'daily-rhythm-id': { currentDay: 4, completedDays: [1, 2, 3] } },
      () => steps,
    )).toBe('/daily-rhythm/day/4');
    expect(localStorage.getItem(key)).toBe('2026-08-24');
  });

  it('does not consume the daily opening when auth data is incomplete', () => {
    const key = accountStorageKey('emmaus_last_opened_v2', 'member-a');

    expect(resolveDailyOpenRoute('member-a', [], {}, () => steps)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();

    expect(resolveDailyOpenRoute('member-a', journeys, {}, () => [])).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();

    expect(resolveDailyOpenRoute(
      'member-a',
      journeys,
      { 'daily-rhythm-id': { currentDay: 2 } },
      () => steps,
    )).toBe('/daily-rhythm/day/2');
  });

  it('keeps the opening marker isolated per member', () => {
    localStorage.setItem(
      accountStorageKey('emmaus_last_opened_v3', 'member-a'),
      '2026-08-23',
    );

    expect(resolveDailyOpenRoute(
      'member-b',
      journeys,
      { 'daily-rhythm-id': { currentDay: 2 } },
      () => steps,
    )).toBe('/daily-rhythm/day/2');
  });
});