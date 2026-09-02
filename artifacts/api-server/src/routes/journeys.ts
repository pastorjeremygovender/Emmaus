/**
 * Journey CMS Routes
 *
 * Admin mutation routes require an authenticated caller. Identity is always
 * derived server-side from the secure session cookie via extractUserId().
 *
 * Progress routes also derive identity server-side via the session cookie —
 * body and query params are never trusted as an identity source.
 */

import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { extractUserId, requireAuth, requireSuperAdmin } from "../emmaus/auth.js";
import * as store from "../lib/journey-store.js";
import type { FrontendStep } from "../lib/journey-store.js";
import { parseImportCsv, exportJourneysToCsv } from "../lib/journey-csv.js";
import { generateJourney, generateStructuredJourney, generateWalkIntroduction, aiBlockAction, type BuilderPayload } from "../lib/journey-ai.js";
import { logAuditEvent } from "../lib/audit-log.js";
import { isAdmin, getUserRole } from "../lib/user-role-store.js";
import * as dailyRhythmGroups from "../lib/daily-rhythm-groups-store.js";
import { selectDailyRhythmSteps } from "../lib/daily-rhythm-content-access.js";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve userId for progress routes from trusted server-side identity only.
 * The secure session cookie is the only accepted source — body and query params
 * are NOT trusted to prevent a caller from reading or writing another user's
 * progress.
 */
function resolveUserId(req: Request): string | null {
  return extractUserId(req);
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 60);
}

/**
 * Find the first unused journey ID based on a base slug.
 * Tries base, then base-2, base-3, … until one is free.
 */
async function findUniqueId(base: string): Promise<string> {
  const baseId = base || `journey-${Date.now()}`;
  if (!(await store.getJourney(baseId))) return baseId;
  for (let n = 2; n <= 99; n++) {
    // keep total length ≤ 63 chars (leave room for the suffix)
    const candidate = `${baseId.substring(0, 57)}-${n}`;
    if (!(await store.getJourney(candidate))) return candidate;
  }
  // Ultimate fallback — timestamp suffix is always unique
  return `${baseId.substring(0, 48)}-${Date.now()}`;
}

// ─── Public catalogue ─────────────────────────────────────────────────────────

router.get("/journeys/published", async (_req: Request, res: Response) => {
  const journeys = await store.listPublishedJourneys();
  res.json({ journeys });
});

// ─── Progress routes (before /:id to avoid shadowing) ─────────────────────────

router.get("/journeys/progress", async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  if (!userId) { res.status(400).json({ error: "userId is required" }); return; }
  const progress = await store.getAllProgress(userId);
  res.set("Cache-Control", "no-store");
  res.json({ progress });
});

router.get("/journeys/daily-rhythm/state", async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    res.set("Cache-Control", "no-store");
    res.json(await store.getDailyRhythmState(userId));
  } catch (err) {
    console.error("GET /journeys/daily-rhythm/state failed", err);
    res.status(500).json({ error: "Could not load Daily Rhythm state" });
  }
});

router.get("/journeys/daily-rhythm/history", async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    res.set("Cache-Control", "no-store");
    const history = await store.getDailyRhythmHistory(userId);
    if (!history) { res.status(404).json({ error: "Daily Rhythm progress not found" }); return; }
    res.json(history);
  } catch (err) {
    console.error("GET /journeys/daily-rhythm/history failed", err);
    res.status(500).json({ error: "Could not load Daily Rhythm history" });
  }
});

router.get("/journeys/daily-rhythm/startup", async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    res.set("Cache-Control", "no-store");
    const startupSession = String(req.get("x-emmaus-startup-session") ?? "").trim();
    const clientTimezone = String(req.get("x-emmaus-timezone") ?? "").trim();
    const result = await store.getDailyRhythmStartup(userId, startupSession, clientTimezone);
    console.info("[DailyOpen]", {
      traceId: String(req.id ?? "unknown"),
      timestamp: new Date().toISOString(),
      user: `u-${Buffer.from(userId).toString("base64url").slice(0, 10)}`,
      session: startupSession ? startupSession.slice(0, 12) : "none",
      localDate: result.localDate,
      localTimezone: result.localTimezone,
      currentDay: result.currentDay,
      state: result.state,
      decisionId: result.decisionId,
      returnedDestination: result.destination,
      timings: result.timings,
    });
    res.json(result);
  } catch (err) {
    const diagnosticReference = `opening-${randomUUID()}`;
    const message = err instanceof Error ? err.message : "unknown";
    console.error("GET /journeys/daily-rhythm/startup failed", {
      diagnosticReference,
      code: message,
    });
    const unavailable = message === "DAILY_RHYTHM_OPENING_LEDGER_UNAVAILABLE";
    res.status(unavailable ? 503 : 500).json({
      state: "OPENING_ERROR",
      error: "Could not resolve today's opening.",
      reason: unavailable ? "opening_ledger_unavailable" : "opening_resolution_failed",
      diagnosticReference,
      destination: null,
    });
  }
});

router.post("/journeys/progress/import", (_req: Request, res: Response) => {
  res.status(410).json({
    error: "Legacy progress import has been removed. Browser progress cannot be imported into an authenticated account.",
  });
});

// ─── Intro-step check (public) ────────────────────────────────────────────────

/**
 * GET /journeys/check-intro?ids=id1,id2,id3
 *
 * Returns the subset of the supplied journey IDs that have a Walk Introduction
 * step (day = 0). Used by the CollectionPage to route not-started walks to
 * day/0 instead of hard-coding day/1.
 */
