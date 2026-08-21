/**
 * admin-sermons.ts — Server-side persistence for admin sermon draft records.
 *
 * GET    /api/admin-sermons           — list all server-persisted sermon drafts
 * GET    /api/admin-sermons/:id       — get one by id
 * POST   /api/admin-sermons           — create / upsert
 * PATCH  /api/admin-sermons/:id       — update fields
 * DELETE /api/admin-sermons/:id       — delete sermon + companion cascade
 *
 * All endpoints require admin or superAdmin role.
 */

import { Router, type Request, type Response } from "express";
import {
  getAllAdminSermons,
  getAdminSermonById,
  upsertAdminSermon,
  updateAdminSermon,
  deleteAdminSermon,
  type AdminSermonRecord,
} from "../lib/admin-sermon-store.js";
import {
  getAllSermons,
  getSermonById,
  updateSermonLifecycle,
  deleteSermonFully as deleteCanonicalSermonFully,
  type CanonicalSermonWithCompanion,
} from "../lib/canonical-sermon-store.js";
import {
  deleteSermonCompanionContent,
  getCompanionBySermonId,
} from "../lib/sermon-companion-store.js";
import { requireAuth } from "../emmaus/auth.js";
import { isAdmin } from "../lib/user-role-store.js";
import { logger } from "../lib/logger.js";

// ─── Canonical → AdminSermonRecord shape ──────────────────────────────────────
// AdminContext and SermonEditor expect AdminSermonRecord-shaped objects.
// Canonical sermons lack a few admin-only fields; they default gracefully.

function canonicalToAdmin(s: CanonicalSermonWithCompanion): AdminSermonRecord {
  const statusMap: Record<string, "draft" | "review" | "published"> = {
    Draft: "draft", Review: "review", Published: "published",
  };
  return {
    id:                  s.id,
    title:               s.title,
    speaker:             s.speaker,
    sermonDate:          s.sermonDate,
    series:              s.series,
    scriptureReference:  s.scriptureReference,
    youtubeUrl:          s.youtubeUrl,
    audioPath:           s.audioPath,
    summary:             s.summary,
    topics:              s.themes,
    keywords:            s.keywords,
    // transcript (AdminSermonRecord) = full recording transcript for re-detect/display
    transcript:          s.fullTranscript || s.transcript,
    // sermonTranscript = sermon-only section (used by Ask Emmaus, companion generation)
    sermonTranscript:    s.transcript,
    transcriptStatus:    s.transcriptStatus,
    aiIndexStatus:       "none",
    companionJourneyId:  s.companionId ?? "",
    mainTheme:           s.mainTheme,
    sermonStartTime:     s.sermonStartTime,
    sermonEndTime:       s.sermonEndTime,
    detectionConfidence: s.detectionConfidence,
    detectionMethod:     s.detectionMethod,
    status:              statusMap[s.status] ?? "draft",
    pastorEdited:        false,
    updatedAt:           s.updatedAt,
    createdAt:           s.createdAt,
    displayOrder:        s.displayOrder,
  };
}

// Map AdminSermonRecord PATCH fields → canonical UpdateSermonData field names
function adminPatchToCanonical(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // Direct-mapped fields (camelCase → camelCase in canonical)
  const direct = ["title","speaker","sermonDate","series","scriptureReference","youtubeUrl","audioPath","summary","keywords","mainTheme","transcriptStatus","sermonStartTime","sermonEndTime","detectionConfidence","detectionMethod","displayOrder"];
  for (const k of direct) if (k in body) out[k] = body[k];
  // transcript in AdminSermonRecord = full recording transcript → canonical fullTranscript
  if ("transcript" in body) out.fullTranscript = body.transcript;
  // sermonTranscript in AdminSermonRecord = sermon-section → canonical transcript (sermon-only).
  // When sermonTranscript is absent (e.g. manually-created or legacy sermon), mirror the full
  // transcript so the canonical transcript stays consistent instead of going stale.
  if ("sermonTranscript" in body) out.transcript = body.sermonTranscript;
  else if ("transcript" in body) out.transcript = body.transcript;
  if ("topics" in body) out.themes = body.topics;
  if ("status" in body) {
    const s = String(body.status);
    out.status = s === "published" ? "Published" : s === "review" ? "Review" : "Draft";
    // Maintain published_at in lockstep with status so canonical ordering is correct.
    // publishSermon() / unpublishSermon() are bypass helpers; the PATCH path must be
    // consistent to cover the editor's "Publish" and "Unpublish" flows.
    if (s === "published") out.publishedAt = new Date().toISOString();
    else out.publishedAt = null;
  }
  return out;
}

