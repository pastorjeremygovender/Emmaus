/**
 * Authenticated, owner-scoped context for typed Emmaus requests.
 *
 * Every source is read independently. A single unavailable source must not
 * prevent Emmaus from answering from the remaining trusted sources.
 */

import { getBibleData } from "../bible/store.js";
import {
  getDailyRhythmState,
  getProgress,
  listPublishedJourneys,
  listSteps,
  type FrontendJourney,
} from "../lib/journey-store.js";
import {
  getAllProgressForUser,
  getSeriesById,
  listPublishedSeries,
} from "../lib/devotional-store.js";
import { getPublishedSermonById } from "../lib/canonical-sermon-store.js";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";
import type { EmmausContextInput } from "./context-builder.js";
import {
  JARVIS_CONTEXT_VERSION,
  type JarvisContext,
  type JarvisContextEnvelope,
  type JarvisSourceStatus,
} from "./jarvis-contract.js";

function status(
  source: JarvisSourceStatus["source"],
  value: "ok" | "unavailable" | "empty",
): JarvisSourceStatus {
  return { source, status: value };
}

async function readDisplayName(userId: string): Promise<string | undefined> {
  const result = await pool.query<{ preferred_name: string | null; app_role: string | null }>(
    `SELECT preferred_name, app_role FROM user_profiles
     WHERE auth_subject = $1 OR email = $1
     ORDER BY CASE WHEN auth_subject = $1 THEN 0 ELSE 1 END
     LIMIT 1`,
    [userId],
  );
  const profile = result.rows[0];
  const preferred = profile?.preferred_name?.trim();
  if (profile?.app_role === "admin" || profile?.app_role === "superAdmin") {
    return preferred && !/^(pastor govender|jeremy govender|the pastor|the user)$/i.test(preferred)
      ? preferred
      : "Pastor Jeremy";
  }
  return preferred || undefined;
}

export interface JarvisContextReaders {
  readDisplayName: typeof readDisplayName;
  getDailyRhythmState: typeof getDailyRhythmState;
  getProgress: typeof getProgress;
  listPublishedJourneys: typeof listPublishedJourneys;
  listSteps: typeof listSteps;
  getBibleData: typeof getBibleData;
  getAllProgressForUser: typeof getAllProgressForUser;
  getSeriesById: typeof getSeriesById;
  listPublishedSeries: typeof listPublishedSeries;
  getPublishedSermonById: typeof getPublishedSermonById;
}

const productionReaders: JarvisContextReaders = {
  readDisplayName,
  getDailyRhythmState,
  getProgress,
  listPublishedJourneys,
  listSteps,
  getBibleData,
  getAllProgressForUser,
  getSeriesById,
  listPublishedSeries,
  getPublishedSermonById,
};

async function readJourneyProgress(
  userId: string,
  journeys: FrontendJourney[],
  readers: JarvisContextReaders,
): Promise<Pick<JarvisContext, "activeProgress" | "completedProgress">> {
  const activeProgress: JarvisContext["activeProgress"] = [];
  const completedProgress: JarvisContext["completedProgress"] = [];

  for (const journey of journeys) {
    if (journey.journeyType === "daily-rhythm" || journey.journeyType === "companion") continue;
    const progress = await readers.getProgress(userId, journey.id);
    if (!progress || progress.status === "paused" || progress.status === "hidden") continue;

    const journeyType = journey.journeyType === "walk" || journey.journeyType === "core"
      ? "walk"
      : "journey";
    if (progress.completedDays.length >= journey.durationDays) {
      completedProgress.push({
        journeyId: journey.id,
        journeyType,
        title: journey.title,
        route: `/journeys/${journey.id}`,
      });
      continue;
    }

    const currentDay = Math.max(1, progress.currentDay);
    const steps = await readers.listSteps(journey.id);
    const step = steps.find((candidate) =>
      candidate.day === currentDay
      && candidate.status === "Published"
      && !candidate.isCompletionStep,
    );
    activeProgress.push({
      journeyId: journey.id,
      journeyType,
      title: journey.title,
      currentDay,
      ...(step?.id ? { stepId: step.id } : {}),
      ...(step?.title ? { stepTitle: step.title } : {}),
      route: `/journey/${journey.id}/day/${currentDay}`,
    });
  }
  return {
    activeProgress: activeProgress.slice(0, 8),
    completedProgress: completedProgress.slice(0, 8),
  };
}

async function readDevotionalContext(userId: string, readers: JarvisContextReaders) {
  const [series, progress] = await Promise.all([
    readers.listPublishedSeries(),
    readers.getAllProgressForUser(userId),
  ]);
  const published = new Map(series.map((item) => [item.id, item]));
  const active = progress
    .filter((item) =>
      published.has(item.seriesId)
      && item.status !== "paused"
      && item.status !== "hidden"
    )
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  if (!active) return undefined;
  const selectedSeries = published.get(active.seriesId);
  if (!selectedSeries) return undefined;
  const full = await readers.getSeriesById(selectedSeries.id);
  const entry = full?.entries
    .filter((item) => item.status === "Published")
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .find((item) => !active.completedDays.includes(item.dayNumber))
    ?? full?.entries
      .filter((item) => item.status === "Published")
      .sort((a, b) => b.dayNumber - a.dayNumber)[0];
  return {
    seriesId: selectedSeries.id,
    seriesTitle: selectedSeries.title,
    currentDay: entry?.dayNumber ?? Math.max(1, active.currentDay),
    ...(entry?.id ? { entryId: entry.id } : {}),
    ...(entry?.title ? { entryTitle: entry.title } : {}),
    route: `/devotional/${selectedSeries.id}/day/${entry?.dayNumber ?? Math.max(1, active.currentDay)}`,
  };
}