router.get("/journeys/check-intro", async (req: Request, res: Response) => {
  const raw = String(req.query.ids ?? "").trim();
  const ids = raw ? raw.split(",").map(s => s.trim()).filter(Boolean) : [];
  if (ids.length === 0) {
    res.json({ journeyIdsWithIntro: [] });
    return;
  }
  const introSet = await store.getJourneyIdsWithIntroStep(ids);
  res.json({ journeyIdsWithIntro: Array.from(introSet) });
});

// ─── Search ───────────────────────────────────────────────────────────────────

router.get("/journeys/search", async (req: Request, res: Response) => {
  const q = String(req.query.q ?? "").trim();
  const rawTags = String(req.query.tags ?? "").trim();
  const tags = rawTags ? rawTags.split(",").map(t => t.trim()).filter(Boolean) : [];
  const results = await store.searchJourneys(q, tags);
  res.json(results);
});

// ─── CSV Export ───────────────────────────────────────────────────────────────

router.get("/journeys/export", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;
  if (!(await isAdmin(callerId))) { res.status(403).json({ error: "Admin access required" }); return; }

  const rawIds = String(req.query.ids ?? "").trim();
  const ids = rawIds ? rawIds.split(",").map(s => s.trim()).filter(Boolean) : [];

  const allJourneys = await store.listJourneys();
  const toExport = ids.length ? allJourneys.filter(j => ids.includes(j.id)) : allJourneys;

  const withSteps = await Promise.all(
    toExport.map(async j => ({
      ...j,
      steps: await store.listSteps(j.id),
    }))
  );

  const csv = exportJourneysToCsv(withSteps);
  const filename = toExport.length === 1
    ? `${toExport[0].id}-export.csv`
    : `journeys-export-${Date.now()}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

// ─── CSV Import ───────────────────────────────────────────────────────────────

router.post("/journeys/import", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;
  if (!(await isAdmin(callerId))) { res.status(403).json({ error: "Admin access required" }); return; }

  const { csv, batchId } = req.body as { csv: string; batchId?: string };
  if (!csv || typeof csv !== "string") {
    res.status(400).json({ error: "csv field (string) is required" });
    return;
  }

  const parsed = parseImportCsv(csv);

  // Separate blocking errors from warnings
  const blockingErrors = parsed.rowErrors.filter(e => e.row > 0 && ["journey_title", "step_number", "step_title", "teaching"].includes(e.column));
  if (blockingErrors.length) {
    res.status(422).json({ errors: parsed.rowErrors, journeys: [], imported: 0 });
    return;
  }

  const importBatchId = batchId ?? `import-${Date.now()}`;
  const createdJourneyIds: string[] = [];

  for (const importJourney of parsed.journeys) {
    // Create journey (use existing if same id exists; overwrite on re-import by appending batch suffix)
    let journeyId = importJourney.id;
    const existing = await store.getJourney(journeyId);
    if (existing) {
      journeyId = `${journeyId}-${Date.now()}`.substring(0, 60);
      importJourney.id = journeyId;
    }

    await store.createJourney({
      id: journeyId,
      title: importJourney.title,
      description: importJourney.description,
      journeyType: importJourney.journeyType,
      status: "Draft",  // imported journeys are always Draft
      tags: importJourney.tags,
      durationDays: importJourney.steps.length,
    });

    // Batch-insert steps
    const BATCH = 50;
    for (let i = 0; i < importJourney.steps.length; i += BATCH) {
      const batch = importJourney.steps.slice(i, i + BATCH);
      for (const step of batch) {
        await store.createStep(journeyId, {
          day: step.day,
          title: step.title,
          mentorIntro: step.mentorIntro,
          scripture: step.scripture,
          preferredTranslation: step.preferredTranslation,
          memoryVerse: step.memoryVerse,
          devotional: step.teachingContent,
          reflectionQuestion: step.reflectionQuestion,
          prayerPrompt: step.prayer,
          actionStep: step.todaysAction,
          suggestedFollowUpQuestions: step.suggestedFollowUpQuestions,
          suggestedSermons: step.suggestedSermons,
          estimatedReadingTime: step.estimatedReadingTime,
          importBatchId,
          importSource: "csv",
        });
      }
    }

    await logAuditEvent({
      contentType: "journey",
      contentId: journeyId,
      action: "create",
      performedBy: callerId,
      previousState: null,
      newState: { id: journeyId, title: importJourney.title, status: "Draft", source: "csv-import", batchId: importBatchId, stepCount: importJourney.steps.length },
    });
    createdJourneyIds.push(journeyId);
  }

  res.status(201).json({
    imported: createdJourneyIds.length,
    journeyIds: createdJourneyIds,
    warnings: parsed.rowErrors.filter(e => e.row === 0),
    totalRows: parsed.totalRows,
  });
});

// ─── AI Journey Generator ─────────────────────────────────────────────────────

router.post("/journeys/generate", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;
  if (!(await isAdmin(callerId))) { res.status(403).json({ error: "Admin access required" }); return; }

  const { prompt } = req.body as { prompt: string };
  if (!prompt?.trim()) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const { journey: generated, id } = await generateJourney(prompt.trim());

  // Create journey in DB as Draft
  const journeyId = id.substring(0, 60);
  await store.createJourney({
    id: journeyId,
    title: generated.title,
    description: generated.description,
    journeyType: "core",
    status: "Draft",
    durationDays: generated.steps.length,
  });

  // Create all steps
  for (const step of generated.steps) {
    await store.createStep(journeyId, {
      day: step.day,
      title: step.title,
      mentorIntro: step.mentorIntro,
      scripture: step.scripture,
      devotional: step.teaching,
      reflectionQuestion: step.reflectionQuestion,
      prayerPrompt: step.prayer,
      actionStep: step.todaysResponse,
      memoryVerse: step.memoryVerse || undefined,
      suggestedFollowUpQuestions: step.askEmmausPrompt ? [step.askEmmausPrompt] : [],
    });
  }

  await logAuditEvent({
    contentType: "journey",
    contentId: journeyId,
    action: "create",
    performedBy: callerId,
    previousState: null,
    newState: { id: journeyId, title: generated.title, status: "Draft", source: "ai-generate", stepCount: generated.steps.length },
  });
  res.status(201).json({ journeyId, title: generated.title, stepCount: generated.steps.length });
});

// ─── AI Journey Builder (structured, block-native) ───────────────────────────

// In-memory dedup guard: userId+slugifiedTitle → expiry timestamp
const buildInProgress = new Map<string, number>();
// Prevents double-delete races (keyed by "delete:<journeyId>")
const deleteInProgress = new Map<string, number>();
const BUILD_DEDUP_MS = 90_000;

router.post("/journeys/ai-build", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;
  if (!(await isAdmin(callerId))) { res.status(403).json({ error: "Admin access required" }); return; }

  const payload = req.body as BuilderPayload;

  // Basic validation
  if (!payload?.title?.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  if (!payload.length || payload.length < 1 || payload.length > 60) {
    res.status(400).json({ error: "length must be between 1 and 60" });
    return;
  }

  // Dedup guard — prevent accidental double submission
  const dedupKey = `${callerId}:${slugify(payload.title)}`;
  const now = Date.now();
  const existing = buildInProgress.get(dedupKey);
  if (existing && existing > now) {
    res.status(409).json({
      error: "A Journey with this title is already being generated. Please wait a moment.",
    });
    return;
  }
  buildInProgress.set(dedupKey, now + BUILD_DEDUP_MS);

  // Hoisted so the catch block can clean up a partially-created journey on failure.
  let journeyId = "";

  try {
    const generated = await generateStructuredJourney(payload);

    // Create Journey in DB as Draft
    const baseId = slugify(payload.title) || `journey-${Date.now()}`;
    journeyId = await findUniqueId(baseId);

    await store.createJourney({
      id: journeyId,
      title: generated.title,
      description: generated.description,
      subtitle: generated.subtitle,
      // Map the wizard's UI contentType to a valid DB journey_type.
      // 'core' is a longer discipleship journey; everything else the wizard
      // produces ('daily-devotional', 'sermon-companion', 'bible-study',
      // 'prayer-journey', 'small-group') is a quick-study Walk.
      journeyType: payload.contentType === "core" ? "core" : "walk",
      status: "Draft",
      tags: generated.tags,
      durationDays: generated.steps.length,
      estimatedDuration: payload.estimatedTime,
      collectionId: payload.collectionId,
      requiresDailyGate: payload.requiresDailyGate,
      aiGenerated: true,
      sourcesSummary: generated.sourcesSummary,
    });

    // Create all steps with blocks
    for (const step of generated.steps) {
      // Normalise blocks: assign a stable UUID to each and validate type/content
      const ALLOWED_BLOCK_TYPES = new Set([
        "heading", "paragraph", "scripture", "reflection", "prayer",
        "action", "question", "sermon-clip", "completion", "divider",
        "quote", "callout", "memory-verse",
      ]);
      const normalisedBlocks = (step.blocks ?? [])
        .filter(b => b && typeof b.type === "string" && ALLOWED_BLOCK_TYPES.has(b.type) && b.content && typeof b.content === "object")
        .map(b => ({
          id: crypto.randomUUID(),
          type: b.type,
          content: b.content,
        }));

      if (normalisedBlocks.length === 0) {
        throw new Error(`Step ${step.day} "${step.title}" has no valid blocks — generation failed.`);
      }

      await store.createStep(journeyId, {
        day: step.day,
        title: step.title,
        mentorIntro: step.mentorIntro ?? "",
        scripture: step.scripture ?? "",
        devotional: step.devotional ?? "",
        reflectionQuestion: step.reflectionQuestion ?? "",
        prayerPrompt: step.prayerPrompt ?? "",
        actionStep: step.actionStep ?? "",
        memoryVerse: step.memoryVerse || undefined,
        // Pass normalised blocks — buildStepColumns stores them as content.blocks JSONB
        blocks: normalisedBlocks as unknown as FrontendStep["blocks"],
        suggestedSermons: payload.sermonSources.map(s => ({
          sermonId: s.sermonId,
          topic: s.title,
          link: undefined,
        })),
      });
    }

    // Restore durationDays: refreshJourneyDuration (called inside createStep) only
    // counts Published steps, so Draft-only AI-built journeys end up with durationDays=0.
    // Set it explicitly here after all steps are created.
    await store.updateJourney(journeyId, { durationDays: generated.steps.length });

    // Generate and save the Walk Introduction (introductionContent) — the plain-text
    // welcome passage shown before Day 1. Fire-and-forget pattern: if it fails we
    // still return the journey; the admin can write the intro manually.
    try {
      const introText = await generateWalkIntroduction(payload, generated.title);
      if (introText) {
        await store.updateJourney(journeyId, { introductionContent: introText });
      }
    } catch (introErr) {
      console.warn("[journey-ai] Walk Introduction generation failed (non-fatal):", introErr);
    }

    await logAuditEvent({
      contentType: "journey",
      contentId: journeyId,
      action: "create",
      performedBy: callerId,
      previousState: null,
      newState: { id: journeyId, title: generated.title, status: "Draft", source: "ai-build", stepCount: generated.steps.length },
    });
    buildInProgress.delete(dedupKey);
    res.status(201).json({
      journeyId,
      title: generated.title,
      stepCount: generated.steps.length,
      sourcesSummary: generated.sourcesSummary,
    });
  } catch (err: unknown) {
    buildInProgress.delete(dedupKey);

    // Clean up a partially-created journey (steps failed mid-loop or intro errored
    // before we returned 201). Avoids orphan Draft journeys accumulating in the admin.
    if (journeyId) {
      try {
        const { pool: cleanupPool } = await import("@workspace/db");
        await cleanupPool.query("DELETE FROM journey_steps WHERE journey_id=$1", [journeyId]);
        await cleanupPool.query("DELETE FROM journeys WHERE id=$1", [journeyId]);
        console.warn(`[journey-ai] Cleaned up orphan journey "${journeyId}" after build failure`);
      } catch (cleanErr) {
        console.error("[journey-ai] Failed to clean up orphan journey:", cleanErr);
      }
    }

    // Surface OpenAI / upstream API errors with their actual status code and message
    // rather than wrapping everything as a generic 500.
    const apiStatus = (err as Record<string, unknown>)?.status;
    const isUpstreamClientError =
      typeof apiStatus === "number" && apiStatus >= 400 && apiStatus < 500;

    const msg =
      err instanceof Error
        ? err.message
        : "Journey generation failed — please try again";

    if (isUpstreamClientError) {
      console.error("[journey-ai] Upstream API error:", apiStatus, msg);
      res.status(400).json({ error: `API error ${apiStatus}: ${msg}` });
    } else {
      console.error("[journey-ai] Generation error:", msg);
      res.status(500).json({ error: msg });
    }
  }
});

// ─── AI Block Action ──────────────────────────────────────────────────────────

router.post("/journeys/ai-block-action", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;
  if (!(await isAdmin(callerId))) { res.status(403).json({ error: "Admin access required" }); return; }

  const { action, blockType, currentContent, journeyContext } = req.body as {
    action: string;
    blockType: string;
    currentContent: Record<string, unknown>;
    journeyContext: string;
  };

  if (!action || !blockType || !currentContent) {
    res.status(400).json({ error: "action, blockType, and currentContent are required" });
    return;
  }

  const VALID_ACTIONS = [
    "rewrite", "shorten", "expand", "make-warmer", "make-clearer",
    "new-believer", "suggest-prayer", "suggest-action", "find-scripture", "regenerate",
  ];
  if (!VALID_ACTIONS.includes(action)) {
    res.status(400).json({ error: `Unknown action. Valid: ${VALID_ACTIONS.join(", ")}` });
    return;
  }

  try {
    const updatedContent = await aiBlockAction(
      action,
      blockType,
      currentContent,
      journeyContext ?? "Emmaus discipleship Journey",
    );
    res.json({ content: updatedContent });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Block action failed";
    res.status(500).json({ error: msg });
  }
});

// ─── Journey CRUD (admin — requires authenticated caller) ─────────────────────

router.get("/journeys", async (_req: Request, res: Response) => {
  const journeys = await store.listJourneys();
  res.json({ journeys });
});

router.post("/journeys", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;
  if (!(await isAdmin(callerId))) { res.status(403).json({ error: "Admin access required" }); return; }

  const { title, description = "", journeyType = "core", status = "Draft", ...rest } = req.body as Record<string, unknown>;
  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "title is required" });
    return;
  }
  // If the caller already picked an explicit id (e.g. from the frontend slug),
  // honour it — but still run the collision check so we never crash.
  const requestedId = typeof rest.id === "string" && rest.id.trim()
    ? rest.id.trim()
    : slugify(title);
  const id = await findUniqueId(requestedId || `journey-${Date.now()}`);

  try {
    const journey = await store.createJourney({
      id,
      title,
      subtitle: rest.subtitle as string | undefined,
      description: description as string,
      journeyType: journeyType as string,
      category: rest.category as string | undefined,
      difficulty: rest.difficulty as string | undefined,
      estimatedDuration: rest.estimatedDuration as string | undefined,
      tags: rest.tags as string[] | undefined,
      prerequisites: rest.prerequisites as string[] | undefined,
      durationDays: (rest.durationDays as number) ?? 0,
      status: status as string,
      coverImageUrl: rest.coverImageUrl as string | undefined,
      churchWide: rest.churchWide as boolean | undefined,
      startDate: rest.startDate as string | undefined,
      endDate: rest.endDate as string | undefined,
      linkedSermonId: rest.linkedSermonId as string | undefined,
      xpReward: rest.xpReward as number | undefined,
      overloadExempt: rest.overloadExempt as boolean | undefined,
      pastorEdited: rest.pastorEdited as boolean | undefined,
      collectionId: rest.collectionId as string | undefined,
      stepLabelPrefix: (rest.stepLabelPrefix as string | null | undefined) ?? undefined,
    });
    await logAuditEvent({
      contentType: "journey",
      contentId: journey.id,
      action: "create",
      performedBy: callerId,
      previousState: null,
      newState: { id: journey.id, title: journey.title, status: journey.status },
    });
    res.status(201).json(journey);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 409) {
      res.status(409).json({ error: (err as Error).message });
      return;
    }
    throw err;
  }
});

router.get("/journeys/:id", async (req: Request, res: Response) => {
  const journey = await store.getJourney(String(req.params["id"]));
  if (!journey) { res.status(404).json({ error: "Journey not found" }); return; }
  res.json(journey);
});

router.patch("/journeys/:id", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;
  if (!(await isAdmin(callerId))) { res.status(403).json({ error: "Admin access required" }); return; }

  const id = String(req.params["id"]);
  const before = await store.getJourney(id);
  const updated = await store.updateJourney(id, req.body as Record<string, unknown>);
  if (!updated) { res.status(404).json({ error: "Journey not found" }); return; }

  const reqStatus = (req.body as Record<string, unknown>).status as string | undefined;
  let auditAction: "edit" | "publish" | "unpublish" | "archive" = "edit";
  if (reqStatus) {
    if (reqStatus === "Published" && before?.status !== "Published") auditAction = "publish";
    else if (reqStatus === "Draft" && before?.status === "Published") auditAction = "unpublish";
    else if (reqStatus === "Archived") auditAction = "archive";
  }
  await logAuditEvent({
    contentType: "journey",
    contentId: id,
    action: auditAction,
    performedBy: callerId,
    previousState: before ? { id: before.id, title: before.title, status: before.status } : null,
    newState: { id: updated.id, title: updated.title, status: updated.status },
  });

  res.json(updated);
});

router.delete("/journeys/:id", async (req: Request, res: Response) => {
  const id = String(req.params["id"]);
  const isPermanent = (req.body as Record<string, unknown>)?.confirm === "PERMANENTLY_DELETE";

  if (isPermanent) {
    // Permanent hard delete — Super Administrators only.
    // Role is resolved server-side from user-role-store, never from headers.
    const callerId = requireAuth(req, res);
    if (!callerId) return;
    if ((await getUserRole(callerId)) !== "superAdmin") {
      res.status(403).json({ error: "Super admin access required for permanent deletion" });
      return;
    }

    const dedupeKey = `delete:${id}`;
    if (deleteInProgress.has(dedupeKey)) {
      res.status(409).json({ error: "A deletion is already in progress for this journey." });
      return;
    }
    deleteInProgress.set(dedupeKey, Date.now());

    try {
      const adminEmail = req.user?.email ?? "";
      // Use getJourneyIncludingDeleted so this works after a prior soft-delete.
      const journeySnapshot = await store.getJourneyIncludingDeleted(id);

      // Insert tombstone BEFORE deleting — prevents a resurrection window where
      // the server restarts between the delete and the tombstone write.
      // If the table doesn't exist yet (pre-migration first boot), this is non-fatal.
      try {
        const { pool: dbPool } = await import("@workspace/db");
        await dbPool.query(
          `INSERT INTO reseed_tombstones (journey_id, deleted_by) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, callerId],
        );
      } catch { /* non-fatal: table may not exist on very first boot */ }

      const counts = await store.permanentDeleteJourney(id, callerId, adminEmail);

      await logAuditEvent({
        contentType: "journey",
        contentId: id,
        action: "permanent_delete",
        performedBy: callerId,
        previousState: journeySnapshot
          ? { id: journeySnapshot.id, title: journeySnapshot.title, status: journeySnapshot.status }
          : null,
        newState: null,
      });
      res.json({ ok: true, ...counts });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Deletion failed";
      if (message === "Journey not found") {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: "Journey could not be deleted." });
      }
    } finally {
      deleteInProgress.delete(dedupeKey);
    }
  } else {
    // Soft delete — requires admin or superAdmin (server-side verified).
    const callerId = requireAuth(req, res);
    if (!callerId) return;
    if (!(await isAdmin(callerId))) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const journey = await store.getJourney(id);
    if (!journey) { res.status(404).json({ error: "Journey not found" }); return; }

    if (journey.status === "Published") {
      res.status(400).json({
        error: "Published journeys must be archived before deleting. Use POST /journeys/:id/archive first.",
      });
      return;
    }

    await store.softDeleteJourney(id);
    await logAuditEvent({
      contentType: "journey",
      contentId: id,
      action: "delete",
      performedBy: callerId,
      previousState: { id: journey.id, title: journey.title, status: journey.status },
      newState: { deletedAt: new Date().toISOString() },
    });
    res.json({ ok: true });
  }
});

