/**
 * Pure rules and evaluation helpers for the church-wide pastoral briefing.
 *
 * This module deliberately has no database access. The database adapter supplies
 * observable records, while this file owns validation and the exact flagging
 * semantics used by both preview and Today.
 */

export const BRIEFING_DEFAULTS = {
  attendanceAlertsEnabled: true,
  missedServicesThreshold: 3,
  emmausInactivityAlertsEnabled: true,
  emmausInactivityDays: 14,
  stalledProgressAlertsEnabled: true,
  stalledProgressDays: 7,
  newUserGracePeriodDays: 7,
  excludeTestAccounts: true,
  excludeInactiveAccounts: true,
  excludeVisitors: true,
  excludeUnlinkedProfiles: true,
  excludeChurchAdministrators: true,
  excludeWithoutActiveIdentity: true,
} as const;

export type PastoralBriefingRules = {
  attendanceAlertsEnabled: boolean;
  missedServicesThreshold: number;
  emmausInactivityAlertsEnabled: boolean;
  emmausInactivityDays: number;
  stalledProgressAlertsEnabled: boolean;
  stalledProgressDays: number;
  newUserGracePeriodDays: number;
  excludeTestAccounts: boolean;
  excludeInactiveAccounts: boolean;
  excludeVisitors: boolean;
  excludeUnlinkedProfiles: boolean;
  excludeChurchAdministrators: boolean;
  excludeWithoutActiveIdentity: boolean;
};

export type BriefingPersonRecord = {
  personId: string;
  personType: "emmaus_user" | "pastoral_person";
  personName: string;
  email: string | null;
  linkedUserId: string | null;
  accountRole: "user" | "admin" | "superAdmin" | null;
  accountStatus: "active" | "removed" | null;
  createdAt: string | null;
  lastActivityAt: string | null;
  isVisitor: boolean;
  isLinked: boolean;
  hasActiveIdentity: boolean;
  missedServices: number;
  stalledJourneys: Array<{ title: string; lastActivityAt: string | null }>;
};

export type BriefingFlag = {
  type: "missed_attendance" | "emmaus_inactivity" | "stalled_progress";
  label: string;
  detail: string;
};

export type EvaluatedBriefingPerson = {
  personId: string;
  personType: "emmaus_user" | "pastoral_person";
  personName: string;
  flags: BriefingFlag[];
};

export function validatePastoralBriefingRules(
  candidate: unknown,
): { ok: true; value: PastoralBriefingRules } | { ok: false; error: string } {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { ok: false, error: "Briefing rules must be an object." };
  }

  const input = candidate as Record<string, unknown>;
  const booleanKeys: Array<keyof PastoralBriefingRules> = [
    "attendanceAlertsEnabled",
    "emmausInactivityAlertsEnabled",
    "stalledProgressAlertsEnabled",
    "excludeTestAccounts",
    "excludeInactiveAccounts",
    "excludeVisitors",
    "excludeUnlinkedProfiles",
    "excludeChurchAdministrators",
    "excludeWithoutActiveIdentity",
  ];
  for (const key of booleanKeys) {
    if (typeof input[key] !== "boolean") {
      return { ok: false, error: `${key} must be true or false.` };
    }
  }

  const ranges: Array<[keyof PastoralBriefingRules, number, number]> = [
    ["missedServicesThreshold", 1, 12],
    ["emmausInactivityDays", 1, 90],
    ["stalledProgressDays", 1, 90],
    ["newUserGracePeriodDays", 0, 90],
  ];
  for (const [key, min, max] of ranges) {
    const value = input[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
      return { ok: false, error: `${key} must be a whole number from ${min} to ${max}.` };
    }
  }

  return {
    ok: true,
    value: {
      attendanceAlertsEnabled: input.attendanceAlertsEnabled as boolean,
      missedServicesThreshold: input.missedServicesThreshold as number,
      emmausInactivityAlertsEnabled: input.emmausInactivityAlertsEnabled as boolean,
      emmausInactivityDays: input.emmausInactivityDays as number,
      stalledProgressAlertsEnabled: input.stalledProgressAlertsEnabled as boolean,
      stalledProgressDays: input.stalledProgressDays as number,
      newUserGracePeriodDays: input.newUserGracePeriodDays as number,
      excludeTestAccounts: input.excludeTestAccounts as boolean,
      excludeInactiveAccounts: input.excludeInactiveAccounts as boolean,
      excludeVisitors: input.excludeVisitors as boolean,
      excludeUnlinkedProfiles: input.excludeUnlinkedProfiles as boolean,
      excludeChurchAdministrators: input.excludeChurchAdministrators as boolean,
      excludeWithoutActiveIdentity: input.excludeWithoutActiveIdentity as boolean,
    },
  };
}

