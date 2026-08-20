import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  accountStorageKey,
  clearSessionAccountState,
  retireUnownedPersonalStorage,
  roomSessionAckKey,
} from '@/lib/account-storage';
import { isOnboarded, markOnboarded } from '@/lib/onboarding';
import { resolveDailyOpenRoute } from '@/lib/entry-route';

const SUBJECT_A = 'subject-a';
const SUBJECT_B = 'subject-b';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-20T09:00:00'));
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('verified-account browser storage isolation', () => {
  it('creates different owned keys for different verified subjects', () => {
    const first = accountStorageKey('emmaus_bible_notes', SUBJECT_A);
    const second = accountStorageKey('emmaus_bible_notes', SUBJECT_B);

    expect(first).not.toBe(second);
    expect(first).toContain(SUBJECT_A);
    expect(second).toContain(SUBJECT_B);
    expect(roomSessionAckKey(SUBJECT_A, 'session-1')).not.toBe(
      roomSessionAckKey(SUBJECT_B, 'session-1'),
    );
  });

  it('never treats another account as onboarded', () => {
    markOnboarded(SUBJECT_A);

    expect(isOnboarded(SUBJECT_A)).toBe(true);
    expect(isOnboarded(SUBJECT_B)).toBe(false);
  });

  it('tracks the daily-open marker separately for each account', () => {
    const journeys = [{ id: 'daily', journeyType: 'daily-rhythm' }];
    const progress = { daily: { currentDay: 4, completedDays: [1, 2, 3] } };
    const getSteps = () => [1, 2, 3, 4, 5].map(day => ({ day }));

    expect(resolveDailyOpenRoute(SUBJECT_A, journeys, progress, getSteps))
      .toBe('/daily-rhythm/day/4');
    expect(resolveDailyOpenRoute(SUBJECT_A, journeys, progress, getSteps))
      .toBeNull();
    expect(resolveDailyOpenRoute(SUBJECT_B, journeys, progress, getSteps))
      .toBe('/daily-rhythm/day/4');
  });

  it('opens Daily Rhythm again on the first open of a new local calendar day', () => {
    const journeys = [{ id: 'daily', journeyType: 'daily-rhythm' }];
    const progress = { daily: { currentDay: 4, completedDays: [1, 2, 3] } };
    const getSteps = () => [1, 2, 3, 4, 5].map(day => ({ day }));
    const dailyOpenKey = accountStorageKey('emmaus_last_opened_v2', SUBJECT_A);

    expect(resolveDailyOpenRoute(SUBJECT_A, journeys, progress, getSteps))
      .toBe('/daily-rhythm/day/4');
    expect(localStorage.getItem(dailyOpenKey)).toBe('2026-08-20');
    expect(resolveDailyOpenRoute(SUBJECT_A, journeys, progress, getSteps))
      .toBeNull();

    vi.setSystemTime(new Date('2026-08-21T09:00:00'));

    expect(resolveDailyOpenRoute(SUBJECT_A, journeys, progress, getSteps))
      .toBe('/daily-rhythm/day/4');
    expect(localStorage.getItem(dailyOpenKey)).toBe('2026-08-21');
  });

  it('retires unowned legacy personal state without deleting owned caches', () => {
    localStorage.setItem('emmaus_progress', '{"daily":{"currentDay":9}}');
    localStorage.setItem('emmaus_bible_notes', '[{"text":"private"}]');
    localStorage.setItem('emmaus_audio_pos_/sermon.mp3', '120');
    const owned = accountStorageKey('emmaus_bible_notes', SUBJECT_A);
    localStorage.setItem(owned, '[{"text":"owned"}]');

    retireUnownedPersonalStorage();

    expect(localStorage.getItem('emmaus_progress')).toBeNull();
    expect(localStorage.getItem('emmaus_bible_notes')).toBeNull();
    expect(localStorage.getItem('emmaus_audio_pos_/sermon.mp3')).toBeNull();
    expect(localStorage.getItem(owned)).toBe('[{"text":"owned"}]');
  });

  it('clears account-transient session state on sign-out or subject replacement', () => {
    sessionStorage.setItem('emmaus_return_destination', '/personal');
    sessionStorage.setItem('emmaus_splash_shown', 'true');
    sessionStorage.setItem('pendingInviteToken', 'invite');
    sessionStorage.setItem('unrelated', 'keep');

    clearSessionAccountState();

    expect(sessionStorage.getItem('emmaus_return_destination')).toBeNull();
    expect(sessionStorage.getItem('emmaus_splash_shown')).toBeNull();
    expect(sessionStorage.getItem('pendingInviteToken')).toBeNull();
    expect(sessionStorage.getItem('unrelated')).toBe('keep');
  });
});