router.post("/journeys/:id/publish", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;
  if (!(await isAdmin(callerId))) { res.status(403).json({ error: "Admin access required" }); return; }

  const id = String(req.params["id"]);
  const before = await store.getJourney(id);
  const updated = await store.updateJourney(id, { status: "Published" });
  if (!updated) { res.status(404).json({ error: "Journey not found" }); return; }
  await logAuditEvent({
    contentType: "journey",
    contentId: id,
    action: "publish",
    performedBy: callerId,
    previousState: before ? { status: before.status } : null,
    newState: { status: "Published" },
  });
  res.json(updated);
});

router.post("/journeys/:id/archive", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;
  if (!(await isAdmin(callerId))) { res.status(403).json({ error: "Admin access required" }); return; }

  const id = String(req.params["id"]);
  const before = await store.getJourney(id);
  const updated = await store.updateJourney(id, { status: "Archived" });
  if (!updated) { res.status(404).json({ error: "Journey not found" }); return; }
  await logAuditEvent({
    contentType: "journey",
    contentId: id,
    action: "archive",
    performedBy: callerId,
    previousState: before ? { status: before.status } : null,
    newState: { status: "Archived" },
  });
  res.json(updated);
});

router.post("/journeys/:id/duplicate", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;
  if (!(await isAdmin(callerId))) { res.status(403).json({ error: "Admin access required" }); return; }

  const copy = await store.duplicateJourney(String(req.params["id"]));
  if (!copy) { res.status(404).json({ error: "Journey not found" }); return; }
  await logAuditEvent({
    contentType: "journey",
    contentId: copy.id,
    action: "create",
    performedBy: callerId,
    previousState: null,
    newState: { id: copy.id, title: copy.title, status: copy.status, source: "duplicate", sourceJourneyId: String(req.params["id"]) },
  });
  res.status(201).json(copy);
});

