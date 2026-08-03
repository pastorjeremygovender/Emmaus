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
import { computeBadge, type Badge } from "../lib/badge.js";
import { extractUserId } from "../emmaus/auth.js";

const router = Router();

// ─── Shared types ─────────────────────────────────────────────────────────────

export type MemberProgressState = "not-started" | "in-progress" | "completed" | "paused";
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
    /** For daily-devotional items: the member's current day (next to complete). */
    currentDay?: number;
  };
  /** Member-facing route, e.g. /journey/:id/day/:n or /devotional/:id/day/:n */
  route: string;
  /**
   * Label for the primary action button.
   * null means the content is fully complete — no primary action should be shown.
   */
  primaryActionLabel: string | null;
  /** Smart Content Indicator badge — 'NEW' | 'UPDATED' | null */
  badge?: Badge;
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
 *   Paused content → "Resume".
 *   Daily Rhythm is calendar-paced and never appears in Next Steps, so it
 *   has no entry here.
 */
function primaryActionLabel(_contentType: ContentType, state: MemberProgressState): string {
  if (state === "paused") return "Resume";
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
  if ((p as unknown as { status?: string }).status === "paused") return "paused";
  return "in-progress";
}

function buildJourneyItem(
  j: journeyStore.FrontendJourney,
  contentType: ContentType,
  allProgress: Record<string, journeyStore.FrontendProgress>,
  journeyIdsWithIntro: Set<string> = new Set(),
  publishedSteps?: journeyStore.FrontendStep[],
): NextStepsItem {
  const state = journeyProgressState(j, allProgress);
  const p = allProgress[j.id];

  // For not-started walks: route to day/0 (Walk Introduction) when one exists,
  // otherwise day/1. This avoids hard-coding day 1 and satisfies the spec
  // requirement to open the Walk Introduction first when it is present.
  const startDay = !p && journeyIdsWithIntro.has(j.id) ? 0 : 1;
  const currentDay = p?.currentDay ?? startDay;

  // For sermon companions, strip any subtitle appended to the title
  // (e.g. "Jesus at the Center: 5 Days of Intentional Living" → "Jesus at the Center").
  const title = contentType === "sermon-devotional" && j.title.includes(": ")
    ? j.title.split(": ")[0].trim()
    : j.title;

  // For sermon-devotional journey companions compute a progress-aware description
  // ("Day N of M · Title") that mirrors the formula used for sermon-table companions
  // and buildDevotionalItem. Falls back to j.description when steps are not available.
  let description: string | undefined = j.description || undefined;
  if (contentType === "sermon-devotional" && publishedSteps !== undefined) {
    const totalDays = publishedSteps.length;
    const completedCount = p?.completedDays.length ?? 0;
    const allComplete = totalDays > 0 && completedCount >= totalDays;
    const nextStep = publishedSteps.find(s => s.day === currentDay);
    const nextStepTitle = nextStep?.title || undefined;

    description = allComplete
      ? `${totalDays} of ${totalDays} completed`
      : completedCount > 0
        ? nextStepTitle
          ? `Day ${currentDay} of ${totalDays} · ${nextStepTitle}`
          : `Day ${currentDay} of ${totalDays}`
        : totalDays > 0
          ? `Day 1 of ${totalDays}`
          : "Day 1";
  }

  return {
    id: j.id,
    contentType,
    title,
    description,
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
    badge: computeBadge(j.notifyPublishedAt, p?.lastOpenedAt, !!p),
  };
}

