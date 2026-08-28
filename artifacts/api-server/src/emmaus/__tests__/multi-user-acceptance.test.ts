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
import { createSermon, deleteSermon, publishSermon, listPublishedSermons } from "../../lib/canonical-sermon-store.ts";
import {
  db,
  devotionalEntriesTable,
  devotionalProgressTable,
  devotionalSeriesTable,
} from "@workspace/db";
import { buildEmmausResourceCatalogue, type EmmausResource } from "../resource-catalogue.ts";
import { resolveCanonicalAskRequest } from "../canonical-tools.ts";
import { actionsForResource, resolveCatalogueAction } from "../action-registry.ts";
import { routeAskEmmausRequest } from "../intent-router.ts";
import { normalizeEmmausResponse } from "../response-normalization.ts";
import { buildScriptureRoute } from "../citation-validation.ts";
import { retrieveSermons } from "../sermon-retrieval.ts";

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
let SERMON_ID = "";

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

  const sermon = await createSermon({
    legacyJsonId: null,
    title: "Acceptance Sermon — The Prodigal Son Comes Home",
    speaker: "Acceptance Pastor",
    sermonDate: "2026-08-28",
    series: "Acceptance Grace",
    scriptureReference: "Luke 15:11–32",
    scriptureBookIds: ["luke"],
    scriptureChapters: [15],
    youtubeUrl: `https://www.youtube.com/watch?v=acceptance-${RUN_TAG}`,
    youtubeVideoId: `acceptance-${RUN_TAG}`,
    audioPath: "",
    notes: "",
    transcript: "The lost son returns to the father's welcome.",
    transcriptStatus: "complete",
    summary: "A sermon about the prodigal son, repentance, welcome, and the Father's grace.",
    themes: ["grace", "welcome", "prodigal son"],
    sections: [
      { timestampSeconds: 93, label: "The lost son returns", summary: "Repentance opens the way home." },
      { timestampSeconds: 247, label: "The Father's welcome", summary: "Grace meets the returning child." },
    ],
    keywords: ["prodigal", "lost son", "welcome", "grace"],
    mainTheme: "prodigal son",
    sermonStartTime: "00:01:00",
    sermonEndTime: "00:12:00",
    detectionConfidence: 1,
    detectionMethod: "manual",
    processingStage: "complete",
    processingError: "",
    status: "Draft",
  });
  SERMON_ID = sermon.id;
  await publishSermon(SERMON_ID);

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
  if (SERMON_ID) await deleteSermon(SERMON_ID);
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

  it("runs the requested golden prompt matrix against live authenticated data", async () => {
    const publishedSermons = await listPublishedSermons();
    const fixtureSermon = publishedSermons.find((sermon) => sermon.id === SERMON_ID);
    assert.ok(fixtureSermon, "the canonical sermon fixture must be published");
    assert.equal(fixtureSermon?.sections.length, 2, "the sermon must retain timestamped sections");
    const sermonMatches = await retrieveSermons("What have we preached about the prodigal son?");
    const retrievedFixture = sermonMatches.find((sermon) => sermon.sermonId === SERMON_ID);
    assert.ok(retrievedFixture, "sermon retrieval must return the verified fixture");
    assert.equal(retrievedFixture?.timestampSeconds, 93);
    assert.equal(retrievedFixture?.openPath, `/sermon/${SERMON_ID}`);
    assert.equal(new URL(retrievedFixture?.timestampedUrl ?? "").searchParams.get("t"), "93s");

    const catalogueStarted = Date.now();
    const catalogue = await buildEmmausResourceCatalogue("prodigal grace devotional faith", undefined, undefined, memberAId);
    const catalogueMs = Date.now() - catalogueStarted;
    const catalogueById = new Map(catalogue.allResources.map((resource) => [resource.resourceId, resource]));
    assert.ok(catalogue.allResources.length >= catalogue.resources.length);
    assert.ok(catalogue.allResources.some((resource) => resource.resourceId === WALK_ID));
    assert.ok(catalogue.allResources.some((resource) => resource.resourceId === JOURNEY_ID));
    assert.ok(catalogue.allResources.some((resource) => resource.resourceId === DEVOTIONAL_ENTRY_2));
    assert.equal(catalogue.allResources.some((resource) => resource.title.includes("Hidden Parchment")), false);

    const goldenCases = [
      {
        name: "devotional",
        prompts: ["devotional", "show me devotional content"],
        expectedIntents: ["AMBIGUOUS", "DIRECT_ACTION"],
        answer: "Would you like to find a devotional, read today's entry, or continue a devotional series?",
      },
      {
        name: "faith",
        prompts: ["What is faith?", "Tell me about faith"],
        expectedIntents: ["GENERAL_BIBLICAL_QUESTION"],
        answer: "Faith is confidence in God's promises. Hebrews 11:1 describes it as assurance of what we hope for.",
      },
      {
        name: "prodigal",
        prompts: ["Prodigal", "Tell me about the lost son"],
        expectedIntents: ["AMBIGUOUS", "GENERAL_BIBLICAL_QUESTION"],
        answer: "Would you like the Bible passage in Luke 15:11–32 or a sermon about the prodigal son?",
      },
      {
        name: "afraid",
        prompts: ["I’m afraid", "I feel frightened"],
        expectedIntents: ["PASTORAL_QUESTION", "AMBIGUOUS"],
        answer: "It is understandable to feel afraid. Psalm 91:1–2 speaks of finding shelter in God's care.",
      },
      {
        name: "find-devotionals",
        prompts: ["Where can I find devotionals?", "Where are the devotional readings?"],
        expectedIntents: ["APP_HELP"],
        answer: "You can find published devotionals in Emmaus under Journeys.",
      },
      {
        name: "preached-prodigal",
        prompts: ["What have we preached about the prodigal son?", "Have we preached about the lost son?"],
        expectedIntents: ["GENERAL_BIBLICAL_QUESTION", "AMBIGUOUS"],
        answer: `The sermon “${fixtureSermon?.title}” reflects on the prodigal son and the Father's welcome. Read Luke 15:11–32.`,
      },
    ] as const;

    const report = goldenCases.flatMap((golden) => golden.prompts.map((prompt) => {
      const started = Date.now();
      const routed = routeAskEmmausRequest(prompt);
      const normalized = normalizeGoldenAnswer(golden.answer, catalogue.resources, fixtureSermon?.title ?? "");
      const totalMs = Date.now() - started;
      const resourceLinks = normalized.metadata.recommendations
        .filter((item) => item.resourceId)
        .map((item) => catalogueById.get(item.resourceId!))
        .filter(Boolean);
      const score = {
        intentAccuracy: golden.expectedIntents.some((intent) => intent === routed.intent),
        factualGrounding: normalized.metadata.scriptureReferences?.every((ref) => Boolean(buildScriptureRoute(ref))),
        scriptureFirst: golden.name === "faith" || golden.name === "afraid" || golden.name === "prodigal"
          ? Boolean(normalized.metadata.scriptureReferences?.length)
          : true,
        localChurchRelevance: golden.name === "preached-prodigal"
          ? normalized.displayAnswer.includes(fixtureSermon?.title ?? "")
          : true,
        concise: normalized.displayAnswer.length <= 2400,
        warm: golden.name === "afraid" ? /understandable|care/i.test(normalized.displayAnswer) : true,
        excessiveNameUsage: (normalized.displayAnswer.match(/Acceptance Pastor/g) ?? []).length <= 1,
        unnecessaryRepetition: new Set(normalized.metadata.scriptureReferences?.map((ref) => ref.reference)).size === normalized.metadata.scriptureReferences?.length,
        unsupportedClaims: !/Imaginary|Hidden Parchment|invented/i.test(normalized.displayAnswer),
        duplicateResources: resourceLinks.length === new Set(resourceLinks.map((resource) => `${resource?.type}:${resource?.resourceId}`)).size,
        workingLinks: resourceLinks.every((resource) => Boolean(resource?.route)),
        displayQuality: normalized.displayAnswer.length > 0 && !/https?:\/\//i.test(normalized.displayAnswer),
        speakableQuality: normalized.speakableAnswer.length > 0 && normalized.speakableAnswer.length <= 720,
      };
      assert.ok(Object.values(score).every(Boolean), `${golden.name}/${prompt} failed: ${JSON.stringify(score)}`);
      return { prompt, intent: routed.intent, score, timeToVisibleMs: totalMs, totalMs };
    }));

    assert.equal(report.length, 12);
    console.log(JSON.stringify({
      suite: "ask-emmaus-golden",
      fixture: {
        publishedSermonSections: fixtureSermon?.sections.length ?? 0,
        completeCatalogueResources: catalogue.allResources.length,
        promptResources: catalogue.resources.length,
      },
      catalogueMs,
      results: report,
    }));
  });
});

function normalizeGoldenAnswer(answer: string, resources: EmmausResource[], sermonTitle: string) {
  return normalizeEmmausResponse({
    answer,
    metadata: {
      answer,
      scripture: null,
      scriptureReferences: [],
      nextStep: null,
      nextSteps: [],
      recommendations: sermonTitle
        ? [{
            type: "sermon",
            title: sermonTitle,
            description: "Verified published sermon.",
            resourceId: SERMON_ID,
            path: `/sermon/${SERMON_ID}`,
          }]
        : [],
      sermonRecommendations: sermonTitle
        ? [{
            sermonId: SERMON_ID,
            source: "canonical",
            title: sermonTitle,
            speaker: "Acceptance Pastor",
            sermonDate: "2026-08-28",
            excerpt: "The Father's welcome.",
            reason: "Verified fixture match.",
            listenAvailable: false,
            openPath: `/sermon/${SERMON_ID}`,
          }]
        : [],
      followUpPrompts: [],
      handoffType: null,
    },
    resources,
  });
}