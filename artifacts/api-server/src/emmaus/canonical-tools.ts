import { getBibleData } from "../bible/store.js";
import {
  getProgress,
  getDailyRhythmState,
  completeStep,
  listPublishedJourneys,
  listSteps,
  type DailyRhythmState,
  type FrontendJourney,
  type FrontendStep,
} from "../lib/journey-store.js";
import {
  getAllProgressForUser,
  getSeriesById,
  listPublishedSeries,
  type DevotionalProgress,
} from "../lib/devotional-store.js";
import { retrieveSermons } from "./sermon-retrieval.js";
import {
  describeCapability,
  EMMAUS_CAPABILITIES,
  getEmmausCapability,
  type EmmausCapabilityId,
} from "./capability-registry.js";
import { routeAskEmmausRequest, type TypedAskEmmausIntent } from "./intent-router.js";
import type {
  EmmausResponseMetadata,
  NextStep,
  Recommendation,
  SermonRecommendation,
  ScriptureRef,
} from "./firestore-model.js";
import {
  buildScriptureRoute,
  canonicalBibleBookName,
  extractValidatedScriptureReferences,
} from "./citation-validation.js";
import { readBiblePassage } from "../lib/bible-verse-search.js";
import { logger } from "../lib/logger.js";
import { buildEmmausResourceCatalogue, type EmmausResource } from "./resource-catalogue.js";
import { actionsForResource } from "./action-registry.js";
import { listPublishedSermons } from "../lib/canonical-sermon-store.js";

export interface CanonicalActionExecutors {
  completeStep: typeof completeStep;
}

const productionActionExecutors: CanonicalActionExecutors = { completeStep };

export type CanonicalToolResolution =
  | { handled: true; metadata: EmmausResponseMetadata }
  | { handled: false };

const emptyMetadata = (): EmmausResponseMetadata => ({
  scripture: null,
  scriptureReferences: [],
  nextStep: null,
  nextSteps: [],
  recommendations: [],
  resourceRecommendations: [],
  followUpPrompts: [],
  handoffType: null,
});

const routeForBible = (ref: {
  book: string;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
}) => buildScriptureRoute(ref);

function scriptureRef(
  bookId: string,
  chapter: number,
  verseStart?: number,
  verseEnd?: number,
  displayText?: string,
  displayBookName?: string,
): ScriptureRef {
  const book = displayBookName ?? canonicalBibleBookName(bookId);
  return {
    reference: `${book} ${chapter}${verseStart == null ? "" : `:${verseStart}${verseEnd != null && verseEnd !== verseStart ? `–${verseEnd}` : ""}`}`,
    book: bookId,
    chapter,
    ...(verseStart != null ? { verseStart } : {}),
    ...(verseEnd != null ? { verseEnd } : {}),
    ...(displayText ? { displayText } : {}),
  };
}

function capabilityRecommendation(capabilityId: EmmausCapabilityId): Recommendation {
  const capability = getEmmausCapability(capabilityId);
  return {
    type: capabilityId === "sermons" ? "sermon"
      : capabilityId === "daily-rhythm" ? "daily_rhythm"
        : capabilityId === "daily-devotional" ? "devotional"
          : capabilityId === "walks" ? "walk"
            : capabilityId === "bible-studies" ? "bible_study"
              : "journey",
    title: capability.displayName,
    description: `${capability.description} ${capability.location}.`,
    path: capability.route,
  };
}

function capabilityNextStep(capabilityId: EmmausCapabilityId, operation: "OPEN" | "READ" | "CONTINUE" = "OPEN"): NextStep {
  const capability = getEmmausCapability(capabilityId);
  const verb = operation === "CONTINUE" ? "Continue" : operation === "READ" ? "Read" : "Open";
  return {
    action: `${verb} ${capability.displayName} in Emmaus.`,
    primaryButtonText: `${verb} ${capability.displayName}`,
    path: capability.route,
  };
}

function capabilityAction(
  capabilityId: EmmausCapabilityId,
  kind: "OPEN" | "READ" | "CONTINUE" = "OPEN",
) {
  const capability = getEmmausCapability(capabilityId);
  const verb = kind === "CONTINUE" ? "Continue" : kind === "READ" ? "Read" : "Open";
  return {
    kind,
    capabilityId,
    label: `${verb} ${capability.displayName}`,
    route: capability.route,
  };
}

function appHelp(capabilityId?: EmmausCapabilityId): EmmausResponseMetadata {
  const metadata = emptyMetadata();
  if (capabilityId) {
    const capability = getEmmausCapability(capabilityId);
    metadata.answer = `${describeCapability(capability)} Use the button below to open it.`;
    metadata.nextStep = capabilityNextStep(capabilityId);
    metadata.capabilityActions = [capabilityAction(capabilityId)];
    metadata.recommendations = [capabilityRecommendation(capabilityId)];
    metadata.followUpPrompts = [`What can I do in ${capability.displayName}?`];
    return metadata;
  }

  const names = EMMAUS_CAPABILITIES
    .filter((capability) => !["saved-bible-position", "active-progress", "ask-emmaus"].includes(capability.id))
    .map((capability) => capability.displayName)
    .join(", ");
  metadata.answer = `Emmaus can help you read Scripture, keep your place in My Bible, take Today's Steps, continue Walks and Journeys, read Daily Devotionals and Bible Studies, find published sermons, and discover new content. You can find these in: ${names}.`;
  metadata.nextStep = capabilityNextStep("todays-steps");
  metadata.capabilityActions = [capabilityAction("todays-steps")];
  metadata.followUpPrompts = ["Where can I find devotionals?", "How do I continue my Journey?"];
  return metadata;
}