// ─── Daily Rhythm day groups ─────────────────────────────────────────────────
router.get("/journeys/:id/daily-rhythm-groups", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;
  try {
    const journey = await store.getJourney(String(req.params["id"]));
    if (!journey || journey.journeyType !== "daily-rhythm") {
      res.status(404).json({ error: "Daily Rhythm journey not found" });
      return;
    }
    const adminAccess = await isAdmin(callerId);
    if (!adminAccess && journey.status !== "Published") {
      res.status(404).json({ error: "Daily Rhythm journey not found" });
      return;
    }
    res.set("Cache-Control", "no-store");
    res.json(await dailyRhythmGroups.listGroups(journey.id, !adminAccess));
  } catch (err) {
    console.error("GET daily rhythm groups failed", err);
    res.status(500).json({ error: "Failed to fetch Daily Rhythm groups" });
  }
});

router.post("/journeys/:id/daily-rhythm-groups", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;
  if (!(await isAdmin(callerId))) { res.status(403).json({ error: "Admin access required" }); return; }
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!title) { res.status(400).json({ error: "title is required" }); return; }
  try {
    const group = await dailyRhythmGroups.createGroup(String(req.params["id"]), {
      title,
      description: typeof req.body.description === "string" ? req.body.description : "",
      displayOrder: Number.isFinite(req.body.displayOrder) ? Number(req.body.displayOrder) : 0,
    });
    if (!group) { res.status(404).json({ error: "Daily Rhythm journey not found" }); return; }
    res.status(201).json(group);
  } catch (err) {
    console.error("POST daily rhythm group failed", err);
    res.status(500).json({ error: "Failed to create Daily Rhythm group" });
  }
});

