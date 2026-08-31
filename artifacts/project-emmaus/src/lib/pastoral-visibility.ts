import type { MeetingSession, UnifiedPerson } from '@/lib/pastoral-api';

/** Records created by automated integration/regression tests must never appear
 * in a pastor's working register. They remain in the database for testing. */
export function isPastoralRegisterPerson(person: UnifiedPerson): boolean {
  const identity = `${person.fullName} ${person.email ?? ''}`.toLowerCase();
  return !(
    identity.includes('@test.invalid') ||
    identity.includes('test-auth-') ||
    identity.includes('__test__') ||
    identity.includes('integration test') ||
    identity.includes('itest-')
  );
}

export function hasValidSessionDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
}

export function isPastoralSessionVisible(session: MeetingSession): boolean {
  const name = (session.meetingTypeName ?? '').trim().toLowerCase();
  return hasValidSessionDate(session.sessionDate) && !name.startsWith('test') && !name.startsWith('__test__');
}