function actionForCapabilityResource(
  kind: "OPEN" | "READ" | "CONTINUE",
  type: Recommendation["type"],
  resourceId: string,
  route: string,
  parentId?: string,
) {
  return {
    kind,
    resourceType: type,
    resourceId,
    ...(parentId ? { parentId } : {}),
    route,
  } as NonNullable<EmmausResponseMetadata["resourceActions"]>[number];
}

function recommendationType(resource: EmmausResource): Recommendation["type"] {
  switch (resource.type) {
    case "bible-study": return "bible_study";
    case "sermon-companion": return "sermon_companion";
    case "daily-rhythm": return "daily_rhythm";
    default: return resource.type;
  }
}

async function resolveCatalogueSearch(
  message: string,
  userId: string,
  capabilityId: "discover" | "bible-studies" | "daily-devotional",
  query: string,
): Promise<EmmausResponseMetadata> {
  const metadata = emptyMetadata();
  const catalogue = await buildEmmausResourceCatalogue(query, undefined, undefined, userId);
  const allowedType = capabilityId === "bible-studies"
    ? "bible-study"
    : capabilityId === "daily-devotional"
      ? "devotional"
      : null;
  const matches = catalogue.resources
    .filter((resource) => resource.relevance > 0 && (!allowedType || resource.type === allowedType))
    .filter((resource, index, all) =>
      all.findIndex((candidate) =>
        candidate.type === resource.type && candidate.resourceId === resource.resourceId,
      ) === index)
    .slice(0, 4);

  if (matches.length === 0) {
    metadata.answer = catalogue.sourceFailures.length > 0
      ? `I couldn't complete that Emmaus resource search because ${catalogue.sourceFailures.join(", ")} were unavailable. Please try again.`
      : `I couldn't find a published Emmaus resource matching “${query.trim().slice(0, 80)}”.`;
    metadata.followUpPrompts = ["Show me Discover.", "Search for a different topic."];
    metadata.retrievalFailures = catalogue.sourceFailures;
    return metadata;
  }

  metadata.answer = `I found ${matches.length === 1 ? "a published Emmaus resource" : `${matches.length} published Emmaus resources`} related to “${query.trim().slice(0, 80)}”: ${matches.map((resource) => `“${resource.title}”`).join(", ")}.`;
  metadata.recommendations = matches.map((resource) => ({
    type: recommendationType(resource),
    title: resource.title,
    description: resource.description ?? resource.provenance,
    resourceId: resource.resourceId,
    parentId: resource.parentId,
    path: resource.route,
  }));
  metadata.resourceRecommendations = matches.map((resource) => ({
    resourceType: recommendationType(resource) as NonNullable<EmmausResponseMetadata["resourceRecommendations"]>[number]["resourceType"],
    resourceId: resource.resourceId,
    ...(resource.parentId ? { parentId: resource.parentId } : {}),
    reason: `Published ${resource.provenance.toLowerCase()} matching the requested topic.`,
  }));
  metadata.resourceActions = matches.flatMap((resource) =>
    actionsForResource(resource).map((action) => ({
      ...action,
      resourceType: recommendationType(resource) as NonNullable<EmmausResponseMetadata["resourceActions"]>[number]["resourceType"],
    })),
  );
  metadata.nextStep = {
    action: `Open ${matches[0].title}.`,
    primaryButtonText: "Open result",
    path: matches[0].route,
  };
  metadata.followUpPrompts = ["What does this resource say?", "Search another Emmaus topic."];
  metadata.retrievalFailures = catalogue.sourceFailures;
  return metadata;
}

async function resolveActiveProgress(userId: string): Promise<EmmausResponseMetadata> {
  const metadata = emptyMetadata();
  const journeys = await listPublishedJourneys();
  const active: Array<{ journey: FrontendJourney; currentDay: number }> = [];
  for (const journey of journeys) {
    if (journey.journeyType === "daily-rhythm") continue;
    const progress = await getProgress(userId, journey.id);
    if (!progress || progress.status === "paused" || progress.status === "hidden") continue;
    if (progress.completedDays.length >= journey.durationDays) continue;
    active.push({ journey, currentDay: Math.max(1, progress.currentDay) });
  }
  if (active.length === 0) {
    metadata.answer = "You do not have an active Walk or Journey yet. You can browse published content in Discover.";
    metadata.nextStep = capabilityNextStep("discover");
    return metadata;
  }
  metadata.answer = active.length === 1
    ? `You are currently working through “${active[0].journey.title}”, at Day ${active[0].currentDay}.`
    : `You have ${active.length} active Walks or Journeys: ${active.map(({ journey }) => `“${journey.title}”`).join(", ")}.`;
  metadata.recommendations = active.slice(0, 4).map(({ journey, currentDay }) => ({
    type: journey.journeyType === "walk" || journey.journeyType === "core" ? "walk" : "journey",
    title: journey.title,
    description: `Your active progress — Day ${currentDay}.`,
    resourceId: journey.id,
    path: `/journey/${journey.id}/day/${currentDay}`,
  }));
  metadata.resourceRecommendations = metadata.recommendations.map((item) => ({
    resourceType: item.type as NonNullable<EmmausResponseMetadata["resourceRecommendations"]>[number]["resourceType"],
    resourceId: item.resourceId!,
    reason: "The signed-in user's active progress.",
  }));
  metadata.resourceActions = active.slice(0, 4).flatMap(({ journey, currentDay }) => {
    const type = journey.journeyType === "walk" || journey.journeyType === "core"
      ? "walk"
      : "journey";
    const route = `/journey/${journey.id}/day/${currentDay}`;
    return [
      actionForCapabilityResource("OPEN", type, journey.id, route),
      actionForCapabilityResource("CONTINUE", type, journey.id, route),
    ];
  });
  metadata.nextStep = {
    action: `Continue ${active[0].journey.title} at Day ${active[0].currentDay}.`,
    primaryButtonText: "Continue",
    path: `/journey/${active[0].journey.id}/day/${active[0].currentDay}`,
  };
  metadata.followUpPrompts = ["Continue my current Journey.", "Show me Discover."];
  return metadata;
}

