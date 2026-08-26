/**
 * Emmaus API Routes
 *
 * Identity is derived server-side from a verified OIDC session.
 *
 * POST   /api/emmaus/conversation               — start or continue; streams SSE
 * POST   /api/emmaus/conversation/:id/message   — append to existing; streams SSE
 * GET    /api/emmaus/conversations               — list caller's conversations
 * GET    /api/emmaus/conversation/:id/messages   — get messages (caller must own)
 * POST   /api/emmaus/memory                      — save caller's memory note
 * DELETE /api/emmaus/memory/:id                  — delete caller's memory note
 */

import { Router, type IRouter, type Request, type Response } from "express";
import {
  handleConversation,
  listConversations,
  getConversationWithOwner,
  getConversationMessages,
  saveMemory,
  deleteMemory,
  setSseHeaders,
} from "../emmaus/conversation-service.js";
import {
  toEmmausContextInput,
  type EmmausContextInput,
  type FlatEmmausContext,
} from "../emmaus/context-builder.js";
import type { EntryPoint } from "../emmaus/firestore-model.js";
import { requireAuth, isOwner } from "../emmaus/auth.js";

const router: IRouter = Router();

// ─── Flat Request Shape (matches OpenAPI schema) ───────────────────────────────

/**
 * The flat context shape clients send.
 * Mapped to the nested EmmausContextInput expected by conversation-service.
 */
interface EmmausConversationBody {
  message?: unknown;
  context?: FlatEmmausContext;
  history?: Array<{ role: string; content: string }>;
}

/**
 * Map the flat client context into the nested EmmausContextInput.
 * userId is always taken from the server-derived identity, never from the body.
 */
function parseHistory(raw: unknown): Array<{ role: "user" | "assistant"; content: string }> | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter((h): h is { role: string; content: string } =>
      typeof h?.role === "string" && typeof h?.content === "string" &&
      (h.role === "user" || h.role === "assistant")
    )
    .map(h => ({ role: h.role as "user" | "assistant", content: h.content }));
}

// ─── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /api/emmaus/conversation
 * Starts a new Ask Emmaus conversation (or continues one via context.conversationId).
 * Requires an authenticated identity.
 */
router.post("/emmaus/conversation", async (req: Request, res: Response) => {
  const body = req.body as EmmausConversationBody;
  const userId = requireAuth(req, res);
  if (!userId) return;

  if (!body.message || typeof body.message !== "string" || !body.message.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  setSseHeaders(res);

  await handleConversation(
    {
      message: body.message.trim(),
       context: toEmmausContextInput(body.context, userId),
      history: parseHistory(body.history),
    },
    res
  );
});

/**
 * POST /api/emmaus/conversation/:id/message
 * Appends a message to an existing conversation.
 * Requires auth + ownership — non-owners receive 403, unknown IDs 404.
 */
router.post("/emmaus/conversation/:id/message", async (req: Request, res: Response) => {
  const body = req.body as EmmausConversationBody;
  const userId = requireAuth(req, res);
  if (!userId) return;

  const conversationId = String(req.params.id);

  if (!body.message || typeof body.message !== "string" || !body.message.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const conversation = await getConversationWithOwner(conversationId);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  if (!isOwner(userId, conversation.userId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  setSseHeaders(res);

  await handleConversation(
    {
      message: body.message.trim(),
      context: {
         ...toEmmausContextInput(body.context, userId),
        conversationId,
      },
      history: parseHistory(body.history),
    },
    res
  );
});

/**
 * GET /api/emmaus/conversations
 * Lists the caller's own conversation stubs — always scoped to the verified userId.
 * Requires auth.
 */
router.get("/emmaus/conversations", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const conversations = await listConversations(userId);
  res.json(conversations);
});

/**
 * GET /api/emmaus/conversation/:id/messages
 * Returns messages for a conversation.
 * Requires auth + ownership — non-owners receive 403, unknown IDs 404.
 */
router.get("/emmaus/conversation/:id/messages", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const conversationId = String(req.params.id);
  const conversation = await getConversationWithOwner(conversationId);

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  if (!isOwner(userId, conversation.userId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const messages = await getConversationMessages(conversationId);
  res.json(messages);
});

/**
 * POST /api/emmaus/memory
 * Saves a memory note for the caller. Requires auth.
 */
router.post("/emmaus/memory", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { content, source } = req.body as { content?: string; source?: string };
  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  const memory = await saveMemory(userId, content, source ?? "manual");
  res.status(201).json(memory);
});

/**
 * DELETE /api/emmaus/memory/:id
 * Deletes a memory note — scoped to the caller's verified userId. Requires auth.
 */
router.delete("/emmaus/memory/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  await deleteMemory(String(req.params.id), userId);
  res.status(204).end();
});

export default router;