router.patch("/journeys/:id/daily-rhythm-groups/:groupId", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;
  if (!(await isAdmin(callerId))) { res.status(403).json({ error: "Admin access required" }); return; }
  const data: Record<string, unknown> = {};
  for (const key of ["title", "description", "status"]) {
    if (req.body?.[key] !== undefined) data[key] = String(req.body[key]);
  }
  if (req.body?.displayOrder !== undefined && Number.isFinite(req.body.displayOrder)) {
    data.display_order = Number(req.body.displayOrder);
  }
  if (data.status && !["Draft", "Published", "Archived"].includes(String(data.status))) {
    res.status(400).json({ error: "Invalid group status" });
    return;
  }
  try {
    const group = await dailyRhythmGroups.updateGroup(String(req.params["id"]), String(req.params["groupId"]), data);
    if (!group) { res.status(404).json({ error: "Group not found" }); return; }
    res.json(group);
  } catch (err) {
    console.error("PATCH daily rhythm group failed", err);
    res.status(500).json({ error: "Failed to update Daily Rhythm group" });
  }
});

router.delete("/journeys/:id/daily-rhythm-groups/:groupId", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;
  if (!(await isAdmin(callerId))) { res.status(403).json({ error: "Admin access required" }); return; }
  const deleted = await dailyRhythmGroups.deleteGroup(String(req.params["id"]), String(req.params["groupId"]));
  if (!deleted) { res.status(404).json({ error: "Group not found" }); return; }
  res.json({ ok: true });
});

