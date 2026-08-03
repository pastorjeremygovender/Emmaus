/**
 * sermons.ts — Canonical Sermon API routes.
 *
 * Member endpoints (require auth only):
 *   GET  /api/sermons                   — list published sermons
 *   GET  /api/sermons/:id               — get one published sermon
 *
 * Admin endpoints (require admin or superAdmin role):
 *   GET    /api/sermons/admin             — list all sermons (any status)
 *   GET    /api/sermons/admin/:id         — get one sermon by UUID
 *   POST   /api/sermons/admin             — create new canonical sermon
 *   PATCH  /api/sermons/admin/:id         — update sermon fields
 *   DELETE /api/sermons/admin/:id         — delete sermon (+ companion FK cascade)
 *   POST   /api/sermons/admin/:id/publish   — publish sermon
 *   POST   /api/sermons/admin/:id/unpublish — return sermon to Draft
 *   POST   /api/sermons/admin/:id/audio-upload-url — presigned GCS upload URL for audio
 *   POST   /api/sermons/admin/:id/transcribe — Whisper transcription (fire-and-forget, poll for status)
 *
 * Design intent:
 * - This is the SINGLE SOURCE OF TRUTH for all sermon content.
 * - `/api/admin-sermons` (file-backed JSON) is kept for backward-compat during
 *   the transition period, but all new creation/editing goes through this router.
 * - Published canonical sermons suppresses matching YouTube archive results in
 *   Ask Emmaus and Preached Here (suppression happens in retrieval layers).
 */

import { Router, type Request, type Response } from "express";
import * as store from "../lib/canonical-sermon-store.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { deleteSermonCompanionContent } from "../lib/sermon-companion-store.js";
import { requireAuth } from "../emmaus/auth.js";
import { isAdmin } from "../lib/user-role-store.js";
import { logger } from "../lib/logger.js";

export const sermonsRouter = Router();
const objectStorage = new ObjectStorageService();

// ─── Auth helpers ──────────────────────────────────────────────────────────────

