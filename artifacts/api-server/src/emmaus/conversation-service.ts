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
import { buildSystemPrompt, PROMPT_VERSION } from "./system-instructions.js";
import { buildContext, type EmmausContextInput } from "./context-builder.js";
import { isOwner } from "./auth.js";
import { checkSafety, checkPastoralHandoff } from "./safety-layer.js";
import { createLLMProvider, type LLMMessage } from "./llm-provider.js";
import {
  getConversationStore,
  type EmmausResponseMetadata,
  type NextStepItem,
  type EntryPoint,
  type EmmausMemory,
} from "./firestore-model.js";
import {
  retrieveSermon,
  type SermonRetrievalResult,
} from "./sermon-retrieval.js";
import { searchBibleVerses, type BiblePassage } from "../lib/bible-verse-search.js";
import { listPublishedJourneys, type FrontendJourney } from "../lib/journey-store.js";
import { listPublishedSeries, type DevotionalSeries } from "../lib/devotional-store.js";
import { getCurrentWeekPublicCompanion } from "../lib/sermon-companion-store.js";
import { getRoomsForUser, type RoomSummary } from "../lib/room-store.js";
import { logger } from "../lib/logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConversationRequest {
  message: string;
  context?: EmmausContextInput;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export type SseEventType = "text" | "done" | "error";

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
    // Allows routing quick questions to a low-latency model (e.g. gpt-4o)
    // while keeping a stronger model for deep-path reasoning.
    model: process.env.EMMAUS_FAST_MODEL,
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
    return { cleanText: fullText.trim(), metadata: null };
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

// ─── SSE Helpers ──────────────────────────────────────────────────────────────

