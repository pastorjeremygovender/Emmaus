/**
 * Live, publication-safe Emmaus resource catalogue for Ask Emmaus.
 *
 * This deliberately reads the authoritative stores on each request. Publishing
 * new content therefore makes it available to Emmaus without changing a prompt,
 * seed file, or hardcoded registry.
 */
import { pool } from "@workspace/db";
import { listPublishedJourneys, listSteps, type FrontendJourney, type FrontendStep } from "../lib/journey-store.js";
import { listPublishedSeries, getSeriesById, type DevotionalSeries, type DevotionalEntry } from "../lib/devotional-store.js";
import { listPublishedSermonCompanions, getEntriesForCompanion, type Companion, type CompanionEntry } from "../lib/sermon-companion-store.js";
import { listPublishedSermons, type CanonicalSermon } from "../lib/canonical-sermon-store.js";
import { BOOK_INTROS, CHAPTER_OVERVIEWS } from "../bible/book-intros.js";
import { logger } from "../lib/logger.js";

export type EmmausResourceType =
  | "daily-rhythm"
  | "journey"
  | "bible-study"
  | "devotional"
  | "sermon-companion"
  | "sermon";

export interface EmmausResource {
  type: EmmausResourceType;
  title: string;
  route: string;
  scripture?: string;
  description?: string;
  /** Approved authored material supplied to the model for explanation/short quotation. */
  excerpts: string[];
  provenance: string;
  relevance: number;
}

const MAX_TEXT = 700;
const MAX_RESOURCES_IN_PROMPT = 28;
const MAX_EXCERPTS_PER_RESOURCE = 3;

function clean(value: unknown, max = MAX_TEXT): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function words(text: string): string[] {
  return Array.from(new Set(text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length >= 3)));
}

function relevance(resource: EmmausResource, query: string, bookId?: string, chapter?: number): number {
  const q = new Set(words(query));
  const searchable = words([
    resource.title,
    resource.description,
    resource.scripture,
    ...resource.excerpts,
  ].filter(Boolean).join(" "));
  let score = searchable.reduce((n, word) => n + (q.has(word) ? 1 : 0), 0);
  if (bookId && resource.scripture?.toLowerCase().includes(bookId.toLowerCase())) score += 5;
  if (chapter && resource.scripture?.match(new RegExp(`\\b${chapter}\\b`))) score += 2;
  return score;
}

function makeResource(
  data: Omit<EmmausResource, "relevance">,
  query: string,
  bookId?: string,
  chapter?: number,
): EmmausResource {
  return { ...data, relevance: relevance(data as EmmausResource, query, bookId, chapter) };
}

function journeyResources(journey: FrontendJourney, steps: FrontendStep[], query: string, bookId?: string, chapter?: number): EmmausResource[] {
  const type: EmmausResourceType = journey.journeyType === "daily-rhythm" || journey.journeyType === "core"
    ? "daily-rhythm"
    : journey.journeyType === "bible-study" ? "bible-study" : "journey";
  const route = type === "daily-rhythm" ? "/walk" : `/journeys/${journey.id}`;
  const stepResources = steps
    .filter(s => s.status === "Published" && !s.isCompletionStep)
    .map(s => ({
      type,
      title: `${journey.title} — ${s.title}`,
      route: `${route}/${s.day}`,
      scripture: s.scripture || s.scriptureReferences?.map(r => r.reference).join(", ") || undefined,
      description: clean(s.mentorIntro || s.devotional) || undefined,
      excerpts: [s.devotional, s.reflectionQuestion, s.prayerPrompt, s.actionStep, s.memoryVerse].filter(Boolean).map(v => clean(v)),
      provenance: `Published ${type === "daily-rhythm" ? "Daily Rhythm" : type === "bible-study" ? "Bible Study" : "Journey"} step`,
    }))
    .map(r => makeResource(r, query, bookId, chapter));

  return [
    makeResource({
      type,
      title: journey.title,
      route,
      scripture: journey.scriptureReference,
      description: journey.description || journey.introductionContent,
      excerpts: [journey.description, journey.introductionContent, journey.subtitle].filter(Boolean).map(v => clean(v)),
      provenance: `Published ${type === "daily-rhythm" ? "Daily Rhythm" : type === "bible-study" ? "Bible Study" : "Journey"}`,
    }, query, bookId, chapter),
    ...stepResources,
  ];
}

