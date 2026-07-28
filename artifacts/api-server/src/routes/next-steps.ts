/**
 * GET /next-steps
 *
 * Canonical member discovery endpoint. Returns pre-grouped, eligibility-checked
 * content for the three-tab Next Steps page.
 *
 * Response shape:
 *   dailyDevotionals       – all published devotional series (at least 1 published entry)
 *   journeyCollections     – published collections with their published journeys
 *   standaloneJourneys     – published journeys with no collection
 *   currentSermonCompanion – companion marked as This Week's (or most-recent)
 *   previousSermonCompanions – all other published companions, newest first
 *
 * Query params:
 *   userId             – optional; personalises memberProgressState
 *   currentCompanionId – optional; overrides most-recent companion as "current"
 */

import { Router, type Request, type Response } from "express";
import * as journeyStore from "../lib/journey-store.js";
import * as devStore from "../lib/devotional-store.js";
import * as collectionsStore from "../lib/collections-store.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── Shared types ─────────────────────────────────────────────────────────────

export type MemberProgressState = "not-started" | "in-progress" | "completed";
export type ContentType =
  | "journey"
  | "bible-study"
  | "sermon-devotional"
  | "daily-devotional";

export interface NextStepsItem {
  id: string;
  contentType: ContentType;
  title: string;
  description?: string;
  memberProgressState: MemberProgressState;
  metadata: {
    durationDays?: number;
    difficulty?: string;
    scriptureReference?: string;
    coverImageUrl?: string;
    collectionId?: string;
    publishedAt?: string;
    subtitle?: string;
  };
  /** Member-facing route, e.g. /journey/:id/day/:n or /devotional/:id/day/:n */
  route: string;
  primaryActionLabel: string;
}

export interface JourneyCollectionGroup {
  id: string;
  title: string;
  description?: string;
  journeys: NextStepsItem[];
}