router.put("/journeys/:id/daily-rhythm-groups/:groupId/items", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;
  if (!(await isAdmin(callerId))) { res.status(403).json({ error: "Admin access required" }); return; }
  const stepIds = Array.isArray(req.body?.stepIds)
    ? req.body.stepIds.filter((id: unknown): id is string => typeof id === "string")
    : null;
  if (!stepIds) { res.status(400).json({ error: "stepIds must be an array" }); return; }
  try {
    const group = await dailyRhythmGroups.replaceGroupItems(String(req.params["id"]), String(req.params["groupId"]), stepIds);
    if (!group) { res.status(404).json({ error: "Group not found" }); return; }
    res.json(group);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    res.status(message.includes("grouped day") ? 400 : 500).json({ error: message });
  }
});

// ─── Steps (admin mutations require auth) ─────────────────────────────────────

router.get("/journeys/:id/steps", async (req: Request, res: Response) => {
  res.set("Cache-Control", "no-store");
  const journeyId = String(req.params["id"]);
  const steps = await store.listSteps(journeyId);
  const userId = resolveUserId(req);
  const journey = await store.getJourney(journeyId);
  const isDailyRhythm = journey?.journeyType === "daily-rhythm" || journey?.journeyType === "core";
  if (isDailyRhythm) {
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const role = await getUserRole(userId);
    if (role === "admin" || role === "superAdmin") {
      // Do not read member progress for authoring requests. Admins need the
      // complete authored catalogue, including future and Draft steps.
      res.json({ steps });
      return;
    }
    const progress = await store.getProgress(userId, journeyId);
    const currentDay = progress?.currentDay ?? 1;
    // All elapsed published days remain available for review, whether or not
    // the member opened or finished them. Future days stay server-gated.
    res.json({ steps: selectDailyRhythmSteps(steps, role, currentDay) });
    return;
  }
  res.json({ steps });
});