function buildDevotionalItem(
  s: devStore.DevotionalSeries,
  publishedEntries: devStore.DevotionalEntry[],
  devProgressMap: Map<string, devStore.DevotionalProgress>,
): NextStepsItem {
  const publishedEntryCount = publishedEntries.length;
  const state = devotionalMemberState(s.id, publishedEntryCount, devProgressMap);
  const p = devProgressMap.get(s.id);

  // Derive the member's next available day from completedDays — exactly the same
  // formula used by Walk.tsx > calcAvailableDaySelfPaced (devotional-calendar.ts).
  // markDayComplete intentionally never increments currentDay (it stays at the DB
  // seed value of 1), so using p.currentDay here would always show "Day 1" to
  // in-progress members and produce a different card text than Today's Steps.
  //
  // The cap is the HIGHEST published day number — NOT publishedEntries.length.
  // For non-contiguous series (e.g. published days 1 and 5, count=2, maxDay=5),
  // using the count (2) as the cap would direct the member to day 2 (unpublished)
  // instead of staying at day 5 (published). Walk.tsx uses the same maxDay formula:
  //   Math.max(...publishedEntries.map(e => e.dayNumber))
  const completedDays = p?.completedDays ?? [];
  const completedCount = completedDays.length;
  const maxPublishedDay = publishedEntryCount > 0
    ? Math.max(...publishedEntries.map(e => e.dayNumber))
    : 1;
  const currentDay = completedCount === 0
    ? 1
    : Math.min(Math.max(...completedDays) + 1, maxPublishedDay);

  const allComplete = publishedEntryCount > 0 && completedCount >= publishedEntryCount;
  const nextEntry = publishedEntries.find(e => e.dayNumber === currentDay);
  const nextEntryTitle = nextEntry?.title || undefined;

  // Mirror the description formula used by Walk.tsx > DevotionalCard so both
  // screens always show exactly the same progress string.
  const description = allComplete
    ? `${publishedEntryCount} of ${publishedEntryCount} completed`
    : completedCount > 0
      ? nextEntryTitle
        ? `Day ${currentDay} of ${publishedEntryCount} · ${nextEntryTitle}`
        : `Day ${currentDay} of ${publishedEntryCount}`
      : publishedEntryCount > 0
        ? `Day 1 of ${publishedEntryCount}`
        : "Day 1";

  return {
    id: s.id,
    contentType: "daily-devotional",
    title: s.title,
    description,
    memberProgressState: state,
    metadata: {
      durationDays: publishedEntryCount || undefined,
      publishedAt: s.publishedAt?.toISOString?.() ?? (s.publishedAt as unknown as string) ?? undefined,
      currentDay,
    },
    route: `/devotional/${s.id}/day/${currentDay}`,
    primaryActionLabel: primaryActionLabel("daily-devotional", state),
    badge: computeBadge(s.notifyPublishedAt ?? null, p?.lastOpenedAt ?? null, devProgressMap.has(s.id)),
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.get("/next-steps", async (req: Request, res: Response) => {
  try {
    // Resolve user identity via the trusted auth helper — falls back to null
    // when the request is unauthenticated (public catalog mode).
    const userId = extractUserId(req);

    // ── Fetch catalog + progress in parallel ────────────────────────────────

    const [publishedJourneys, devSeries, allCollections, scTableCompanions] = await Promise.all([
      journeyStore.listPublishedJourneys(),
      devStore.listPublishedSeries(),
      collectionsStore.listCollections(),
      // Sermon companions from the sermon_companion table (AI-generated pipeline)
      sermonCompanionStore.listPublishedSermonCompanions(),
    ]);

    // Batch-check which published journeys have a Walk Introduction step (day=0).
    // Used to route not-started walks to day/0 instead of hard-coding day/1.
    const journeyIdsWithIntro = await journeyStore.getJourneyIdsWithIntroStep(
      publishedJourneys.map(j => j.id),
    );

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

    // Fetch published entries per devotional series.
    // Storing the full entry list (not just count) lets buildDevotionalItem
    // look up the current entry title for a progress-aware description.
    const seriesEntriesMap = new Map<string, devStore.DevotionalEntry[]>();
    await Promise.all(
      devSeries.map(async s => {
        const full = await devStore.getSeriesById(s.id);
        const published = (full?.entries ?? []).filter((e: devStore.DevotionalEntry) => e.status === "Published");
        seriesEntriesMap.set(s.id, published);
      }),
    );

    // Fetch published entries per sermon-table companion.
    // Used by buildCompanionItem to compute a progress-aware description
    // ("Day N of M · Entry Title") that mirrors Today's Steps exactly.
    const companionEntriesMap = new Map<string, sermonCompanionStore.CompanionEntry[]>();

    // Fetch published steps per journey-source companion.
    // Used by buildJourneyItem to compute the same progress-aware description
    // for companions stored in the journeys table (legacy/manual companions).
    const journeyCompanionStepsMap = new Map<string, journeyStore.FrontendStep[]>();

    await Promise.all([
      ...scTableCompanions.map(async c => {
        const entries = await sermonCompanionStore.getEntriesForCompanion(c.id);
        const published = entries.filter(e => e.status === "Published");
        companionEntriesMap.set(c.id, published);
      }),
      ...publishedJourneys
        .filter(j => j.journeyType === "companion")
        .map(async j => {
          const steps = await journeyStore.listSteps(j.id);
          const published = steps.filter(s => s.status === "Published");
          journeyCompanionStepsMap.set(j.id, published);
        }),
    ]);

    // ── Daily Devotionals ────────────────────────────────────────────────────

    const dailyDevotionals = devSeries
      .filter(s => (seriesEntriesMap.get(s.id)?.length ?? 0) > 0)
      .map(s => buildDevotionalItem(s, seriesEntriesMap.get(s.id) ?? [], devProgressMap));

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
    // Falls back to the most-recently-published companion (first in the sorted list)
    // when no companion has the flag set — covers the window between the column
    // being added (startup migration) and the admin clicking Set as This Week's Sermon.
    const sermonTableCompanions = allCompanions.filter(c => c.source === "sermon-table");
    const currentCompanionUnified =
      sermonTableCompanions.find(
        c => (c.data as sermonCompanionStore.Companion).isCurrentWeek,
      ) ??
      (sermonTableCompanions[0] ?? null);
    const previousCompanionsUnified = allCompanions.filter(
      c => c.data.id !== currentCompanionUnified?.data.id,
    );

    // Build NextStepsItem from either source type.
    function buildCompanionItem(u: UnifiedCompanion): NextStepsItem {
      if (u.source === "journey") {
        return buildJourneyItem(
          u.data,
          "sermon-devotional",
          journeyProgress,
          new Set(), // no intro-step routing needed for companions
          journeyCompanionStepsMap.get(u.data.id),
        );
      }
      // sermon-table companion
      const c = u.data;
      const prog = scProgressMap[c.id];

      // Use the actual published entry count as the final-day threshold.
      // publishedEntryCount is returned by listPublishedSermonCompanions() and
      // reflects only published (not draft) entries — the same value Today's Steps
      // uses via numberOfDays on the scCompanion object.
      const publishedEntryCount = c.publishedEntryCount;

      let state: MemberProgressState = "not-started";
      if (prog) {
        if (publishedEntryCount > 0 && prog.completedDays.length >= publishedEntryCount) {
          state = "completed";
        } else if (prog.status === "paused") {
          state = "paused";
        } else {
          state = "in-progress";
        }
      }
      const currentDay = prog?.currentDay ?? 1;

      // "All days complete" when the user's arithmetic next-day pointer has
      // advanced past the last available published entry — matches the same
      // check used by the Today's Steps card (currentDay > numberOfDays).
      const isAllComplete = publishedEntryCount > 0 && currentDay > publishedEntryCount;

      // Strip subtitle appended to companion title by AI generation
      // e.g. "Jesus at the Center: 5 Days of Intentional Living" → title + subtitle
      const hasSeparator = c.title.includes(": ");
      const title    = hasSeparator ? c.title.split(": ")[0].trim() : c.title;
      const subtitle = hasSeparator ? c.title.split(": ").slice(1).join(": ").trim() : undefined;

      // Progress-aware description for Today's Steps card
      const publishedEntries = companionEntriesMap.get(c.id) ?? [];
      const completedCount = prog?.completedDays.length ?? 0;
      const allComplete = publishedEntryCount > 0 && completedCount >= publishedEntryCount;
      const nextEntry = publishedEntries.find(e => e.dayNumber === currentDay);
      const nextEntryTitle = nextEntry?.title || undefined;

      const description = allComplete
        ? `${publishedEntryCount} of ${publishedEntryCount} steps completed`
        : completedCount > 0
          ? nextEntryTitle
            ? `Step ${currentDay} of ${publishedEntryCount} · ${nextEntryTitle}`
            : `Step ${currentDay} of ${publishedEntryCount}`
          : publishedEntryCount > 0
            ? `Step 1 of ${publishedEntryCount}`
            : "Step 1";

      // Action label — complete companions now show "Review Companion" instead of no button.
      const actionLabel = allComplete
        ? "Review Companion"
        : primaryActionLabel("sermon-devotional", state);

      return {
        id: c.id,
        contentType: "sermon-devotional",
        title,
        description,
        memberProgressState: state,
        metadata: {
          durationDays: c.numberOfDays,
          publishedAt: c.publishedAt ?? undefined,
          // subtitle lets the Next Steps discovery card show "5 Days of Intentional Living"
          // instead of the progress-based description.
          subtitle: subtitle || undefined,
        },
        // All cards route to the overview; the overview decides whether to
        // open step 1 / current step / review based on progress.
        route: `/sermon-companion/${c.id}/overview`,
        primaryActionLabel: actionLabel,
        badge: computeBadge(c.notifyPublishedAt ?? null, prog?.lastOpenedAt ?? null, !!prog),
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
          buildJourneyItem(j, j.journeyType === "bible-study" ? "bible-study" : "journey", journeyProgress, journeyIdsWithIntro),
        ),
      }));

    // Standalone journeys (no collection, not companion/daily-rhythm)
    const standaloneJourneys = standaloneRaw.map(j =>
      buildJourneyItem(j, j.journeyType === "bible-study" ? "bible-study" : "journey", journeyProgress, journeyIdsWithIntro),
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