async function resolveTodayDevotional(userId: string): Promise<EmmausResponseMetadata> {
  const metadata = emptyMetadata();
  const [series, progress] = await Promise.all([
    listPublishedSeries(),
    getAllProgressForUser(userId),
  ]);
  const published = new Map(series.map((item) => [item.id, item]));
  const fullSeries = await Promise.all(
    series.map(async (item) => ({
      series: item,
      full: await getSeriesById(item.id),
    })),
  );
  const fullById = new Map(fullSeries.map(({ series: item, full }) => [item.id, full]));

  // Date-allocated devotionals are addressed by the calendar date printed on
  // their entries, not by the member's progress pointer. This is deliberately
  // resolved before progress so an unopened Psalms/seasonal series can still
  // provide the entry assigned to today.
  const datedSeries = fullSeries.filter(({ full }) =>
    hasDateAllocatedEntries(full?.entries ?? []),
  );
  const datedMatches = datedSeries
    .map(({ series: item, full }) => ({
      series: item,
      entry: resolveDateAllocatedDevotionalEntry(full?.entries ?? []),
    }))
    .filter((item): item is typeof item & { entry: NonNullable<typeof item.entry> } =>
      item.entry !== undefined,
    );

  let selectedSeries: typeof series[number] | undefined;
  let selectedEntry:
    NonNullable<Awaited<ReturnType<typeof getSeriesById>>>["entries"][number] | undefined;
  let selectedByDate = false;

  if (datedMatches.length > 0) {
    selectedSeries = datedMatches[0].series;
    selectedEntry = datedMatches[0].entry;
    selectedByDate = true;
  }

  const active = progress
    .filter((item) =>
      published.has(item.seriesId)
      && !datedSeries.some(({ series: dated }) => dated.id === item.seriesId)
      && item.status !== "paused"
      && item.status !== "hidden",
    )
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  if (!selectedSeries && active.length > 1) {
    metadata.answer = "You have more than one Daily Devotional in progress. Which one would you like to continue?";
    metadata.nextStep = capabilityNextStep("daily-devotional", "OPEN");
    metadata.recommendations = [capabilityRecommendation("daily-devotional")];
    metadata.followUpPrompts = ["Show me my active devotionals."];
    return metadata;
  }

  if (!selectedSeries) {
    const selected = active[0] ?? (
      series.length === 1 && datedSeries.length === 0
        ? { seriesId: series[0].id, currentDay: 1 } as DevotionalProgress
        : null
    );
    if (!selected) {
      if (datedSeries.length > 0) {
        metadata.answer = "There is no published Daily Devotional entry assigned to today yet. You can browse the available devotionals from Discover.";
      } else {
        metadata.answer = "I couldn't find a Daily Devotional available to you yet. You can browse the published series from Discover.";
      }
      metadata.nextStep = capabilityNextStep("daily-devotional");
      return metadata;
    }
    selectedSeries = published.get(selected.seriesId) ?? series[0];
    const full = fullById.get(selectedSeries.id);
    selectedEntry = resolveCurrentDevotionalEntry(
      full?.entries ?? [],
      selected.completedDays ?? [],
    );
  }

  if (!selectedSeries || !selectedEntry) {
    const title = selectedSeries?.title ?? "The published Daily Devotional";
    metadata.answer = "I couldn't find a Daily Devotional available to you yet. You can browse the published series from Discover.";
    if (selectedSeries) {
      metadata.answer = `The published Daily Devotional "${title}" does not have a published entry available yet. You can browse other available devotionals from Discover.`;
    }
    metadata.nextStep = capabilityNextStep("daily-devotional");
    return metadata;
  }

  const entry = selectedEntry;

  const resource: Recommendation = {
    type: "devotional",
    title: `${selectedSeries.title} — ${entry.title}`,
    description: "Today's published Daily Devotional",
    resourceId: entry.id,
    parentId: selectedSeries.id,
    path: `/devotional/${selectedSeries.id}/day/${entry.dayNumber}`,
  };
  const resourcePath = resource.path;
  if (!resourcePath) {
    metadata.answer = "That Daily Devotional is published, but its member route could not be validated.";
    metadata.nextStep = capabilityNextStep("daily-devotional");
    return metadata;
  }
  const parts = [entry.greeting, entry.considerThis, entry.prayer, entry.nextStep, entry.closing]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim());
  metadata.answer = `Here is today's Daily Devotional, “${entry.title}.”${parts.length ? `\n\n${parts.join("\n\n")}` : ""}`;
  metadata.recommendations = [resource];
  metadata.resourceRecommendations = [{
    resourceType: "devotional",
    resourceId: entry.id,
    parentId: selectedSeries.id,
    reason: selectedByDate
      ? "The published Daily Devotional entry allocated to today's date."
      : "The signed-in user's current published Daily Devotional.",
  }];
  metadata.resourceActions = [
    actionForCapabilityResource("OPEN", "devotional", entry.id, resourcePath, selectedSeries.id),
    actionForCapabilityResource("READ", "devotional", entry.id, resourcePath, selectedSeries.id),
    actionForCapabilityResource("CONTINUE", "devotional", entry.id, resourcePath, selectedSeries.id),
  ];
  metadata.nextStep = {
    action: `Read Day ${entry.dayNumber} of ${selectedSeries.title}.`,
    primaryButtonText: "Open today's devotional",
    path: resourcePath,
  };
  metadata.followUpPrompts = ["Help me reflect on this devotional.", "Show me my other devotionals."];
  return metadata;
}