router.post("/journeys/:id/steps", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;
  if (!(await isAdmin(callerId))) { res.status(403).json({ error: "Admin access required" }); return; }

  const journeyId = String(req.params["id"]);
  const { day, title = "", ...rest } = req.body as Record<string, unknown>;
  if (!day || typeof day !== "number") {
    res.status(400).json({ error: "day (number) is required" });
    return;
  }

  // Upsert logic: if a step already exists at this day (e.g. a spurious
  // non-completion step left over from the old Walk Complete bug), update it
  // in-place rather than failing with a unique-constraint violation.
  const existing = await store.getStep(journeyId, day as number);
  let step;
  if (existing) {
    step = await store.updateStep(journeyId, day as number, { title: title as string, ...rest } as Parameters<typeof store.updateStep>[2]);
    if (!step) {
      res.status(404).json({ error: "Step not found after upsert" });
      return;
    }
    await logAuditEvent({
      contentType: "journey_step",
      contentId: `${journeyId}:day:${step.day}`,
      action: "edit",
      performedBy: callerId,
      previousState: { day: existing.day, title: existing.title, status: existing.status },
      newState: { journeyId: step.journeyId, day: step.day, title: step.title, status: step.status },
    });
    res.status(200).json(step);
    return;
  }

  step = await store.createStep(journeyId, { day: day as number, title: title as string, ...rest } as Parameters<typeof store.createStep>[1]);
  await logAuditEvent({
    contentType: "journey_step",
    contentId: `${journeyId}:day:${step.day}`,
    action: "create",
    performedBy: callerId,
    previousState: null,
    newState: { journeyId: step.journeyId, day: step.day, title: step.title, status: step.status },
  });
  res.status(201).json(step);
});

router.patch("/journeys/:id/steps/:day", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;
  if (!(await isAdmin(callerId))) { res.status(403).json({ error: "Admin access required" }); return; }

  const journeyId = String(req.params["id"]);
  const day = parseInt(String(req.params["day"]), 10);
  if (isNaN(day)) { res.status(400).json({ error: "day must be a number" }); return; }
  const stepBefore = await store.getStep(journeyId, day);

  // The completion-step position and uniqueness invariant is enforced inside
  // updateStep (store layer), using a live max-regular-day query that covers
  // renumber payloads and draft steps. The route passes the body through unchanged.
  const body = req.body as Parameters<typeof store.updateStep>[2];
  try {
    const updated = await store.updateStep(journeyId, day, body);
    if (!updated) { res.status(404).json({ error: "Step not found" }); return; }
    await logAuditEvent({
      contentType: "journey_step",
      contentId: `${journeyId}:day:${day}`,
      action: "edit",
      performedBy: callerId,
      previousState: stepBefore ? { day: stepBefore.day, title: stepBefore.title, status: stepBefore.status } : null,
      newState: { day: updated.day, title: updated.title, status: updated.status },
    });
    res.json(updated);
  } catch (err: unknown) {
    // Unique constraint violation (postgres code 23505) — day already exists in this journey
    const pgCode = (err as { cause?: { code?: string }; code?: string })?.cause?.code
      ?? (err as { code?: string })?.code;
    if (pgCode === "23505") {
      res.status(409).json({ error: "A step with that day number already exists in this journey" });
      return;
    }
    throw err;
  }
});

// ─── Bulk-generate display labels for all steps (admin only) ─────────────────

router.post("/journeys/:id/steps/bulk-labels", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;
  if (!(await isAdmin(callerId))) { res.status(403).json({ error: "Admin access required" }); return; }

  const journeyId = String(req.params["id"]);
  const { startDate, format, overwriteExisting } = req.body as {
    startDate: string;
    format: string;
    overwriteExisting?: boolean;
  };
  if (!startDate || !format) {
    res.status(400).json({ error: "startDate and format are required" });
    return;
  }

  // Simple date-label formatter — token order matters (longer tokens first)
  const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function formatDateLabel(date: Date, fmt: string): string {
    const d = date.getUTCDate();
    const m = date.getUTCMonth();
    const y = date.getUTCFullYear();
    return fmt
      .replace("MMMM", MONTHS_LONG[m])
      .replace("MMM",  MONTHS_SHORT[m])
      .replace("YYYY", String(y))
      .replace("DD",   String(d).padStart(2, "0"))
      .replace("MM",   String(m + 1).padStart(2, "0"))
      .replace("D",    String(d))
      .replace("M",    String(m + 1));
  }

  try {
    const allSteps = await store.listSteps(journeyId);
    const orderedSteps = allSteps
      .filter(s => !s.isCompletionStep)
      .sort((a, b) => a.day - b.day);

    const startTs = new Date(startDate);
    const labels: Array<{ day: number; displayLabel: string }> = [];

    orderedSteps.forEach((step, index) => {
      if (!overwriteExisting && step.displayLabel?.trim()) return;
      const date = new Date(startTs);
      date.setUTCDate(date.getUTCDate() + index);
      labels.push({ day: step.day, displayLabel: formatDateLabel(date, format) });
    });

    const updated = await store.bulkSetStepDisplayLabels(journeyId, labels);

    await logAuditEvent({
      contentType: "journey_step",
      contentId: journeyId,
      action: "edit",
      performedBy: callerId,
      previousState: null,
      newState: { action: "bulk-labels", format, startDate, updated },
    });

    res.json({
      updated,
      previewFirst: labels[0]?.displayLabel ?? null,
      previewLast:  labels[labels.length - 1]?.displayLabel ?? null,
    });
  } catch (err) {
    console.error("POST /journeys/:id/steps/bulk-labels failed", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/journeys/:id/steps/:day", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;
  if (!(await isAdmin(callerId))) { res.status(403).json({ error: "Admin access required" }); return; }

  const journeyId = String(req.params["id"]);
  const day = parseInt(String(req.params["day"]), 10);
  if (isNaN(day)) { res.status(400).json({ error: "day must be a number" }); return; }

  const stepBefore = await store.getStep(journeyId, day);
  await store.softDeleteStep(journeyId, day);
  if (stepBefore) {
    await logAuditEvent({
      contentType: "journey_step",
      contentId: `${journeyId}:day:${day}`,
      action: "delete",
      performedBy: callerId,
      previousState: { day: stepBefore.day, title: stepBefore.title, status: stepBefore.status },
      newState: { deletedAt: new Date().toISOString() },
    });
  }
  res.json({ ok: true });
});

// ─── Progress ─────────────────────────────────────────────────────────────────

router.post("/journeys/:id/progress/start", async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  if (!userId) { res.status(400).json({ error: "userId is required" }); return; }
  const journey = await store.getJourney(String(req.params["id"]));
  if (!journey || journey.status !== "Published") {
    res.status(404).json({ error: "Published journey not found" });
    return;
  }
  const requestedOrigin = req.body?.displayOrigin;
  if (requestedOrigin !== undefined && store.parseJourneyDisplayOrigin(requestedOrigin) === null) {
    res.status(400).json({ error: "displayOrigin must be walk or journey" });
    return;
  }
  const prog = await store.startJourney(
    userId,
    String(req.params["id"]),
    store.parseJourneyDisplayOrigin(requestedOrigin),
  );
  res.json(prog);
});