export const adminSermonsRouter = Router();

// Role validated from server-side store — never from request headers.
async function guardAdmin(req: Request, res: Response): Promise<string | null> {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  if (!(await isAdmin(userId))) {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  return userId;
}

// ─── GET / ────────────────────────────────────────────────────────────────────
// Returns a merged list: canonical DB sermons (new) + legacy JSON-only sermons.
// Canonical records take precedence; JSON records whose id matches a canonical
// legacy_json_id are suppressed to prevent duplicates.

adminSermonsRouter.get("/", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
  try {
    const [canonicalSermons, jsonSermons] = await Promise.all([
      getAllSermons(),
      getAllAdminSermons(),
    ]);

    // Build set of legacy IDs already covered by canonical records
    const canonicalLegacyIds = new Set(
      canonicalSermons.map(s => s.legacyJsonId).filter(Boolean)
    );

    // Include JSON records that have no canonical counterpart yet
    const legacyOnly = jsonSermons.filter(s => !canonicalLegacyIds.has(s.id));

    const result: AdminSermonRecord[] = [
      ...canonicalSermons.map(canonicalToAdmin),
      ...legacyOnly,
    ];

    res.set("Cache-Control", "no-store");
    res.json(result);
  } catch (err) {
    logger.error({ err }, "admin-sermons: list failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
// Checks canonical DB first (new sermons), then falls back to legacy JSON store.
// The companion UUID is fetched from the DB so canonicalToAdmin returns a correct
// companionJourneyId for the SermonEditor to open the companion tab on reload.

adminSermonsRouter.get("/:id", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
  const id = String(req.params.id);
  try {
    // Try canonical DB — let genuine DB errors propagate (→ 500 below)
    const canonical = await getSermonById(id);
    if (canonical) {
      // Resolve companion ID from the DB so the editor can open the companion tab
      const companion = await getCompanionBySermonId(id).catch(() => null);
      res.json(canonicalToAdmin({ ...canonical, companionId: companion?.id ?? null, isCurrentWeek: false }));
      return;
    }
    // Not in canonical DB — fall back to legacy JSON
    const sermon = await getAdminSermonById(id);
    if (!sermon) {
      res.status(404).json({ error: "Sermon not found" });
      return;
    }
    res.json(sermon);
  } catch (err) {
    logger.error({ err }, "admin-sermons: get failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST / ───────────────────────────────────────────────────────────────────

const ALLOWED_SERMON_STATUSES = ["draft", "review", "published"];

adminSermonsRouter.post("/", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
  const body = req.body as Record<string, unknown>;
  if (!body?.id || typeof body.id !== "string") {
    res.status(400).json({ error: "id is required" });
    return;
  }
  if (body.status !== undefined && !ALLOWED_SERMON_STATUSES.includes(String(body.status))) {
    res.status(400).json({ error: `status must be one of: ${ALLOWED_SERMON_STATUSES.join(", ")}` });
    return;
  }
  try {
    const sermon = await upsertAdminSermon(body as Parameters<typeof upsertAdminSermon>[0]);
    res.status(201).json(sermon);
  } catch (err) {
    logger.error({ err }, "admin-sermons: upsert failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
// Canonical delete: handles canonical DB sermons (new), legacy JSON + companion
// table sermons, and legacy journey-companion sermons.
//
// For canonical DB sermons the companion UUID is resolved from the DB — no
// client-supplied hint is required.  A client-supplied companionJourneyId is
// still accepted as a fallback for legacy sermons that have no JSON record.

adminSermonsRouter.delete("/:id", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
  const id = String(req.params.id);

  // Optional client hint — still respected for legacy sermons
  const bodyCompanionId =
    req.body && typeof req.body.companionJourneyId === "string"
      ? req.body.companionJourneyId
      : null;

  try {
    // ── Canonical DB path ────────────────────────────────────────────────────
    // New sermons created by the generator live here; no JSON record exists.
    // deleteSermonFully wraps companion + sermon deletion in a single transaction
    // so a partial failure never leaves an orphaned or companion-less record.
    const canonicalSermon = await getSermonById(id);
    if (canonicalSermon) {
      logger.info({ sermonId: id, path: "canonical" }, "admin-sermons: beginning atomic canonical delete");

      const { deleted, companionId } = await deleteCanonicalSermonFully(id);

      logger.info({ sermonId: id, deleted, companionId }, "admin-sermons: canonical delete complete");
      res.status(200).json({
        success: true,
        deleted: {
          storageType: "current" as const,
          sermonId: id,
          companionId,
          legacyJourneyId: null,
        },
      });
      return;
    }

    // ── Legacy JSON path ─────────────────────────────────────────────────────
    const jsonSermon = await getAdminSermonById(id);
    const companionJourneyId = jsonSermon?.companionJourneyId ?? bodyCompanionId;

    if (!jsonSermon && !bodyCompanionId) {
      res.status(404).json({
        success: false,
        code: "NOT_FOUND",
        message: "Sermon not found.",
      });
      return;
    }

    logger.info(
      { sermonId: id, companionJourneyId, fromJsonRecord: !!jsonSermon },
      "admin-sermons: beginning legacy delete",
    );

    const result = await deleteSermonCompanionContent({
      sermonId: id,
      companionJourneyId: companionJourneyId ?? null,
    });

    logger.info(result, "admin-sermons: legacy delete complete");
    res.status(200).json({ success: true, deleted: result });
  } catch (err) {
    logger.error({ err, sermonId: id }, "admin-sermons: delete failed");
    res.status(500).json({
      success: false,
      code: "DELETE_FAILED",
      message: "We couldn't delete this Sermon Companion. Nothing was removed. Please try again.",
    });
  }
});

// ─── PATCH /:id ───────────────────────────────────────────────────────────────
// Updates canonical DB first (new sermons), then falls back to legacy JSON store.
//
// All field updates AND knowledge index sync happen in a single DB transaction
// via updateSermonLifecycle — status changes (publish, unpublish, review),
// metadata edits, and index consistency are atomic.

adminSermonsRouter.patch("/:id", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
  const ALLOWED_STATUSES = ["draft", "review", "published"];
  const id = String(req.params.id);
  const body = req.body as Record<string, unknown>;

  if (body.status !== undefined && !ALLOWED_STATUSES.includes(String(body.status))) {
    res.status(400).json({ error: `status must be one of: ${ALLOWED_STATUSES.join(", ")}` });
    return;
  }

  try {
    // Check canonical DB first — let genuine DB errors propagate (→ 500 below)
    const canonicalExists = await getSermonById(id);
    if (canonicalExists) {
      // updateSermonLifecycle applies every field in the patch AND syncs the
      // knowledge index in one atomic DB transaction. Status transitions
      // (draft → published, published → draft, any → review) are handled
      // correctly: Published → upsert index; Draft/Review → remove from index.
      const canonicalPatch = adminPatchToCanonical(body);
      const updated = await updateSermonLifecycle(id, canonicalPatch);
      if (!updated) {
        res.status(404).json({ error: "Sermon not found" });
        return;
      }

      // Resolve companion so the response carries the correct companionJourneyId
      const companion = await getCompanionBySermonId(id).catch(() => null);
      res.json(canonicalToAdmin({ ...updated, companionId: companion?.id ?? null, isCurrentWeek: false }));
      return;
    }
    // Not in canonical DB — fall back to legacy JSON store
    const jsonUpdated = await updateAdminSermon(id, body);
    if (!jsonUpdated) {
      res.status(404).json({ error: "Sermon not found" });
      return;
    }
    res.json(jsonUpdated);
  } catch (err) {
    logger.error({ err }, "admin-sermons: update failed");
    res.status(500).json({ error: "Server error" });
  }
});
