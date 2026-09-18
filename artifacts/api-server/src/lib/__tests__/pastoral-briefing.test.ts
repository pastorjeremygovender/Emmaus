import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BRIEFING_DEFAULTS,
  countConsecutiveMissed,
  evaluatePastoralBriefing,
  validatePastoralBriefingRules,
  type BriefingPersonRecord,
  type PastoralBriefingRules,
} from "../pastoral-briefing.ts";

const NOW = new Date("2026-09-01T12:00:00.000Z");

function person(overrides: Partial<BriefingPersonRecord> = {}): BriefingPersonRecord {
  return {
    personId: "person-1",
    personType: "emmaus_user",
    personName: "Alex Member",
    email: "alex@example.com",
    linkedUserId: "person-1",
    accountRole: "user",
    accountStatus: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastActivityAt: "2026-08-01T00:00:00.000Z",
    isVisitor: false,
    isLinked: true,
    hasActiveIdentity: true,
    missedServices: 0,
    stalledJourneys: [],
    ...overrides,
  };
}

function rules(overrides: Partial<PastoralBriefingRules> = {}): PastoralBriefingRules {
  return { ...BRIEFING_DEFAULTS, ...overrides };
}

describe("Pastoral Briefing Rules", () => {
  it("counts only the newest consecutive missed expected services", () => {
    assert.equal(countConsecutiveMissed([true, true, true]), 3);
    assert.equal(countConsecutiveMissed([true, true, false, true, true]), 2);
    assert.equal(countConsecutiveMissed([false, true]), 0);
  });

  it("accepts the inclusive validation boundaries and rejects out-of-range values", () => {
    const valid = validatePastoralBriefingRules({
      ...BRIEFING_DEFAULTS,
      missedServicesThreshold: 1,
      emmausInactivityDays: 90,
      stalledProgressDays: 1,
      newUserGracePeriodDays: 0,
    });
    assert.equal(valid.ok, true);

    const invalid = validatePastoralBriefingRules({
      ...BRIEFING_DEFAULTS,
      missedServicesThreshold: 13,
    });
    assert.equal(invalid.ok, false);
  });

  it("flags attendance at the threshold and does not flag below it", () => {
    const flagged = evaluatePastoralBriefing(
      rules({ emmausInactivityAlertsEnabled: false, stalledProgressAlertsEnabled: false }),
      [person({ missedServices: 3 })],
      NOW,
    );
    assert.deepEqual(flagged[0]?.flags.map(flag => flag.type), ["missed_attendance"]);

    const quiet = evaluatePastoralBriefing(
      rules({ emmausInactivityAlertsEnabled: false, stalledProgressAlertsEnabled: false }),
      [person({ missedServices: 2 })],
      NOW,
    );
    assert.equal(quiet.length, 0);
  });

  it("supports inactivity and stalled progress independently", () => {
    const result = evaluatePastoralBriefing(
      rules({ attendanceAlertsEnabled: false, emmausInactivityDays: 14, stalledProgressDays: 7 }),
      [person({
        lastActivityAt: "2026-08-01T00:00:00.000Z",
        stalledJourneys: [
          { title: "A Walk", lastActivityAt: "2026-08-20T00:00:00.000Z" },
          { title: "A recent Walk", lastActivityAt: "2026-08-30T00:00:00.000Z" },
        ],
      })],
      NOW,
    );
    assert.deepEqual(result[0]?.flags.map(flag => flag.type), ["emmaus_inactivity", "stalled_progress"]);
    assert.match(result[0]?.flags[1]?.detail ?? "", /A Walk/);
  });

  it("applies the grace period and every configured exclusion", () => {
    const excluded = [
      person({ personId: "new", createdAt: "2026-08-30T00:00:00.000Z" }),
      person({ personId: "inactive", accountStatus: "removed" }),
      person({ personId: "visitor", isVisitor: true }),
      person({ personId: "unlinked", isLinked: false }),
      person({ personId: "identity", hasActiveIdentity: false }),
      person({ personId: "admin", accountRole: "admin" }),
      person({ personId: "test", email: "fixture@example.test" }),
    ];
    assert.deepEqual(
      evaluatePastoralBriefing(
        rules({ attendanceAlertsEnabled: true, emmausInactivityAlertsEnabled: false, stalledProgressAlertsEnabled: false }),
        excluded.map(item => ({ ...item, missedServices: 3 })),
        NOW,
      ),
      [],
    );
  });

  it("does not treat a linked pastoral profile with unknown status as inactive", () => {
    const result = evaluatePastoralBriefing(
      rules({ emmausInactivityAlertsEnabled: false, stalledProgressAlertsEnabled: false }),
      [person({
        personType: "pastoral_person",
        personId: "pastoral-1",
        accountStatus: null,
        missedServices: 3,
      })],
      NOW,
    );
    assert.equal(result.length, 1);
    assert.equal(result[0]?.flags[0]?.type, "missed_attendance");
  });

  it("returns no flag for unstarted, completed, or excluded content supplied by the adapter", () => {
    const result = evaluatePastoralBriefing(
      rules({ attendanceAlertsEnabled: false, emmausInactivityAlertsEnabled: false }),
      [person({
        stalledJourneys: [],
      })],
      NOW,
    );
    assert.equal(result.length, 0);
  });
});