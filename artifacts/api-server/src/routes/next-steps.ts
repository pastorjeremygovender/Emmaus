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
 *   userId – optional; personalises memberProgressState
 */

import { Router, type Request, type Response } from "express";
import * as journeyStore from "../lib/journey-store.js";
import * as devStore from "../lib/devotional-store.js";
import * as collectionsStore from "../lib/collections-store.js";
import * as sermonCompanionStore from "../lib/sermon-companion-store.js";
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

/**
 * Canonical primary-action label for sequential content.
 *
 * Rule (mirrors devotional-calendar.ts on the client):
 *   All self-paced content → "Continue" regardless of state.
 *   Daily Rhythm is calendar-paced and never appears in Next Steps, so it
 *   has no entry here.
 */
function primaryActionLabel(_contentType: ContentType, _state: MemberProgressState): string {
  return "Continue";
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

  // For sermon companions, strip any subtitle appended to the title
  // (e.g. "Jesus at the Center: 5 Days of Intentional Living" → "Jesus at the Center").
  const title = contentType === "sermon-devotional" && j.title.includes(": ")
    ? j.title.split(": ")[0].trim()
    : j.title;

  return {
    id: j.id,
    contentType,
    title,
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

    // ── Fetch catalog + progress in parallel ────────────────────────────────

    const [publishedJourneys, devSeries, allCollections, scTableCompanions] = await Promise.all([
      journeyStore.listPublishedJourneys(),
      devStore.listPublishedSeries(),
      collectionsStore.listCollections(),
      // Sermon companions from the sermon_companion table (AI-generated pipeline)
      sermonCompanionStore.listPublishedSermonCompanions(),
    ]);

    // Fetch user progress if available
    const [journeyProgress, devProgressMap, scProgressMap] = await Promise.all([
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
      userId
        ? sermonCompanionStore.getAllSermonCompanionProgress(userId)
        : Promise.resolve({} as Record<string, sermonCompanionStore.CompanionProgress>),
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

    // ── Sermon Companions ──────────────────────────────────────────────────────
    // Two sources are merged into one list:
    //   1. journeys table (journeyType='companion') — manually created / legacy
    //   2. sermon_companion table — AI-generated via the sermon generation pipeline
    //
    // Eligibility for both: Published status AND at least one published entry.
    // listPublishedJourneys() already enforces Published status; the journey-step
    // count is not re-checked here because the journey editor controls entry status.
    // listPublishedSermonCompanions() enforces both status and published entry count.

    type UnifiedCompanion =
      | { source: "journey"; data: journeyStore.FrontendJourney }
      | { source: "sermon-table"; data: sermonCompanionStore.Companion & { publishedEntryCount: number } };

    const seenIds = new Set<string>();
    const allCompanions: UnifiedCompanion[] = [];

    for (const j of publishedJourneys.filter(j => j.journeyType === "companion")) {
      if (seenIds.has(j.id)) continue;
      seenIds.add(j.id);
      allCompanions.push({ source: "journey", data: j });
    }
    for (const c of scTableCompanions) {
      if (seenIds.has(c.id)) continue;
      seenIds.add(c.id);
      allCompanions.push({ source: "sermon-table", data: c });
    }

    // Sort newest-published first so the fallback current-companion is consistent.
    allCompanions.sort((a, b) => {
      const aDate = a.source === "journey" ? (a.data.publishedAt ?? "") : (a.data.publishedAt ?? "");
      const bDate = b.source === "journey" ? (b.data.publishedAt ?? "") : (b.data.publishedAt ?? "");
      return bDate.localeCompare(aDate);
    });

    // Current = companion explicitly marked is_current_week = true in the DB.
    // Returns null when none is set; the card is omitted gracefully on the client.
    const currentCompanionUnified =
      allCompanions.find(
        c => c.source === "sermon-table" && (c.data as sermonCompanionStore.Companion).isCurrentWeek,
      ) ?? null;
    const previousCompanionsUnified = allCompanions.filter(
      c => c.data.id !== currentCompanionUnified?.data.id,
    );

    // Build NextStepsItem from either source type.
    function buildCompanionItem(u: UnifiedCompanion): NextStepsItem {
      if (u.source === "journey") {
        return buildJourneyItem(u.data, "sermon-devotional", journeyProgress);
      }
      // sermon-table companion
      const c = u.data;
      const prog = scProgressMap[c.id];
      let state: MemberProgressState = "not-started";
      if (prog) {
        state =
          c.numberOfDays > 0 && prog.completedDays.length >= c.numberOfDays
            ? "completed"
            : "in-progress";
      }
      const currentDay = prog?.currentDay ?? 1;
      // Strip any subtitle appended to the companion title by AI generation
      // (e.g. "Jesus at the Center: 5 Days of Intentional Living" → "Jesus at the Center").
      const title = c.title.includes(": ") ? c.title.split(": ")[0].trim() : c.title;
      return {
        id: c.id,
        contentType: "sermon-devotional",
        title,
        memberProgressState: state,
        metadata: {
          durationDays: c.numberOfDays,
          publishedAt: c.publishedAt ?? undefined,
        },
        route: `/sermon-companion/${c.id}/day/${currentDay}`,
        primaryActionLabel: primaryActionLabel("sermon-devotional", state),
      };
    }

    const currentSermonCompanion = currentCompanionUnified
      ? buildCompanionItem(currentCompanionUnified)
      : null;
    const previousSermonCompanions = previousCompanionsUnified.map(buildCompanionItem);

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

    res.set("Cache-Control", "no-store");
    res.json(response);
  } catch (err) {
    logger.error({ err }, "GET /next-steps failed");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