export function resolveCurrentDevotionalEntry<T extends {
  status: string;
  dayNumber: number;
  displayLabel?: string | null;
}>(
  entries: T[],
  completedDays: number[],
): T | undefined {
  const published = entries
    .filter((entry) => entry.status === "Published")
    .sort((a, b) => a.dayNumber - b.dayNumber);
  if (published.length === 0) return undefined;

  const completed = new Set(completedDays);
  return published.find((entry) => !completed.has(entry.dayNumber))
    ?? published[published.length - 1];
}

type CalendarDate = {
  day: number;
  month: number;
  year?: number;
};

const FULL_MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const SHORT_MONTHS = FULL_MONTHS.map((month) => month.slice(0, 3));
const MEMBER_TIME_ZONE = "Africa/Johannesburg";

function parseDevotionalDateLabel(label: string | null | undefined): CalendarDate | null {
  if (!label?.trim()) return null;
  const value = label.trim().toLowerCase();

  const dayMonth = value.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/);
  const monthDay = value.match(/^([a-z]+)\s+(\d{1,2})(?:\s+(\d{4}))?$/);
  const numeric = value.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);

  let day: number;
  let month: number;
  let year: number | undefined;
  if (dayMonth) {
    day = Number(dayMonth[1]);
    month = [...FULL_MONTHS, ...SHORT_MONTHS].indexOf(dayMonth[2]) % 12 + 1;
    year = dayMonth[3] ? Number(dayMonth[3]) : undefined;
  } else if (monthDay) {
    month = [...FULL_MONTHS, ...SHORT_MONTHS].indexOf(monthDay[1]) % 12 + 1;
    day = Number(monthDay[2]);
    year = monthDay[3] ? Number(monthDay[3]) : undefined;
  } else if (numeric) {
    day = Number(numeric[1]);
    month = Number(numeric[2]);
    year = numeric[3] ? Number(numeric[3]) : undefined;
  } else {
    return null;
  }

  if (!Number.isInteger(day) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  const validationYear = year ?? 2000;
  const lastDay = new Date(Date.UTC(validationYear, month, 0)).getUTCDate();
  if (day < 1 || day > lastDay) return null;
  return { day, month, ...(year !== undefined ? { year } : {}) };
}

function memberCalendarDate(now: Date, timeZone = MEMBER_TIME_ZONE): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const get = (type: "year" | "month" | "day") =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function sameCalendarDate(labelDate: CalendarDate, target: CalendarDate): boolean {
  return labelDate.day === target.day
    && labelDate.month === target.month
    && (labelDate.year === undefined || labelDate.year === target.year);
}

export function hasDateAllocatedEntries<T extends {
  status: string;
  displayLabel?: string | null;
}>(entries: T[]): boolean {
  return entries.some((entry) =>
    entry.status === "Published" && parseDevotionalDateLabel(entry.displayLabel) !== null,
  );
}

/**
 * Resolve the published entry assigned to the member's current calendar date.
 * Date-labelled series intentionally ignore completedDays: a dated devotional
 * answers "what is assigned today?", not "what is my next unread entry?".
 */
export function resolveDateAllocatedDevotionalEntry<T extends {
  status: string;
  dayNumber: number;
  displayLabel?: string | null;
}>(
  entries: T[],
  now = new Date(),
  timeZone = MEMBER_TIME_ZONE,
): T | undefined {
  const target = memberCalendarDate(now, timeZone);
  return entries
    .filter((entry) => entry.status === "Published")
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .find((entry) => {
      const labelDate = parseDevotionalDateLabel(entry.displayLabel);
      return labelDate !== null && sameCalendarDate(labelDate, target);
    });
}

async function resolveBibleRead(intent: TypedAskEmmausIntent): Promise<EmmausResponseMetadata> {
  const metadata = emptyMetadata();
  const ref = intent.bibleReference;
  if (!ref) {
    metadata.answer = "Which Bible book and chapter would you like me to open?";
    metadata.followUpPrompts = ["Read Psalm 23", "Read John 3:16"];
    return metadata;
  }
  const route = routeForBible({
    book: ref.bookId,
    chapter: ref.chapter,
    verseStart: ref.verse,
    verseEnd: ref.verseEnd ?? ref.verse,
  });
  if (!route) {
    metadata.answer = "I couldn't validate that Bible reference. Please give me a book and chapter, such as Psalm 23 or John 3:16.";
    metadata.followUpPrompts = ["Read Psalm 23", "Read John 3:16"];
    return metadata;
  }
  const verses = readBiblePassage(ref.bookId, ref.chapter, ref.verse, ref.verseEnd ?? ref.verse);
  if (verses.length === 0) {
    metadata.answer = `I can open ${ref.bookName} ${ref.chapter}${ref.verse ? `:${ref.verse}` : ""}, but that passage text is not available in the local Bible provider right now.`;
  } else {
    const label = verses.length === 1 ? verses[0].reference : `${ref.bookName} ${ref.chapter}`;
    metadata.answer = `Here is ${label}:\n\n${verses.map((verse) => `${verse.verse}. ${verse.text}`).join("\n")}`;
  }
  const scripture = scriptureRef(ref.bookId, ref.chapter, ref.verse, ref.verseEnd ?? ref.verse, undefined, ref.bookName);
  metadata.scripture = scripture;
  metadata.scriptureReferences = [scripture];
  metadata.nextStep = {
    action: `Open ${scripture.reference} in My Bible.`,
    primaryButtonText: `Open ${scripture.reference}`,
    path: route,
  };
  metadata.nextSteps = [{
    type: "read",
    text: scripture.reference,
    path: route,
  }];
  metadata.followUpPrompts = ["What does this passage mean?", "Help me pray through this passage."];
  return metadata;
}

