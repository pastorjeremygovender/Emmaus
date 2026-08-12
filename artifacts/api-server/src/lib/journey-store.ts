/**
 * Journey Store — Postgres/Drizzle-backed persistence for Journey CMS
 *
 * Journey IDs are slug-based strings (e.g. "15-minutes-with-jesus").
 * Steps are identified by (journeyId, day) where day is the step number (1-based).
 * Progress is identified by (userId, journeyId).
 *
 * toFrontendStep() reads from explicit columns first, then falls back to the
 * legacy `content` JSONB column so migrated data continues to work.
 */

import { eq, and, asc, or, ilike, sql, inArray, isNull } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import { isStartSharedReady } from "./feature-flags.js";
import {
  journeysTable,
  journeyStepsTable,
  userJourneyProgressTable,
  stepReflectionsTable,
  journeyAuditLogTable,
} from "@workspace/db/schema";
import type {
  Journey as DbJourney,
  JourneyStep as DbJourneyStep,
  UserJourneyProgress as DbProgress,
} from "@workspace/db/schema";

export type { DbJourney, DbJourneyStep, DbProgress };

// ─── Sermon reference shape ────────────────────────────────────────────────────

export interface SermonRef {
  sermonId?: string;
  timestamp?: number;      // seconds
  topic?: string;
  link?: string;
  contextualSentence?: string;
}

// ─── Frontend-shaped types ────────────────────────────────────────────────────
// These match the contract consumed by JourneyContext and all UI components.
// Field names are kept stable for backward compatibility.

export interface FrontendStep {
  journeyId: string;
  day: number;          // step number
  title: string;
  status: string;       // "Draft" | "Published"

  // Canonical discipleship fields
  mentorIntro: string;
  scripture: string;                    // primary reference
  devotional: string;                   // alias for teachingContent
  reflectionQuestion: string;
  prayerPrompt: string;                 // alias for prayer
  actionStep: string;                   // alias for todaysAction
  memoryVerse?: string;

  // Extended metadata
  preferredTranslation?: string;
  estimatedReadingTime?: number;        // minutes
  xpReward?: number;

  // JSONB arrays
  scriptureReferences?: Array<{ reference: string; translation?: string; verseText?: string }>;
  suggestedSermons?: SermonRef[];
  suggestedFollowUpQuestions?: string[];
  unlockConditions?: Record<string, unknown> | null;

  // Import provenance
  importBatchId?: string;
  importSource?: string;

  // Legacy sermon fields (mapped from suggestedSermons[0])
  sermonTimestampSeconds?: number;
  sermonLink?: string;
  sermonContextualSentence?: string;

  order?: number;

  // Block-based content (stored in content.blocks JSONB)
  // null = not yet edited in block editor; undefined = not loaded
  blocks?: Array<Record<string, unknown>> | null;

  // Daily Rhythm closing text (stored in content.closingText JSONB)
  closingText?: string;

  // Emmaus Journey Standard — intro to the next day (stored in content.lookingAhead JSONB)
  lookingAhead?: string;

  // Walk Completion entry — not a numbered lesson.
  // Excluded from lesson lists, progress counts, and durationDays.
  isCompletionStep?: boolean;
  /** Optional per-step display label (e.g. "1 January"). Overrides prefix+number when set. */
  displayLabel?: string | null;
}

export interface FrontendJourney {
  id: string;
  title: string;
  subtitle?: string;
  description: string;
  journeyType: string;
  category?: string;
  difficulty?: string;
  estimatedDuration?: string;
  tags?: string[];
  prerequisites?: string[];
  durationDays: number;
  status: string;
  coverImageUrl?: string;
  churchWide?: boolean;
  startDate?: string;
  endDate?: string;
  linkedSermonId?: string;
  xpReward?: number;
  overloadExempt?: boolean;
  pastorEdited?: boolean;
  publishedAt?: string;
  updatedAt?: string;
  createdAt?: string;
  collectionId?: string;
  // Branding & versioning
  themeColor?: string;   // hex colour, e.g. '#3B82F6' — nullable
  version?: number;      // incremented on each publish; defaults to 1
  // Smart content indicators — ISO string; null/undefined = no notification set
  notifyPublishedAt?: string;
  // Stored in metadata JSONB — no DB migration required
  scriptureReference?: string;  // e.g. "John 3:16-17"
  nextJourneyId?: string;       // slug of recommended next journey after completion
  requiresDailyGate?: boolean;  // default true — false bypasses the daily 15-min gate
  introductionContent?: string; // journey-level intro text (admin-authored, stored in metadata JSONB)
  completionMessage?: string;   // short closing message shown after journey completion (stored in metadata JSONB)
  // Step display label prefix — "Day", "Step", or custom. null = auto-derive from journeyType.
  stepLabelPrefix?: string | null;
  // AI Builder fields (also stored in metadata JSONB)
  aiGenerated?: boolean;
  sourcesSummary?: {
    scriptureReferences: string[];
    sermonsUsed: Array<{ title: string; date: string }>;
    generatedSections: string[];
  };
}

export interface FrontendProgress {
  journeyId: string;
  currentDay: number;
  completedDays: number[];
  startedAt: string;
  lastCompletedAt: string | null;
  /** Engagement lifecycle status — active | paused | completed | dropped */
  status: string;
  /** Set when the member opens the content — used for UPDATED badge computation. */
  lastOpenedAt?: string | null;
  /** Non-destructive hide: card removed from Today's Steps, progress preserved. */
  hiddenFromToday?: boolean;
}

// ─── Converters ───────────────────────────────────────────────────────────────