export async function assembleJarvisContext(
  userId: string,
  input?: Pick<EmmausContextInput, "sermonContext">,
  overrides: Partial<JarvisContextReaders> = {},
): Promise<JarvisContextEnvelope> {
  const readers: JarvisContextReaders = { ...productionReaders, ...overrides };
  const sourceStatuses: JarvisSourceStatus[] = [];
  const identity = await readers.readDisplayName(userId)
    .then((displayName) => {
      sourceStatuses.push(status("identity", displayName ? "ok" : "empty"));
      return { displayName };
    })
    .catch((error) => {
      logger.warn({ err: String(error) }, "emmaus: Jarvis identity source unavailable");
      sourceStatuses.push(status("identity", "unavailable"));
      return {};
    });

  const [rhythmResult, journeysResult, bibleResult, devotionalResult, sermonResult] =
    await Promise.all([
      readers.getDailyRhythmState(userId)
        .then((value) => {
          sourceStatuses.push(status("daily-rhythm", value ? "ok" : "empty"));
          return value;
        })
        .catch((error) => {
          logger.warn({ err: String(error) }, "emmaus: Jarvis Daily Rhythm source unavailable");
          sourceStatuses.push(status("daily-rhythm", "unavailable"));
          return null;
        }),
      readers.listPublishedJourneys()
        .then(async (journeys) => {
          const progress = await readJourneyProgress(userId, journeys, readers);
          sourceStatuses.push(status(
            "active-progress",
            progress.activeProgress.length > 0 || progress.completedProgress.length > 0 ? "ok" : "empty",
          ));
          return progress;
        })
        .catch((error) => {
          logger.warn({ err: String(error) }, "emmaus: Jarvis active progress source unavailable");
          sourceStatuses.push(status("active-progress", "unavailable"));
          return { activeProgress: [], completedProgress: [] };
        }),
      readers.getBibleData(userId)
        .then((data) => {
          const last = data?.history?.[0];
          sourceStatuses.push(status("bible", last ? "ok" : "empty"));
          return last;
        })
        .catch((error) => {
          logger.warn({ err: String(error) }, "emmaus: Jarvis Bible source unavailable");
          sourceStatuses.push(status("bible", "unavailable"));
          return undefined;
        }),
      readDevotionalContext(userId, readers)
        .then((value) => {
          sourceStatuses.push(status("devotional", value ? "ok" : "empty"));
          return value;
        })
        .catch((error) => {
          logger.warn({ err: String(error) }, "emmaus: Jarvis devotional source unavailable");
          sourceStatuses.push(status("devotional", "unavailable"));
          return undefined;
        }),
      input?.sermonContext?.sermonId
        ? readers.getPublishedSermonById(input.sermonContext.sermonId)
            .then((sermon) => {
              sourceStatuses.push(status("sermon", sermon ? "ok" : "empty"));
              return sermon;
            })
            .catch((error) => {
              logger.warn({ err: String(error) }, "emmaus: Jarvis sermon source unavailable");
              sourceStatuses.push(status("sermon", "unavailable"));
              return null;
            })
        : Promise.resolve(null),
    ]);
  if (!input?.sermonContext?.sermonId) {
    sourceStatuses.push(status("sermon", "empty"));
  }

  const dailyRhythm = rhythmResult
    ? {
        journeyId: rhythmResult.journeyId,
        currentDay: rhythmResult.currentDayNumber,
        ...(rhythmResult.currentStepId ? { stepId: rhythmResult.currentStepId } : {}),
        ...(rhythmResult.currentStepTitle ? { stepTitle: rhythmResult.currentStepTitle } : {}),
        completedToday: rhythmResult.currentStepCompleted,
        locked: rhythmResult.nextStepLocked,
        ...(rhythmResult.nextEligibleUnlockDate
          ? { unlockDate: rhythmResult.nextEligibleUnlockDate }
          : {}),
      }
    : undefined;

  return {
    schemaVersion: JARVIS_CONTEXT_VERSION,
    scope: "authenticated-user",
    context: {
      identity,
      ...(dailyRhythm ? { dailyRhythm } : {}),
      activeProgress: journeysResult.activeProgress,
      completedProgress: journeysResult.completedProgress,
      ...(bibleResult
        ? {
            bible: {
              bookId: bibleResult.bookId,
              bookName: bibleResult.bookName,
              chapter: bibleResult.chapter,
              ...(bibleResult.chapterHeading ? { chapterHeading: bibleResult.chapterHeading } : {}),
              ...(bibleResult.openedAt ? { openedAt: bibleResult.openedAt } : {}),
            },
          }
        : {}),
      ...(devotionalResult ? { devotional: devotionalResult } : {}),
      ...(sermonResult
        ? {
            sermon: {
              sermonId: sermonResult.id,
              title: sermonResult.title,
              speaker: sermonResult.speaker,
              ...(sermonResult.scriptureReference ? { scriptureReference: sermonResult.scriptureReference } : {}),
              ...(sermonResult.sermonDate ? { sermonDate: sermonResult.sermonDate } : {}),
            },
          }
        : {}),
      sourceStatuses,
    },
  };
}