async function guardAdmin(req: Request, res: Response): Promise<string | null> {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  if (!(await isAdmin(userId))) {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  return userId;
}

// ─── Member: list published sermons ──────────────────────────────────────────
// Returns CanonicalSermonWithCompanion[] so clients can route to SermonHome.

sermonsRouter.get("/", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const sermons = await store.listPublishedSermons(); // includes companionId
    res.set("Cache-Control", "no-store");
    res.json(sermons);
  } catch (err) {
    logger.error({ err }, "sermons: listPublished failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin GET routes MUST precede /:id — Express matches in registration order ─
// Placing GET /admin after GET /:id causes Express to match /admin as id="admin"
// and short-circuit before the admin handler is ever reached.

// ─── Admin: list all sermons ──────────────────────────────────────────────────

sermonsRouter.get("/admin", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
  try {
    const sermons = await store.getAllSermons();
    res.set("Cache-Control", "no-store");
    res.json(sermons);
  } catch (err) {
    logger.error({ err }, "sermons: listAll failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin: get one sermon ────────────────────────────────────────────────────

sermonsRouter.get("/admin/:id", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
  const id = String(req.params.id);
  try {
    const sermon = await store.getSermonById(id);
    if (!sermon) {
      res.status(404).json({ error: "Sermon not found" });
      return;
    }
    res.json(sermon);
  } catch (err) {
    logger.error({ err }, "sermons: getAdmin failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Member: presigned audio download URL ────────────────────────────────────
// Returns a short-lived (~1 hour) presigned GCS GET URL for the sermon's audio.
// The URL is generated at request time — never stored or cached.
// 404 when sermon not found or has no audioPath.
// 410 (Gone) when the file no longer exists in storage.

sermonsRouter.get("/:id/audio-url", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = String(req.params.id);
  try {
    const sermon = await store.getPublishedSermonById(id);
    if (!sermon || sermon.status !== "Published") {
      res.status(404).json({ error: "Sermon not found" });
      return;
    }
    if (!sermon.audioPath?.trim()) {
      res.status(404).json({ error: "No audio available for this sermon" });
      return;
    }
    try {
      const url = await objectStorage.getObjectEntityDownloadURL(sermon.audioPath.trim(), 3600);
      res.set("Cache-Control", "no-store");
      res.json({ url });
    } catch (storageErr: unknown) {
      const name = storageErr instanceof Error ? storageErr.name : "";
      if (name === "ObjectNotFoundError") {
        res.status(410).json({ error: "Audio file is no longer available" });
        return;
      }
      throw storageErr;
    }
  } catch (err) {
    logger.error({ err, sermonId: id }, "sermons: audio-url failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Member: get one published sermon ────────────────────────────────────────
// Returns CanonicalSermonWithCompanion so SermonHome can show the companion CTA.

sermonsRouter.get("/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = String(req.params.id);
  try {
    const sermon = await store.getPublishedSermonById(id);
    if (!sermon || sermon.status !== "Published") {
      res.status(404).json({ error: "Sermon not found" });
      return;
    }
    res.set("Cache-Control", "no-store");
    res.json(sermon);
  } catch (err) {
    logger.error({ err }, "sermons: getMember failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin: create new canonical sermon ──────────────────────────────────────

sermonsRouter.post("/admin", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
  const body = req.body as Record<string, unknown>;

  if (!body?.title || typeof body.title !== "string" || !body.title.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  try {
    const sermon = await store.createSermon({
      legacyJsonId:       null,
      title:              String(body.title ?? ""),
      speaker:            String(body.speaker ?? ""),
      sermonDate:         String(body.sermonDate ?? ""),
      series:             String(body.series ?? ""),
      scriptureReference: String(body.scriptureReference ?? ""),
      scriptureBookIds:   Array.isArray(body.scriptureBookIds) ? body.scriptureBookIds as string[] : [],
      scriptureChapters:  Array.isArray(body.scriptureChapters) ? body.scriptureChapters as number[] : [],
      youtubeUrl:         String(body.youtubeUrl ?? ""),
      youtubeVideoId:     String(body.youtubeVideoId ?? ""),
      audioPath:          String(body.audioPath ?? ""),
      notes:              String(body.notes ?? ""),
      transcript:         String(body.transcript ?? ""),
      transcriptStatus:   (body.transcriptStatus as store.CanonicalSermon["transcriptStatus"]) ?? "none",
      summary:            String(body.summary ?? ""),
      themes:             Array.isArray(body.themes) ? body.themes as string[] : [],
      sections:           Array.isArray(body.sections) ? body.sections as store.SermonSection[] : [],
      keywords:           Array.isArray(body.keywords) ? body.keywords as string[] : [],
      mainTheme:          String(body.mainTheme ?? ""),
      status:             (body.status as store.CanonicalSermon["status"]) ?? "Draft",
    });
    res.status(201).json(sermon);
  } catch (err) {
    logger.error({ err }, "sermons: create failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin: update sermon fields ──────────────────────────────────────────────

sermonsRouter.patch("/admin/:id", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
  const id = String(req.params.id);
  const body = req.body as store.UpdateSermonData;

  // Guard: status must be a valid value if provided
  if (body.status !== undefined && !["Draft", "Review", "Published"].includes(body.status)) {
    res.status(400).json({ error: "status must be Draft, Review, or Published" });
    return;
  }

  try {
    const updated = await store.updateSermon(id, body);
    if (!updated) {
      res.status(404).json({ error: "Sermon not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "sermons: update failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin: publish sermon ────────────────────────────────────────────────────

sermonsRouter.post("/admin/:id/publish", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
  const id = String(req.params.id);
  try {
    const sermon = await store.publishSermon(id);
    if (!sermon) {
      res.status(404).json({ error: "Sermon not found" });
      return;
    }
    res.json(sermon);
  } catch (err) {
    logger.error({ err }, "sermons: publish failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin: unpublish sermon ──────────────────────────────────────────────────

sermonsRouter.post("/admin/:id/unpublish", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
  const id = String(req.params.id);
  try {
    const sermon = await store.unpublishSermon(id);
    if (!sermon) {
      res.status(404).json({ error: "Sermon not found" });
      return;
    }
    res.json(sermon);
  } catch (err) {
    logger.error({ err }, "sermons: unpublish failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin: delete sermon (cascade companion) ─────────────────────────────────
//
// Deletes the canonical sermon record. If there is a linked sermon companion
// (sermon_companion.sermon_uuid = this id), it is also deleted via the companion
// store cascade. The legacy sermon_id text column is used as a fallback.

sermonsRouter.delete("/admin/:id", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
  const id = String(req.params.id);

  try {
    const sermon = await store.getSermonById(id);
    if (!sermon) {
      res.status(404).json({ error: "Sermon not found" });
      return;
    }

    // Delete companion content if linked (uses legacyJsonId as the sermon_id key)
    if (sermon.legacyJsonId) {
      await deleteSermonCompanionContent({
        sermonId: sermon.legacyJsonId,
        companionJourneyId: null,
      }).catch(err =>
        logger.warn({ err, sermonId: id }, "sermons: companion delete failed (continuing)")
      );
    }

    const deleted = await store.deleteSermon(id);
    if (!deleted) {
      res.status(404).json({ error: "Sermon not found" });
      return;
    }

    logger.info({ sermonId: id, title: sermon.title }, "sermons: deleted");
    res.json({ success: true, deleted: { id, title: sermon.title } });
  } catch (err) {
    logger.error({ err }, "sermons: delete failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin: transcribe uploaded audio via OpenAI Whisper ─────────────────────
//
// Downloads the audio from object storage and calls Whisper-1.
// Returns 202 immediately after setting transcriptStatus to "pending" so the
// request completes before any proxy timeout fires (Whisper typically takes
// 30–120 seconds — longer than most production proxy limits).
//
// The caller polls GET /admin/:id until transcriptStatus is "complete" or "none"
// (none = failure, so the admin can retry).

sermonsRouter.post("/admin/:id/transcribe", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
  const id = String(req.params.id);

  try {
    const sermon = await store.getSermonById(id);
    if (!sermon) {
      res.status(404).json({ error: "Sermon not found" });
      return;
    }
    if (!sermon.audioPath) {
      res.status(400).json({ error: "No audio file uploaded for this sermon. Upload audio first." });
      return;
    }

    // Mark as pending immediately so client can show progress
    const pending = await store.updateSermon(id, { transcriptStatus: "pending" });

    // Return 202 before the long Whisper call — prevents proxy timeout.
    // Client must poll GET /admin/:id until transcriptStatus changes.
    res.status(202).json(pending);

    // ── Background transcription ──────────────────────────────────────────
    // This runs after the HTTP response has been sent.
    // NOTE: fire-and-forget is not durable across process restarts. If the
    // server restarts mid-transcription, status stays "pending" and the admin
    // must manually reset and retry. This is an accepted constraint for now.
    (async () => {
      try {
        const { transcribeAudio } = await import("../lib/audio-transcription.js");
        const transcript = await transcribeAudio(sermon.audioPath);

        await store.updateSermon(id, {
          transcript,
          fullTranscript: transcript,
          transcriptStatus: "complete",
        });

        logger.info({ sermonId: id, chars: transcript.length }, "sermons: transcription complete");
      } catch (bgErr) {
        // Reset status to none so admin can retry
        await store.updateSermon(id, { transcriptStatus: "none" }).catch(() => {});
        logger.error({ err: bgErr, sermonId: id }, "sermons: background transcription failed");
      }
    })();
  } catch (err) {
    logger.error({ err, sermonId: id }, "sermons: transcribe request setup failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Transcription failed" });
  }
});

// ─── Admin: run full processing pipeline ─────────────────────────────────────
//
// Triggers the full audio-first pipeline in the background:
//   transcribing → generating → complete (or failed:<stage>)
//
// Returns 202 immediately after setting processingStage = 'transcribing'.
// The client polls GET /admin/:id until processingStage reaches 'complete'
// or a 'failed:...' value.

sermonsRouter.post("/admin/:id/process", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
  const id = String(req.params.id);

  try {
    const sermon = await store.getSermonById(id);
    if (!sermon) {
      res.status(404).json({ error: "Sermon not found" });
      return;
    }
    if (!sermon.audioPath) {
      res.status(400).json({ error: "No audio uploaded for this sermon. Upload audio first." });
      return;
    }

    // Mark as transcribing immediately so the client can start polling
    const pending = await store.updateSermon(id, {
      processingStage: "transcribing",
      processingError: "",
    });

    // Return 202 before the long background work starts
    res.status(202).json(pending);

    // ── Background pipeline ──────────────────────────────────────────────
    // Runs after the HTTP response is sent. Fire-and-forget — if the server
    // restarts mid-run, processingStage stays at its last value and the admin
    // can retry from the processing screen.
    (async () => {
      try {
        const { transcribeAudio }                      = await import("../lib/audio-transcription.js");
        const { generateSermonContentFromTranscript }  = await import("../lib/sermon-generator.js");

        // Stage 1 — transcribe
        let fullTranscript: string;
        try {
          fullTranscript = await transcribeAudio(sermon.audioPath);
        } catch (transcribeErr) {
          await store.updateSermon(id, {
            processingStage: "failed:transcribing",
            processingError: transcribeErr instanceof Error
              ? transcribeErr.message
              : "Transcription failed",
            transcriptStatus: "none",
          }).catch(() => {});
          logger.error({ err: transcribeErr, sermonId: id }, "sermons: process — transcription failed");
          return;
        }

        // Persist the transcript and advance stage
        await store.updateSermon(id, {
          transcript:      fullTranscript,
          fullTranscript,
          transcriptStatus: "complete",
          processingStage:  "generating",
        }).catch(() => {});

        // Stage 2 — generate sermon draft + companion
        try {
          await generateSermonContentFromTranscript(id, fullTranscript, {
            title:   sermon.title,
            speaker: sermon.speaker,
          });
        } catch (genErr) {
          await store.updateSermon(id, {
            processingStage: "failed:generating",
            processingError: genErr instanceof Error
              ? genErr.message
              : "Content generation failed",
          }).catch(() => {});
          logger.error({ err: genErr, sermonId: id }, "sermons: process — generation failed");
          return;
        }

        logger.info({ sermonId: id }, "sermons: process pipeline complete");
      } catch (bgErr) {
        await store.updateSermon(id, {
          processingStage: "failed:transcribing",
          processingError: bgErr instanceof Error ? bgErr.message : "Processing failed",
        }).catch(() => {});
        logger.error({ err: bgErr, sermonId: id }, "sermons: process — unexpected background failure");
      }
    })();
  } catch (err) {
    logger.error({ err, sermonId: id }, "sermons: process request setup failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Processing failed" });
  }
});

// ─── Admin: request presigned audio upload URL ────────────────────────────────
//
// Returns a GCS presigned PUT URL so the client can upload audio directly.
// The objectPath returned here should be stored in sermon.audioPath after upload.
// Body: { name: string, size: number, contentType: string }

sermonsRouter.post("/admin/:id/audio-upload-url", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
  const id = String(req.params.id);
  const { name, size, contentType } = req.body as {
    name?: string;
    size?: number;
    contentType?: string;
  };

  if (!name || !size || !contentType) {
    res.status(400).json({ error: "name, size, and contentType are required" });
    return;
  }

  try {
    // Verify sermon exists
    const sermon = await store.getSermonById(id);
    if (!sermon) {
      res.status(404).json({ error: "Sermon not found" });
      return;
    }

    const uploadURL = await objectStorage.getObjectEntityUploadURL();
    const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL);

    // Auto-update the sermon's audioPath so it's stored immediately
    await store.updateSermon(id, { audioPath: objectPath });

    res.json({ uploadURL, objectPath });
  } catch (err) {
    logger.error({ err, sermonId: id }, "sermons: audio-upload-url failed");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});