function toFrontendJourney(row: DbJourney): FrontendJourney {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle ?? undefined,
    description: row.description,
    journeyType: row.journeyType,
    category: row.category ?? undefined,
    difficulty: row.difficulty ?? undefined,
    estimatedDuration: row.estimatedDuration ?? undefined,
    tags: (row.tags as string[] | null) ?? [],
    prerequisites: (row.prerequisites as string[] | null) ?? [],
    durationDays: row.durationDays,
    status: row.status,
    coverImageUrl: row.coverImageUrl ?? undefined,
    churchWide: row.churchWide ?? undefined,
    startDate: row.startDate ?? undefined,
    endDate: row.endDate ?? undefined,
    linkedSermonId: row.linkedSermonId ?? undefined,
    xpReward: row.xpReward ?? undefined,
    overloadExempt: row.overloadExempt ?? undefined,
    pastorEdited: row.pastorEdited ?? undefined,
    publishedAt: row.publishedAt?.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    collectionId: row.collectionId ?? undefined,
    themeColor: row.themeColor ?? undefined,
    version: row.version ?? 1,
    notifyPublishedAt: row.notifyPublishedAt?.toISOString(),
    stepLabelPrefix: row.stepLabelPrefix ?? null,
    scriptureReference: (meta.scriptureReference as string) || undefined,
    nextJourneyId: (meta.nextJourneyId as string) || undefined,
    requiresDailyGate: meta.requiresDailyGate === false ? false : undefined,
    aiGenerated: meta.aiGenerated === true ? true : undefined,
    sourcesSummary: (meta.sourcesSummary as FrontendJourney["sourcesSummary"]) || undefined,
    introductionContent: (meta.introductionContent as string) || undefined,
    completionMessage: (meta.completionMessage as string) || undefined,
  };
}

/** Read a step row, preferring explicit columns and falling back to legacy JSONB content. */
function toFrontendStep(row: DbJourneyStep): FrontendStep {
  const legacy = (row.content ?? {}) as Record<string, unknown>;

  // Canonical fields — new column takes precedence over legacy JSONB
  const mentorIntro    = (row.mentorIntro ?? (legacy.mentorIntro as string) ?? "");
  const scripture      = (row.scripture  ?? (legacy.scripture  as string) ?? "");
  const devotional     = (row.teachingContent ?? (legacy.devotional as string) ?? "");
  const reflectionQ    = (row.reflectionQuestion ?? (legacy.reflectionQuestion as string) ?? "");
  const prayer         = (row.prayer  ?? (legacy.prayerPrompt as string) ?? "");
  const action         = (row.todaysAction ?? (legacy.actionStep as string) ?? "");

  // Sermon legacy compat — first suggestedSermons entry wins; fall back to content JSONB fields
  const sermons = (row.suggestedSermons ?? []) as SermonRef[];
  const firstSermon = sermons[0];
  const sermonTimestampSeconds =
    firstSermon?.timestamp ?? (legacy.sermonTimestampSeconds as number | undefined);
  const sermonLink =
    firstSermon?.link ?? (legacy.sermonLink as string | undefined);
  const sermonContextualSentence =
    firstSermon?.contextualSentence ?? (legacy.sermonContextualSentence as string | undefined);

  // Blocks are stored in content.blocks JSONB; null means never edited in block editor
  const blocks = (legacy.blocks as Array<Record<string, unknown>> | undefined) ?? null;

  // Daily Rhythm closing text
  const closingText = (legacy.closingText as string | undefined);

  // Emmaus Journey Standard — looking ahead
  const lookingAhead = (legacy.lookingAhead as string | undefined);

  return {
    journeyId: row.journeyId,
    day: row.day,
    title: row.title,
    status: row.status ?? 'Draft',
    mentorIntro,
    scripture,
    devotional,
    reflectionQuestion: reflectionQ,
    prayerPrompt: prayer,
    actionStep: action,
    memoryVerse: row.memoryVerse ?? undefined,
    preferredTranslation: row.preferredTranslation ?? undefined,
    estimatedReadingTime: row.estimatedReadingTime ?? undefined,
    xpReward: row.xpReward ?? undefined,
    scriptureReferences: (row.scriptureReferences ?? []) as FrontendStep["scriptureReferences"],
    suggestedSermons: sermons,
    suggestedFollowUpQuestions: (row.suggestedFollowUpQuestions ?? []) as string[],
    unlockConditions: row.unlockConditions as Record<string, unknown> | null | undefined,
    sermonTimestampSeconds,
    sermonLink,
    sermonContextualSentence,
    order: row.day,
    blocks,
    closingText,
    lookingAhead,
    isCompletionStep: row.isCompletionStep ?? false,
    displayLabel: row.displayLabel ?? null,
  };
}

