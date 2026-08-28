/**
 * Ask Emmaus sermon-action parity — authenticated transport regression tests.
 *
 * Typed Ask Emmaus and Voice must remain presentation variants of the same
 * authenticated conversation contract. These tests exercise both HTTP routes
 * and compare the verified sermon metadata that the two clients render.
 *
 * Requires the API server to be running:
 *   TEST_SERVER_URL=http://localhost:8080 \
 *   NODE_ENV=test ALLOW_TEST_AUTH_HARNESS=1 \
 *   node --test --import=tsx/esm \
 *   src/emmaus/__tests__/sermon-action-parity.test.ts
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { after, before, describe, it } from "node:test";
import {
  authHeader,
  cleanupTestAuth,
} from "../../test-utils/test-auth.ts";
import {
  createSermon,
  deleteSermonFully,
  publishSermon,
} from "../../lib/canonical-sermon-store.ts";
import {
  getAllSegments,
  getAllVideos,
  type YoutubeVideoRecord,
  type SermonSegment,
} from "../../lib/sermon-store.ts";
import { writeArchiveState } from "../../lib/archive-state-store.ts";

const BASE_URL = process.env.TEST_SERVER_URL ?? "http://localhost:8080";
const base = new URL(BASE_URL);
const transport = base.protocol === "https:" ? https : http;
const RUN_TAG = `${Date.now()}-${process.pid}`;
const TEST_USER = `sermon-action-parity-${RUN_TAG}`;
const TEST_ADMIN = `sermon-action-parity-admin-${RUN_TAG}`;

type SseEvent = {
  type: string;
  content?: string;
  conversationId?: string;
  messageId?: string;
  metadata?: Record<string, unknown>;
};

type SseResponse = {
  status: number;
  text: string;
  done: SseEvent;
};

function request(opts: {
  method?: "POST" | "PATCH";
  path: string;
  userId?: string;
  role?: "user" | "admin" | "superAdmin";
  body?: object;
}): Promise<{ status: number; body: string }> {
  return new Promise(async (resolve, reject) => {
    try {
      const auth = opts.userId
        ? await authHeader(opts.userId, { role: opts.role ?? "user" })
        : {};
      const body = opts.body ? JSON.stringify(opts.body) : undefined;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...auth,
      };
      if (body) headers["Content-Length"] = String(Buffer.byteLength(body));

      const req = transport.request(
        {
          hostname: base.hostname,
          port: Number(base.port) || (base.protocol === "https:" ? 443 : 80),
          method: opts.method ?? "POST",
          path: opts.path,
          headers,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString(),
          }));
        },
      );
      req.on("error", reject);
      if (body) req.write(body);
      req.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function postConversation(
  path: "/api/emmaus/conversation" | "/api/voice/conversation",
  message: string,
  context: Record<string, unknown> = { entryPoint: "personal" },
): Promise<SseResponse> {
  const response = await request({
    path,
    userId: TEST_USER,
    body: {
      message,
      context,
      ...(path === "/api/voice/conversation"
        ? { currentPath: "/personal/ask-emmaus/voice" }
        : {}),
    },
  });
  assert.equal(response.status, 200, `${path} should return an authenticated SSE response`);

  const events = response.body
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice("data: ".length)) as SseEvent);
  const done = events.find((event) => event.type === "done");
  assert.ok(done, `${path} should emit a done event`);
  return {
    status: response.status,
    text: events
      .filter((event) => event.type === "text")
      .map((event) => event.content ?? "")
      .join(""),
    done,
  };
}

function sermonResults(response: SseResponse): Array<Record<string, unknown>> {
  const results = response.done.metadata?.sermonRecommendations;
  return Array.isArray(results) ? results as Array<Record<string, unknown>> : [];
}

function assertPipelineTimings(response: SseResponse, label: string): void {
  const timings = response.done.metadata?.pipelineTimings as Record<string, unknown> | undefined;
  assert.ok(timings, `${label} should expose structured pipeline timings`);
  for (const field of [
    "authMs",
    "contextMs",
    "routingMs",
    "retrievalScriptureMs",
    "retrievalSermonsMs",
    "retrievalResourcesMs",
    "retrievalMemoriesMs",
    "retrievalRoomsMs",
    "modelGenerationMs",
    "validationMs",
    "totalMs",
  ]) {
    assert.ok(
      timings[field] === null || typeof timings[field] === "number",
      `${label} ${field} should be numeric or null`,
    );
  }
}

function assertNoUnverifiedSermonAction(response: SseResponse, label: string): void {
  assert.deepEqual(sermonResults(response), [], `${label} should have no sermon card`);
  assert.doesNotMatch(response.text, /\bsermon\b|https?:\/\/|\/sermon\//i,
    `${label} should not mention a sermon or expose a fabricated link`);
  const metadata = response.done.metadata ?? {};
  const recommendations = Array.isArray(metadata.recommendations)
    ? metadata.recommendations as Array<Record<string, unknown>>
    : [];
  const nextSteps = Array.isArray(metadata.nextSteps)
    ? metadata.nextSteps as Array<Record<string, unknown>>
    : [];
  assert.ok(!recommendations.some((item) => item.type === "sermon"),
    `${label} should not expose an unverified sermon recommendation`);
  assert.ok(!recommendations.some((item) => /\/sermon\//i.test(String(item.path ?? ""))),
    `${label} should not expose an unverified sermon route`);
  assert.ok(!nextSteps.some((item) => item.type === "listen"),
    `${label} should not expose an unverified Listen action`);
}

let canonicalId = "";
let archiveId = "";
let originalVideos: YoutubeVideoRecord[] = [];
let originalSegments: SermonSegment[] = [];

before(async () => {
  originalVideos = await getAllVideos();
  originalSegments = await getAllSegments();

  const canonical = await createSermon({
    legacyJsonId: null,
    title: `__TEST__ Covenant Lantern Canonical ${RUN_TAG}`,
    speaker: "Pastor Parity",
    sermonDate: "2026-08-26",
    series: "Parity Regression",
    scriptureReference: "John 3:16",
    scriptureBookIds: ["john"],
    scriptureChapters: [3],
    youtubeUrl: "https://www.youtube.com/watch?v=paritycanon",
    youtubeVideoId: `paritycanon${RUN_TAG.slice(-3)}`,
    audioPath: `/objects/parity-canonical-${RUN_TAG}.mp3`,
    notes: "",
    transcript: "A verified canonical sermon for the transport parity test.",
    transcriptStatus: "complete",
    summary: "A verified teaching about the covenant lantern.",
    themes: ["covenant"],
    sections: [{ timestampSeconds: 754, label: "Covenant lantern" }],
    keywords: ["lantern"],
    mainTheme: "covenant lantern",
    status: "Draft",
    processingStage: "complete",
    processingError: "",
  });
  canonicalId = canonical.id;
  await publishSermon(canonicalId);

  const archive: YoutubeVideoRecord = {
    id: randomUUID(),
    youtubeVideoId: `parityarchive${RUN_TAG.slice(-3)}`,
    youtubeUrl: "https://www.youtube.com/watch?v=parityarchive",
    title: `__TEST__ Harbour Light Archive ${RUN_TAG}`,
    description: "Approved archive fixture for Ask Emmaus parity.",
    publishedAt: "2026-08-26T00:00:00.000Z",
    durationSeconds: 3600,
    thumbnailUrl: "",
    channelId: "test-channel",
    privacyStatus: "public",
    lastSyncAt: "2026-08-26T00:00:00.000Z",
    contentType: "sermon",
    sermonLikelihood: 1,
    classificationReason: "test fixture",
    reviewStatus: "approved",
    speaker: "Pastor Archive",
    sermonDate: "2026-08-25",
    series: "Parity Regression",
    scriptureReferences: ["Matthew 5"],
    scriptureBookIds: ["matthew"],
    scriptureChapters: [5],
    topics: ["harbour"],
    keywords: ["harbour", "light"],
    summary: "A verified archive teaching about a harbour light.",
    aiIndexStatus: "indexed",
    transcriptStatus: "complete",
    audioProcessingStatus: "ready",
    importedAt: "2026-08-26T00:00:00.000Z",
  };
  archiveId = archive.id;
  archive.audioUrl = `/api/youtube-archive/audio/${archiveId}`;
  archive.finalSermonStartSeconds = 720;
  await writeArchiveState("videos", [...originalVideos, archive]);

  const archiveSegment: SermonSegment = {
    id: randomUUID(),
    videoId: archiveId,
    youtubeVideoId: archive.youtubeVideoId,
    sequenceNumber: 1,
    startTimeSeconds: 754,
    endTimeSeconds: 900,
    originalText: "The harbour light guides us home.",
    cleanedText: "The harbour light guides us home.",
    wordCount: 7,
    themes: ["harbour"],
    scriptureRefs: ["Matthew 5"],
    keywords: ["harbour", "light"],
    summary: "A verified archive segment about a harbour light.",
    aiIndexStatus: "indexed",
    absoluteStartSeconds: 754,
    absoluteEndSeconds: 900,
    relativeStartSeconds: 34,
    relativeEndSeconds: 180,
    isSermonContent: true,
    transcriptTimingBasis: "absolute_video",
  };
  await writeArchiveState("segments", [...originalSegments, archiveSegment]);

  // A no-op approval PATCH tells the running API process to invalidate its
  // in-memory archive search index after this test fixture is written.
  const refresh = await request({
    method: "PATCH",
    path: `/api/youtube-archive/videos/${archiveId}`,
    userId: TEST_ADMIN,
    role: "superAdmin",
    body: { reviewStatus: "approved" },
  });
  assert.equal(refresh.status, 200, "archive fixture should be accepted by the admin update route");
});


after(async () => {
  if (canonicalId) await deleteSermonFully(canonicalId);
  await writeArchiveState("videos", originalVideos);
  await writeArchiveState("segments", originalSegments);
  await cleanupTestAuth();
});

describe("authenticated Ask Emmaus sermon action parity", { concurrency: 1 }, () => {
  it("returns the same canonical sermon actions to typed and Voice clients", async () => {
    const message = "Please show me the covenant lantern teaching in John 3.";
    const context = {
      entryPoint: "personal",
      bookId: "john",
      chapter: 3,
    };
    const typed = await postConversation("/api/emmaus/conversation", message, {
      ...context,
    });
    const voice = await postConversation("/api/voice/conversation", message, {
      ...context,
    });
    assert.ok(voice.done.conversationId, "Voice response should identify the resumable conversation");
    const resumedVoice = await postConversation("/api/voice/conversation", message, {
      ...context,
      conversationId: voice.done.conversationId,
    });

    const typedResult = sermonResults(typed).find((result) => result.sermonId === canonicalId);
    const voiceResult = sermonResults(voice).find((result) => result.sermonId === canonicalId);
    const resumedResult = sermonResults(resumedVoice).find((result) => result.sermonId === canonicalId);
    assertPipelineTimings(typed, "typed");
    assertPipelineTimings(voice, "Voice");
    assertPipelineTimings(resumedVoice, "resumed Voice");
    assert.ok(typedResult, "typed Ask Emmaus should return the tagged canonical sermon");
    assert.deepEqual(voiceResult, typedResult);
    assert.deepEqual(
      resumedResult,
      typedResult,
      "resumed Voice should preserve the canonical sermon actions exactly",
    );

    const result = typedResult;
    assert.equal(result.source, "canonical");
    assert.equal(result.openPath, `/sermon/${canonicalId}`);
    assert.match(String(result.watchUrl), /^https:\/\/www\.youtube\.com\/watch\?/);
    assert.equal(result.listenAvailable, true);
    assert.match(String(result.audioUrl), /\/storage\/objects\/parity-canonical-/);
  });

  it("returns verified Watch and Listen actions without a canonical route for archive-only matches", async () => {
    const message = "Please show me the harbour light teaching in Matthew 5.";
    const context = {
      entryPoint: "personal",
      bookId: "matthew",
      chapter: 5,
    };
    const typed = await postConversation("/api/emmaus/conversation", message, {
      ...context,
    });
    const voice = await postConversation("/api/voice/conversation", message, {
      ...context,
    });
    assert.ok(voice.done.conversationId, "Voice response should identify the resumable conversation");
    const resumedVoice = await postConversation("/api/voice/conversation", message, {
      ...context,
      conversationId: voice.done.conversationId,
    });

    const typedResult = sermonResults(typed).find((result) => result.sermonId === archiveId);
    const voiceResult = sermonResults(voice).find((result) => result.sermonId === archiveId);
    const resumedResult = sermonResults(resumedVoice).find((result) => result.sermonId === archiveId);
    assert.ok(typedResult, "typed Ask Emmaus should return the tagged archive sermon");
    assert.deepEqual(voiceResult, typedResult);
    assert.deepEqual(
      resumedResult,
      typedResult,
      "resumed Voice should preserve verified archive Watch and Listen actions",
    );

    const result = typedResult;
    assert.equal(result.source, "archive");
    assert.equal(result.openPath, undefined);
    assert.match(String(result.watchUrl), /^https:\/\/www\.youtube\.com\/watch\?/);
    assert.equal(result.listenAvailable, true);
    assert.equal(result.audioUrl, `/api/youtube-archive/audio/${archiveId}`);
    assert.equal(result.relativeStartSeconds, 34);
  });

  it("keeps both authenticated flows honest when sermon retrieval finds nothing", async () => {
    const message = `${RUN_TAG} zephyrless meadow`;
    const typed = await postConversation("/api/emmaus/conversation", message);
    const voice = await postConversation("/api/voice/conversation", message);
    assert.ok(voice.done.conversationId, "Voice response should identify the resumable conversation");
    const resumedVoice = await postConversation("/api/voice/conversation", message, {
      entryPoint: "personal",
      conversationId: voice.done.conversationId,
    });

    assertNoUnverifiedSermonAction(typed, "typed Ask Emmaus");
    assertNoUnverifiedSermonAction(voice, "Voice Ask Emmaus");
    assertNoUnverifiedSermonAction(resumedVoice, "resumed Voice Ask Emmaus");
  });
});