async function resolveBibleContinue(userId: string): Promise<EmmausResponseMetadata> {
  const metadata = emptyMetadata();
  const data = await getBibleData(userId);
  // The Bible store keeps history newest-first.
  const last = data?.history?.[0];
  if (!last) {
    metadata.answer = "I couldn't find a saved Bible position for you yet. Open My Bible and Emmaus will remember the chapter you read.";
    metadata.nextStep = capabilityNextStep("my-bible");
    return metadata;
  }
  const route = routeForBible({ book: last.bookId, chapter: last.chapter });
  if (!route) {
    metadata.answer = "Your saved Bible position could not be validated. Open My Bible to choose a chapter again.";
    metadata.nextStep = capabilityNextStep("my-bible");
    return metadata;
  }
  const scripture = scriptureRef(last.bookId, last.chapter, undefined, undefined, undefined, last.bookName);
  metadata.answer = `You last opened ${scripture.reference}. I can take you back there.`;
  metadata.scripture = scripture;
  metadata.scriptureReferences = [scripture];
  metadata.nextStep = {
    action: `Continue reading at ${scripture.reference}.`,
    primaryButtonText: `Continue at ${scripture.reference}`,
    path: route,
  };
  metadata.nextSteps = [{ type: "continue", text: scripture.reference, path: route }];
  metadata.followUpPrompts = ["Read the next chapter.", "What is this chapter about?"];
  return metadata;
}

export function buildDailyRhythmConversation(
  state: DailyRhythmState,
  step: FrontendStep,
): EmmausResponseMetadata {
  const metadata = emptyMetadata();
  const path = `/daily-rhythm/day/${state.currentDayNumber}`;
  const title = state.currentStepTitle ?? step.title ?? `Daily Rhythm — Day ${state.currentDayNumber}`;
  const authoredReferences = [
    step.scripture,
    ...(step.scriptureReferences ?? []).map((item) => item.reference),
  ].filter((value): value is string => Boolean(value?.trim()));
  const scriptureReferences = extractValidatedScriptureReferences(authoredReferences.join("; "));
  const verseText = step.scriptureReferences?.find((item) => item.verseText?.trim())?.verseText?.trim();

  const sections = [
    `Today: ${title}`,
    step.scripture ? `Scripture: ${step.scripture}${verseText ? ` — “${verseText}”` : ""}` : "",
    step.mentorIntro?.trim() ?? "",
    step.devotional?.trim() ?? "",
    step.reflectionQuestion?.trim()
      ? `Reflection: ${step.reflectionQuestion.trim()}`
      : "",
  ].filter(Boolean);

  metadata.answer = sections.join("\n\n");
  metadata.scripture = scriptureReferences[0] ?? null;
  metadata.scriptureReferences = scriptureReferences;
  metadata.recommendations = [{
    type: "daily_rhythm",
    resourceId: state.currentStepId!,
    parentId: state.journeyId,
    title,
    description: step.scripture || "Today's available Daily Rhythm step.",
    path,
  }];
  metadata.resourceRecommendations = [{
    resourceType: "daily_rhythm",
    resourceId: state.currentStepId!,
    parentId: state.journeyId,
    reason: "The signed-in member's eligible published Daily Rhythm step.",
  }];
  metadata.resourceActions = [
    actionForCapabilityResource("OPEN", "daily_rhythm", state.currentStepId!, path, state.journeyId),
    actionForCapabilityResource("READ", "daily_rhythm", state.currentStepId!, path, state.journeyId),
  ];
  metadata.nextStep = {
    action: `Continue Daily Rhythm Day ${state.currentDayNumber} in Emmaus.`,
    primaryButtonText: "Open today's step",
    path,
  };
  metadata.followUpPrompts = [
    "Help me reflect on this.",
    "Pray with me about this.",
  ];
  return metadata;
}

async function resolveDailyRhythm(userId: string): Promise<EmmausResponseMetadata> {
  const metadata = emptyMetadata();
  const state = await getDailyRhythmState(userId);
  if (!state || !state.currentStepId) {
    metadata.answer = "Today's Daily Rhythm is not available to your account yet.";
    metadata.nextStep = capabilityNextStep("todays-steps");
    return metadata;
  }

  if (state.nextStepLocked || state.currentStepCompleted) {
    const unlockText = state.nextEligibleUnlockDate
      ? ` Your next step is available on ${state.nextEligibleUnlockDate}.`
      : " Your next step will unlock on a later day.";
    metadata.answer = `You have completed today's Daily Rhythm step.${unlockText}`;
    metadata.nextStep = capabilityNextStep("todays-steps");
    return metadata;
  }

  const steps = await listSteps(state.journeyId);
  const step = steps.find((candidate) =>
    candidate.id === state.currentStepId
    && candidate.status === "Published"
    && !candidate.isCompletionStep
  );
  if (!step) {
    metadata.answer = "Today's Daily Rhythm content is not available right now.";
    metadata.retrievalFailures = ["daily-rhythm"];
    metadata.followUpPrompts = ["Try again."];
    return metadata;
  }

  return buildDailyRhythmConversation(state, step);
}

async function resolveTodaySteps(userId: string): Promise<EmmausResponseMetadata> {
  const rhythm = await resolveDailyRhythm(userId);
  if ((rhythm.recommendations?.length ?? 0) > 0 || rhythm.nextStep?.path?.startsWith("/daily-rhythm/")) {
    return rhythm;
  }
  return resolveActiveProgress(userId);
}

