/**
 * Emmaus Conversation Service
 *
 * Orchestrates the full pipeline for each Ask Emmaus request:
 *   1. Build context (entry point + Bible/Journey/Sermon context)
 *   2. Route classification (fast / deep)
 *   3. Sermon retrieval (deterministic, verified records only)
 *   4. Safety layer (crisis signal detection)
 *   5. LLM Provider (OpenAI or Mock) — streaming
 *   6. Parse structured metadata from <EMMAUS_META> block
 *   7. Strip LLM sermon recommendations; inject verified retrieval result
 *   8. Persist messages and send done event
 *
 * Env vars (optional — all have safe defaults):
 *   OPENAI_API_KEY             — enables OpenAI; absent → mock provider
 *   EMMAUS_MAX_OUTPUT_TOKENS   — fast-path token cap (default: 900)
 *   EMMAUS_DEEP_MAX_TOKENS     — deep-path token cap (default: 1400)
 *   EMMAUS_REASONING_EFFORT    — fast-path effort for o1/o3 models (default: low)
 *   EMMAUS_SERMON_MIN_SCORE    — minimum retrieval score (default: 5)
 *
 *   Firestore persistence (when absent, in-memory store is used):
 *   FIREBASE_PROJECT_ID
 *   GOOGLE_APPLICATION_CREDENTIALS  OR  FIREBASE_SERVICE_ACCOUNT_KEY
 */

import type { Response } from "express";
import { pool } from "@workspace/db";
import { buildSystemPrompt, PROMPT_VERSION } from "./system-instructions.js";
import { buildContext, type EmmausContextInput } from "./context-builder.js";
import { isOwner } from "./auth.js";
import { checkSafety, checkPastoralHandoff } from "./safety-layer.js";
import { createLLMProvider, type LLMMessage } from "./llm-provider.js";
import {
  getConversationStore,
  type EmmausResponseMetadata,
  type EmmausResourceType as ContractResourceType,
  type NextStepItem,
  type EntryPoint,
  type EmmausMemory,
} from "./firestore-model.js";
import {
  retrieveSermon,
  retrieveSermons,
  type SermonRetrievalResult,
} from "./sermon-retrieval.js";
import { searchBibleVerses, type BiblePassage } from "../lib/bible-verse-search.js";
import { getRoomsForUser, type RoomSummary } from "../lib/room-store.js";
import { buildEmmausResourceCatalogue, type EmmausResourceType as CatalogueResourceType } from "./resource-catalogue.js";
import { actionsForResource } from "./action-registry.js";
import { logger } from "../lib/logger.js";
import {
  extractValidatedScriptureReferences,
  validateCitations,
  validateModelResponse,
} from "./citation-validation.js";
import { classifyEmmausIntent } from "@workspace/api-zod";
import { checkSafetyKeywordsOnly } from "./safety-layer.js";
import { resolveCanonicalAskRequest } from "./canonical-tools.js";
import { routeAskEmmausRequest } from "./intent-router.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConversationRequest {
  message: string;
  context?: EmmausContextInput;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

const RESOURCE_TYPE_TO_CONTRACT: Record<CatalogueResourceType, ContractResourceType> = {
  journey: "journey",
  walk: "walk",
  walk_step: "walk_step",
  "bible-study": "bible_study",
  devotional: "devotional",
  "sermon-companion": "sermon_companion",
  sermon: "sermon",
  "daily-rhythm": "daily_rhythm",
};

export type SseEventType = "text" | "done" | "error";

