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
  type EntryPoint,
} from "./firestore-model.js";
import {
  retrieveSermon,
  type SermonRetrievalResult,
} from "./sermon-retrieval.js";
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

  // ── 1. Route classification ────────────────────────────────────────────────
  const route = classifyRoute(req.message);
  const settings = routeSettings(route);

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

  // ── 3. Sermon retrieval (deterministic — verified records only) ────────────
  const tSermon = Date.now();
  const bibleBookId = contextInput.bibleContext?.bookId;
  const bibleChapter = contextInput.bibleContext?.chapter;
  const sermonResult: SermonRetrievalResult | null = retrieveSermon(
    req.message,
    bibleBookId,
    bibleChapter
  );

  logger.info(
    `[emmaus:${reqId}] sermon_retrieval ms=${Date.now() - tSermon} found=${!!sermonResult}${sermonResult ? ` id=${sermonResult.sermonId}` : ""}`
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
  if (sermonResult) {
    contextBlock +=
      `\n\nVerified sermon match for this conversation:\n` +
      `  Title: "${sermonResult.title}"\n` +
      `  Speaker: ${sermonResult.speaker}\n` +
      `  Scripture: ${sermonResult.scriptureReference}\n` +
      `  Preached: ${sermonResult.sermonDate}\n` +
      `  Summary: ${sermonResult.summary}\n` +
      `\nYou may reference this sermon naturally in your prose response if it adds genuine value.` +
      ` Do not fabricate any detail not listed above. The Preached Here card is added automatically — do not include it in metadata.`;
  }

  const systemPrompt = buildSystemPrompt(contextBlock);

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
  finalMeta.recommendations = finalMeta.recommendations.filter(
    (r) => r.type !== "sermon"
  );

  if (sermonResult) {
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