function devotionalResources(series: DevotionalSeries, entries: DevotionalEntry[], query: string, bookId?: string, chapter?: number): EmmausResource[] {
  return [
    makeResource({
      type: "devotional",
      title: series.title,
      route: `/devotional/${series.id}/day/1`,
      description: clean(series.description) || undefined,
      excerpts: [series.description].filter(Boolean).map(v => clean(v)),
      provenance: "Published Daily Devotional series",
    }, query, bookId, chapter),
    ...entries.filter(e => e.status === "Published").map(e => makeResource({
      type: "devotional",
      title: `${series.title} — ${e.title}`,
      route: `/devotional/${series.id}/day/${e.dayNumber}`,
      scripture: clean(e.scriptureReference) || undefined,
      description: clean(e.greeting) || undefined,
      excerpts: [e.greeting, e.considerThis, e.prayer, e.nextStep, e.closing].filter(Boolean).map(v => clean(v)),
      provenance: "Published Daily Devotional entry",
    }, query, bookId, chapter)),
  ];
}

function companionResources(companion: Companion, entries: CompanionEntry[], query: string, bookId?: string, chapter?: number): EmmausResource[] {
  return [
    makeResource({
      type: "sermon-companion",
      title: companion.title,
      route: `/sermon-companion/${companion.id}/overview`,
      description: companion.description,
      excerpts: [companion.description].filter(Boolean).map(v => clean(v)),
      provenance: "Published Sermon Companion",
    }, query, bookId, chapter),
    ...entries.filter(e => e.status === "Published").map(e => makeResource({
      type: "sermon-companion",
      title: `${companion.title} — ${e.title}`,
      route: `/sermon-companion/${companion.id}/day/${e.dayNumber}`,
      scripture: e.scriptureReference,
      description: e.greeting,
      excerpts: [e.greeting, e.reflection, e.prayer, e.nextStep, e.closing].filter(Boolean).map(v => clean(v)),
      provenance: "Published Sermon Companion entry",
    }, query, bookId, chapter)),
  ];
}

function sermonResources(sermons: CanonicalSermon[], query: string, bookId?: string, chapter?: number): EmmausResource[] {
  return sermons.map(s => makeResource({
    type: "sermon",
    title: s.title,
    route: `/sermon/${s.id}`,
    scripture: s.scriptureReference,
    description: [s.speaker, s.series, s.mainTheme].filter(Boolean).join(" · "),
    excerpts: [s.summary, ...s.themes, s.mainTheme].filter(Boolean).map(v => clean(v)),
    provenance: "Published canonical sermon",
  }, query, bookId, chapter));
}

async function studyNoteResources(query: string, bookId?: string, chapter?: number): Promise<EmmausResource[]> {
  try {
    const result = await pool.query(
      `SELECT book_id, chapter, verse_start, verse_end, title, content, context_note,
              jesus_connection, apply_it, key_truth, reflection_question, related_scriptures
         FROM bible_study_notes
        WHERE status = 'Published'
        ORDER BY updated_at DESC
        LIMIT 500`,
    );
    return result.rows.map((row: Record<string, unknown>) => {
      const ref = `${row.book_id} ${row.chapter}:${row.verse_start}${row.verse_end ? `-${row.verse_end}` : ""}`;
      return makeResource({
        type: "bible-study",
        title: clean(row.title) || `Bible Study — ${ref}`,
        route: `/bible/read/${row.book_id}/${row.chapter}`,
        scripture: ref,
        description: clean(row.key_truth || row.context_note),
        excerpts: [row.content, row.context_note, row.jesus_connection, row.apply_it, row.reflection_question, row.related_scriptures]
          .filter(Boolean).map(v => clean(v)),
        provenance: "Published Bible Study note",
      }, query, bookId, chapter);
    });
  } catch (err) {
    logger.warn({ err: String(err) }, "Ask Emmaus Bible Study catalogue unavailable");
    return [];
  }
}

