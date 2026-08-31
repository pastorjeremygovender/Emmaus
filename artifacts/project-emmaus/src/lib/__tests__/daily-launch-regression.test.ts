import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('does not make a Daily Rhythm decision from client progress or browser date', () => {
    const route = resolveDailyOpenRoute(
      'member-a',
      journeys,
      { 'daily-rhythm-id': { currentDay: 3, completedDays: [1, 2] } },
      () => steps,
    );

    expect(route).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('does not let a stale marker change the server-owned result', () => {
    localStorage.setItem('emmaus_account:member-a:emmaus_last_opened_v3', '2026-08-23');
    expect(resolveDailyOpenRoute('member-a', journeys, {}, () => steps)).toBeNull();
    expect(localStorage.getItem('emmaus_account:member-a:emmaus_last_opened_v3')).toBe('2026-08-23');
  });

  it('does not create a marker after a compatibility call', () => {
    resolveDailyOpenRoute('member-a', journeys, {}, () => steps);
    vi.setSystemTime(new Date('2026-08-24T07:00:00'));
    expect(localStorage.length).toBe(0);
  });

  it('defers missing content and progress handling to the server', () => {
    expect(resolveDailyOpenRoute('member-a', [], {}, () => steps)).toBeNull();
    expect(resolveDailyOpenRoute('member-a', journeys, {}, () => [])).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('does not use another member’s marker', () => {
    localStorage.setItem(
      'emmaus_account:member-a:emmaus_last_opened_v3',
      '2026-08-23',
    );

    expect(resolveDailyOpenRoute('member-b', journeys, {}, () => steps)).toBeNull();
  });
});