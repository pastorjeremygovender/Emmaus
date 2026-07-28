/**
 * GET /next-steps
 *
 * Canonical member discovery endpoint. Returns pre-grouped, eligibility-checked
 * content for the Next Steps page. The server determines grouping and progress
 * state — no complex publication rules need to live in the frontend.
 *
 * Query params:
 *   userId             — optional; when supplied, memberProgressState is personalised
 *   currentCompanionId — optional; the companion journey marked as This Week's Sermon
 *                        Falls back to most-recently-published companion.
 */

import { Router, type Request, type Response } from "express";
import * as journeyStore from "../lib/journey-store.js";
import * as devStore from "../lib/devotional-store.js";
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
  };
  /** Member-facing route, e.g. /journey/:id/day/:n or /devotional/:id/day/:n */
  route: string;
  primaryActionLabel: string;
}

export interface NextStepsResponse {
  recommended: NextStepsItem[];
  dailyDevotionals: NextStepsItem[];
  currentSermonDevotional: NextStepsItem | null;
  previousSermonDevotionals: NextStepsItem[];
  journeys: NextStepsItem[];
  bibleStudies: NextStepsItem[];
  recentlyAdded: NextStepsItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EXEMPT_JOURNEY_TYPES = new Set(["core", "companion", "devotional", "daily-rhythm"]);

function primaryActionLabel(contentType: ContentType, state: MemberProgressState): string {
  const noun =
    contentType === "daily-devotional" ? "Devotional" :
    contentType === "sermon-devotional" ? "Sermon Devotional" :
    contentType === "bible-study" ? "Bible Study" :
    "Journey";
  switch (state) {
    case "not-started": return `Begin ${noun}`;
    case "in-progress": return `Continue ${noun}`;
    case "completed":   return `Review ${noun}`;
  }
}

function journeyRoute(id: string, currentDay: number): string {
  return `/journey/${id}/day/${currentDay}`;
}

function devotionalRoute(id: string, currentDay: number): string {
  return `/devotional/${id}/day/${currentDay}`;
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
    },
    route: journeyRoute(j.id, currentDay),
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
    route: devotionalRoute(s.id, currentDay),
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

    const [publishedJourneys, devSeries] = await Promise.all([
      journeyStore.listPublishedJourneys(),
      devStore.listPublishedSeries(),
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

    // ── Group journeys by content type ──────────────────────────────────────

    const companions = publishedJourneys.filter(j => j.journeyType === "companion");

    // Determine current companion: explicit param > most-recently-published
    const sortedCompanions = [...companions].sort(
      (a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
    );
    const currentCompanion =
      (currentCompanionId ? sortedCompanions.find(j => j.id === currentCompanionId) : null) ??
      sortedCompanions[0] ??
      null;
    const previousCompanions = companions.filter(j => j.id !== currentCompanion?.id);

    const standardJourneys = publishedJourneys.filter(
      j => !EXEMPT_JOURNEY_TYPES.has(j.journeyType) && j.journeyType !== "bible-study",
    );
    const bibleStudyJourneys = publishedJourneys.filter(
      j => j.journeyType === "bible-study",
    );

    // ── Build section arrays ─────────────────────────────────────────────────

    const dailyDevotionals = devSeries.map(s =>
      buildDevotionalItem(s, entryCounts.get(s.id) ?? 0, devProgressMap),
    );

    const journeysSection = standardJourneys.map(j =>
      buildJourneyItem(j, "journey", journeyProgress),
    );

    const bibleStudiesSection = bibleStudyJourneys.map(j =>
      buildJourneyItem(j, "bible-study", journeyProgress),
    );

    const currentSermonDevotional = currentCompanion
      ? buildJourneyItem(currentCompanion, "sermon-devotional", journeyProgress)
      : null;

    const previousSermonDevotionals = previousCompanions.map(j =>
      buildJourneyItem(j, "sermon-devotional", journeyProgress),
    );

    // ── Recommended (max 3) ──────────────────────────────────────────────────
    //
    // Rules:
    //  - Companion (sermon devotional) is excluded — it always has its own dedicated
    //    "This Week's Sermon" section and must not appear twice.
    //  - Daily Devotionals are excluded — they always appear in their own dedicated
    //    "Daily Devotionals" section. Showing Psalms in Recommended AND in Daily
    //    Devotionals would duplicate it on the same screen.
    //  - Only surface a Journey or Bible Study when there is no active growth content,
    //    to avoid redundancy with those dedicated sections.
    //  - Recommended is only populated when there is something a member would not
    //    otherwise immediately see in a section below.

    const recommended: NextStepsItem[] = [];
    const recommendedIds = new Set<string>();

    // A beginner/first unstarted Journey or Bible Study if no active growth content
    const allGrowth = [...journeysSection, ...bibleStudiesSection];
    const hasActiveGrowth = allGrowth.some(j => j.memberProgressState === "in-progress");
    if (!hasActiveGrowth) {
      const target =
        allGrowth.find(
          j =>
            j.memberProgressState === "not-started" &&
            (j.metadata.difficulty?.toLowerCase().includes("begin") ||
             j.metadata.difficulty?.toLowerCase().includes("intro")),
        ) ??
        allGrowth.find(j => j.memberProgressState === "not-started");
      if (target) {
        recommended.push(target);
        recommendedIds.add(target.id);
      }
    }

    // ── Recently Added (max 5, newest first, no duplicates of dedicated sections) ──
    //
    // Exclude anything already shown in a dedicated section above:
    //   - dailyDevotionals are shown in full under "Daily Devotionals"
    //   - currentCompanion is shown in full under "This Week's Sermon"
    //   - items in recommended are shown in full under "Recommended for You"
    //
    // previousSermonDevotionals can appear here if they have a publishedAt date
    // and are not already featured.

    const alreadyShowedIds = new Set<string>([
      ...recommendedIds,
      ...dailyDevotionals.map(d => d.id),     // always in Daily Devotionals section
      ...(currentCompanion ? [currentCompanion.id] : []),  // always in This Week's Sermon
    ]);

    type Candidate = { item: NextStepsItem; publishedAt: string };
    const candidates: Candidate[] = [
      ...journeysSection,
      ...bibleStudiesSection,
      ...previousSermonDevotionals,
    ]
      .filter(item => !alreadyShowedIds.has(item.id) && !!item.metadata.publishedAt)
      .map(item => ({ item, publishedAt: item.metadata.publishedAt! }));

    const recentlyAdded = candidates
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, 5)
      .map(c => c.item);

    // ── Respond ──────────────────────────────────────────────────────────────

    const response: NextStepsResponse = {
      recommended,
      dailyDevotionals,
      currentSermonDevotional,
      previousSermonDevotionals,
      journeys: journeysSection,
      bibleStudies: bibleStudiesSection,
      recentlyAdded,
    };

    res.json(response);
  } catch (err) {
    logger.error({ err }, "GET /next-steps failed");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