function toFrontendProgress(row: DbProgress): FrontendProgress {
  return {
    journeyId: row.journeyId,
    currentDay: row.currentDay,
    completedDays: (row.completedDays as number[]) ?? [],
    startedAt: row.startedAt.toISOString(),
    lastCompletedAt: row.lastCompletedAt?.toISOString() ?? null,
    status: row.status ?? "active",
    lastOpenedAt: row.lastOpenedAt?.toISOString() ?? null,
    hiddenFromToday: (row as { hiddenFromToday?: boolean }).hiddenFromToday ?? false,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build the step column values from a FrontendStep (write path). */
function buildStepColumns(data: Partial<FrontendStep>): Record<string, unknown> {
  const cols: Record<string, unknown> = {};

  // ── Status ──────────────────────────────────────────────────────────────────
  // Must be mapped explicitly — it is not caught by any of the field-name
  // remappings below (e.g. devotional → teachingContent). Without this line,
  // every PATCH silently drops the status field and steps stay as Draft forever.
  if (data.status !== undefined)             cols.status             = data.status;
  if (data.isCompletionStep !== undefined)   cols.isCompletionStep   = data.isCompletionStep;
  if (data.displayLabel !== undefined)       cols.displayLabel       = data.displayLabel ?? null;

  if (data.title !== undefined)              cols.title              = data.title;
  if (data.mentorIntro !== undefined)        cols.mentorIntro        = data.mentorIntro;
  if (data.scripture !== undefined)          cols.scripture          = data.scripture;
  if (data.devotional !== undefined)         cols.teachingContent    = data.devotional;
  if (data.reflectionQuestion !== undefined) cols.reflectionQuestion = data.reflectionQuestion;
  if (data.prayerPrompt !== undefined)       cols.prayer             = data.prayerPrompt;
  if (data.actionStep !== undefined)         cols.todaysAction       = data.actionStep;
  if (data.memoryVerse !== undefined)        cols.memoryVerse        = data.memoryVerse;
  if (data.preferredTranslation !== undefined) cols.preferredTranslation = data.preferredTranslation;
  if (data.estimatedReadingTime !== undefined) cols.estimatedReadingTime = data.estimatedReadingTime;
  if (data.xpReward !== undefined)           cols.xpReward           = data.xpReward;
  if (data.scriptureReferences !== undefined) cols.scriptureReferences = data.scriptureReferences;
  if (data.suggestedFollowUpQuestions !== undefined) cols.suggestedFollowUpQuestions = data.suggestedFollowUpQuestions;
  if (data.unlockConditions !== undefined)   cols.unlockConditions   = data.unlockConditions;

  // Content JSONB column: holds blocks (block editor) and closingText (daily rhythm)
  // Build only the keys that were supplied — other keys in the JSONB are overwritten,
  // but daily-rhythm steps never use blocks and block-editor steps never use closingText.
  const contentPatch: Record<string, unknown> = {};
  if (data.blocks !== undefined)        contentPatch.blocks        = data.blocks;
  if (data.closingText !== undefined)   contentPatch.closingText   = data.closingText;
  if (data.lookingAhead !== undefined)  contentPatch.lookingAhead  = data.lookingAhead;
  if (Object.keys(contentPatch).length > 0) {
    cols.content = contentPatch;
  }

  // Merge legacy sermon fields into suggestedSermons.
  // Legacy fields (sermonTimestampSeconds / sermonLink / sermonContextualSentence) always
  // take precedence when present — they represent the DayEditor's sermon card inputs.
  // An explicit non-empty suggestedSermons array is used as-is only when no legacy fields exist.
  const hasLegacySermon =
    data.sermonTimestampSeconds !== undefined ||
    data.sermonLink !== undefined ||
    data.sermonContextualSentence !== undefined;
  const hasSermonsArray =
    data.suggestedSermons !== undefined && data.suggestedSermons.length > 0;

  if (hasLegacySermon) {
    // DayEditor edited the sermon fields — write them as suggestedSermons[0]
    const entry: SermonRef = {
      timestamp: data.sermonTimestampSeconds,
      link: data.sermonLink,
      contextualSentence: data.sermonContextualSentence,
    };
    cols.suggestedSermons = [entry];
  } else if (hasSermonsArray) {
    // Explicit non-empty array provided (e.g. from a future block editor)
    cols.suggestedSermons = data.suggestedSermons;
  } else if (data.suggestedSermons !== undefined) {
    // Explicitly clearing the array
    cols.suggestedSermons = [];
  }

  return cols;
}

// ─── Journey CRUD ─────────────────────────────────────────────────────────────

export async function listJourneys(): Promise<FrontendJourney[]> {
  const rows = await db.select().from(journeysTable)
    .where(isNull(journeysTable.deletedAt))
    .orderBy(asc(journeysTable.createdAt));
  return rows.map(toFrontendJourney);
}

export async function listPublishedJourneys(): Promise<FrontendJourney[]> {
  const rows = await db
    .select()
    .from(journeysTable)
    .where(and(eq(journeysTable.status, "Published"), isNull(journeysTable.deletedAt)))
    .orderBy(asc(journeysTable.createdAt));
  return rows.map(toFrontendJourney);
}

export async function getJourney(id: string): Promise<FrontendJourney | null> {
  const rows = await db.select().from(journeysTable)
    .where(and(eq(journeysTable.id, id), isNull(journeysTable.deletedAt)));
  return rows[0] ? toFrontendJourney(rows[0]) : null;
}

/**
 * Admin-only bypass: returns a journey even if it has been soft-deleted.
 * Use this in routes that need to read a journey before permanently deleting it,
 * where the journey may already have been soft-deleted via an earlier DELETE call.
 */
export async function getJourneyIncludingDeleted(id: string): Promise<FrontendJourney | null> {
  const rows = await db.select().from(journeysTable).where(eq(journeysTable.id, id));
  return rows[0] ? toFrontendJourney(rows[0]) : null;
}

export async function createJourney(data: Partial<FrontendJourney> & { id: string; title: string }): Promise<FrontendJourney> {
  const now = new Date();
  try {
    const rows = await db.insert(journeysTable).values({
      id: data.id,
      title: data.title,
      subtitle: data.subtitle,
      description: data.description ?? "",
      journeyType: data.journeyType ?? "core",
      category: data.category,
      difficulty: data.difficulty,
      estimatedDuration: data.estimatedDuration,
      tags: data.tags ?? [],
      prerequisites: data.prerequisites ?? [],
      durationDays: data.durationDays ?? 0,
      status: data.status ?? "Draft",
      coverImageUrl: data.coverImageUrl,
      churchWide: data.churchWide,
      startDate: data.startDate,
      endDate: data.endDate,
      linkedSermonId: data.linkedSermonId,
      xpReward: data.xpReward,
      overloadExempt: data.overloadExempt,
      pastorEdited: data.pastorEdited,
      publishedAt: data.status === "Published" ? now : undefined,
      collectionId: data.collectionId ?? null,
      stepLabelPrefix: data.stepLabelPrefix ?? null,
      metadata: {
        ...(data.scriptureReference ? { scriptureReference: data.scriptureReference } : {}),
        ...(data.nextJourneyId ? { nextJourneyId: data.nextJourneyId } : {}),
        ...(data.requiresDailyGate !== undefined ? { requiresDailyGate: data.requiresDailyGate } : {}),
        ...(data.aiGenerated ? { aiGenerated: true } : {}),
        ...(data.sourcesSummary ? { sourcesSummary: data.sourcesSummary } : {}),
      },
      createdAt: now,
      updatedAt: now,
    }).returning();
    return toFrontendJourney(rows[0]);
  } catch (err: unknown) {
    // Postgres unique_violation — surface as a typed error so the route can
    // return 409 instead of letting it explode as an unhandled 500.
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      const conflict = new Error(`Journey id "${data.id}" already exists`) as Error & { status: number };
      conflict.status = 409;
      throw conflict;
    }
    throw err;
  }
}

export async function updateJourney(
  id: string,
  data: Partial<FrontendJourney>
): Promise<FrontendJourney | null> {
  const now = new Date();
  const updateFields: Record<string, unknown> = { updatedAt: now };

  if (data.title !== undefined)            updateFields.title            = data.title;
  if (data.subtitle !== undefined)         updateFields.subtitle         = data.subtitle;
  if (data.description !== undefined)      updateFields.description      = data.description;
  if (data.journeyType !== undefined)      updateFields.journeyType      = data.journeyType;
  if (data.category !== undefined)         updateFields.category         = data.category;
  if (data.difficulty !== undefined)       updateFields.difficulty       = data.difficulty;
  if (data.estimatedDuration !== undefined) updateFields.estimatedDuration = data.estimatedDuration;
  if (data.tags !== undefined)             updateFields.tags             = data.tags;
  if (data.prerequisites !== undefined)    updateFields.prerequisites    = data.prerequisites;
  if (data.durationDays !== undefined)     updateFields.durationDays     = data.durationDays;
  if (data.status !== undefined) {
    updateFields.status = data.status;
    if (data.status === "Published") {
      // Only set publishedAt on first publish
      const existing = await getJourney(id);
      if (existing && !existing.publishedAt) {
        updateFields.publishedAt = now;
      }
      // Auto-publish all Draft steps when the journey is published.
      // Step-level Draft/Published is an admin authoring state; when a journey goes live
      // all its steps must be live too. Without this, admins who publish the journey
      // without individually publishing each step get a walk members can never enter.
      await db
        .update(journeyStepsTable)
        .set({ status: "Published", updatedAt: now })
        .where(and(
          eq(journeyStepsTable.journeyId, id),
          eq(journeyStepsTable.status, "Draft"),
        ));
    }
  }
  if (data.coverImageUrl !== undefined)    updateFields.coverImageUrl    = data.coverImageUrl;
  if (data.churchWide !== undefined)       updateFields.churchWide       = data.churchWide;
  if (data.startDate !== undefined)        updateFields.startDate        = data.startDate;
  if (data.endDate !== undefined)          updateFields.endDate          = data.endDate;
  if (data.linkedSermonId !== undefined)   updateFields.linkedSermonId   = data.linkedSermonId;
  if (data.xpReward !== undefined)         updateFields.xpReward         = data.xpReward;
  if (data.overloadExempt !== undefined)   updateFields.overloadExempt   = data.overloadExempt;
  if (data.pastorEdited !== undefined)     updateFields.pastorEdited     = data.pastorEdited;
  if (data.collectionId !== undefined)     updateFields.collectionId     = data.collectionId ?? null;
  if (data.themeColor !== undefined)       updateFields.themeColor       = data.themeColor || null;
  if (data.stepLabelPrefix !== undefined)  updateFields.stepLabelPrefix  = data.stepLabelPrefix || null;

  // notifyMembers is a write-only publish flag:
  //   true  → set notify_published_at = now() (opt-in, members see NEW/UPDATED)
  //   false → clear notify_published_at = null (opt-out, no badge)
  //   absent / undefined → leave unchanged
  if ((data as Record<string, unknown>).notifyMembers === true) {
    updateFields.notifyPublishedAt = now;
  } else if ((data as Record<string, unknown>).notifyMembers === false && data.status === "Published") {
    updateFields.notifyPublishedAt = null;
  }

  // Auto-increment version on each publish
  if (data.status === "Published") {
    const existingForVersion = await db.select({ version: journeysTable.version }).from(journeysTable).where(eq(journeysTable.id, id));
    const currentVersion = existingForVersion[0]?.version ?? 1;
    updateFields.version = currentVersion + 1;
  }

  // scriptureReference, nextJourneyId, and introductionContent live in the metadata JSONB column
  if (data.scriptureReference !== undefined || data.nextJourneyId !== undefined || data.introductionContent !== undefined || data.completionMessage !== undefined) {
    const existing = await getJourney(id);
    const currentMeta = ((existing as any)?._rawMeta ?? {}) as Record<string, unknown>;
    // Re-fetch raw metadata from DB since FrontendJourney doesn't carry it fully
    const rawRows = await db.select({ metadata: journeysTable.metadata }).from(journeysTable).where(eq(journeysTable.id, id));
    const rawMeta = (rawRows[0]?.metadata ?? {}) as Record<string, unknown>;
    updateFields.metadata = {
      ...rawMeta,
      ...(data.scriptureReference !== undefined ? { scriptureReference: data.scriptureReference || null } : {}),
      ...(data.nextJourneyId !== undefined ? { nextJourneyId: data.nextJourneyId || null } : {}),
      ...(data.requiresDailyGate !== undefined ? { requiresDailyGate: data.requiresDailyGate } : {}),
      ...(data.introductionContent !== undefined ? { introductionContent: data.introductionContent } : {}),
      ...(data.completionMessage !== undefined ? { completionMessage: data.completionMessage } : {}),
    };
    void currentMeta; // suppress unused warning
  }

  const rows = await db
    .update(journeysTable)
    .set(updateFields)
    .where(eq(journeysTable.id, id))
    .returning();
  return rows[0] ? toFrontendJourney(rows[0]) : null;
}

export async function deleteJourney(id: string): Promise<void> {
  await db.delete(journeysTable).where(eq(journeysTable.id, id));
}

/**
 * Permanently deletes a Journey and all associated records.
 * Requires Super Administrator identity — call requireSuperAdmin() before this.
 *
 * Cascade rules on journeysTable already handle:
 *   journey_steps, user_journey_progress, journey_imports
 * Manual pre-delete needed for:
 *   step_reflections (no FK cascade)
 *
 * Collections are NOT touched — a collection with zero journeys is valid.
 *
 * Returns counts for the audit record that is written after deletion.
 */
export async function permanentDeleteJourney(
  id: string,
  adminId: string,
  adminEmail: string
): Promise<{ stepCount: number; blockCount: number; progressCount: number; reflectionCount: number }> {
  // 1. Fetch the journey so we have the title for the audit record.
  // Use getJourneyIncludingDeleted because a superAdmin may call permanentDelete
  // after a prior soft-delete (where getJourney returns null).
  const journey = await getJourneyIncludingDeleted(id);
  if (!journey) throw new Error("Journey not found");

  // 2. Count associated records before any deletion
  const steps = await listSteps(id);
  const stepCount = steps.length;
  const blockCount = steps.reduce((sum, step) => {
    const blocks = (step as unknown as Record<string, unknown>).blocks;
    return sum + (Array.isArray(blocks) ? blocks.length : 0);
  }, 0);

  const [progressRows, reflectionRows] = await Promise.all([
    db.select({ id: userJourneyProgressTable.id })
      .from(userJourneyProgressTable)
      .where(eq(userJourneyProgressTable.journeyId, id)),
    db.select({ id: stepReflectionsTable.id })
      .from(stepReflectionsTable)
      .where(eq(stepReflectionsTable.journeyId, id)),
  ]);
  const progressCount = progressRows.length;
  const reflectionCount = reflectionRows.length;

  // 3. Delete records with no FK cascade before removing the journey
  await db.delete(stepReflectionsTable).where(eq(stepReflectionsTable.journeyId, id));

  // 4. Delete the journey — DB cascade removes steps, progress, imports
  await db.delete(journeysTable).where(eq(journeysTable.id, id));

  // 5. Write immutable audit record (after deletion so it reflects actual final state)
  await db.insert(journeyAuditLogTable).values({
    action: "permanent_delete",
    adminId,
    adminEmail,
    journeyId: id,
    journeyTitle: journey.title,
    stepCount,
    blockCount,
    progressCount,
    reflectionCount,
    deletedAt: new Date(),
  });

  return { stepCount, blockCount, progressCount, reflectionCount };
}

export async function duplicateJourney(id: string): Promise<FrontendJourney | null> {
  const original = await getJourney(id);
  if (!original) return null;
  const originalSteps = await listSteps(id);

  const now = new Date();
  const newId = `${id}-copy-${Date.now()}`.substring(0, 60);
  const copy = await createJourney({
    ...original,
    id: newId,
    title: `${original.title} (Copy)`,
    status: "Draft",
  });

  for (const step of originalSteps) {
    await createStep(newId, step);
  }

  return copy;
}

/**
 * Returns the set of journey IDs (from the provided list) that have a step at
 * day = 0 (the Walk Introduction). Used by the next-steps endpoint to route
 * not-started walks to their intro rather than hard-coding day 1.
 *
 * Single batch query — no N+1 penalty.
 */
export async function getJourneyIdsWithIntroStep(journeyIds: string[]): Promise<Set<string>> {
  if (journeyIds.length === 0) return new Set();
  const { inArray } = await import("drizzle-orm");
  const rows = await db
    .selectDistinct({ journeyId: journeyStepsTable.journeyId })
    .from(journeyStepsTable)
    .where(
      and(
        eq(journeyStepsTable.day, 0),
        inArray(journeyStepsTable.journeyId, journeyIds),
        isNull(journeyStepsTable.deletedAt),
      ),
    );
  return new Set(rows.map(r => r.journeyId));
}

// ─── Step CRUD ─────────────────────────────────────────────────────────────────

export async function listSteps(journeyId: string): Promise<FrontendStep[]> {
  const rows = await db
    .select()
    .from(journeyStepsTable)
    .where(and(eq(journeyStepsTable.journeyId, journeyId), isNull(journeyStepsTable.deletedAt)))
    .orderBy(asc(journeyStepsTable.day));
  return rows.map(toFrontendStep);
}

export async function getStep(journeyId: string, day: number): Promise<FrontendStep | null> {
  const rows = await db
    .select()
    .from(journeyStepsTable)
    .where(and(eq(journeyStepsTable.journeyId, journeyId), eq(journeyStepsTable.day, day), isNull(journeyStepsTable.deletedAt)));
  return rows[0] ? toFrontendStep(rows[0]) : null;
}

export async function createStep(journeyId: string, data: Partial<FrontendStep> & { day: number }): Promise<FrontendStep> {
  const now = new Date();
  const cols = buildStepColumns(data);

  // Inherit the parent journey's published state so steps added to a
  // live journey are immediately visible without a separate publish action.
  const parent = await getJourney(journeyId);
  const stepStatus = parent?.status === "Published" ? "Published" : "Draft";

  const rows = await db.insert(journeyStepsTable).values({
    journeyId,
    day: data.day,
    title: (data.title ?? "") as string,
    status: stepStatus,
    content: {},  // legacy JSONB left empty; real data is in columns
    createdAt: now,
    updatedAt: now,
    ...cols,
  }).returning();

  // Update journey durationDays
  await refreshJourneyDuration(journeyId, now);

  return toFrontendStep(rows[0]);
}

export async function updateStep(journeyId: string, day: number, data: Partial<FrontendStep>): Promise<FrontendStep | null> {
  const existing = await db
    .select()
    .from(journeyStepsTable)
    .where(and(eq(journeyStepsTable.journeyId, journeyId), eq(journeyStepsTable.day, day), isNull(journeyStepsTable.deletedAt)));
  if (!existing[0]) return null;

  const now = new Date();
  const cols = buildStepColumns(data);

  // Support explicit day renumbering: if data.day differs from the route key,
  // include it in the update. The unique constraint prevents collision with
  // an existing row — the DB will throw a unique-violation error if there's a conflict.
  const updateFields: Record<string, unknown> = { updatedAt: now, ...cols };
  if (data.day !== undefined && data.day !== day) {
    updateFields.day = data.day;
  }

  const rows = await db
    .update(journeyStepsTable)
    .set(updateFields)
    .where(and(eq(journeyStepsTable.journeyId, journeyId), eq(journeyStepsTable.day, day)))
    .returning();

  // If the day number changed, recompute durationDays (max day may have changed)
  if (data.day !== undefined && data.day !== day) {
    await refreshJourneyDuration(journeyId, now);
  } else {
    await db.update(journeysTable).set({ updatedAt: now }).where(eq(journeysTable.id, journeyId));
  }

  return rows[0] ? toFrontendStep(rows[0]) : null;
}

export async function deleteStep(journeyId: string, day: number): Promise<boolean> {
  await db
    .delete(journeyStepsTable)
    .where(and(eq(journeyStepsTable.journeyId, journeyId), eq(journeyStepsTable.day, day)));

  await refreshJourneyDuration(journeyId, new Date());
  return true;
}

/**
 * Soft-delete a journey by setting deleted_at. The journey remains in the DB
 * for recovery but is invisible to all list/member/admin queries.
 * Use this in preference to permanentDeleteJourney unless the admin explicitly
 * confirms permanent deletion via `{ "confirm": "PERMANENTLY_DELETE" }`.
 */
export async function softDeleteJourney(id: string): Promise<void> {
  await pool.query(
    `UPDATE journeys SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [id],
  );
}

/**
 * Soft-delete a journey step by setting deleted_at. Soft-deleted steps are
 * invisible to members and admin UI; refreshJourneyDuration is called to ensure
 * durationDays counts only non-deleted Published steps.
 */
/**
 * Bulk-set display_label on multiple steps in one journey.
 * Each entry in `labels` is { day, displayLabel } — pass null to clear a label.
 * Returns the number of steps that were actually updated.
 */
export async function bulkSetStepDisplayLabels(
  journeyId: string,
  labels: Array<{ day: number; displayLabel: string | null }>
): Promise<number> {
  if (labels.length === 0) return 0;
  const now = new Date();
  let count = 0;
  for (const { day, displayLabel } of labels) {
    const result = await db
      .update(journeyStepsTable)
      .set({ displayLabel: displayLabel ?? null, updatedAt: now })
      .where(
        and(
          eq(journeyStepsTable.journeyId, journeyId),
          eq(journeyStepsTable.day, day),
          isNull(journeyStepsTable.deletedAt),
        )
      );
    void result;
    count++;
  }
  if (count > 0) {
    await db.update(journeysTable).set({ updatedAt: now }).where(eq(journeysTable.id, journeyId));
  }
  return count;
}

export async function softDeleteStep(journeyId: string, day: number): Promise<void> {
  await pool.query(
    `UPDATE journey_steps SET deleted_at = NOW(), updated_at = NOW()
     WHERE journey_id = $1 AND day = $2`,
    [journeyId, day],
  );
  await refreshJourneyDuration(journeyId, new Date());
}

async function refreshJourneyDuration(journeyId: string, now: Date): Promise<void> {
  const allSteps = await listSteps(journeyId);
  // Only Published, non-completion steps count toward the lesson total.
  // Completion steps (isCompletionStep = true) are their own content type — they
  // are never numbered lessons and must not inflate durationDays.
  const lessonSteps = allSteps.filter(s => s.status === "Published" && !s.isCompletionStep);
  const maxDay = lessonSteps.reduce((m, s) => Math.max(m, s.day), 0);
  await db
    .update(journeysTable)
    .set({ durationDays: maxDay, updatedAt: now })
    .where(eq(journeysTable.id, journeyId));
}

// ─── Progress ─────────────────────────────────────────────────────────────────

// ─── Journey engagement lifecycle ────────────────────────────────────────────

export async function pauseJourney(userId: string, journeyId: string): Promise<void> {
  const now = new Date();
  await db
    .update(userJourneyProgressTable)
    .set({ status: "paused", updatedAt: now })
    .where(and(
      eq(userJourneyProgressTable.userId, userId),
      eq(userJourneyProgressTable.journeyId, journeyId),
    ));
}

export async function resumeJourney(userId: string, journeyId: string): Promise<void> {
  const now = new Date();
  await db
    .update(userJourneyProgressTable)
    .set({ status: "active", updatedAt: now })
    .where(and(
      eq(userJourneyProgressTable.userId, userId),
      eq(userJourneyProgressTable.journeyId, journeyId),
    ));
}

export async function removeJourneyProgress(userId: string, journeyId: string): Promise<void> {
  await db
    .delete(userJourneyProgressTable)
    .where(and(
      eq(userJourneyProgressTable.userId, userId),
      eq(userJourneyProgressTable.journeyId, journeyId),
    ));
}

export async function getAllProgress(userId: string): Promise<Record<string, FrontendProgress>> {
  const rows = await db
    .select()
    .from(userJourneyProgressTable)
    .where(eq(userJourneyProgressTable.userId, userId));
  const result: Record<string, FrontendProgress> = {};
  for (const row of rows) {
    result[row.journeyId] = toFrontendProgress(row);
  }
  return result;
}

// ─── Development-mode progress mutations ──────────────────────────────────────
// These are admin-only helpers used by the Development Mode testing tools.
// They affect only the specified user's own progress row and nothing else.

/** Reset a user's progress for a journey back to Day 1 (admin / dev only). */
export async function resetProgress(
  userId: string,
  journeyId: string
): Promise<FrontendProgress> {
  const existing = await getProgress(userId, journeyId);
  if (!existing) {
    return startJourney(userId, journeyId);
  }
  const now = new Date();
  const rows = await db
    .update(userJourneyProgressTable)
    .set({ currentDay: 1, completedDays: [], lastCompletedAt: null, updatedAt: now })
    .where(and(
      eq(userJourneyProgressTable.userId, userId),
      eq(userJourneyProgressTable.journeyId, journeyId)
    ))
    .returning();
  return toFrontendProgress(rows[0]);
}

/**
 * Mark a specific day as incomplete — remove it from completedDays and roll
 * currentDay back so the tester can re-complete it (admin / dev only).
 */
export async function markStepIncomplete(
  userId: string,
  journeyId: string,
  day: number
): Promise<FrontendProgress> {
  const existing = await getProgress(userId, journeyId);
  if (!existing) throw new Error("No progress record found");

  const completedDays = existing.completedDays.filter(d => d !== day);
  // Roll currentDay back to at most `day` so the tester can re-complete it.
  const newCurrentDay = Math.min(existing.currentDay, day);
  // Clear the last-completed timestamp if no days remain, so the daily lock
  // is lifted and the tester can continue immediately.
  const lastCompletedAt = completedDays.length > 0 ? (existing.lastCompletedAt ? new Date(existing.lastCompletedAt) : null) : null;

  const now = new Date();
  const rows = await db
    .update(userJourneyProgressTable)
    .set({ currentDay: newCurrentDay, completedDays, lastCompletedAt, updatedAt: now })
    .where(and(
      eq(userJourneyProgressTable.userId, userId),
      eq(userJourneyProgressTable.journeyId, journeyId)
    ))
    .returning();
  return toFrontendProgress(rows[0]);
}

export async function getProgress(userId: string, journeyId: string): Promise<FrontendProgress | null> {
  const rows = await db
    .select()
    .from(userJourneyProgressTable)
    .where(and(
      eq(userJourneyProgressTable.userId, userId),
      eq(userJourneyProgressTable.journeyId, journeyId)
    ));
  return rows[0] ? toFrontendProgress(rows[0]) : null;
}

export async function startJourney(userId: string, journeyId: string): Promise<FrontendProgress> {
  const now = new Date();
  // Use onConflictDoNothing so concurrent calls (e.g. from the shared-start
  // endpoint and the legacy start endpoint racing) are safe under the unique
  // index on (user_id, journey_id).  If the INSERT is a no-op, RETURNING is
  // empty and we fall through to a SELECT to return the existing row.
  const rows = await db.insert(userJourneyProgressTable).values({
    userId,
    journeyId,
    currentDay: 1,
    completedDays: [],
    startedAt: now,
    status: "active",
    // Set lastOpenedAt on creation so the badge is immediately cleared —
    // a member who starts a NEW journey should not see UPDATED on reload.
    lastOpenedAt: now,
    createdAt: now,
    updatedAt: now,
  })
  // On conflict: update lastOpenedAt atomically so any UPDATED badge clears
  // when the reader opens, even for returning members. updatedAt is also
  // refreshed; no other progress fields are changed so concurrent start calls
  // remain safe (they don't overwrite currentDay or completedDays).
  .onConflictDoUpdate({
    target: [userJourneyProgressTable.userId, userJourneyProgressTable.journeyId],
    set: { lastOpenedAt: now, updatedAt: now },
  })
  .returning();

  return toFrontendProgress(rows[0]);
}

export async function completeStep(
  userId: string,
  journeyId: string,
  day: number,
  reflectionText?: string
): Promise<FrontendProgress> {
  const now = new Date();
  const existing = await getProgress(userId, journeyId);

  let prog: FrontendProgress;
  if (existing) {
    const completedDays = [...new Set([...existing.completedDays, day])];
    const newCurrentDay = Math.max(existing.currentDay, day + 1);
    const rows = await db
      .update(userJourneyProgressTable)
      .set({ completedDays, currentDay: newCurrentDay, lastCompletedAt: now, updatedAt: now })
      .where(and(
        eq(userJourneyProgressTable.userId, userId),
        eq(userJourneyProgressTable.journeyId, journeyId)
      ))
      .returning();
    prog = toFrontendProgress(rows[0]);
  } else {
    await startJourney(userId, journeyId);
    return completeStep(userId, journeyId, day, reflectionText);
  }

  if (reflectionText?.trim()) {
    const existingRef = await db
      .select()
      .from(stepReflectionsTable)
      .where(and(
        eq(stepReflectionsTable.userId, userId),
        eq(stepReflectionsTable.journeyId, journeyId),
        eq(stepReflectionsTable.day, day),
      ));
    if (existingRef[0]) {
      await db.update(stepReflectionsTable)
        .set({ reflection: reflectionText, updatedAt: now })
        .where(eq(stepReflectionsTable.id, existingRef[0].id));
    } else {
      await db.insert(stepReflectionsTable).values({
        userId, journeyId, day,
        reflection: reflectionText,
        createdAt: now, updatedAt: now,
      });
    }
  }

  return prog;
}

export async function getReflections(userId: string): Promise<Record<string, string>> {
  const rows = await db
    .select()
    .from(stepReflectionsTable)
    .where(eq(stepReflectionsTable.userId, userId));
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[`${row.journeyId}-${row.day}`] = row.reflection;
  }
  return result;
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  journeys: FrontendJourney[];
  stepMatches: Array<{ journeyId: string; day: number; title: string; matchedField: string; excerpt: string }>;
}

export async function searchJourneys(q: string, tags: string[]): Promise<SearchResult> {
  const term = `%${q.toLowerCase()}%`;

  // Journey-level search: title + description
  const journeyRows = q
    ? await db.select().from(journeysTable).where(
        and(
          or(
            ilike(journeysTable.title, term),
            ilike(journeysTable.description, term),
          ),
          isNull(journeysTable.deletedAt),
        )
      )
    : await db.select().from(journeysTable).where(isNull(journeysTable.deletedAt));

  // Tag filter: keep journeys whose tags array contains any of the requested tags
  let journeyResults = journeyRows.map(toFrontendJourney);
  if (tags.length) {
    journeyResults = journeyResults.filter(j =>
      tags.some(tag => (j.tags ?? []).map(t => t.toLowerCase()).includes(tag.toLowerCase()))
    );
  }

  // Step-level search (only when a text query is present)
  let stepMatches: SearchResult["stepMatches"] = [];
  if (q) {
    // Exclude steps from soft-deleted parent journeys by scoping to live journey IDs.
    const liveJourneyIds = (await db
      .select({ id: journeysTable.id })
      .from(journeysTable)
      .where(isNull(journeysTable.deletedAt)))
      .map(r => r.id);

    const stepRows = liveJourneyIds.length === 0 ? [] : await db.select().from(journeyStepsTable).where(
      and(
        or(
          ilike(journeyStepsTable.title, term),
          ilike(journeyStepsTable.scripture, term),
          ilike(journeyStepsTable.teachingContent, term),
          ilike(journeyStepsTable.prayer, term),
          ilike(journeyStepsTable.reflectionQuestion, term),
        ),
        isNull(journeyStepsTable.deletedAt),
        inArray(journeyStepsTable.journeyId, liveJourneyIds),
      )
    );
    stepMatches = stepRows.map(r => {
      const t = q.toLowerCase();
      let matchedField = "title";
      let excerpt = r.title ?? "";
      if (r.scripture?.toLowerCase().includes(t)) { matchedField = "scripture"; excerpt = r.scripture ?? ""; }
      else if (r.teachingContent?.toLowerCase().includes(t)) { matchedField = "teaching"; excerpt = r.teachingContent?.substring(0, 120) ?? ""; }
      else if (r.prayer?.toLowerCase().includes(t)) { matchedField = "prayer"; excerpt = r.prayer?.substring(0, 120) ?? ""; }
      else if (r.reflectionQuestion?.toLowerCase().includes(t)) { matchedField = "reflection"; excerpt = r.reflectionQuestion ?? ""; }
      return { journeyId: r.journeyId, day: r.day, title: r.title ?? "", matchedField, excerpt };
    });
  }

  return { journeys: journeyResults, stepMatches };
}

export async function upsertProgressFromLocal(
  userId: string,
  progressMap: Record<string, { currentDay: number; completedDays: number[]; startedAt: string; lastCompletedAt: string | null }>
): Promise<void> {
  const now = new Date();
  for (const [journeyId, prog] of Object.entries(progressMap)) {
    const existing = await getProgress(userId, journeyId);
    if (existing) continue;
    await db.insert(userJourneyProgressTable).values({
      userId,
      journeyId,
      currentDay: prog.currentDay,
      completedDays: prog.completedDays,
      startedAt: new Date(prog.startedAt),
      lastCompletedAt: prog.lastCompletedAt ? new Date(prog.lastCompletedAt) : null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  }
}

// ─── One-time data repair ──────────────────────────────────────────────────────

/**
 * Repairs step statuses that were silently created as Draft while their parent
 * journey was already Published — a bug in the original createStep implementation.
 *
 * Actions (all idempotent):
 *   1. Find every Published journey.
 *   2. Set all Draft steps of those journeys to Published.
 *   3. Set the "created-in-god-s-image" placeholder journey to Draft so it no
 *      longer shadows the real walk in the same collection.
 *
 * Returns a report suitable for logging / API response.
 */
export async function repairStepStatuses(): Promise<{
  publishedJourneyIds: string[];
  stepsPublished: number;
  placeholderJourneyRetired: boolean;
}> {
  const now = new Date();

  // 1. Collect all Published journey IDs.
  const publishedJourneys = await listPublishedJourneys();
  const publishedIds = publishedJourneys.map(j => j.id);

  let stepsPublished = 0;

  if (publishedIds.length > 0) {
    // 2. Bulk-publish every Draft step whose parent is a Published journey.
    const result = await db
      .update(journeyStepsTable)
      .set({ status: "Published", updatedAt: now })
      .where(
        and(
          eq(journeyStepsTable.status, "Draft"),
          inArray(journeyStepsTable.journeyId, publishedIds),
        ),
      )
      .returning({ day: journeyStepsTable.day });
    stepsPublished = result.length;

    // 3. Refresh durationDays for every affected journey so the lesson count
    //    reflects the newly-published steps.
    for (const id of publishedIds) {
      await refreshJourneyDuration(id, now);
    }
  }

  // 4. Retire the accidental "created-in-god-s-image" placeholder journey.
  //    It has one "Untitled Step" and was shadowing "what-went-wrong" in the
  //    Coming to Jesus collection. Setting it to Draft removes it from the
  //    published catalogue without deleting any data.
  const placeholder = await getJourney("created-in-god-s-image");
  let placeholderJourneyRetired = false;
  if (placeholder && placeholder.status === "Published") {
    await db
      .update(journeysTable)
      .set({ status: "Draft", updatedAt: now })
      .where(eq(journeysTable.id, "created-in-god-s-image"));
    placeholderJourneyRetired = true;
  }

  return { publishedJourneyIds: publishedIds, stepsPublished, placeholderJourneyRetired };
}
