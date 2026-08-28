/**
 * Database-backed Ask Emmaus release acceptance matrix.
 *
 * This suite deliberately uses real verified test identities and the
 * publication-aware stores. It does not mock the catalogue or pass logical
 * test keys into application resolvers as if they were authenticated IDs.
 *
 * Run with:
 *   NODE_ENV=test ALLOW_TEST_AUTH_HARNESS=1 \
 *   node --test --import=tsx/esm \
 *   src/emmaus/__tests__/multi-user-acceptance.test.ts
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, describe, it } from "node:test";
import { pool } from "@workspace/db";
import {
  authHeader,
  cleanupTestAuth,
  testUserIdFor,
} from "../../test-utils/test-auth.ts";
import { createJourney, createStep } from "../../lib/journey-store.ts";
import {
  db,
  devotionalEntriesTable,
  devotionalProgressTable,
  devotionalSeriesTable,
} from "@workspace/db";
import { buildEmmausResourceCatalogue, type EmmausResource } from "../resource-catalogue.ts";
import { resolveCanonicalAskRequest } from "../canonical-tools.ts";
import { actionsForResource, resolveCatalogueAction } from "../action-registry.ts";

const RUN_TAG = `${Date.now()}-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
const MEMBER_A = `multi-user-acceptance-a-${RUN_TAG}`;
const MEMBER_B = `multi-user-acceptance-b-${RUN_TAG}`;

const WALK_ID = `__test-emmaus-acceptance-walk-${RUN_TAG}`;
const JOURNEY_ID = `__test-emmaus-acceptance-journey-${RUN_TAG}`;
const STUDY_ID = `__test-emmaus-acceptance-study-${RUN_TAG}`;
const RHYTHM_ID = `__test-emmaus-acceptance-rhythm-${RUN_TAG}`;
const DEVOTIONAL_ID = crypto.randomUUID();
const DEVOTIONAL_ENTRY_1 = crypto.randomUUID();
const DEVOTIONAL_ENTRY_2 = crypto.randomUUID();

let memberAId = "";
let memberBId = "";

async function metadataFor(message: string, userId: string) {
  const result = await resolveCanonicalAskRequest(message, userId);
  assert.equal(result.handled, true, `${message} should use the canonical resolver`);
  if (!result.handled) throw new Error(`Canonical resolver did not handle: ${message}`);
  return result.metadata;
}

function resourceById(resources: EmmausResource[], resourceId: string): EmmausResource {
  const resource = resources.find((candidate) => candidate.resourceId === resourceId);
  assert.ok(resource, `catalogue should contain ${resourceId}`);
  return resource;
}

async function seedFixture() {
  memberAId = await testUserIdFor(MEMBER_A);
  memberBId = await testUserIdFor(MEMBER_B);

  // Calling authHeader proves both fixture members have separate real opaque
  // sessions, not merely separate strings passed to a resolver.
  const [memberAAuth, memberBAuth] = await Promise.all([
    authHeader(MEMBER_A),
    authHeader(MEMBER_B),
  ]);
  assert.match(memberAAuth.Authorization, /^Bearer .+/);
  assert.match(memberBAuth.Authorization, /^Bearer .+/);
  assert.notEqual(memberAAuth.Authorization, memberBAuth.Authorization);

  await createJourney({
    id: WALK_ID,
    title: "Acceptance Walk — Quartz Lantern",
    description: "A published Walk fixture for multi-user acceptance.",
    journeyType: "walk",
    durationDays: 2,
    status: "Published",
  });
  await createStep(WALK_ID, {
    day: 1,
    title: "Quartz Lantern Begins",
    mentorIntro: "A private progress fixture begins here.",
    devotional: "Grace steadies the first step.",
    scripture: "John 3:16",
  });
  await createStep(WALK_ID, {
    day: 2,
    title: "Quartz Lantern Continues",
    mentorIntro: "The second published Walk step.",
    devotional: "Hope carries us onward.",
    scripture: "Romans 8:1",
  });

  await createJourney({
    id: JOURNEY_ID,
    title: "Acceptance Journey — Cedar Compass",
    description: "A published Journey fixture for multi-user acceptance.",
    journeyType: "journey",
    durationDays: 2,
    status: "Published",
  });
  await createStep(JOURNEY_ID, {
    day: 1,
    title: "Cedar Compass Begins",
    mentorIntro: "A longer journey starts with trust.",
    devotional: "Trust gives the journey direction.",
    scripture: "Proverbs 3:5",
  });
  await createStep(JOURNEY_ID, {
    day: 2,
    title: "Cedar Compass Continues",
    mentorIntro: "The next published Journey step.",
    devotional: "Wisdom grows through faithful practice.",
    scripture: "James 1:5",
  });

  await createJourney({
    id: STUDY_ID,
    title: "Acceptance Bible Study — Amber Grace",
    description: "A published Bible Study fixture about grace.",
    journeyType: "bible-study",
    durationDays: 1,
    status: "Published",
  });
  await createStep(STUDY_ID, {
    day: 1,
    title: "Amber Grace in Scripture",
    mentorIntro: "A study note grounded in grace.",
    devotional: "Grace is received, not earned.",
    reflectionQuestion: "Where do you need to receive grace today?",
    scripture: "Ephesians 2:8",
  });

  await createJourney({
    id: RHYTHM_ID,
    title: "Acceptance Daily Rhythm — Willow",
    description: "A published Daily Rhythm fixture with a locked future step.",
    journeyType: "daily-rhythm",
    durationDays: 2,
    status: "Published",
  });
  // Daily Rhythm selection is global, so make this fixture the deterministic
  // first candidate during this isolated acceptance command.
  await pool.query("UPDATE journeys SET display_order = -2147483648 WHERE id = $1", [RHYTHM_ID]);
  await createStep(RHYTHM_ID, {
    day: 1,
    title: "Willow Rhythm Today",
    mentorIntro: "Today's eligible rhythm step.",
    devotional: "Be present with God today.",
    scripture: "Psalm 23",
  });
  await createStep(RHYTHM_ID, {
    day: 2,
    title: "Willow Rhythm Locked Future",
    mentorIntro: "This must not be visible before it unlocks.",
    devotional: "A future step must remain private.",
    scripture: "Psalm 24",
  });

  await db.insert(devotionalSeriesTable).values({
    id: DEVOTIONAL_ID,
    title: "Acceptance Devotional — River Stones",
    description: "A published devotional fixture.",
    status: "Published",
    publishedAt: new Date(),
    createdBy: memberAId,
  });
  await db.insert(devotionalEntriesTable).values([
    {
      id: DEVOTIONAL_ENTRY_1,
      seriesId: DEVOTIONAL_ID,
      dayNumber: 1,
      title: "River Stones — Day One",
      greeting: "Welcome to the first day.",
      considerThis: "Grace meets us at the beginning.",
      status: "Published",
      publishedAt: new Date(),
    },
    {
      id: DEVOTIONAL_ENTRY_2,
      seriesId: DEVOTIONAL_ID,
      dayNumber: 2,
      title: "River Stones — Day Two",
      greeting: "Welcome to the second day.",
      considerThis: "Hope grows as we continue.",
      status: "Published",
      publishedAt: new Date(),
    },
  ]);

  await db.insert(devotionalProgressTable).values({
    userId: memberAId,
    seriesId: DEVOTIONAL_ID,
    currentDay: 2,
    completedDays: [1],
    status: "active",
  });

  await pool.query(
    `INSERT INTO user_journey_progress
      (user_id, journey_id, current_day, completed_days, status, started_at, display_origin)
     VALUES
      ($1, $2, 2, $3::jsonb, 'active', now(), 'walk'),
      ($1, $4, 2, $3::jsonb, 'active', now(), 'journey'),
      ($1, $5, 1, '[]'::jsonb, 'active', now(), 'walk')`,
    [memberAId, WALK_ID, JSON.stringify([1]), JOURNEY_ID, RHYTHM_ID],
  );
  await pool.query(
    `INSERT INTO user_bible_data (user_id, data)
     VALUES ($1, $2::jsonb)`,
    [memberAId, JSON.stringify({
      history: [{ bookId: "john", bookName: "John", chapter: 3 }],
    })],
  );

  // An unpublished record with a unique title proves publication is evaluated
  // against the live database, rather than a test-side allow-list.
  await createJourney({
    id: `${STUDY_ID}-draft`,
    title: "Acceptance Draft — Hidden Parchment",
    description: "This unpublished resource must never be returned.",
    journeyType: "bible-study",
    durationDays: 1,
    status: "Draft",
  });
  await createStep(`${STUDY_ID}-draft`, {
    day: 1,
    title: "Hidden Parchment",
    devotional: "Unpublished content.",
  });
}

async function cleanupFixture() {
  const journeyIds = [WALK_ID, JOURNEY_ID, STUDY_ID, RHYTHM_ID, `${STUDY_ID}-draft`];
  await pool.query(
    `DELETE FROM step_reflections WHERE journey_id = ANY($1::text[])`,
    [journeyIds],
  );
  await pool.query(
    `DELETE FROM daily_rhythm_opening_ledger WHERE journey_id = ANY($1::text[])`,
    [journeyIds],
  );
  await pool.query(
    `DELETE FROM journey_steps WHERE journey_id = ANY($1::text[])`,
    [journeyIds],
  );
  await pool.query(
    `DELETE FROM journeys WHERE id = ANY($1::text[])`,
    [journeyIds],
  );
  await pool.query(
    `DELETE FROM devotional_series WHERE id = $1::uuid`,
    [DEVOTIONAL_ID],
  );
}

before(seedFixture);

after(async () => {
  await cleanupFixture();
  await cleanupTestAuth();
  const [remainingUsers, remainingJourneys, remainingSeries] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS count
         FROM users
        WHERE id = ANY($1::text[])`,
      [[memberAId, memberBId]],
    ),
    pool.query(
      `SELECT count(*)::int AS count
         FROM journeys
        WHERE id = ANY($1::text[])`,
      [[WALK_ID, JOURNEY_ID, STUDY_ID, RHYTHM_ID, `${STUDY_ID}-draft`]],
    ),
    pool.query(
      `SELECT count(*)::int AS count
         FROM devotional_series
        WHERE id = $1::uuid`,
      [DEVOTIONAL_ID],
    ),
  ]);
  assert.equal(remainingUsers.rows[0]?.count, 0, "fixture member identities must be removed");
  assert.equal(remainingJourneys.rows[0]?.count, 0, "fixture journeys must be removed");
  assert.equal(remainingSeries.rows[0]?.count, 0, "fixture devotional must be removed");
});

describe("Ask Emmaus multi-user acceptance matrix", () => {
  it("retrieves each published capability and exposes only catalogue-backed actions", async () => {
    const study = await metadataFor("Find Bible Studies about amber grace", memberAId);
    assert.ok(study.recommendations.some((item) => item.resourceId === `${STUDY_ID}-step` || item.title.includes("Amber Grace")));
    assert.equal(study.recommendations.some((item) => item.title.includes("Hidden Parchment")), false);

    const discover = await metadataFor("Find acceptance resources about quartz lantern", memberAId);
    assert.ok(discover.recommendations.some((item) => item.title.includes("Quartz Lantern")));

    const devotional = await metadataFor("Read today's devotional", memberAId);
    assert.equal(devotional.recommendations[0]?.resourceId, DEVOTIONAL_ENTRY_2);
    assert.equal(devotional.nextStep?.path, `/devotional/${DEVOTIONAL_ID}/day/2`);

    const walk = await metadataFor("Continue my Walk", memberAId);
    assert.equal(walk.recommendations[0]?.resourceId, WALK_ID);
    assert.equal(walk.nextStep?.path, `/journey/${WALK_ID}/day/2`);

    const journey = await metadataFor("Continue my Journey", memberAId);
    assert.equal(journey.recommendations[0]?.resourceId, JOURNEY_ID);
    assert.equal(journey.nextStep?.path, `/journey/${JOURNEY_ID}/day/2`);

    const bible = await metadataFor("Continue reading my Bible", memberAId);
    assert.equal(bible.nextStep?.path, "/bible/read/john/3");

    const rhythm = await metadataFor("Read today's Daily Rhythm", memberAId);
    assert.equal(rhythm.recommendations[0]?.resourceId !== undefined, true);
    assert.equal(rhythm.nextStep?.path, "/daily-rhythm/day/1");

    const catalogue = await buildEmmausResourceCatalogue("acceptance", undefined, undefined, memberAId);
    const actionResources = catalogue.resources.filter((item) =>
      [WALK_ID, JOURNEY_ID, STUDY_ID, DEVOTIONAL_ENTRY_2].includes(item.resourceId)
      || (item.type === "daily-rhythm" && item.title.includes("Willow Rhythm Today")),
    );
    assert.ok(actionResources.length >= 5, "each fixture capability should have a catalogue resource");
    for (const resource of actionResources) {
      for (const action of actionsForResource(resource)) {
        const resolution = resolveCatalogueAction({
          authenticated: true,
          tenantId: "icc",
          kind: action.kind,
          resourceType: resource.type,
          resourceId: resource.resourceId,
          parentId: resource.parentId,
        }, [resource]);
        assert.equal(resolution.ok, true, `${action.kind} must resolve for ${resource.type}`);
      }
    }
  });

  it("keeps saved position, progress, and Daily Rhythm eligibility private to member A", async () => {
    const memberBWalk = await metadataFor("Continue my Walk", memberBId);
    assert.equal(memberBWalk.recommendations.some((item) => item.resourceId === WALK_ID), false);
    assert.match(memberBWalk.answer ?? "", /(?:no active|do not have an active) Walk/i);

    const memberBJourney = await metadataFor("Continue my Journey", memberBId);
    assert.equal(memberBJourney.recommendations.some((item) => item.resourceId === JOURNEY_ID), false);

    const memberBBible = await metadataFor("Continue reading my Bible", memberBId);
    assert.equal(memberBBible.scripture, null);
    assert.equal(memberBBible.nextStep?.path, "/bible");

    const memberBRhythm = await metadataFor("Read today's Daily Rhythm", memberBId);
    assert.equal(memberBRhythm.nextStep?.path, "/daily-rhythm/day/1");
    const memberBRhythmCatalogue = await buildEmmausResourceCatalogue("willow rhythm", undefined, undefined, memberBId);
    assert.equal(
      memberBRhythmCatalogue.resources.some((resource) => resource.title.includes("Locked Future")),
      false,
      "member B must not receive a future Daily Rhythm step",
    );

    const memberARhythmCatalogue = await buildEmmausResourceCatalogue("willow rhythm", undefined, undefined, memberAId);
    assert.equal(
      memberARhythmCatalogue.resources.some((resource) => resource.title.includes("Locked Future")),
      false,
      "member A must not receive a future Daily Rhythm step either",
    );
  });

  it("rejects unpublished, invented, mismatched, and unauthenticated targets", async () => {
    const draftCatalogue = await buildEmmausResourceCatalogue("hidden parchment", undefined, undefined, memberAId);
    assert.equal(draftCatalogue.resources.some((resource) => resource.title.includes("Hidden Parchment")), false);

    const publishedCatalogue = await buildEmmausResourceCatalogue("quartz lantern", undefined, undefined, memberAId);
    const walk = resourceById(publishedCatalogue.resources, WALK_ID);
    assert.equal(resolveCatalogueAction({
      authenticated: true,
      tenantId: "icc",
      kind: "OPEN",
      resourceType: walk.type,
      resourceId: "invented-resource-id",
    }, [walk]).ok, false);
    assert.equal(resolveCatalogueAction({
      authenticated: true,
      tenantId: "icc",
      kind: "OPEN",
      resourceType: walk.type,
      resourceId: walk.resourceId,
      parentId: "wrong-parent",
    }, [walk]).ok, false);
    assert.equal(resolveCatalogueAction({
      authenticated: false,
      tenantId: "icc",
      kind: "OPEN",
      resourceType: walk.type,
      resourceId: walk.resourceId,
    }, [walk]).ok, false);

    const invalidBible = await metadataFor("Read John 999", memberAId);
    assert.equal(invalidBible.nextStep, null);
    assert.equal(invalidBible.recommendations.length, 0);
  });
});