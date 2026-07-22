/**
 * Emmaus API Routes
 *
 * Identity is derived server-side from a signed session cookie (emmaus_uid)
 * or the X-User-Id header in dev/demo mode — never from request body or query.
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
import type { EmmausContextInput, BibleContext, JourneyContext, SermonContext } from "../emmaus/context-builder.js";
import type { EntryPoint } from "../emmaus/firestore-model.js";
import { requireAuth, isOwner, setUserCookie } from "../emmaus/auth.js";

const router: IRouter = Router();

// ─── Flat Request Shape (matches OpenAPI schema) ───────────────────────────────

/**
 * The flat context shape clients send.
 * Mapped to the nested EmmausContextInput expected by conversation-service.
 */
interface FlatContext {
  entryPoint?: string;
  conversationId?: string;
  userName?: string;
  // Bible
  bookId?: string;
  bookName?: string;
  chapter?: number;
  chapterHeading?: string;
  verseText?: string;
  // Journey
  journeyId?: string;
  journeyTitle?: string;
  currentDay?: number;
  // Sermon
  sermonId?: string;
  sermonTitle?: string;
  scriptureReference?: string;
}

interface EmmausConversationBody {
  message?: unknown;
  context?: FlatContext;
  history?: Array<{ role: string; content: string }>;
}

/**
 * Map the flat client context into the nested EmmausContextInput.
 * userId is always taken from the server-derived identity, never from the body.
 */
function toContextInput(flat: FlatContext | undefined, userId: string): EmmausContextInput {
  const entryPoint = (flat?.entryPoint ?? "standalone") as EntryPoint;

  const ctx: EmmausContextInput = {
    entryPoint,
    userId,
    conversationId: flat?.conversationId,
    userName: flat?.userName,
  };

  // Bible context (used by bible entry point)
  if (flat?.bookId || flat?.bookName || flat?.chapter) {
    const bible: BibleContext = {
      bookId: flat.bookId ?? "",
      bookName: flat.bookName ?? "",
      chapter: flat.chapter ?? 1,
      chapterHeading: flat.chapterHeading,
      verseText: flat.verseText,
      // Journey linkage within a Bible reading
      journeyId: flat.journeyId,
      journeyTitle: flat.journeyTitle,
    };
    ctx.bibleContext = bible;
  }

  // Journey context (used by journeys entry point, no bookId)
  if (flat?.journeyId && !flat?.bookId) {
    const journey: JourneyContext = {
      journeyId: flat.journeyId,
      journeyTitle: flat.journeyTitle ?? flat.journeyId,
      currentDay: flat.currentDay ?? 1,
    };
    ctx.journeyContext = journey;
  }

  // Sermon context
  if (flat?.sermonId) {
    const sermon: SermonContext = {
      sermonId: flat.sermonId,
      sermonTitle: flat.sermonTitle ?? flat.sermonId,
      scriptureReference: flat.scriptureReference,
    };
    ctx.sermonContext = sermon;
  }

  return ctx;
}

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
 * Requires authenticated identity; issues a session cookie for subsequent requests.
 */
router.post("/emmaus/conversation", async (req: Request, res: Response) => {
  const body = req.body as EmmausConversationBody;
  const userId = requireAuth(req, res);
  if (!userId) return;

  if (!body.message || typeof body.message !== "string" || !body.message.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  // Issue a signed session cookie so subsequent requests use it instead of the header
  setUserCookie(res, userId);
  setSseHeaders(res);

  await handleConversation(
    {
      message: body.message.trim(),
      context: toContextInput(body.context, userId),
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

  setUserCookie(res, userId);
  setSseHeaders(res);

  await handleConversation(
    {
      message: body.message.trim(),
      context: {
        ...toContextInput(body.context, userId),
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
