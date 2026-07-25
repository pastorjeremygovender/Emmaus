/**
 * Journey CMS Routes
 *
 * Admin mutation routes require an authenticated caller (via signed session cookie
 * or X-User-Id header). Identity is always derived server-side via extractUserId().
 *
 * Progress routes accept userId from body/query as a fallback so the user-facing
 * app works before full session auth is wired. A future task (#48) will tighten
 * these to session-only once Clerk/Replit Auth is integrated.
 */

import { Router, type Request, type Response } from "express";
import { extractUserId, requireAuth } from "../emmaus/auth.js";
import * as store from "../lib/journey-store.js";
import { parseImportCsv, exportJourneysToCsv } from "../lib/journey-csv.js";
import { generateJourney } from "../lib/journey-ai.js";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve userId for progress routes:
 * 1. Signed session cookie / X-User-Id header (trusted, server-derived)
 * 2. Body / query param (fallback for user-facing app before full auth is added)
 */
function resolveUserId(req: Request): string | null {
  return (
    extractUserId(req) ||
    (req.query.userId as string) ||
    (req.body?.userId as string) ||
    null
  );
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
  res.json({ progress });
});

router.post("/journeys/progress/import", async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  if (!userId) { res.status(400).json({ error: "userId is required" }); return; }
  const { progress } = req.body as { progress: Record<string, { currentDay: number; completedDays: number[]; startedAt: string; lastCompletedAt: string | null }> };
  await store.upsertProgressFromLocal(userId, progress ?? {});
  res.json({ ok: true });
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

  res.status(201).json({ journeyId, title: generated.title, stepCount: generated.steps.length });
});

// ─── Journey CRUD (admin — requires authenticated caller) ─────────────────────

router.get("/journeys", async (_req: Request, res: Response) => {
  const journeys = await store.listJourneys();
  res.json({ journeys });
});

router.post("/journeys", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;

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

  const id = String(req.params["id"]);
  const updated = await store.updateJourney(id, req.body as Record<string, unknown>);
  if (!updated) { res.status(404).json({ error: "Journey not found" }); return; }
  res.json(updated);
});

router.delete("/journeys/:id", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;

  await store.deleteJourney(String(req.params["id"]));
  res.json({ ok: true });
});

router.post("/journeys/:id/publish", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;

  const id = String(req.params["id"]);
  const updated = await store.updateJourney(id, { status: "Published" });
  if (!updated) { res.status(404).json({ error: "Journey not found" }); return; }
  res.json(updated);
});

router.post("/journeys/:id/archive", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;

  const id = String(req.params["id"]);
  const updated = await store.updateJourney(id, { status: "Archived" });
  if (!updated) { res.status(404).json({ error: "Journey not found" }); return; }
  res.json(updated);
});

router.post("/journeys/:id/duplicate", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;

  const copy = await store.duplicateJourney(String(req.params["id"]));
  if (!copy) { res.status(404).json({ error: "Journey not found" }); return; }
  res.status(201).json(copy);
});

// ─── Steps (admin mutations require auth) ─────────────────────────────────────

router.get("/journeys/:id/steps", async (req: Request, res: Response) => {
  const steps = await store.listSteps(String(req.params["id"]));
  res.json({ steps });
});

router.post("/journeys/:id/steps", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;

  const journeyId = String(req.params["id"]);
  const { day, title = "", ...rest } = req.body as Record<string, unknown>;
  if (!day || typeof day !== "number") {
    res.status(400).json({ error: "day (number) is required" });
    return;
  }
  const step = await store.createStep(journeyId, { day: day as number, title: title as string, ...rest } as Parameters<typeof store.createStep>[1]);
  res.status(201).json(step);
});

router.patch("/journeys/:id/steps/:day", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;

  const journeyId = String(req.params["id"]);
  const day = parseInt(String(req.params["day"]), 10);
  if (isNaN(day)) { res.status(400).json({ error: "day must be a number" }); return; }
  try {
    const updated = await store.updateStep(journeyId, day, req.body as Parameters<typeof store.updateStep>[2]);
    if (!updated) { res.status(404).json({ error: "Step not found" }); return; }
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

router.delete("/journeys/:id/steps/:day", async (req: Request, res: Response) => {
  const callerId = requireAuth(req, res);
  if (!callerId) return;

  const journeyId = String(req.params["id"]);
  const day = parseInt(String(req.params["day"]), 10);
  if (isNaN(day)) { res.status(400).json({ error: "day must be a number" }); return; }
  await store.deleteStep(journeyId, day);
  res.json({ ok: true });
});

// ─── Progress ─────────────────────────────────────────────────────────────────

router.post("/journeys/:id/progress/start", async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  if (!userId) { res.status(400).json({ error: "userId is required" }); return; }
  const prog = await store.startJourney(userId, String(req.params["id"]));
  res.json(prog);
});

router.post("/journeys/:id/progress/complete-step", async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  if (!userId) { res.status(400).json({ error: "userId is required" }); return; }
  const { day, reflectionText } = req.body as { day: number; reflectionText?: string };
  if (!day || typeof day !== "number") {
    res.status(400).json({ error: "day is required" });
    return;
  }
  const prog = await store.completeStep(userId, String(req.params["id"]), day, reflectionText);
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

export default router;