export async function buildEmmausResourceCatalogue(
  query: string,
  bibleBookId?: string,
  bibleChapter?: number,
): Promise<{ resources: EmmausResource[]; sourceFailures: string[] }> {
  const sourceFailures: string[] = [];
  const [journeys, series, companions, sermons, notes] = await Promise.all([
    listPublishedJourneys().catch(err => { sourceFailures.push("journeys"); logger.warn({ err: String(err) }, "Ask Emmaus journey catalogue unavailable"); return [] as FrontendJourney[]; }),
    listPublishedSeries().catch(err => { sourceFailures.push("devotionals"); logger.warn({ err: String(err) }, "Ask Emmaus devotional catalogue unavailable"); return [] as DevotionalSeries[]; }),
    listPublishedSermonCompanions().catch(err => { sourceFailures.push("sermon-companions"); logger.warn({ err: String(err) }, "Ask Emmaus companion catalogue unavailable"); return [] as Array<Companion & { publishedEntryCount: number }>; }),
    listPublishedSermons().catch(err => { sourceFailures.push("sermons"); logger.warn({ err: String(err) }, "Ask Emmaus sermon catalogue unavailable"); return [] as CanonicalSermon[]; }),
    studyNoteResources(query, bibleBookId, bibleChapter),
  ]);

  const resources: EmmausResource[] = [...notes];
  for (const journey of journeys.filter(j => j.journeyType !== "companion")) {
    const steps = await listSteps(journey.id).catch(err => {
      sourceFailures.push(`journey:${journey.id}`);
      logger.warn({ err: String(err), journeyId: journey.id }, "Ask Emmaus journey steps unavailable");
      return [];
    });
    resources.push(...journeyResources(journey, steps, query, bibleBookId, bibleChapter));
  }
  for (const s of series) {
    const full = await getSeriesById(s.id).catch(() => null);
    resources.push(...devotionalResources(s, full?.entries ?? [], query, bibleBookId, bibleChapter));
  }
  for (const c of companions) {
    const entries = await getEntriesForCompanion(c.id).catch(() => []);
    resources.push(...companionResources(c, entries, query, bibleBookId, bibleChapter));
  }
  resources.push(...sermonResources(sermons, query, bibleBookId, bibleChapter));

  // Static Bible introductions and chapter overviews are also approved Emmaus
  // study resources. Only include the current chapter/book to keep prompts bounded.
  if (bibleBookId && BOOK_INTROS[bibleBookId]) {
    const intro = BOOK_INTROS[bibleBookId];
    resources.push(makeResource({
      type: "bible-study",
      title: `${intro.bookId} — Bible introduction`,
      route: `/bible/read/${intro.bookId}/1`,
      scripture: intro.keyVerseRef,
      description: intro.theme,
      excerpts: [intro.overview, intro.keyVerse].map(v => clean(v)),
      provenance: "Emmaus Bible book introduction",
    }, query, bibleBookId, bibleChapter));
  }
  if (bibleBookId && bibleChapter) {
    const overview = CHAPTER_OVERVIEWS[`${bibleBookId}:${bibleChapter}`];
    if (overview) resources.push(makeResource({
      type: "bible-study",
      title: `${bibleBookId} ${bibleChapter} — chapter overview`,
      route: `/bible/read/${bibleBookId}/${bibleChapter}`,
      scripture: `${bibleBookId} ${bibleChapter}`,
      excerpts: [overview].map(v => clean(v)),
      provenance: "Emmaus Bible chapter overview",
    }, query, bibleBookId, bibleChapter));
  }

  return {
    resources: resources
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, MAX_RESOURCES_IN_PROMPT)
      .map(r => ({ ...r, excerpts: r.excerpts.slice(0, MAX_EXCERPTS_PER_RESOURCE) })),
    sourceFailures,
  };
}