async function getTrustedDisplayName(userId: string): Promise<string | undefined> {
  if (!userId || userId === "anonymous") return undefined;
  try {
    const result = await pool.query<{ preferred_name: string | null; app_role: string | null }>(
      `SELECT preferred_name, app_role FROM user_profiles
       WHERE auth_subject = $1 OR email = $1
       ORDER BY CASE WHEN auth_subject = $1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [userId],
    );
    const profile = result.rows[0];
    const preferred = profile?.preferred_name?.trim();
    if (profile?.app_role === "admin" || profile?.app_role === "superAdmin") {
      // ICC's administrator account is addressed by the ministry name, not the
      // account's legal/display identity.
      return preferred && !/^(pastor govender|jeremy govender|the pastor|the user)$/i.test(preferred)
        ? preferred
        : "Pastor Jeremy";
    }
    return preferred || undefined;
  } catch (err) {
    logger.warn({ err: String(err) }, "emmaus: trusted display name unavailable");
    return undefined;
  }
}

export interface SseDonePayload {
  conversationId: string;
  messageId: string;
  metadata: EmmausResponseMetadata;
  promptVersion: string;
  /** When the user asked Emmaus to use a different name, this holds the
   *  validated new name so the client can persist it immediately. */
  detectedNameUpdate?: string;
}

// ─── Name Update Detection ────────────────────────────────────────────────────

/**
 * Minimum and maximum character lengths for a valid preferred name segment.
 * The name must be at least 2 characters and no more than 30, and may consist
 * of 1–3 space-separated words (handles "call me Sarah", "call me Sarah Jane").
 */
const NAME_MIN = 2;
const NAME_MAX = 30;

/**
 * Individual words that can never be part of a valid preferred name.
 * Checked per-word after the capture group is split — prevents accepting
 * "Sarah Please", "When You", "Jane And", or "Blessed" as name segments.
 */
const BLOCKED_NAME_WORDS_LOWER = new Set([
  // Identity/role words
  "friend", "user", "member",
  // Pronouns
  "me", "my", "i", "you", "he", "she", "it", "we", "they",
  "him", "her", "us", "them",
  // Articles and prepositions (single words like "a", "an", "the" are also
  // caught by the per-word length minimum, but include them explicitly)
  "a", "an", "the",
  // Polite or sentence-final words
  "please", "now", "back", "away", "there", "here", "up", "down",
  "out", "in", "today", "again", "just", "still", "always", "never",
  "maybe", "actually", "okay", "ok", "yes", "no", "sure",
  // Connectives and clause-openers
  "and", "but", "or", "so", "yet", "nor", "because", "since",
  "if", "when", "where", "while", "how", "why", "what", "who",
  // Common adjectives / emotional states that end sentences
  "crazy", "silly", "lost", "saved", "broken", "tired", "fine",
  "happy", "sad", "alone", "afraid", "free", "new", "wrong", "right",
  // Spiritual or identity words not suitable as display names
  "god", "jesus", "emmaus", "lord", "blessed", "sinner",
]);

/**
 * Detect "call me [name]", "my name is [name]", or "I go by [name]" patterns
 * and return a validated, title-cased name string, or null when no match is found.
 *
 * Safety design:
 *  - The name segment is anchored to end-of-message or punctuation so sentence
 *    continuations like "call me when you arrive" do not match.
 *  - At most two words are accepted (covers "Sarah Jane" style compound names).
 *  - Every captured word is checked against BLOCKED_NAME_WORDS_LOWER so
 *    "call me Sarah please" (→ "Sarah Please") and similar false positives are
 *    rejected even when they appear at the end of the message.
 */
export function detectNameUpdate(message: string): string | null {
  // (?:[.,!?;]|\s*$) — name ends at punctuation or end-of-string.
  // This ensures "call me when you arrive" does not fire because " you arrive"
  // is neither punctuation nor end-of-string after the first word "when".
  const nameSegment =
    "([A-Za-z][A-Za-z'-]*(?:\\s+[A-Za-z][A-Za-z'-]*)?)\\s*(?:[.,!?;]|\\s*$)";

  const patterns = [
    new RegExp(`\\bcall\\s+me\\s+${nameSegment}`, "i"),
    new RegExp(`\\bmy\\s+name\\s+is\\s+${nameSegment}`, "i"),
    new RegExp(`\\bI\\s+go\\s+by\\s+${nameSegment}`, "i"),
    new RegExp(`\\bplease\\s+call\\s+me\\s+${nameSegment}`, "i"),
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (!match) continue;

    const raw = match[1].trim();
    if (raw.length < NAME_MIN || raw.length > NAME_MAX) continue;

    const words = raw.split(/\s+/);
    const titleCasedWords = words.map(
      (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    );

    // Reject if any individual word is too short (e.g. "a" in "a sinner")
    // or is a common English word rather than a name.
    if (
      titleCasedWords.some(
        (w) => w.length < NAME_MIN || BLOCKED_NAME_WORDS_LOWER.has(w.toLowerCase())
      )
    ) {
      continue;
    }

    return titleCasedWords.join(" ");
  }

  return null;
}

// ─── Route Classification ─────────────────────────────────────────────────────

type Route = "fast" | "deep";

/**
 * Classify the request as fast (simple/pastoral) or deep (complex theology).
 * Fast path: shorter history, lower token cap, low reasoning effort.
 * Deep path: full history, higher token cap, medium reasoning effort.
 *
 * Default to fast — only genuine theological complexity triggers deep.
 */
function classifyRoute(message: string): Route {
  const q = message.toLowerCase();
  const deepPatterns: RegExp[] = [
    // Comparative theology / denomination debates
    /\b(compar|contrast|differ(ence|ent)?)\b.{0,40}\b(view|tradition|denomination|theolog|doctrine|interpretation)\b/,
    // Dense doctrinal terms
    /\b(trinit|incarnat|aton(e|ement)|justif(y|ication)|predestination|eschatolog|soteriolog|ecclesiolog|christolog)\b/,
    // Problem of evil / theodicy
    /\b(why does god allow|theodicy|problem of evil|suffering and god|how can god)\b/,
    // Disagreement / paradox
    /\b(disagree|contradict|reconcile|paradox)\b.{0,30}\b(scripture|bible|faith|god|christian)\b/,
    // Explicit depth request
    /\b(in[- ]depth|detailed|thorough)\b.{0,30}\b(theolog|biblical|scriptural|doctr)\b/,
  ];
  return deepPatterns.some((p) => p.test(q)) ? "deep" : "fast";
}

// ─── Routing Settings ─────────────────────────────────────────────────────────

function routeSettings(route: Route) {
  if (route === "deep") {
    return {
      maxTokens: parseInt(process.env.EMMAUS_DEEP_MAX_TOKENS ?? "1400", 10),
      historyTurns: 10,
      reasoningEffort: "medium" as const,
      // EMMAUS_DEEP_MODEL overrides the provider default for deep-path requests.
      // Falls back to the provider's configured model when absent.
      model: process.env.EMMAUS_DEEP_MODEL,
    };
  }
  return {
    maxTokens: parseInt(process.env.EMMAUS_MAX_OUTPUT_TOKENS ?? "900", 10),
    historyTurns: 6,
    reasoningEffort: (process.env.EMMAUS_REASONING_EFFORT ?? "low") as
      | "low"
      | "medium"
      | "high",
    // EMMAUS_FAST_MODEL overrides the provider default for fast-path requests.
      // Use a low-latency default for ordinary questions while keeping the
      // configured provider model available for the deep path.
      model: process.env.EMMAUS_FAST_MODEL ?? "gpt-4o-mini",
  };
}

// ─── Meta Parsing ─────────────────────────────────────────────────────────────

const META_OPEN = "<EMMAUS_META>";
const META_CLOSE = "</EMMAUS_META>";

function extractMeta(fullText: string): {
  cleanText: string;
  metadata: EmmausResponseMetadata | null;
} {
  const openIdx = fullText.indexOf(META_OPEN);
  const closeIdx = fullText.indexOf(META_CLOSE);

  if (openIdx === -1 || closeIdx === -1) {
    // A malformed metadata block must never leak its control tags or JSON
    // into the member-facing answer.
    return {
      cleanText: (openIdx >= 0 ? fullText.slice(0, openIdx) : fullText).trim(),
      metadata: null,
    };
  }

  const cleanText = fullText.substring(0, openIdx).trim();
  const jsonStr = fullText
    .substring(openIdx + META_OPEN.length, closeIdx)
    .trim();

  try {
    const metadata: EmmausResponseMetadata = JSON.parse(jsonStr);
    return { cleanText, metadata };
  } catch {
    return { cleanText, metadata: null };
  }
}

/**
 * Sermon prose is only trusted when retrieval supplied a verified sermon.
 * The model prompt asks it not to invent sermon connections, but the final
 * response still needs a transport-level guard because model compliance is
 * not an authorization boundary.
 */
function stripUnverifiedSermonMentions(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/u)
    .filter((sentence) => !/\b(?:sermon|preach(?:ed|es|ing)?|preacher)\b/i.test(sentence))
    .join(" ");
}

/**
 * Apply the transport-level redactions that are safe to perform while the
 * model is still generating. The final answer is sanitised again after the
 * metadata block has been parsed.
 */
function sanitizeStreamingText(text: string): string {
  return text
    .replace(/<EMMAUS_META[\s\S]*$/gi, "")
    .replace(/<\/?EMMAUS_META>/gi, "")
    .replace(/https?:\/\/[^\s)\]}"']+/gi, "")
    .replace(/(?:^|\s)\/(?:api\/)?(?:bible|journeys?|journey|devotional|sermon(?:-companion)?|rooms?|admin)[^\s)\]}"']*/gi, " ");
}

/**
 * Return the portion of a rolling model buffer that cannot be part of a split
 * metadata tag or an unfinished URL/app route. This lets the visible stream
 * start earlier without weakening the final redaction pass.
 */
function safeStreamingLength(text: string): number {
  let safeLength = Math.max(0, text.length - (META_OPEN.length - 1));
  const unsafeStartPattern =
    /https?:\/\/|(?:^|\s)\/(?:api\/)?(?:bible|journeys?|journey|devotional|sermon(?:-companion)?|rooms?|admin)/gi;

  for (const match of text.matchAll(unsafeStartPattern)) {
    const start = match.index ?? 0;
    if (start < safeLength) safeLength = start;
  }

  return safeLength;
}

function defaultMetadata(): EmmausResponseMetadata {
  return {
    scripture: null,
    nextStep: null,
    nextSteps: [],
    recommendations: [],
    followUpPrompts: [
      "Help me pray through this.",
      "Show me a Journey.",
      "What does Scripture say about this?",
    ],
    handoffType: null,
  };
}

function isLockedDailyRhythmRecommendation(item: { type?: string; title?: string; path?: string }): boolean {
  const title = String(item.title ?? "").toLowerCase();
  const path = String(item.path ?? "").toLowerCase();
  return title === "10 minutes with jesus"
    || path.includes("/15-minutes-with-jesus");
}

// ─── SSE Helpers ──────────────────────────────────────────────────────────────

function sseWrite(res: Response, type: SseEventType, payload: unknown) {
  res.write(
    `data: ${JSON.stringify({ type, ...((payload as object) ?? {}) })}\n\n`
  );
  // Flush immediately when compression/proxy middleware exposes a flush
  // method. Without this, several SSE events can be buffered into one batch.
  (res as Response & { flush?: () => void }).flush?.();
}

/**
 * Complete a request resolved by a server-owned canonical tool.
 *
 * Canonical responses deliberately use the same persistence and SSE boundary as
 * model responses. The client therefore has one contract, while clear
 * navigation/read requests do not incur broad retrieval or model drift.
 */
async function completeCanonicalResponse(
  req: ConversationRequest,
  res: Response,
  store: ReturnType<typeof getConversationStore>,
  builtCtx: ReturnType<typeof buildContext>,
  contextInput: EmmausContextInput,
  metadata: EmmausResponseMetadata,
): Promise<void> {
  const userId = builtCtx.userId;
  const requestedIntent = classifyEmmausIntent(req.message);
  let conversationId = contextInput.conversationId;

  if (!conversationId) {
    const conversation = await store.createConversation({
      userId,
      title: builtCtx.conversationTitle,
      entryPoint: builtCtx.entryPoint,
    });
    conversationId = conversation.id;
  } else {
    const existing = await store.getConversation(conversationId);
    if (!existing) {
      sseWrite(res, "error", { message: "Conversation not found." });
      res.end();
      return;
    }
    if (!isOwner(userId, existing.userId)) {
      sseWrite(res, "error", { message: "Forbidden." });
      res.end();
      return;
    }
  }

  await store.addMessage({
    conversationId,
    userId,
    role: "user",
    content: req.message,
    promptVersion: PROMPT_VERSION,
    entryPoint: builtCtx.entryPoint,
    safetyChecked: true,
    resourceInteractions: [],
  });

  const finalMeta: EmmausResponseMetadata = {
    ...metadata,
    requestedIntent: requestedIntent.mode,
    scriptureReferences: metadata.scriptureReferences ?? (metadata.scripture ? [metadata.scripture] : []),
  };
  const answer = finalMeta.answer ?? "I found the relevant Emmaus destination for you.";
  // Keep canonical responses progressive for the existing client experience,
  // without pretending that a deterministic result is an LLM token stream.
  for (const chunk of answer.match(/.{1,180}(?:\s|$)/g) ?? [answer]) {
    sseWrite(res, "text", { content: chunk });
  }

  const assistantMsg = await store.addMessage({
    conversationId,
    userId,
    role: "assistant",
    content: answer,
    metadata: finalMeta,
    promptVersion: PROMPT_VERSION,
    entryPoint: builtCtx.entryPoint,
    safetyChecked: true,
    resourceInteractions: [],
  });

  sseWrite(res, "done", {
    conversationId,
    messageId: assistantMsg.id,
    metadata: finalMeta,
    promptVersion: PROMPT_VERSION,
  } satisfies SseDonePayload);
  res.end();
}

export function setSseHeaders(res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
}

// ─── Main Service Function ────────────────────────────────────────────────────

export async function handleConversation(
  req: ConversationRequest,
  res: Response
): Promise<void> {
  // ── Timing / tracing ──────────────────────────────────────────────────────
  const reqId = Math.random().toString(36).slice(2, 8);
  const t0 = Date.now();
  const ms = () => Date.now() - t0;

  const store = getConversationStore();
  const provider = createLLMProvider();

  // ── 1. Route classification + name-update detection ───────────────────────
  const route = classifyRoute(req.message);
  const requestedIntent = classifyEmmausIntent(req.message);
  const settings = routeSettings(route);
  const detectedNameUpdate = detectNameUpdate(req.message);

  if (detectedNameUpdate) {
    logger.info(`[emmaus:${reqId}] name_update detected`);
  }

  logger.info(
    `[emmaus:${reqId}] recv route=${route} model=${settings.model ?? "provider-default"} ` +
    `maxTokens=${settings.maxTokens} message_chars=${req.message.length}`
  );

  // ── 2. Build context ──────────────────────────────────────────────────────
  const contextInput: EmmausContextInput = req.context ?? {
    entryPoint: "standalone",
  };
  const builtCtx = buildContext(contextInput);
  const userId = builtCtx.userId;

  logger.info(`[emmaus:${reqId}] context_built ms=${ms()}`);

  // ── 3. Canonical typed request router ─────────────────────────────────────
  //
  // Safety remains the first authority. For safe, high-confidence requests we
  // resolve against authenticated application data before any sermon/resource
  // retrieval or LLM call. General and pastoral language falls through to the
  // established Scripture-first conversation pipeline below.
  // Voice deliberately remains on the existing shared retrieval pipeline.
  // Its authenticated envelope is the transport boundary, not a user hint.
  if (!contextInput.voiceContextEnvelope && checkSafetyKeywordsOnly(req.message).isSafe) {
    const canonical = await resolveCanonicalAskRequest(req.message, userId);
    if (canonical.handled) {
      logger.info(
        `[emmaus:${reqId}] canonical_resolved intent=${routeAskEmmausRequest(req.message).intent} ms=${ms()}`
      );
      await completeCanonicalResponse(req, res, store, builtCtx, contextInput, canonical.metadata);
      return;
    }
  }

  // ── 4. Scripture-first retrieval ─────────────────────────────────────────
  //
  // All three run concurrently — Bible search injects relevant BSB passages;
  // sermon retrieval finds a verified timestamped match; memories personalise
  // the system context with previously approved notes about the user.
  const tSearch = Date.now();
  const retrievalFailures: string[] = [];
  const bibleBookId = contextInput.bibleContext?.bookId;
  const bibleChapter = contextInput.bibleContext?.chapter;
  // AE-1: resolve userId early so we can fetch memories in this parallel step.
  const preUserId = contextInput.userId ?? "anonymous";

  // Scripture is deliberately awaited before Emmaus resources. This ordering is
  // part of the safety contract, not merely prompt wording.
  const biblePassages = await Promise.resolve(searchBibleVerses(req.message, 5))
    .catch((err): BiblePassage[] => {
      retrievalFailures.push("scripture");
      logger.warn({ err: String(err) }, "emmaus: Scripture retrieval unavailable");
      return [];
    });
  logger.info(`[emmaus:${reqId}] scripture_retrieved count=${biblePassages.length}`);
  const [sermonResults, userMemories, resourceCatalogue, userRooms] = await Promise.all([
    retrieveSermons(req.message, bibleBookId, bibleChapter, 3).catch((err) => {
      retrievalFailures.push("sermons");
      logger.warn({ err: String(err) }, "emmaus: sermon retrieval unavailable");
      return [];
    }),
    preUserId !== "anonymous"
      ? store.getMemories(preUserId).catch((): EmmausMemory[] => [])
      : Promise.resolve([] as EmmausMemory[]),
    buildEmmausResourceCatalogue(req.message, bibleBookId, bibleChapter, preUserId),
    preUserId !== "anonymous"
      ? getRoomsForUser(preUserId).catch((): RoomSummary[] => [])
      : Promise.resolve([] as RoomSummary[]),
  ]);

  logger.info(
    `[emmaus:${reqId}] parallel_search ms=${Date.now() - tSearch} ` +
    `bible=${biblePassages.length} sermons=${sermonResults.length} resources=${resourceCatalogue.resources.length}` +
    (resourceCatalogue.sourceFailures.length > 0
      ? ` resource_failures=${resourceCatalogue.sourceFailures.join(",")}`
      : "") +
    (sermonResults[0] ? ` sermon_id=${sermonResults[0].sermonId} src=${sermonResults[0].source}` : "")
  );
  const sermonResult = sermonResults[0] ?? null;

  // ── 5. Get or create conversation ─────────────────────────────────────────
  let conversationId = contextInput.conversationId;
  let canonicalHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
  if (!conversationId) {
    const conv = await store.createConversation({
      userId,
      title: builtCtx.conversationTitle,
      entryPoint: builtCtx.entryPoint,
    });
    conversationId = conv.id;
  } else {
    const existing = await store.getConversation(conversationId);
    if (!existing) {
      sseWrite(res, "error", { message: "Conversation not found." });
      res.end();
      return;
    }
    if (!isOwner(userId, existing.userId)) {
      sseWrite(res, "error", { message: "Forbidden." });
      res.end();
      return;
    }
    const storedMessages = await store.getMessages(conversationId);
    canonicalHistory = storedMessages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({ role: message.role, content: message.content }))
      .slice(-settings.historyTurns);
  }

  // ── 6. Persist user message ───────────────────────────────────────────────
  await store.addMessage({
    conversationId,
    userId,
    role: "user",
    content: req.message,
    promptVersion: PROMPT_VERSION,
    entryPoint: builtCtx.entryPoint,
    safetyChecked: true,
    resourceInteractions: [],
  });

  // ── 7. Safety check ───────────────────────────────────────────────────────
  const safetyResult = checkSafety(req.message, store, {
    userId,
    conversationId,
  });

  if (!safetyResult.isSafe && safetyResult.safetyResponse) {
    const chunks = safetyResult.safetyResponse.split(" ");
    for (const word of chunks) {
      sseWrite(res, "text", { content: word + " " });
    }

    const safetyMsgId = await store.addMessage({
      conversationId,
      userId,
      role: "assistant",
      content: safetyResult.safetyResponse,
      promptVersion: PROMPT_VERSION,
      entryPoint: builtCtx.entryPoint,
      safetyChecked: true,
      resourceInteractions: [],
    });

    sseWrite(res, "done", {
      conversationId,
      messageId: safetyMsgId.id,
      metadata: {
        ...defaultMetadata(),
        handoffType: "crisis",
        followUpPrompts: [],
      },
      promptVersion: PROMPT_VERSION,
    } as SseDonePayload);

    res.end();
    return;
  }

  // ── 8. Check for pastoral handoff (soft) ─────────────────────────────────
  const needsPastoralNote = checkPastoralHandoff(req.message);

  // ── 9. Build messages for LLM ─────────────────────────────────────────────
  //
  // Inject verified sermon info into the context block so the model can
  // reference it naturally in prose — but card data comes from retrieval only.
  let contextBlock = builtCtx.systemContextBlock;
  contextBlock +=
    `\n\nREQUESTED EMMAUS INTENT: ${requestedIntent.mode}. ` +
    "A Bible reference is evidence, not permission to navigate. " +
    (requestedIntent.mode === "ASK"
      ? "Answer in Ask Emmaus and surface validated Scripture; do not direct the member to a route automatically."
      : requestedIntent.mode === "FIND"
        ? "Return validated Bible/resource results inside Ask Emmaus; do not navigate automatically."
        : requestedIntent.mode === "READ"
          ? "Use only validated published content or the validated Bible reference for reading; never invent a route or media URL."
          : "Open only the exact server-valid destination represented by the validated reference; never use a model-generated route.");

  // AE-1: Inject approved user memories (fetched in parallel at step 3).
  // Mirrors the format in context-builder.ts so the model sees a consistent block.
  if (userMemories.length > 0) {
    contextBlock += "\n\nApproved notes about this user (do not reference them directly — weave them in naturally):";
    for (const m of userMemories) {
      contextBlock += `\n  - ${m.content}`;
    }
  }

  // Inject relevant BSB passages — gives the LLM exact verse text to quote
  if (biblePassages.length > 0) {
    contextBlock += "\n\nRelevant Scripture passages (BSB translation) for this question:\n";
    for (const p of biblePassages.slice(0, 5)) {
      contextBlock += `  ${p.reference} — "${p.text}"\n`;
    }
  }

  // Inject the live, publication-safe Emmaus catalogue. Each resource includes
  // bounded authored excerpts so Emmaus can explain and quote content accurately,
  // while exact routes prevent fabricated recommendations.
  {
    const resourceLines: string[] = [];

    resourceLines.push(
      "LIVE PUBLISHED EMMAUS RESOURCES (use these exact titles and paths; quoted material is approved authored content):",
    );
    for (const resource of resourceCatalogue.resources) {
      const details = [
        resource.scripture ? `Scripture: ${resource.scripture}` : "",
        resource.description ? `About: ${resource.description}` : "",
        resource.excerpts.length > 0 ? `Approved excerpts: ${resource.excerpts.map(e => `"${e}"`).join(" | ")}` : "",
        `Source: ${resource.provenance}`,
      ].filter(Boolean).join(" — ");
      resourceLines.push(
        `  - [${resource.type}] id="${resource.resourceId}"${resource.parentId ? ` parentId="${resource.parentId}"` : ""} ` +
        `"${resource.title}" → ${resource.route}${details ? ` — ${details}` : ""}`,
      );
    }

    if (userRooms.length > 0) {
      const room = userRooms[0] as { id: string; name: string };
      resourceLines.push("MEMBER'S ROOM:");
      resourceLines.push(
        `  - "${room.name}" — this member belongs to this room. Where genuinely appropriate, gently suggest sharing a prayer request here. Path: /rooms/${room.id}`
      );
    }

    if (resourceLines.length > 0) {
      contextBlock +=
        "\n\n" +
        resourceLines.join("\n");
    }
    if (resourceCatalogue.sourceFailures.length > 0) {
      retrievalFailures.push(...resourceCatalogue.sourceFailures);
      contextBlock +=
        `\n\nRESOURCE CATALOGUE NOTICE: These sources were unavailable for this request: ${resourceCatalogue.sourceFailures.join(", ")}. ` +
        "Do not imply that unavailable sources were searched or complete.";
    }
  }

  // Inject verified sermon context. The timestamped URL is intentionally kept out
  // of prose because the Preached Here card handles it, but the model must still
  // name the sermon connection and weave its verified insight into the answer.
  if (sermonResult) {
    contextBlock +=
      `\n\nVerified ICC sermon matching this conversation:\n` +
      `  Title: "${sermonResult.title}"\n` +
      `  Speaker: ${sermonResult.speaker}\n` +
      `  Scripture: ${sermonResult.scriptureReference}\n` +
      `  Preached: ${sermonResult.sermonDate}\n` +
      `  Summary: ${sermonResult.summary}\n` +
      `\nYou must weave this sermon's insight naturally into the pastoral prose` +
      ` (e.g. "Pastor ${sermonResult.speaker.split(" ").at(-1)} preached on this — …"),` +
      ` not only provide the link/card. Do not fabricate any detail. The Preached Here card and listen step are added` +
      ` automatically — do NOT generate a "listen" nextStep or a sermon recommendation in metadata.`;
  }

  // When the user just asked for a name change, use the new name in this
  // response's prompt so Emmaus immediately addresses them correctly.
  const trustedUserName = await getTrustedDisplayName(userId);
  const effectiveUserName = detectedNameUpdate ?? trustedUserName;
  const systemPrompt = buildSystemPrompt(contextBlock, effectiveUserName, detectedNameUpdate ?? undefined);

  const messages: LLMMessage[] = [{ role: "system", content: systemPrompt }];

  // Inject conversation history — capped by route
  const historyForPrompt = canonicalHistory.length > 0
    ? canonicalHistory
    : (req.history ?? []).slice(-settings.historyTurns);
  if (historyForPrompt.length > 0) {
    for (const h of historyForPrompt) {
      const content =
        h.role === "assistant" ? extractMeta(h.content).cleanText : h.content;
      messages.push({ role: h.role, content });
    }
  }

  messages.push({ role: "user", content: req.message });

  // ── 10. Stream LLM response ───────────────────────────────────────────────
  //
  // Rolling-buffer streaming parser — handles <EMMAUS_META> appearing:
  //   • fully in one chunk
  //   • split across two or more chunks
  //   • beginning mid-chunk (text before tag must still be emitted)
  let fullResponse = "";
  let emitBuffer = "";
  let pastMetaOpen = false;
  let streamedText = "";
  let firstTextEmitted = false;
  const tLLM = Date.now();

  logger.info(`[emmaus:${reqId}] llm_start context_ms=${tLLM - t0}`);

  try {
    for await (const chunk of provider.streamCompletion(messages, {
      maxTokens: settings.maxTokens,
      reasoningEffort: settings.reasoningEffort,
      model: settings.model,
    })) {
      if (chunk.done) break;

      // Log time-to-first-token once
      if (!firstTextEmitted && chunk.content) {
        firstTextEmitted = true;
        logger.info(`[emmaus:${reqId}] TTFT=${Date.now() - tLLM}ms total_ms=${ms()}`);
      }

      fullResponse += chunk.content;

      if (!pastMetaOpen) {
        emitBuffer += chunk.content;

        const metaIdx = emitBuffer.indexOf(META_OPEN);
        if (metaIdx !== -1) {
          const beforeMeta = emitBuffer.slice(0, metaIdx);
          const safeChunk = sanitizeStreamingText(beforeMeta);
          if (safeChunk) {
            sseWrite(res, "text", { content: safeChunk });
            streamedText += safeChunk;
          }
          pastMetaOpen = true;
          emitBuffer = "";
        } else {
          const safeLen = safeStreamingLength(emitBuffer);
          if (safeLen > 0) {
            const safeChunk = sanitizeStreamingText(emitBuffer.slice(0, safeLen));
            if (safeChunk) {
              sseWrite(res, "text", { content: safeChunk });
              streamedText += safeChunk;
            }
            emitBuffer = emitBuffer.slice(safeLen);
          }
        }
      }
    }
  } catch (err) {
    logger.error(`[emmaus:${reqId}] llm_error after ${ms()}ms: ${err}`);
    sseWrite(res, "error", {
      message: "Something went wrong. Please try again.",
    });
    res.end();
    return;
  }

  // If the provider returned plain prose without a metadata block, release the
  // guarded tail now that the stream has ended.
  if (!pastMetaOpen && emitBuffer) {
    const safeChunk = sanitizeStreamingText(emitBuffer);
    if (safeChunk) {
      sseWrite(res, "text", { content: safeChunk });
      streamedText += safeChunk;
    }
  }

  // Flush remaining buffer
  logger.info(
    `[emmaus:${reqId}] llm_done llm_ms=${Date.now() - tLLM} total_ms=${ms()} chars=${fullResponse.length}`
  );

  // ── 11. Parse metadata ────────────────────────────────────────────────────
  const { cleanText, metadata } = extractMeta(fullResponse);
  const finalMeta: EmmausResponseMetadata = metadata
    ? validateModelResponse(metadata, resourceCatalogue.resources)
    : defaultMetadata();

  if (needsPastoralNote && !finalMeta.handoffType) {
    finalMeta.handoffType = "pastoral";
  }

  // ── 12. Inject verified sermon result (strip LLM-generated sermon recs) ───
  //
  // The LLM is instructed not to include sermon recommendations in metadata,
  // but strip any that appear anyway to prevent fabricated data reaching the UI.
  finalMeta.recommendations = (finalMeta.recommendations ?? []).filter(
    (r) => r.type !== "sermon" && !isLockedDailyRhythmRecommendation(r)
  );
  finalMeta.nextSteps = (finalMeta.nextSteps ?? []).filter(
    (s) => !isLockedDailyRhythmRecommendation(s)
  );

  // Ensure nextSteps is always an array (LLM may omit it)
  if (!finalMeta.nextSteps) finalMeta.nextSteps = [];

  // Model metadata is advisory. Only catalogue-backed resources and valid
  // Scripture references are allowed to reach the client.
  const validatedMeta = validateCitations(finalMeta, resourceCatalogue.resources);
  finalMeta.scripture = validatedMeta.scripture;
  finalMeta.nextStep = validatedMeta.nextStep;
  finalMeta.recommendations = validatedMeta.recommendations;
  finalMeta.requestedIntent = requestedIntent.mode;
  finalMeta.retrievalFailures = Array.from(new Set(retrievalFailures));
  finalMeta.resourceActions = resourceCatalogue.resources
    .slice(0, 28)
    .flatMap((resource) => actionsForResource(resource))
    .map((action) => ({
      ...action,
      resourceType: RESOURCE_TYPE_TO_CONTRACT[action.resourceType],
    }));
  finalMeta.sermonRecommendations = sermonResults.map((sermon) => ({
    sermonId: sermon.sermonId,
    ...(sermon.segmentId ? { segmentId: sermon.segmentId } : {}),
    source: sermon.source,
    title: sermon.title,
    speaker: sermon.speaker,
    sermonDate: sermon.sermonDate,
    excerpt: sermon.excerpt,
    reason: sermon.reason,
    ...(sermon.openPath ? { openPath: sermon.openPath } : {}),
    ...(sermon.timestampedUrl ? { watchUrl: sermon.timestampedUrl } : {}),
    ...(sermon.timestampSeconds != null ? { watchTimestampSeconds: sermon.timestampSeconds } : {}),
    listenAvailable: Boolean(sermon.audioUrl),
    ...(sermon.listenPath ? { listenPath: sermon.listenPath } : {}),
    ...(sermon.audioUrl ? {
      audioUrl: sermon.audioUrl,
      ...(sermon.relativeStartSeconds != null ? { relativeStartSeconds: sermon.relativeStartSeconds } : {}),
    } : {}),
  }));

  // If the model omitted a recommendation despite a clearly matching
  // published resource, expose the best catalogue match deterministically.
  // This keeps retrieval useful without allowing invented routes or IDs.
  if (finalMeta.recommendations.length === 0) {
    const bestResource = resourceCatalogue.resources.find((resource) =>
      resource.type !== "sermon" && resource.relevance >= 1
    );
    if (bestResource) {
      const recommendationType =
        bestResource.type === "bible-study"
          ? "bible_study"
          : bestResource.type === "sermon-companion"
            ? "sermon_companion"
            : bestResource.type === "daily-rhythm"
              ? "daily_rhythm"
              : bestResource.type;
      finalMeta.recommendations.push({
        type: recommendationType,
        title: bestResource.title,
        description: bestResource.description ?? `A published ${bestResource.provenance.toLowerCase()} relevant to this question.`,
        resourceId: bestResource.resourceId,
        parentId: bestResource.parentId,
        path: bestResource.route,
      });
    }
  }

  // Never stream untrusted model URLs. The response body is intentionally
  // sanitized after metadata parsing and before the first text event.
  const safeCleanText = sanitizeStreamingText(cleanText)
    .replace(/\s{2,}/g, " ")
    .trim();
  const safeAnswer = sermonResults.length === 0
    ? stripUnverifiedSermonMentions(safeCleanText)
    : safeCleanText;

  // The model sometimes mentions additional passages in prose without
  // repeating them in scriptureReferences. Promote any exact BSB references
  // it actually named into the trusted citation set so every quoted passage
  // can still be rendered as a clickable citation.
  const proseScriptures = extractValidatedScriptureReferences(safeAnswer);
  const modelScriptureKeys = new Set(
    (finalMeta.scriptureReferences ?? []).map(ref => ref.reference.toLowerCase()),
  );
  const missingProseScriptures = proseScriptures.filter(
    ref => !modelScriptureKeys.has(ref.reference.toLowerCase()),
  );
  if (missingProseScriptures.length > 0) {
    logger.info({
      references: missingProseScriptures.map(ref => ref.reference),
    }, "emmaus: validated Scripture references recovered from prose");
  }
  finalMeta.scriptureReferences = Array.from(
    new Map(
      [...(finalMeta.scriptureReferences ?? []), ...proseScriptures]
        .map(ref => [ref.reference.toLowerCase(), ref] as const),
    ).values(),
  );
  if (!finalMeta.scripture && proseScriptures[0]) finalMeta.scripture = proseScriptures[0];
  if (sermonResults.length === 0) {
    // A "listen" item is a sermon action and must be server-verified just
    // like sermonRecommendations. The model is never allowed to create one.
    finalMeta.nextSteps = finalMeta.nextSteps.filter((step) => step.type !== "listen");
  }
  finalMeta.answer = safeAnswer;
  // Normal responses have already been released incrementally above. Keep the
  // fallback for providers that return no streamable text.
  if (safeAnswer && !streamedText) {
    sseWrite(res, "text", { content: safeAnswer });
  }

  if (sermonResult) {
    // ── Preached Here card ──────────────────────────────────────────────────
    finalMeta.recommendations.unshift({
      type: "sermon",
      label: "Preached Here",
      title: sermonResult.title,
      speakerName: sermonResult.speaker,
      description: sermonResult.summary,
      path: sermonResult.timestampedUrl || sermonResult.openPath,
      sermonId: sermonResult.sermonId,
      timestampSeconds: sermonResult.timestampSeconds,
    });

    // ── Listen step (always verified — never LLM-generated) ────────────────
    const hasListen = finalMeta.nextSteps.some((s) => s.type === "listen");
    if (!hasListen) {
      const titleShort = sermonResult.title.replace(/\s*[|–—]\s*.*/u, "").trim();
      const timeLabel = sermonResult.timestampLabel
        ? `, ${sermonResult.timestampLabel}`
        : "";
      finalMeta.nextSteps.push({
        type: "listen",
        text: `"${titleShort}" — ${sermonResult.speaker}${timeLabel}`,
        path: sermonResult.timestampedUrl,
        watchUrl: sermonResult.timestampedUrl,
        timestampSeconds: sermonResult.timestampSeconds,
        absoluteStartSeconds: sermonResult.timestampSeconds,
        speakerName: sermonResult.speaker,
        audioUrl: sermonResult.audioUrl,
        relativeStartSeconds: sermonResult.relativeStartSeconds,
      } satisfies NextStepItem);
    }
  }

  // ── 13. Persist assistant message ─────────────────────────────────────────
  const assistantMsg = await store.addMessage({
    conversationId,
    userId,
    role: "assistant",
    content: safeAnswer,
    metadata: finalMeta,
    promptVersion: PROMPT_VERSION,
    entryPoint: builtCtx.entryPoint,
    safetyChecked: true,
    resourceInteractions: [],
  });

  // ── 14. Send done event ───────────────────────────────────────────────────
  const donePayload: SseDonePayload = {
    conversationId,
    messageId: assistantMsg.id,
    metadata: finalMeta,
    promptVersion: PROMPT_VERSION,
    ...(detectedNameUpdate ? { detectedNameUpdate } : {}),
  };
  sseWrite(res, "done", donePayload);
  res.end();

  logger.info(`[emmaus:${reqId}] request_complete total_ms=${ms()}`);
}

// ─── List Conversations ───────────────────────────────────────────────────────

export async function listConversations(userId: string) {
  const store = getConversationStore();
  return store.listConversations(userId);
}

// ─── Get Conversation (with owner info for authorization) ─────────────────────

export async function getConversationWithOwner(conversationId: string) {
  const store = getConversationStore();
  return store.getConversation(conversationId);
}

// ─── Get Conversation Messages ────────────────────────────────────────────────

export async function getConversationMessages(conversationId: string) {
  const store = getConversationStore();
  return store.getMessages(conversationId);
}

// ─── Memory Operations ────────────────────────────────────────────────────────

export async function saveMemory(
  userId: string,
  content: string,
  source: string
) {
  const store = getConversationStore();
  return store.addMemory({ userId, content, source, approved: true });
}

export async function deleteMemory(memoryId: string, userId: string) {
  const store = getConversationStore();
  return store.deleteMemory(memoryId, userId);
}

export async function getUserMemories(userId: string) {
  const store = getConversationStore();
  return store.getMemories(userId);
}
