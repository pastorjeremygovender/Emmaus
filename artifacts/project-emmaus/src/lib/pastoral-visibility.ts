import type { MeetingSession, UnifiedPerson } from './pastoral-api';

const TEST_PERSON_MARKERS = [
  '@test.invalid',
  'test-auth-',
  '__test__',
  'integration test',
  'itest-',
] as const;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isVisiblePastoralPerson(
  person: Pick<UnifiedPerson, 'fullName' | 'email'>,
): boolean {
  const identity = `${person.fullName ?? ''} ${person.email ?? ''}`.toLowerCase();
  return !TEST_PERSON_MARKERS.some(marker => identity.includes(marker));
}

export function filterVisiblePastoralPeople<T extends Pick<UnifiedPerson, 'fullName' | 'email'>>(
  people: T[],
): T[] {
  return people.filter(isVisiblePastoralPerson);
}

export function isValidPastoralSessionDate(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;

  const date = new Date(`${value}T12:00:00`);
  const [year, month, day] = value.split('-').map(Number);
  return !Number.isNaN(date.getTime())
    && date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
}

export function isVisiblePastoralSession(
  session: Pick<MeetingSession, 'sessionDate' | 'meetingTypeName'>,
): boolean {
  const meetingName = (session.meetingTypeName ?? '').trimStart().toLowerCase();
  return isValidPastoralSessionDate(session.sessionDate)
    && !meetingName.startsWith('test')
    && !meetingName.startsWith('__test__');
}

export function filterVisiblePastoralSessions<T extends Pick<MeetingSession, 'sessionDate' | 'meetingTypeName'>>(
  sessions: T[],
): T[] {
  return sessions.filter(isVisiblePastoralSession);
}