function sseWrite(res: Response, type: SseEventType, payload: unknown) {
  res.write(
    `data: ${JSON.stringify({ type, ...((payload as object) ?? {}) })}\n\n`
  );
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
  const settings = routeSettings(route);
  const detectedNameUpdate = detectNameUpdate(req.message);

  if (detectedNameUpdate) {
    logger.info(`[emmaus:${reqId}] name_update detected="${detectedNameUpdate}"`);
  }

  logger.info(
    `[emmaus:${reqId}] recv route=${route} maxTokens=${settings.maxTokens} msg="${req.message.slice(0, 60)}"`
  );

  // ── 2. Build context ──────────────────────────────────────────────────────
  const contextInput: EmmausContextInput = req.context ?? {
    entryPoint: "standalone",
  };
  const builtCtx = buildContext(contextInput);
  const userId = builtCtx.userId;

  logger.info(`[emmaus:${reqId}] context_built ms=${ms()}`);

  // ── 3. Parallel: Bible verse search + Sermon retrieval + User memories ───
  //
  // All three run concurrently — Bible search injects relevant BSB passages;
  // sermon retrieval finds a verified timestamped match; memories personalise
  // the system context with previously approved notes about the user.
  const tSearch = Date.now();
  const bibleBookId = contextInput.bibleContext?.bookId;
  const bibleChapter = contextInput.bibleContext?.chapter;
  // AE-1: resolve userId early so we can fetch memories in this parallel step.
  const preUserId = contextInput.userId ?? "anonymous";

  const [biblePassages, sermonResult, userMemories, publishedJourneys, publishedSeries, currentCompanion, userRooms] = await Promise.all([
    Promise.resolve(searchBibleVerses(req.message, 5)).catch((): BiblePassage[] => []),
    retrieveSermon(req.message, bibleBookId, bibleChapter).catch(() => null),
    preUserId !== "anonymous"
      ? store.getMemories(preUserId).catch((): EmmausMemory[] => [])
      : Promise.resolve([] as EmmausMemory[]),
    listPublishedJourneys().catch((): FrontendJourney[] => []),
    listPublishedSeries().catch((): DevotionalSeries[] => []),
    getCurrentWeekPublicCompanion().catch(() => null),
    preUserId !== "anonymous"
      ? getRoomsForUser(preUserId).catch((): RoomSummary[] => [])
      : Promise.resolve([] as RoomSummary[]),
  ]);

  logger.info(
    `[emmaus:${reqId}] parallel_search ms=${Date.now() - tSearch} ` +
    `bible=${biblePassages.length} sermon=${!!sermonResult}` +
    (sermonResult ? ` sermon_id=${sermonResult.sermonId} src=${sermonResult.source}` : "")
  );

  // ── 4. Get or create conversation ─────────────────────────────────────────
  let conversationId = contextInput.conversationId;
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
  }

  // ── 5. Persist user message ───────────────────────────────────────────────
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

  // ── 6. Safety check ───────────────────────────────────────────────────────
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

  // ── 7. Check for pastoral handoff (soft) ─────────────────────────────────
  const needsPastoralNote = checkPastoralHandoff(req.message);

  // ── 8. Build messages for LLM ─────────────────────────────────────────────
  //
  // Inject verified sermon info into the context block so the model can
  // reference it naturally in prose — but card data comes from retrieval only.
  let contextBlock = builtCtx.systemContextBlock;

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

  // Inject published Emmaus content — gives the LLM real, correct paths so it can
  // recommend specific content rather than generic placeholders.
  {
    const resourceLines: string[] = [];

    const contentJourneys = publishedJourneys.filter((j) => j.journeyType !== "companion");
    if (contentJourneys.length > 0) {
      resourceLines.push("WALKS & JOURNEYS (recommend only from this list — use the exact paths):");
      for (const j of contentJourneys) {
        const path =
          j.journeyType === "daily-rhythm" ? "/walk" : `/journeys/${j.id}`;
        const typeLabel = j.journeyType === "daily-rhythm" ? "Daily Rhythm" : "Journey";
        resourceLines.push(`  - "${j.title}" [${typeLabel}] → ${path}`);
      }
    }

    if (publishedSeries.length > 0) {
      resourceLines.push("DEVOTIONAL SERIES:");
      for (const s of publishedSeries) {
        resourceLines.push(`  - "${s.title}" → /devotional/${s.id}/day/1`);
      }
    }

    if (currentCompanion) {
      resourceLines.push("CURRENT SERMON COMPANION:");
      resourceLines.push(
        `  - "${currentCompanion.title}" → /sermon-companion/${currentCompanion.id}/day/1`
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
        "\n\nAvailable published Emmaus content for recommendations (use ONLY these — never invent a resource or path):\n" +
        resourceLines.join("\n");
    }
  }

  // Inject verified sermon context — do NOT include the timestamped URL in the
  // prose (the Preached Here card handles that); just let the model know the
  // sermon exists so it can reference the insight naturally.
  if (sermonResult) {
    contextBlock +=
      `\n\nVerified ICC sermon matching this conversation:\n` +
      `  Title: "${sermonResult.title}"\n` +
      `  Speaker: ${sermonResult.speaker}\n` +
      `  Scripture: ${sermonResult.scriptureReference}\n` +
      `  Preached: ${sermonResult.sermonDate}\n` +
      `  Summary: ${sermonResult.summary}\n` +
      `\nYou may weave this sermon's insight naturally into your prose` +
      ` (e.g. "Pastor ${sermonResult.speaker.split(" ").at(-1)} preached on this — …").` +
      ` Do not fabricate any detail. The Preached Here card and listen step are added` +
      ` automatically — do NOT generate a "listen" nextStep or a sermon recommendation in metadata.`;
  }

  // When the user just asked for a name change, use the new name in this
  // response's prompt so Emmaus immediately addresses them correctly.
  const effectiveUserName = detectedNameUpdate ?? (contextInput.userName?.trim() || undefined);
  const systemPrompt = buildSystemPrompt(contextBlock, effectiveUserName, detectedNameUpdate ?? undefined);

  const messages: LLMMessage[] = [{ role: "system", content: systemPrompt }];

  // Inject conversation history — capped by route
  if (req.history && req.history.length > 0) {
    for (const h of req.history.slice(-settings.historyTurns)) {
      const content =
        h.role === "assistant" ? extractMeta(h.content).cleanText : h.content;
      messages.push({ role: h.role, content });
    }
  }

  messages.push({ role: "user", content: req.message });

  // ── 9. Stream LLM response ────────────────────────────────────────────────
  //
  // Rolling-buffer streaming parser — handles <EMMAUS_META> appearing:
  //   • fully in one chunk
  //   • split across two or more chunks
  //   • beginning mid-chunk (text before tag must still be emitted)
  let fullResponse = "";
  let emitBuffer = "";
  let pastMetaOpen = false;
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
          if (beforeMeta) sseWrite(res, "text", { content: beforeMeta });
          pastMetaOpen = true;
          emitBuffer = "";
        } else {
          const safeLen = Math.max(
            0,
            emitBuffer.length - (META_OPEN.length - 1)
          );
          if (safeLen > 0) {
            sseWrite(res, "text", { content: emitBuffer.slice(0, safeLen) });
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

  // Flush remaining buffer
  if (!pastMetaOpen && emitBuffer) {
    sseWrite(res, "text", { content: emitBuffer });
  }

  logger.info(
    `[emmaus:${reqId}] llm_done llm_ms=${Date.now() - tLLM} total_ms=${ms()} chars=${fullResponse.length}`
  );

  // ── 10. Parse metadata ────────────────────────────────────────────────────
  const { cleanText, metadata } = extractMeta(fullResponse);
  const finalMeta: EmmausResponseMetadata = metadata ?? defaultMetadata();

  if (needsPastoralNote && !finalMeta.handoffType) {
    finalMeta.handoffType = "pastoral";
  }

  // ── 11. Inject verified sermon result (strip LLM-generated sermon recs) ───
  //
  // The LLM is instructed not to include sermon recommendations in metadata,
  // but strip any that appear anyway to prevent fabricated data reaching the UI.
  finalMeta.recommendations = (finalMeta.recommendations ?? []).filter(
    (r) => r.type !== "sermon"
  );

  // Ensure nextSteps is always an array (LLM may omit it)
  if (!finalMeta.nextSteps) finalMeta.nextSteps = [];

  if (sermonResult) {
    // ── Preached Here card ──────────────────────────────────────────────────
    finalMeta.recommendations.unshift({
      type: "sermon",
      label: "Preached Here",
      title: sermonResult.title,
      speakerName: sermonResult.speaker,
      description: sermonResult.summary,
      path: sermonResult.timestampedUrl,
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

  // ── 12. Persist assistant message ─────────────────────────────────────────
  const assistantMsg = await store.addMessage({
    conversationId,
    userId,
    role: "assistant",
    content: cleanText,
    metadata: finalMeta,
    promptVersion: PROMPT_VERSION,
    entryPoint: builtCtx.entryPoint,
    safetyChecked: true,
    resourceInteractions: [],
  });

  // ── 13. Send done event ───────────────────────────────────────────────────
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
