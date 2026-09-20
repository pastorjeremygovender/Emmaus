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
import { normalizeEmmausResponse } from "../response-normalization.ts";
import { buildScriptureRoute, validateModelResponse } from "../citation-validation.ts";
import { routeAskEmmausRequest } from "../intent-router.ts";
import { createSermon, deleteSermonFully, listPublishedSermons, publishSermon } from "../../lib/canonical-sermon-store.ts";
import { getConversationStore } from "../firestore-model.ts";

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
let publishedSermonId = "";
let draftSermonId = "";

async function metadataFor(
  message: string,
  userId: string,
  context?: {
    journeyContext?: {
      journeyId: string;
      journeyTitle?: string;
      currentDay: number;
    };
    sermonContext?: {
      sermonId: string;
      sermonTitle: string;
      scriptureReference?: string;
    };
  },
) {
  const result = await resolveCanonicalAskRequest(message, userId, undefined, undefined, context);
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

  const publishedSermon = await createSermon({
    legacyJsonId: null,
    title: "Acceptance Sermon — Steady Harbour",
    speaker: "Pastor Acceptance",
    sermonDate: "2026-08-27",
    series: "Acceptance Evidence",
    scriptureReference: "John 3:16",
    scriptureBookIds: ["john"],
    scriptureChapters: [3],
    youtubeUrl: "https://www.youtube.com/watch?v=acceptanceharbour",
    youtubeVideoId: `acceptanceharbour-${RUN_TAG}`,
    audioPath: `/objects/acceptance-harbour-${RUN_TAG}.mp3`,
    notes: "",
    transcript: "A verified teaching about finding steady hope in Christ.",
    transcriptStatus: "complete",
    summary: "A verified teaching about steady hope when life feels uncertain.",
    themes: ["hope", "harbour"],
    sections: [{ timestampSeconds: 412, label: "Steady hope" }],
    keywords: ["steady", "harbour", "hope"],
    mainTheme: "steady harbour",
    sermonStartTime: "00:06:00",
    sermonEndTime: "00:42:00",
    detectionConfidence: 0.99,
    detectionMethod: "manual",
    status: "Draft",
    processingStage: "complete",
    processingError: "",
  });
  publishedSermonId = publishedSermon.id;
  await publishSermon(publishedSermonId);

  const draftSermon = await createSermon({
    legacyJsonId: null,
    title: "Acceptance Sermon — Hidden Pulpit",
    speaker: "Pastor Acceptance",
    sermonDate: "2026-08-27",
    series: "Acceptance Evidence",
    scriptureReference: "John 3:16",
    scriptureBookIds: ["john"],
    scriptureChapters: [3],
    youtubeUrl: "https://www.youtube.com/watch?v=hiddenpulpit",
    youtubeVideoId: `hiddenpulpit-${RUN_TAG}`,
    audioPath: `/objects/hidden-pulpit-${RUN_TAG}.mp3`,
    notes: "",
    transcript: "An unpublished sermon fixture.",
    transcriptStatus: "complete",
    summary: "An unpublished sermon that must not be searchable.",
    themes: ["hidden"],
    sections: [],
    keywords: ["hidden"],
    mainTheme: "hidden pulpit",
    processingStage: "complete",
    processingError: "",
    status: "Draft",
  });
  draftSermonId = draftSermon.id;

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
  if (publishedSermonId) await deleteSermonFully(publishedSermonId);
  if (draftSermonId) await deleteSermonFully(draftSermonId);
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
  const remainingSermons = await pool.query(
    `SELECT count(*)::int AS count
       FROM sermons
      WHERE id = ANY($1::uuid[])`,
    [[publishedSermonId, draftSermonId]],
  );
  assert.equal(remainingSermons.rows[0]?.count, 0, "fixture sermons must be removed");
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

  it("uses the visible Walk and sermon as the only targets for contextual open commands", async () => {
    const walk = await metadataFor("Open the walk please", memberAId, {
      journeyContext: {
        journeyId: WALK_ID,
        journeyTitle: "Untrusted browser title",
        currentDay: 2,
      },
    });
    assert.equal(walk.recommendations[0]?.resourceId, WALK_ID);
    assert.equal(walk.recommendations[0]?.title, "Acceptance Walk — Quartz Lantern");
    assert.equal(walk.nextStep?.path, `/journey/${WALK_ID}/day/2`);
    assert.equal(walk.resourceActions?.[0]?.resourceId, WALK_ID);
    assert.equal(walk.resourceActions?.[0]?.route, `/journey/${WALK_ID}/day/2`);
    assert.equal(walk.recommendations[0]?.path, walk.nextStep?.path);

    const sermon = await metadataFor("Open the sermon", memberAId, {
      sermonContext: {
        sermonId: publishedSermonId,
        sermonTitle: "Untrusted browser title",
      },
    });
    assert.equal(sermon.recommendations[0]?.resourceId, publishedSermonId);
    assert.equal(sermon.recommendations[0]?.title, "Acceptance Sermon — Steady Harbour");
    assert.equal(sermon.nextStep?.path, `/sermon/${publishedSermonId}`);
    assert.equal(sermon.resourceActions?.[0]?.resourceId, publishedSermonId);
    assert.equal(sermon.resourceActions?.[0]?.route, `/sermon/${publishedSermonId}`);
    assert.equal(sermon.recommendations[0]?.path, sermon.nextStep?.path);

    const ambiguousWalk = await metadataFor("Open the walk please", memberBId);
    assert.match(ambiguousWalk.answer ?? "", /which walk/i);
    assert.equal(ambiguousWalk.nextStep, null);
    assert.equal(ambiguousWalk.recommendations.length, 0);
    assert.equal(ambiguousWalk.resourceActions?.length ?? 0, 0);

    const ambiguousSermon = await metadataFor("Open the sermon", memberAId);
    assert.match(ambiguousSermon.answer ?? "", /which sermon/i);
    assert.equal(ambiguousSermon.nextStep, null);
    assert.equal(ambiguousSermon.recommendations.length, 0);
    assert.equal(ambiguousSermon.resourceActions?.length ?? 0, 0);
  });

  it("runs the release golden set through the final response and history boundary", async () => {
    const report: Array<{
      name: string;
      relevance: "relevant" | "not-relevant";
      routingMs: number;
      retrievalMs: number;
      totalMs: number;
    }> = [];

    const evaluate = async (
      name: string,
      message: string,
      relevance: "relevant" | "not-relevant",
      check: () => Promise<void> | void,
    ) => {
      const started = Date.now();
      const routingStarted = Date.now();
      routeAskEmmausRequest(message);
      const routingMs = Date.now() - routingStarted;
      const retrievalStarted = Date.now();
      await check();
      const retrievalMs = Date.now() - retrievalStarted;
      report.push({ name: `${name}: ${message}`, relevance, routingMs, retrievalMs, totalMs: Date.now() - started });
    };

    await evaluate("canonical action", "Read today's devotional", "relevant", async () => {
      const result = await metadataFor("Read today's devotional", memberAId);
      assert.equal(result.nextStep?.path, `/devotional/${DEVOTIONAL_ID}/day/2`);
    });

    await evaluate("Bible reference", "Read John 3:16–18", "relevant", () => {
      const normalized = normalizeEmmausResponse({
        answer: "Take comfort in john 3:16–18.",
        metadata: {
          scripture: null,
          scriptureReferences: [],
          nextStep: null,
          nextSteps: [],
          recommendations: [],
          followUpPrompts: [],
          handoffType: null,
        },
      });
      assert.equal(normalized.displayAnswer, "Take comfort in John 3:16–18.");
      assert.deepEqual(normalized.metadata.scriptureReferences?.map((ref) => ref.reference), ["John 3:16–18"]);
    });

    await evaluate("vague single-word prompt", "Grace", "not-relevant", () => {
      const routed = routeAskEmmausRequest("Grace");
      assert.equal(routed.intent, "AMBIGUOUS");
      assert.equal(routed.clarificationRequired, true);
    });

    await evaluate("pastoral question", "I feel anxious and alone", "relevant", () => {
      const routed = routeAskEmmausRequest("I feel anxious and alone");
      assert.equal(routed.intent, "PASTORAL_QUESTION");
      assert.equal(routed.clarificationRequired, false);
    });

    await evaluate("sermon match", "Find sermons about steady harbour", "relevant", async () => {
      const result = await metadataFor("Find sermons about steady harbour", memberAId);
      const sermon = result.sermonRecommendations?.find((item) => item.sermonId === publishedSermonId);
      assert.ok(sermon, "published canonical sermon should be returned for a matching topic");
      assert.equal(sermon.title, "Acceptance Sermon — Steady Harbour");
      assert.equal(sermon.speaker, "Pastor Acceptance");
      assert.equal(result.sermonRecommendations?.some((item) => item.title.includes("Hidden Pulpit")), false);
    });

    await evaluate("unsupported resource and client-context claims", "Try the Hidden Parchment Journey", "not-relevant", async () => {
      const catalogue = await buildEmmausResourceCatalogue("quartz lantern", undefined, undefined, memberAId);
      const unsafeAnswer = [
        "Try the Hidden Parchment Journey.",
        "Pastor Imaginary preached it.",
        "John 999 is the route to follow.",
        "Open /journeys/not-real from the client context.",
      ].join(" ");
      const metadata = validateModelResponse({
        answer: unsafeAnswer,
        scripture: { reference: "John 999", book: "john", chapter: 999 },
        scriptureReferences: [{ reference: "John 999", book: "john", chapter: 999 }],
        recommendations: [{
          type: "journey",
          title: "Invented Route",
          resourceId: "invented-resource",
          path: "/journeys/not-real",
        }],
        nextStep: {
          action: "Open it",
          primaryButtonText: "Open",
          path: "/bible/read/john/999",
        },
        nextSteps: [{
          type: "continue",
          text: "Open it",
          path: "/journeys/not-real",
        }],
      }, catalogue.resources);
      const normalized = normalizeEmmausResponse({
        answer: unsafeAnswer,
        metadata,
        resources: catalogue.resources,
      });
      const store = getConversationStore();
      const conversation = await store.createConversation({
        userId: memberAId,
        title: "Golden unsupported-claim check",
        entryPoint: "personal",
      });
      const persisted = await store.addMessage({
        conversationId: conversation.id,
        userId: memberAId,
        role: "assistant",
        content: normalized.displayAnswer,
        metadata: normalized.metadata,
        promptVersion: "golden-test",
        entryPoint: "personal",
        safetyChecked: true,
        resourceInteractions: [],
      });
      const persistedHistory = JSON.stringify(persisted);
      for (const surface of [
        normalized.displayAnswer,
        normalized.speakableAnswer,
        JSON.stringify(normalized.metadata),
        persistedHistory,
      ]) {
        assert.doesNotMatch(surface, /Hidden Parchment|Pastor Imaginary|John 999|not-real|\/admin\//i);
      }
      assert.equal(normalized.metadata.nextStep, null);
      assert.deepEqual(normalized.metadata.nextSteps, []);
      assert.deepEqual(normalized.metadata.recommendations, []);
    });

    assert.equal(report.length, 6);
    assert.ok(report.every((entry) =>
      Number.isFinite(entry.routingMs) &&
      Number.isFinite(entry.retrievalMs) &&
      Number.isFinite(entry.totalMs) &&
      entry.totalMs >= entry.retrievalMs,
    ));
    // This is intentionally emitted as structured JSON so CI/release logs
    // retain relevance decisions and representative stage latency.
    console.info(`ASK_EMMAUS_GOLDEN_EVALUATION ${JSON.stringify(report)}`);
  });

  it("scores representative answers for display quality", async () => {
    const publishedSermon = (await listPublishedSermons()).find(
      (sermon) => sermon.id === publishedSermonId,
    );
    assert.ok(publishedSermon, "the canonical sermon fixture must be published");

    const catalogue = await buildEmmausResourceCatalogue(
      "prodigal grace devotional faith",
      undefined,
      undefined,
      memberAId,
    );
    const goldenCases = [
      {
        name: "canonical action",
        prompt: "Read today's devotional",
        expectedIntent: "DIRECT_ACTION",
        answer: "Open today's published devotional step in Emmaus.",
      },
      {
        name: "Bible reference",
        prompt: "Read John 3:16–18",
        expectedIntent: "BIBLE_READ",
        answer: "Take comfort in john 3:16–18.",
      },
      {
        name: "vague single-word prompt",
        prompt: "Grace",
        expectedIntent: "AMBIGUOUS",
        answer: "Would you like to explore a Bible passage or a published Emmaus resource?",
      },
      {
        name: "pastoral question",
        prompt: "I’m afraid",
        expectedIntent: "PASTORAL_QUESTION",
        answer: "It is understandable to feel afraid. Psalm 91:1–2 speaks of finding shelter in God's care.",
      },
      {
        name: "sermon match",
        prompt: "Find sermons about steady harbour",
        expectedIntent: "RESOURCE_SEARCH",
        answer: `The sermon “${publishedSermon.title}” reflects on steady hope. Read John 3:16.`,
      },
      {
        name: "unsupported resource",
        prompt: "Try the Hidden Parchment Journey",
        expectedIntent: "AMBIGUOUS",
        answer: "I couldn't verify that Emmaus resource.",
      },
    ] as const;

    const report = goldenCases.map((golden) => {
      const started = Date.now();
      const routed = routeAskEmmausRequest(golden.prompt);
      const normalized = normalizeGoldenAnswer(
        golden.answer,
        catalogue.resources,
        publishedSermon.title,
        publishedSermonId,
      );
      const totalMs = Date.now() - started;
      const score = {
        intentAccuracy: routed.intent === golden.expectedIntent,
        factualGrounding: normalized.metadata.scriptureReferences?.every((ref) =>
          Boolean(buildScriptureRoute(ref)),
        ),
        concise: normalized.displayAnswer.length <= 2400,
        unsupportedClaims: !/Imaginary|Hidden Parchment|invented|not-real/i.test(
          `${normalized.displayAnswer} ${normalized.speakableAnswer} ${JSON.stringify(normalized.metadata)}`,
        ),
        displayQuality: normalized.displayAnswer.length > 0 && !/https?:\/\//i.test(normalized.displayAnswer),
        speakableQuality: normalized.speakableAnswer.length > 0 &&
          normalized.speakableAnswer.length <= 720,
      };
      assert.ok(Object.values(score).every(Boolean), `${golden.name} failed: ${JSON.stringify(score)}`);
      return {
        prompt: golden.prompt,
        relevance: golden.name === "unsupported resource" ? "not-relevant" : "relevant",
        score,
        totalMs,
      };
    });

    assert.equal(report.length, goldenCases.length);
    console.info(`ASK_EMMAUS_GOLDEN_QUALITY ${JSON.stringify(report)}`);
  });
});

function normalizeGoldenAnswer(
  answer: string,
  resources: EmmausResource[],
  sermonTitle: string,
  sermonId: string,
) {
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
            resourceId: sermonId,
            path: `/sermon/${sermonId}`,
          }]
        : [],
      sermonRecommendations: sermonTitle
        ? [{
            sermonId,
            source: "canonical",
            title: sermonTitle,
            speaker: "Pastor Acceptance",
            sermonDate: "2026-08-28",
            excerpt: "The Father's welcome.",
            reason: "Verified fixture match.",
            listenAvailable: false,
            openPath: `/sermon/${sermonId}`,
          }]
        : [],
      followUpPrompts: [],
      handoffType: null,
    },
    resources,
  });
}