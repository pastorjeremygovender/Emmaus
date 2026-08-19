import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import crypto from "node:crypto";
import { pool } from "@workspace/db";
import {
  canRemoveKnownAccountFixture,
  KNOWN_ACCOUNT_FIXTURE_EMAILS,
} from "../known-account-fixtures.ts";
import {
  createCareSignal,
  createMeetingType,
  createSession,
  getCareSignals,
  getRegister,
  listEmmausAccounts,
  listDiscipleshipSignals,
  listUnifiedPeople,
  upsertAttendance,
} from "../pastoral-store.ts";
import { getRecentActivity, getTodayStats } from "../dashboard-store.ts";

const nodeEnv = process.env.NODE_ENV;
if (nodeEnv === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error(
    "admin-account-source.test: refused to run in production/deployment environment",
  );
}
if (process.env.ALLOW_TEST_AUTH_HARNESS !== "1" || nodeEnv !== "test") {
  throw new Error(
    "admin-account-source.test: set NODE_ENV=test and ALLOW_TEST_AUTH_HARNESS=1",
  );
}

const { upsertVerifiedIdentity } = await import("../../routes/auth.ts");

const nonce = crypto.randomBytes(6).toString("hex");
const subjects = [
  `__TEST__-admin-account-${nonce}-alpha`,
  `__TEST__-admin-account-${nonce}-beta`,
];
const emails = [
  `test-admin-account-${nonce}-alpha@test.invalid`,
  `test-admin-account-${nonce}-beta@test.invalid`,
];
const legacyEmail = `test-admin-account-${nonce}-legacy@test.invalid`;

async function purgeTestRows(): Promise<void> {
  await pool.query(
    `DELETE FROM discipleship_signals WHERE person_id = ANY($1::text[])`,
    [subjects],
  );
  await pool.query(
    `DELETE FROM meeting_sessions WHERE created_by = ANY($1::text[])`,
    [subjects],
  );
  await pool.query(
    `DELETE FROM meeting_types WHERE created_by = ANY($1::text[])`,
    [subjects],
  );
  await pool.query(
    `DELETE FROM step_reflections WHERE user_id = ANY($1::text[])`,
    [subjects],
  );
  await pool.query(
    `DELETE FROM user_journey_progress WHERE user_id = ANY($1::text[])`,
    [subjects],
  );
  await pool.query(
    `DELETE FROM user_profiles
     WHERE auth_subject = ANY($1::text[]) OR email = $2`,
    [subjects, legacyEmail],
  );
  await pool.query(
    `DELETE FROM users WHERE id = ANY($1::text[])`,
    [subjects],
  );
}