async function resolveContinueJourney(userId: string, type: "walk" | "journey"): Promise<EmmausResponseMetadata> {
  const metadata = emptyMetadata();
  const journeys = await listPublishedJourneys();
  const matches: Array<{ journey: FrontendJourney; currentDay: number; stepId?: string }> = [];
  for (const journey of journeys) {
    const isWalk = journey.journeyType === "walk" || journey.journeyType === "core";
    if ((type === "walk") !== isWalk || journey.journeyType === "daily-rhythm") continue;
    const progress = await getProgress(userId, journey.id);
    if (!progress || progress.status === "paused" || progress.status === "hidden" || progress.completedDays.length >= journey.durationDays) continue;
    const steps = await listSteps(journey.id);
    const current = steps.find((step) => step.day === progress.currentDay && step.status === "Published" && !step.isCompletionStep);
    matches.push({ journey, currentDay: progress.currentDay, stepId: current?.id });
  }

  if (matches.length === 0) {
    metadata.answer = `You do not have an active ${type === "walk" ? "Walk" : "Journey"} to continue yet. You can browse published ${type === "walk" ? "Walks" : "Journeys"} in Discover.`;
    metadata.nextStep = capabilityNextStep(type === "walk" ? "walks" : "journeys");
    return metadata;
  }
  if (matches.length > 1) {
    metadata.answer = `You have more than one active ${type === "walk" ? "Walk" : "Journey"}. Which one would you like to continue?`;
    metadata.nextStep = capabilityNextStep(type === "walk" ? "walks" : "journeys");
    metadata.followUpPrompts = matches.slice(0, 3).map(({ journey }) => `Continue ${journey.title}`);
    return metadata;
  }

  const { journey, currentDay, stepId } = matches[0];
  const route = `/journey/${journey.id}/day/${currentDay}`;
  const recommendation: Recommendation = {
    type: type === "walk" ? "walk" : "journey",
    resourceId: journey.id,
    title: journey.title,
    description: `Continue at Day ${currentDay}.`,
    path: route,
  };
  metadata.answer = `You can continue “${journey.title}” at Day ${currentDay}.`;
  metadata.recommendations = [recommendation];
  metadata.resourceRecommendations = [{
    resourceType: type,
    resourceId: journey.id,
    reason: "The signed-in user's active progress.",
  }];
  metadata.resourceActions = [
    actionForCapabilityResource("OPEN", type, journey.id, route),
    actionForCapabilityResource("CONTINUE", type, journey.id, route),
  ];
  metadata.nextStep = {
    action: `Continue ${journey.title} at Day ${currentDay}.`,
    primaryButtonText: "Continue",
    path: route,
  };
  metadata.nextSteps = [{
    type: "continue",
    text: `${journey.title} — Day ${currentDay}`,
    path: route,
  }];
  if (stepId) {
    logger.debug({ userId, journeyId: journey.id, stepId }, "emmaus: resolved active journey step");
  }
  metadata.followUpPrompts = ["What is this step about?", "Help me reflect on this step."];
  return metadata;
}

async function resolveCurrentSermon(): Promise<EmmausResponseMetadata> {
  const metadata = emptyMetadata();
  const sermons = await listPublishedSermons();
  const sermon = [...sermons].sort((a, b) => {
    const dateDelta = Date.parse(b.sermonDate) - Date.parse(a.sermonDate);
    if (Number.isFinite(dateDelta) && dateDelta !== 0) return dateDelta;
    return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
  })[0];

  if (!sermon) {
    metadata.answer = "This week's sermon is not published in Emmaus yet.";
    metadata.nextStep = capabilityNextStep("sermons");
    return metadata;
  }

  const route = `/sermon/${sermon.id}`;
  metadata.answer = `This week's sermon is “${sermon.title}” by ${sermon.speaker}.`;
  metadata.recommendations = [{
    type: "sermon",
    title: sermon.title,
    description: sermon.scriptureReference || sermon.summary,
    path: route,
    sermonId: sermon.id,
    speakerName: sermon.speaker,
  }];
  metadata.resourceRecommendations = [{
    resourceType: "sermon",
    resourceId: sermon.id,
    reason: "The latest verified published sermon in Emmaus.",
  }];
  metadata.resourceActions = [
    actionForCapabilityResource("OPEN", "sermon", sermon.id, route),
  ];
  metadata.nextStep = {
    action: `Open ${sermon.title}.`,
    primaryButtonText: "Open sermon",
    path: route,
  };
  return metadata;
}

async function resolveSermonSearch(message: string): Promise<EmmausResponseMetadata> {
  const metadata = emptyMetadata();
  const results = await retrieveSermons(message, undefined, undefined, 2);
  if (results.length === 0) {
    metadata.answer = "I couldn't find a verified published sermon matching that search.";
    metadata.followUpPrompts = ["Search sermons about faith", "Search sermons about hope"];
    return metadata;
  }
  const sermons: SermonRecommendation[] = results.map((sermon) => ({
    sermonId: sermon.sermonId,
    ...(sermon.segmentId ? { segmentId: sermon.segmentId } : {}),
    source: sermon.source,
    title: sermon.title,
    speaker: sermon.speaker,
    sermonDate: sermon.sermonDate,
    excerpt: sermon.excerpt,
    reason: sermon.reason,
    ...(sermon.openPath ? { openPath: sermon.openPath } : {}),
    ...(sermon.timestampedUrl ? { watchUrl: sermon.timestampedUrl } : {}),
    ...(sermon.timestampSeconds != null ? { watchTimestampSeconds: sermon.timestampSeconds } : {}),
    listenAvailable: Boolean(sermon.audioUrl),
    ...(sermon.listenPath ? { listenPath: sermon.listenPath } : {}),
    ...(sermon.audioUrl ? {
      audioUrl: sermon.audioUrl,
      ...(sermon.relativeStartSeconds != null ? { relativeStartSeconds: sermon.relativeStartSeconds } : {}),
    } : {}),
  }));
  metadata.answer = `I found ${sermons.length === 1 ? "a verified sermon" : `${sermons.length} verified sermons`} related to your search: ${sermons.map((sermon) => `“${sermon.title}”`).join(", ")}.`;
  metadata.sermonRecommendations = sermons;
  metadata.recommendations = sermons.map((sermon) => ({
    type: "sermon",
    title: sermon.title,
    description: sermon.excerpt,
    path: sermon.watchUrl ?? sermon.openPath,
    sermonId: sermon.sermonId,
    timestampSeconds: sermon.watchTimestampSeconds,
    speakerName: sermon.speaker,
  }));
  metadata.followUpPrompts = ["Search another sermon topic", "What does Scripture say about this?"];
  return metadata;
}

