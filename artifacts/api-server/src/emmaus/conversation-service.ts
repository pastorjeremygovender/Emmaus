/**
 * Emmaus Conversation Service
 *
 * Orchestrates the full pipeline for each Ask Emmaus request:
 *   1. Build context (entry point + Bible/Journey/Sermon context)
 *   2. Safety layer (crisis signal detection)
 *   3. LLM Provider (OpenAI or Mock)
 *   4. Parse structured metadata from <EMMAUS_META> block
 *   5. Stream response to client
 *   6. Persist messages to store
 *
 * Required env vars:
 *   OPENAI_API_KEY  — when present, uses gpt-4o; when absent, uses mock provider
 *
 * Optional env vars (Firestore persistence):
 *   FIREBASE_PROJECT_ID
 *   GOOGLE_APPLICATION_CREDENTIALS  OR  FIREBASE_SERVICE_ACCOUNT_KEY
 *   When absent, in-memory store is used — conversations are lost on restart.
 *
 * Startup is never blocked when any env var is absent.
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
  const jsonStr = fullText.substring(openIdx + META_OPEN.length, closeIdx).trim();

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
  res.write(`data: ${JSON.stringify({ type, ...((payload as object) ?? {}) })}\n\n`);
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
  const store = getConversationStore();
  const provider = createLLMProvider();

  // ── 1. Build context ──────────────────────────────────────────────────────
  const contextInput: EmmausContextInput = req.context ?? { entryPoint: "standalone" };
  const builtCtx = buildContext(contextInput);
  const userId = builtCtx.userId;

  // ── 2. Get or create conversation ─────────────────────────────────────────
  let conversationId = contextInput.conversationId;
  if (!conversationId) {
    const conv = await store.createConversation({
      userId,
      title: builtCtx.conversationTitle,
      entryPoint: builtCtx.entryPoint,
    });
    conversationId = conv.id;
  } else {
    // Defensive ownership check: second guardrail in case the service is called
    // directly (e.g. internal tooling, future callers) bypassing the route handler.
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

  // ── 3. Persist user message ───────────────────────────────────────────────
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

  // ── 4. Safety check ───────────────────────────────────────────────────────
  const safetyResult = checkSafety(req.message, store, { userId, conversationId });

  if (!safetyResult.isSafe && safetyResult.safetyResponse) {
    // Stream safety response immediately
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

  // ── 5. Check for pastoral handoff (soft) ──────────────────────────────────
  const needsPastoralNote = checkPastoralHandoff(req.message);

  // ── 6. Build messages for LLM ─────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(builtCtx.systemContextBlock);

  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // Inject conversation history (strip old metadata blocks for brevity)
  if (req.history && req.history.length > 0) {
    for (const h of req.history.slice(-10)) { // cap at 10 prior turns
      const content = h.role === "assistant"
        ? extractMeta(h.content).cleanText
        : h.content;
      messages.push({ role: h.role, content });
    }
  }

  // Current message
  messages.push({ role: "user", content: req.message });

  // ── 7. Stream LLM response ────────────────────────────────────────────────
  //
  // Rolling-buffer streaming parser — handles <EMMAUS_META> appearing:
  //   • fully in one chunk
  //   • split across two or more chunks
  //   • beginning mid-chunk (text before tag must still be emitted)
  //
  // Invariant: the emitBuffer holds at most (META_OPEN.length - 1) chars at any
  // time while searching — just enough to detect a tag that spans a chunk boundary.
  // Text that is confirmed safe (too far from the possible tag start) is emitted
  // immediately. Once the tag is found, emitting stops and the rest of the stream
  // is accumulated into fullResponse for metadata parsing only.
  let fullResponse = "";
  let emitBuffer = "";          // unconfirmed chars (may contain start of tag)
  let pastMetaOpen = false;     // true once <EMMAUS_META> is found

  try {
    for await (const chunk of provider.streamCompletion(messages, { maxTokens: 2000 })) {
      if (chunk.done) break;

      fullResponse += chunk.content;

      if (!pastMetaOpen) {
        emitBuffer += chunk.content;

        const metaIdx = emitBuffer.indexOf(META_OPEN);
        if (metaIdx !== -1) {
          // Tag found — emit all text that came before it, then stop.
          const beforeMeta = emitBuffer.slice(0, metaIdx);
          if (beforeMeta) sseWrite(res, "text", { content: beforeMeta });
          pastMetaOpen = true;
          emitBuffer = "";
        } else {
          // Tag not found — emit everything except the trailing window that
          // could still be the beginning of a split tag (META_OPEN.length - 1 chars).
          const safeLen = Math.max(0, emitBuffer.length - (META_OPEN.length - 1));
          if (safeLen > 0) {
            sseWrite(res, "text", { content: emitBuffer.slice(0, safeLen) });
            emitBuffer = emitBuffer.slice(safeLen);
          }
        }
      }
    }
  } catch (err) {
    console.error("[Emmaus] LLM stream error:", err);
    sseWrite(res, "error", { message: "Something went wrong. Please try again." });
    res.end();
    return;
  }

  // Flush remaining buffer if stream ended before any tag was found
  if (!pastMetaOpen && emitBuffer) {
    sseWrite(res, "text", { content: emitBuffer });
  }

  // ── 8. Parse metadata ─────────────────────────────────────────────────────
  const { cleanText, metadata } = extractMeta(fullResponse);
  const finalMeta: EmmausResponseMetadata = metadata ?? defaultMetadata();

  // Inject pastoral handoff signal if needed
  if (needsPastoralNote && !finalMeta.handoffType) {
    finalMeta.handoffType = "pastoral";
  }

  // ── 9. Persist assistant message ──────────────────────────────────────────
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

  // ── 10. Send done event ───────────────────────────────────────────────────
  const donePayload: SseDonePayload = {
    conversationId,
    messageId: assistantMsg.id,
    metadata: finalMeta,
    promptVersion: PROMPT_VERSION,
  };
  sseWrite(res, "done", donePayload);
  res.end();
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

export async function saveMemory(userId: string, content: string, source: string) {
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