describe("verified admin account source", () => {
  before(purgeTestRows);
  after(purgeTestRows);

  it("removes only exact, unverified, normal-role fixtures", () => {
    assert.ok(KNOWN_ACCOUNT_FIXTURE_EMAILS.includes("demo@emmaus.church"));
    assert.equal(KNOWN_ACCOUNT_FIXTURE_EMAILS.includes("sarah@example.com"), false);
    assert.equal(
      canRemoveKnownAccountFixture({
        email: "demo@emmaus.church",
        authSubject: null,
        appRole: "user",
      }),
      true,
    );
    assert.equal(
      canRemoveKnownAccountFixture({
        email: "demo@emmaus.church",
        authSubject: "verified-subject",
        appRole: "user",
      }),
      false,
    );
    assert.equal(
      canRemoveKnownAccountFixture({
        email: "demo@emmaus.church",
        authSubject: null,
        appRole: "admin",
      }),
      false,
    );
    assert.equal(
      canRemoveKnownAccountFixture({
        email: "demo@emmaus.church",
        authSubject: null,
        appRole: "user",
        hasAttachedData: true,
      }),
      false,
    );
    assert.equal(
      canRemoveKnownAccountFixture(
        {
          email: "demo@emmaus.church",
          authSubject: null,
          appRole: "user",
        },
        "demo@emmaus.church",
      ),
      false,
    );
    assert.equal(
      canRemoveKnownAccountFixture({
        email: "real.member@example.com",
        authSubject: null,
        appRole: "user",
      }),
      false,
    );
  });

  it("creates one profile per verified subject and keeps accounts, people, metrics, and activity subject-isolated", async () => {
    const beforeStats = await getTodayStats();

    await upsertVerifiedIdentity({
      sub: subjects[0],
      email: emails[0],
      email_verified: true,
      first_name: "Alpha",
    });
    const firstProfile = await pool.query<{ updated_at: Date }>(
      `SELECT updated_at FROM user_profiles WHERE auth_subject = $1`,
      [subjects[0]],
    );
    assert.equal(firstProfile.rows.length, 1);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await upsertVerifiedIdentity({
      sub: subjects[0],
      email: emails[0],
      email_verified: true,
      first_name: "Alpha",
    });
    await upsertVerifiedIdentity({
      sub: subjects[1],
      email: emails[1],
      email_verified: true,
      first_name: "Beta",
    });
    await pool.query(
      `INSERT INTO user_profiles (email, preferred_name)
       VALUES ($1, 'Legacy Invisible')`,
      [legacyEmail],
    );

    const alphaProfile = await pool.query<{
      count: string;
      updated_at: Date;
    }>(
      `SELECT COUNT(*)::text AS count, MAX(updated_at) AS updated_at
       FROM user_profiles
       WHERE auth_subject = $1`,
      [subjects[0]],
    );
    assert.equal(Number(alphaProfile.rows[0]?.count), 1);
    assert.ok(
      alphaProfile.rows[0]!.updated_at.getTime() >=
        firstProfile.rows[0]!.updated_at.getTime(),
      "repeat sign-in must refresh the existing profile",
    );

    const journey = await pool.query<{ id: string; title: string }>(
      `SELECT id, title FROM journeys ORDER BY created_at ASC LIMIT 1`,
    );
    assert.ok(journey.rows[0], "test requires at least one seeded journey");

    await pool.query(
      `INSERT INTO user_journey_progress
         (user_id, journey_id, current_day, completed_days, status)
       VALUES ($1, $2, 3, '[1,2]'::jsonb, 'active')`,
      [subjects[0], journey.rows[0].id],
    );
    await pool.query(
      `INSERT INTO step_reflections
         (user_id, journey_id, day, reflection)
       VALUES ($1, $2, 2, 'Subject-isolated test reflection')`,
      [subjects[0], journey.rows[0].id],
    );

    const accounts = await listEmmausAccounts();
    const alpha = accounts.find((account) => account.id === subjects[0]);
    const beta = accounts.find((account) => account.id === subjects[1]);
    assert.ok(alpha, "verified alpha account must be visible");
    assert.ok(beta, "verified beta account must be visible");
    assert.equal(
      accounts.some((account) => account.email === legacyEmail),
      false,
      "unverified legacy profile must stay hidden",
    );
    assert.equal(alpha.currentJourneyId, journey.rows[0].id);
    assert.equal(alpha.currentJourneyTitle, journey.rows[0].title);
    assert.equal(alpha.currentDay, 3);
    assert.equal(alpha.reflectionCount, 1);
    assert.equal(beta.currentJourneyId, null);
    assert.equal(beta.reflectionCount, 0);

    const meetingType = await createMeetingType({
      name: `__TEST__ Subject identity ${nonce}`,
      careSignalEnabled: true,
      createdBy: subjects[0],
    });
    const meetingSession = await createSession({
      meetingTypeId: meetingType.id,
      sessionDate: new Date().toISOString().slice(0, 10),
      createdBy: subjects[0],
    });
    await upsertAttendance({
      sessionId: meetingSession.id,
      personId: subjects[0],
      personType: "emmaus_user",
      status: "present",
      recordedBy: subjects[0],
    });
    // Historical attendance rows may still use email; keep them resolvable
    // while all new records use the immutable subject.
    await upsertAttendance({
      sessionId: meetingSession.id,
      personId: emails[1],
      personType: "emmaus_user",
      status: "present",
      recordedBy: subjects[0],
    });

    const register = await getRegister(meetingSession.id);
    assert.equal(
      register.find((record) => record.personId === subjects[0])?.personName,
      "Alpha",
    );
    assert.equal(
      register.find((record) => record.personId === emails[1])?.personName,
      "Beta",
      "historical email-keyed attendance must remain readable",
    );

    await createCareSignal({
      personId: subjects[0],
      personType: "emmaus_user",
      sessionId: meetingSession.id,
    });
    const careSignals = await getCareSignals({
      includesDismissed: true,
      personId: subjects[0],
      personType: "emmaus_user",
    });
    assert.equal(careSignals[0]?.personName, "Alpha");

    await pool.query(
      `INSERT INTO discipleship_signals
         (id, church_id, person_id, person_type, category, signal_type, title, explanation)
       VALUES ($1, 'icc', $2, 'emmaus_user', 'growth', $3, 'Test growth', 'Identity join test')`,
      [
        crypto.randomUUID(),
        subjects[0],
        `__TEST__-subject-identity-${nonce}`,
      ],
    );
    const discipleshipSignals = await listDiscipleshipSignals({
      personId: subjects[0],
      personType: "emmaus_user",
    });
    assert.equal(discipleshipSignals[0]?.personName, "Alpha");

    const recentActivity = await getRecentActivity(200);
    assert.ok(
      recentActivity.some(
        (item) => item.type === "walk_progress" && item.personName === "Alpha",
      ),
      "subject-keyed walk activity must resolve the member name",
    );
    assert.ok(
      recentActivity.some(
        (item) => item.type === "attendance" && item.personName === "Alpha",
      ),
      "subject-keyed attendance activity must resolve the member name",
    );
    assert.ok(
      recentActivity.some(
        (item) => item.type === "attendance" && item.personName === "Beta",
      ),
      "historical email-keyed attendance activity must remain readable",
    );

    const people = await listUnifiedPeople();
    assert.ok(people.some((person) => person.id === subjects[0]));
    assert.ok(people.some((person) => person.id === subjects[1]));
    assert.equal(
      people.some((person) => person.email === legacyEmail),
      false,
      "All People must use the same verified population",
    );

    const afterStats = await getTodayStats();
    assert.equal(
      afterStats.newPeopleThisWeek.emmausAccounts,
      beforeStats.newPeopleThisWeek.emmausAccounts + 2,
      "dashboard account count must match verified account creation only",
    );
  });
});