export interface NextStepsResponse {
  dailyDevotionals: NextStepsItem[];
  journeyCollections: JourneyCollectionGroup[];
  standaloneJourneys: NextStepsItem[];
  currentSermonCompanion: NextStepsItem | null;
  previousSermonCompanions: NextStepsItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function primaryActionLabel(contentType: ContentType, state: MemberProgressState): string {
  if (contentType === "sermon-devotional") {
    switch (state) {
      case "not-started": return "Begin Sermon Companion";
      case "in-progress": return "Continue Sermon Companion";
      case "completed":   return "Review Today";
    }
  }
  if (contentType === "daily-devotional") {
    switch (state) {
      case "not-started": return "Begin Devotional";
      case "in-progress": return "Continue Devotional";
      case "completed":   return "Review Today";
    }
  }
  const noun = contentType === "bible-study" ? "Bible Study" : "Journey";
  switch (state) {
    case "not-started": return `Begin ${noun}`;
    case "in-progress": return `Continue ${noun}`;
    case "completed":   return `Review ${noun}`;
  }
}

function journeyProgressState(
  j: journeyStore.FrontendJourney,
  allProgress: Record<string, journeyStore.FrontendProgress>,
): MemberProgressState {
  const p = allProgress[j.id];
  if (!p) return "not-started";
  if (j.durationDays > 0 && p.completedDays.length >= j.durationDays) return "completed";
  return "in-progress";
}

function devotionalMemberState(
  seriesId: string,
  publishedEntryCount: number,
  devProgressMap: Map<string, devStore.DevotionalProgress>,
): MemberProgressState {
  const p = devProgressMap.get(seriesId);
  if (!p) return "not-started";
  if (publishedEntryCount > 0 && p.completedDays.length >= publishedEntryCount) return "completed";
  return "in-progress";
}

function buildJourneyItem(
  j: journeyStore.FrontendJourney,
  contentType: ContentType,
  allProgress: Record<string, journeyStore.FrontendProgress>,
): NextStepsItem {
  const state = journeyProgressState(j, allProgress);
  const p = allProgress[j.id];
  const currentDay = p?.currentDay ?? 1;
  return {
    id: j.id,
    contentType,
    title: j.title,
    description: j.description || undefined,
    memberProgressState: state,
    metadata: {
      durationDays: j.durationDays || undefined,
      difficulty: j.difficulty || undefined,
      scriptureReference: j.scriptureReference || undefined,
      coverImageUrl: j.coverImageUrl || undefined,
      collectionId: j.collectionId || undefined,
      publishedAt: j.publishedAt || undefined,
      subtitle: j.subtitle || undefined,
    },
    route: `/journey/${j.id}/day/${currentDay}`,
    primaryActionLabel: primaryActionLabel(contentType, state),
  };
}

function buildDevotionalItem(
  s: devStore.DevotionalSeries,
  publishedEntryCount: number,
  devProgressMap: Map<string, devStore.DevotionalProgress>,
): NextStepsItem {
  const state = devotionalMemberState(s.id, publishedEntryCount, devProgressMap);
  const p = devProgressMap.get(s.id);
  const currentDay = p?.currentDay ?? 1;
  return {
    id: s.id,
    contentType: "daily-devotional",
    title: s.title,
    description: s.description || undefined,
    memberProgressState: state,
    metadata: {
      durationDays: publishedEntryCount || undefined,
      publishedAt: s.publishedAt?.toISOString?.() ?? (s.publishedAt as unknown as string) ?? undefined,
    },
    route: `/devotional/${s.id}/day/${currentDay}`,
    primaryActionLabel: primaryActionLabel("daily-devotional", state),
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.get("/next-steps", async (req: Request, res: Response) => {
  try {
    const userId =
      (req.headers["x-user-id"] as string | undefined) ||
      (req.query.userId as string | undefined) ||
      null;
    const currentCompanionId =
      (req.query.currentCompanionId as string | undefined) || null;

    // ── Fetch catalog + progress in parallel ────────────────────────────────

    const [publishedJourneys, devSeries, allCollections] = await Promise.all([
      journeyStore.listPublishedJourneys(),
      devStore.listPublishedSeries(),
      collectionsStore.listCollections(),
    ]);

    // Fetch user progress if available
    const [journeyProgress, devProgressMap] = await Promise.all([
      userId
        ? journeyStore.getAllProgress(userId)
        : Promise.resolve({} as Record<string, journeyStore.FrontendProgress>),
      userId
        ? devStore.getAllProgressForUser(userId).then(arr => {
            const m = new Map<string, devStore.DevotionalProgress>();
            arr.forEach(p => m.set(p.seriesId, p));
            return m;
          })
        : Promise.resolve(new Map<string, devStore.DevotionalProgress>()),
    ]);

    // Count published entries per devotional series
    const entryCounts = new Map<string, number>();
    await Promise.all(
      devSeries.map(async s => {
        const full = await devStore.getSeriesById(s.id);
        const count = full?.entries.filter(e => e.status === "Published").length ?? 0;
        entryCounts.set(s.id, count);
      }),
    );

    // ── Daily Devotionals ────────────────────────────────────────────────────

    const dailyDevotionals = devSeries
      .filter(s => (entryCounts.get(s.id) ?? 0) > 0)
      .map(s => buildDevotionalItem(s, entryCounts.get(s.id) ?? 0, devProgressMap));

    // ── Sermon Companions (companion journeyType) ─────────────────────────────

    const companions = publishedJourneys.filter(j => j.journeyType === "companion");
    const sortedCompanions = [...companions].sort(
      (a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
    );
    const currentCompanion =
      (currentCompanionId ? sortedCompanions.find(j => j.id === currentCompanionId) : null) ??
      sortedCompanions[0] ??
      null;
    const previousCompanions = companions.filter(j => j.id !== currentCompanion?.id);

    const currentSermonCompanion = currentCompanion
      ? buildJourneyItem(currentCompanion, "sermon-devotional", journeyProgress)
      : null;
    const previousSermonCompanions = [...previousCompanions]
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
      .map(j => buildJourneyItem(j, "sermon-devotional", journeyProgress));

    // ── Journey grouping ──────────────────────────────────────────────────────
    // Exclude companion and daily-rhythm types — they live in their own tabs.

    const JOURNEY_EXCLUDE = new Set(["companion", "daily-rhythm"]);

    // Group by collectionId
    const byCollection = new Map<string, journeyStore.FrontendJourney[]>();
    const standaloneRaw: journeyStore.FrontendJourney[] = [];

    for (const j of publishedJourneys) {
      if (JOURNEY_EXCLUDE.has(j.journeyType)) continue;
      if (j.collectionId) {
        if (!byCollection.has(j.collectionId)) byCollection.set(j.collectionId, []);
        byCollection.get(j.collectionId)!.push(j);
      } else {
        standaloneRaw.push(j);
      }
    }

    // Build collection groups — only Published collections that have journeys
    const journeyCollections: JourneyCollectionGroup[] = allCollections
      .filter(c => c.status === "Published" && byCollection.has(c.id))
      .map(c => ({
        id: c.id,
        title: c.title,
        description: c.description || undefined,
        journeys: (byCollection.get(c.id) ?? []).map(j =>
          buildJourneyItem(j, j.journeyType === "bible-study" ? "bible-study" : "journey", journeyProgress),
        ),
      }));

    // Standalone journeys (no collection, not companion/daily-rhythm)
    const standaloneJourneys = standaloneRaw.map(j =>
      buildJourneyItem(j, j.journeyType === "bible-study" ? "bible-study" : "journey", journeyProgress),
    );

    // ── Respond ──────────────────────────────────────────────────────────────

    const response: NextStepsResponse = {
      dailyDevotionals,
      journeyCollections,
      standaloneJourneys,
      currentSermonCompanion,
      previousSermonCompanions,
    };

    res.json(response);
  } catch (err) {
    logger.error({ err }, "GET /next-steps failed");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