export function evaluatePastoralBriefing(
  rules: PastoralBriefingRules,
  people: BriefingPersonRecord[],
  now = new Date(),
): EvaluatedBriefingPerson[] {
  const currentTime = now.getTime();
  const result: EvaluatedBriefingPerson[] = [];

  for (const person of people) {
    if (
      (rules.excludeInactiveAccounts && person.accountStatus !== null && person.accountStatus !== "active") ||
      (rules.excludeVisitors && person.isVisitor) ||
      (rules.excludeUnlinkedProfiles && !person.isLinked) ||
      (rules.excludeWithoutActiveIdentity && !person.hasActiveIdentity) ||
      (rules.excludeChurchAdministrators && (person.accountRole === "admin" || person.accountRole === "superAdmin")) ||
      (rules.excludeTestAccounts && isTestAccount(person.email, person.personName)) ||
      isWithinGracePeriod(person.createdAt, rules.newUserGracePeriodDays, currentTime)
    ) {
      continue;
    }

    const flags: BriefingFlag[] = [];
    if (rules.attendanceAlertsEnabled && person.missedServices >= rules.missedServicesThreshold) {
      flags.push({
        type: "missed_attendance",
        label: "Missed expected services",
        detail: `Missed ${person.missedServices} consecutive expected services.`,
      });
    }

    const daysSinceActivity = daysSince(person.lastActivityAt, currentTime);
    if (
      rules.emmausInactivityAlertsEnabled &&
      person.lastActivityAt &&
      daysSinceActivity >= rules.emmausInactivityDays
    ) {
      flags.push({
        type: "emmaus_inactivity",
        label: "Emmaus inactivity",
        detail: `No meaningful Emmaus activity for ${daysSinceActivity} days.`,
      });
    }

    if (rules.stalledProgressAlertsEnabled) {
      const stalled = person.stalledJourneys.filter(
        journey => daysSince(journey.lastActivityAt, currentTime) >= rules.stalledProgressDays,
      );
      if (stalled.length > 0) {
        flags.push({
          type: "stalled_progress",
          label: "Stalled Walk or Journey",
          detail: stalled.length === 1
            ? `"${stalled[0].title}" has had no progress for ${daysSince(stalled[0].lastActivityAt, currentTime)} days.`
            : `${stalled.length} active Walks or Journeys have had no progress recently.`,
        });
      }
    }

    if (flags.length > 0) {
      result.push({
        personId: person.personId,
        personType: person.personType,
        personName: person.personName || "Person",
        flags,
      });
    }
  }

  return result.sort((a, b) => a.personName.localeCompare(b.personName));
}

/** Counts the current run from the newest attendance record; presence breaks it. */
export function countConsecutiveMissed(statuses: readonly boolean[]): number {
  let count = 0;
  for (const missed of statuses) {
    if (!missed) break;
    count++;
  }
  return count;
}

function daysSince(value: string | null, now: number): number {
  if (!value) return 99999;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 99999;
  return Math.max(0, Math.floor((now - timestamp) / 86_400_000));
}

function isWithinGracePeriod(value: string | null, days: number, now: number): boolean {
  if (!value || days === 0) return false;
  const createdAt = new Date(value).getTime();
  return Number.isFinite(createdAt) && Math.max(0, now - createdAt) < days * 86_400_000;
}

function isTestAccount(email: string | null, name: string): boolean {
  const value = `${email ?? ""} ${name}`.toLowerCase();
  return /\b(test|fixture|demo|preview)\b/.test(value) || value.includes("__test__");
}