function safeStoredRoute(route: string): boolean {
  return route.startsWith("/") && !route.startsWith("//") && !/[\r\n]/u.test(route);
}

/**
 * Resolve short follow-up commands from the previous server-validated assistant
 * action. Model prose and legacy nextStep paths are deliberately ignored.
 */
export async function resolveContextualFollowUp(
  message: string,
  previousMetadata?: EmmausResponseMetadata,
  userId?: string,
  executors: CanonicalActionExecutors = productionActionExecutors,
): Promise<EmmausResponseMetadata | null> {
  if (!previousMetadata) return null;
  const value = message.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

  const pendingAction = previousMetadata.pendingMemberAction;
  if (pendingAction?.kind === "COMPLETE_DAILY_RHYTHM") {
    const metadata = emptyMetadata();
    if (/^(?:yes|yes please|please do|do it|confirm|mark it complete)[.!?]*$/.test(value)) {
      if (!userId) {
        metadata.answer = "I couldn't safely confirm which member's progress to update. Nothing has been changed.";
        return metadata;
      }
      await executors.completeStep(userId, pendingAction.journeyId, pendingAction.day);
      metadata.answer = "Today's Daily Rhythm is complete. We can continue tomorrow.";
      metadata.pendingMemberAction = null;
      return metadata;
    }
    if (/^(?:no|no thanks|not yet|cancel|don't|do not)[.!?]*$/.test(value)) {
      metadata.answer = "Nothing has been changed. Take the time you need.";
      metadata.pendingMemberAction = null;
      return metadata;
    }
    metadata.answer = "Please say yes to mark today's Daily Rhythm complete, or no to leave it unchanged.";
    metadata.pendingMemberAction = pendingAction;
    metadata.followUpPrompts = ["Yes, mark it complete.", "No, not yet."];
    return metadata;
  }

  const completionIntent = /^(?:i(?:'m| am) (?:finished|done)|i(?:'ve| have) finished|finished|done|mark (?:today|it|this)(?:'s daily rhythm)? complete|complete (?:today|this step|daily rhythm))[.!?]*$/.test(value);
  if (completionIntent) {
    const dailyAction = (previousMetadata.resourceActions ?? []).find((action) =>
      action.resourceType === "daily_rhythm"
      && Boolean(action.parentId)
      && safeStoredRoute(action.route)
    );
    const dayMatch = dailyAction?.route.match(/^\/daily-rhythm\/day\/(\d+)$/);
    const day = dayMatch ? Number(dayMatch[1]) : NaN;
    if (dailyAction?.parentId && Number.isSafeInteger(day) && day > 0) {
      const metadata = emptyMetadata();
      metadata.answer = "Would you like me to mark today's Daily Rhythm complete?";
      metadata.pendingMemberAction = {
        kind: "COMPLETE_DAILY_RHYTHM",
        journeyId: dailyAction.parentId,
        stepId: dailyAction.resourceId,
        day,
        label: "Mark today's Daily Rhythm complete",
        requiresConfirmation: true,
      };
      metadata.followUpPrompts = ["Yes, mark it complete.", "No, not yet."];
      return metadata;
    }
  }

  if (/^(?:read|open|show me)\s+(?:the\s+)?next chapter[.!?]*$/.test(value)) {
    const previous = previousMetadata.scriptureReferences?.[0] ?? previousMetadata.scripture;
    if (!previous) return null;
    return resolveBibleRead({
      intent: "BIBLE_READ",
      requestedCapability: "my-bible",
      requestedOperation: value.startsWith("open") ? "OPEN" : "READ",
      bibleReference: {
        bookId: previous.book,
        bookName: canonicalBibleBookName(previous.book),
        chapter: previous.chapter + 1,
      },
      confidence: 0.99,
      clarificationRequired: false,
    });
  }

  const recommendationRecall = value.match(
    /^(?:open|show me|take me to)\s+(?:the\s+)?(?:(walk|journey|devotional|sermon)\s+)?(?:you\s+)?recommended(?:\s+(?:to me))?(?:\s+(?:yesterday|before|earlier|last time))?[.!?]*$/,
  );
  const followUp = value.match(/^(open|continue|resume|read|show me|take me there|go there)(?:\s+(?:it|that|this|there))?[.!?]*$/);
  if (!followUp && !recommendationRecall) return null;
  const requestedKind = recommendationRecall
    ? "OPEN"
    : /continue|resume/.test(followUp![1])
      ? "CONTINUE"
      : /read|show me/.test(followUp![1])
        ? "READ"
        : "OPEN";
  const requestedResourceType = recommendationRecall?.[1];

  const resourceActions = (previousMetadata.resourceActions ?? [])
    .filter((action) => safeStoredRoute(action.route))
    .filter((action) => !requestedResourceType || action.resourceType === requestedResourceType);
  const resourceAction = resourceActions.find((action) => action.kind === requestedKind)
    ?? resourceActions[0];
  if (resourceAction) {
    const metadata = emptyMetadata();
    const recommendation = (previousMetadata.recommendations ?? []).find((item) =>
      item.resourceId === resourceAction.resourceId
      && (!resourceAction.parentId || item.parentId === resourceAction.parentId),
    );
    const title = recommendation?.title ?? "that Emmaus resource";
    metadata.answer = `I can ${requestedKind === "CONTINUE" ? "continue" : requestedKind === "READ" ? "read" : "open"} “${title}”.`;
    metadata.recommendations = recommendation ? [recommendation] : [];
    metadata.resourceRecommendations = (previousMetadata.resourceRecommendations ?? []).filter((item) =>
      item.resourceId === resourceAction.resourceId
      && (!resourceAction.parentId || item.parentId === resourceAction.parentId),
    );
    metadata.resourceActions = [resourceAction];
    metadata.nextStep = {
      action: `${requestedKind === "CONTINUE" ? "Continue" : requestedKind === "READ" ? "Read" : "Open"} ${title}.`,
      primaryButtonText: requestedKind === "CONTINUE" ? "Continue" : requestedKind === "READ" ? "Read" : "Open",
      path: resourceAction.route,
    };
    return metadata;
  }

  const capabilityActions = (previousMetadata.capabilityActions ?? [])
    .filter((action) => safeStoredRoute(action.route));
  const capabilityAction = capabilityActions.find((action) => action.kind === requestedKind)
    ?? capabilityActions[0];
  if (capabilityAction) {
    const metadata = emptyMetadata();
    metadata.answer = `I can ${requestedKind === "CONTINUE" ? "continue" : requestedKind === "READ" ? "read" : "open"} that part of Emmaus.`;
    metadata.capabilityActions = [capabilityAction];
    metadata.nextStep = {
      action: capabilityAction.label,
      primaryButtonText: capabilityAction.label,
      path: capabilityAction.route,
    };
    return metadata;
  }

  return null;
}

export function canonicalFailureMetadata(routed: TypedAskEmmausIntent): EmmausResponseMetadata {
  const metadata = emptyMetadata();
  const source = routed.requestedCapability ?? (
    routed.intent === "BIBLE_READ" || routed.intent === "BIBLE_CONTINUE"
      ? "my-bible"
      : "emmaus"
  );
  metadata.answer = "I couldn't safely access that part of Emmaus right now. Please try again.";
  metadata.retrievalFailures = [source];
  metadata.followUpPrompts = ["Try again.", "What else can Emmaus help me with?"];
  return metadata;
}

export async function resolveCanonicalAskRequest(
  message: string,
  userId: string,
  previousMetadata?: EmmausResponseMetadata,
  executors: CanonicalActionExecutors = productionActionExecutors,
): Promise<CanonicalToolResolution> {
  const contextual = await resolveContextualFollowUp(message, previousMetadata, userId, executors);
  if (contextual) return { handled: true, metadata: contextual };
  const routed = routeAskEmmausRequest(message);
  try {
    switch (routed.intent) {
      case "APP_HELP":
        return { handled: true, metadata: appHelp(routed.requestedCapability) };
      case "BIBLE_READ":
        return { handled: true, metadata: await resolveBibleRead(routed) };
      case "BIBLE_CONTINUE":
        return { handled: true, metadata: await resolveBibleContinue(userId) };
      case "RESOURCE_SEARCH":
        if (
          routed.requestedCapability === "bible-studies"
          || routed.requestedCapability === "discover"
          || routed.requestedCapability === "daily-devotional"
        ) {
          const query = routed.resourceQuery ?? message;
          if (routed.requestedCapability === "discover" && /\b(?:sermon|sermons|preached|preaching)\b/i.test(message)) {
            return { handled: true, metadata: await resolveSermonSearch(query) };
          }
          return {
            handled: true,
            metadata: await resolveCatalogueSearch(message, userId, routed.requestedCapability, query),
          };
        }
        return { handled: true, metadata: await resolveSermonSearch(routed.resourceQuery ?? message) };
      case "DIRECT_ACTION":
        if (routed.requestedCapability === "sermons" && routed.requestedOperation === "OPEN") {
          return { handled: true, metadata: await resolveCurrentSermon() };
        }
        if (routed.requestedCapability === "todays-steps") {
          return { handled: true, metadata: await resolveTodaySteps(userId) };
        }
        if (routed.requestedCapability === "daily-devotional") {
          return { handled: true, metadata: await resolveTodayDevotional(userId) };
        }
        if (routed.requestedCapability === "daily-rhythm") {
          return { handled: true, metadata: await resolveDailyRhythm(userId) };
        }
        if (routed.requestedCapability === "walks") {
          return { handled: true, metadata: await resolveContinueJourney(userId, "walk") };
        }
        if (routed.requestedCapability === "journeys") {
          return { handled: true, metadata: await resolveContinueJourney(userId, "journey") };
        }
        if (routed.requestedCapability === "active-progress") {
          return { handled: true, metadata: await resolveActiveProgress(userId) };
        }
        return { handled: false };
      default:
        return { handled: false };
    }
  } catch (error) {
    logger.warn({ intent: routed.intent, err: String(error) }, "emmaus: canonical tool resolution failed");
    const mustNotGuess =
      routed.intent === "APP_HELP"
      || routed.intent === "BIBLE_READ"
      || routed.intent === "BIBLE_CONTINUE"
      || routed.intent === "RESOURCE_SEARCH"
      || routed.intent === "DIRECT_ACTION";
    return mustNotGuess
      ? { handled: true, metadata: canonicalFailureMetadata(routed) }
      : { handled: false };
  }
}