router.post("/journeys/:id/progress/complete-step", async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  if (!userId) { res.status(400).json({ error: "userId is required" }); return; }
  const journeyId = String(req.params["id"]);
  const { day, reflectionText } = req.body as { day: number; reflectionText?: string };
  if (!Number.isInteger(day) || day < 0) {
    res.status(400).json({ error: "day is required" });
    return;
  }
  try {
    const prog = await store.completeStep(userId, journeyId, day, reflectionText);
    const journey = await store.getJourney(journeyId);
    const isDailyRhythm = journey?.journeyType === "daily-rhythm" || journey?.journeyType === "core";
    if (!isDailyRhythm) {
      res.json({ progress: prog });
      return;
    }

    // Return the same server-authoritative opening decision that now reflects
    // the committed completion. The client can update the gate in-place instead
    // of clearing it and remounting the completion screen.
    const startupSession = String(req.get("x-emmaus-startup-session") ?? "");
    const dailyRhythmStartup = await store.getDailyRhythmStartup(userId, startupSession);
    const dailyRhythmState = await store.getDailyRhythmState(userId);
    res.json({ progress: prog, dailyRhythmStartup, dailyRhythmState });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not complete step";
    if (message.includes("Daily Rhythm step is locked")) {
      res.status(409).json({ error: message, code: "DAILY_RHYTHM_STEP_LOCKED" });
      return;
    }
    res.status(500).json({ error: message });
  }
});

// ─── Development-mode progress tools (self-only) ──────────────────────────────
// These routes are intentionally not role-gated at the HTTP layer because they
// operate only on the requesting user's own progress row. A member who calls
// them just resets their own data — no privilege escalation is possible.

router.post("/journeys/:id/progress/reset", async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  if (!userId) { res.status(400).json({ error: "userId is required" }); return; }
  const prog = await store.resetProgress(userId, String(req.params["id"]));
  res.json(prog);
});

router.post("/journeys/:id/progress/mark-step-incomplete", async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  if (!userId) { res.status(400).json({ error: "userId is required" }); return; }
  const { day } = req.body as { day: number };
  if (!day || typeof day !== "number") {
    res.status(400).json({ error: "day is required" });
    return;
  }
  const prog = await store.markStepIncomplete(userId, String(req.params["id"]), day);
  res.json(prog);
});

router.get("/journeys/:id/progress/reflections", async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  if (!userId) { res.status(400).json({ error: "userId is required" }); return; }
  const reflections = await store.getReflections(userId);
  const journeyId = String(req.params["id"]);
  const filtered: Record<string, string> = {};
  for (const [key, val] of Object.entries(reflections)) {
    if (key.startsWith(journeyId + "-")) filtered[key] = val;
  }
  res.json({ reflections: filtered });
});

// ─── One-time data repair: publish steps that belong to Published journeys ─────
//
// Root cause: createStep always defaulted to status="Draft" regardless of parent
// journey status. Steps added after a journey was published stayed Draft and were
// invisible to members. This endpoint is idempotent — safe to call multiple times.
//
// Scope of changes:
//   1. Every Draft step whose parent journey is Published → status = "Published".
//   2. Any journey named "created-in-god-s-image" (accidental placeholder with one
//      "Untitled Step") → status = "Draft" so it no longer shadows the real walk.
//
// Auth: superAdmin only.

router.post("/journeys/repair-step-statuses", async (req: Request, res: Response) => {
  const callerId = requireSuperAdmin(req, res);
  if (!callerId) return;

  const report = await store.repairStepStatuses();
  res.json({ ok: true, ...report });
});

export default router;
