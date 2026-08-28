import { BOOK_INTROS } from "../bible/book-intros.js";
import type { EmmausResponseMetadata, EmmausResourceType, Recommendation, ScriptureRef } from "./firestore-model.js";
import type { EmmausResource } from "./resource-catalogue.js";
import { logger } from "../lib/logger.js";

const aliases: Record<string, string> = {
  psalm: "psalms", psalms: "psalms", ps: "psalms", psa: "psalms",
  genesis: "genesis", gen: "genesis", ge: "genesis",
  exodus: "exodus", ex: "exodus",
  john: "john", jn: "john", jhn: "john",
  romans: "romans", rom: "romans",
  hebrews: "hebrews", heb: "hebrews",
  "1 cor": "1corinthians", "1 corinthians": "1corinthians", "first corinthians": "1corinthians",
  "2 cor": "2corinthians", "2 corinthians": "2corinthians", "second corinthians": "2corinthians",
  "1 thess": "1thessalonians", "1 thessalonians": "1thessalonians", "first thessalonians": "1thessalonians",
  "2 thess": "2thessalonians", "2 thessalonians": "2thessalonians", "second thessalonians": "2thessalonians",
  "1 tim": "1timothy", "1 timothy": "1timothy", "first timothy": "1timothy",
  "2 tim": "2timothy", "2 timothy": "2timothy", "second timothy": "2timothy",
  "1 pet": "1peter", "1 peter": "1peter", "first peter": "1peter",
  "2 pet": "2peter", "2 peter": "2peter", "second peter": "2peter",
  "1 jn": "1john", "1 john": "1john", "first john": "1john",
  "2 jn": "2john", "2 john": "2john", "second john": "2john",
  "3 jn": "3john", "3 john": "3john", "third john": "3john",
  "song of solomon": "songofsolomon",
  "song of songs": "songofsolomon", "1 samuel": "1samuel", "2 samuel": "2samuel",
  "1 kings": "1kings", "2 kings": "2kings", "1 chronicles": "1chronicles",
  "2 chronicles": "2chronicles", "1 corinthians": "1corinthians", "2 corinthians": "2corinthians",
  "1 thessalonians": "1thessalonians", "2 thessalonians": "2thessalonians",
  "1 john": "1john", "2 john": "2john", "3 john": "3john",
};

export function normalizeBibleBook(book: string): string | null {
  const raw = book.trim().toLowerCase().replace(/\s+/g, " ");
  const compact = raw.replace(/\s/g, "");
  const id = aliases[raw] ?? aliases[compact] ?? compact;
  return Object.prototype.hasOwnProperty.call(BOOK_INTROS, id) ? id : null;
}

function titleCaseBookId(id: string): string {
  const numbered = id.match(/^([123])(.*)$/);
  const base = numbered ? numbered[2] : id;
  const display = base.replace(/(^|[a-z])([a-z]+)/g, (_, prefix, word) =>
    `${prefix}${word.charAt(0).toUpperCase()}${word.slice(1)}`,
  );
  return numbered ? `${numbered[1]} ${display}` : display;
}

const CANONICAL_BIBLE_BOOK_NAMES: Record<string, string> = Object.fromEntries(
  Object.keys(BOOK_INTROS).map(id => [
    id,
    id === "psalms" ? "Psalm" : id === "songofsolomon" ? "Song of Solomon" : titleCaseBookId(id),
  ]),
);

// Display names are application data, never generic title-casing.
export function canonicalBibleBookName(book: string): string {
  const id = normalizeBibleBook(book);
  if (!id) return book;
  const numbered = id.match(/^([123])(.*)$/);
  if (numbered) {
    const base = numbered[2].charAt(0).toUpperCase() + numbered[2].slice(1);
    return `${numbered[1]} ${base}`;
  }
  return CANONICAL_BIBLE_BOOK_NAMES[id] ??
    id.replace(/(^|[a-z])([a-z]+)/g, (_, prefix, word) => `${prefix}${word.charAt(0).toUpperCase()}${word.slice(1)}`);
}

export function buildScriptureRoute(ref: Partial<ScriptureRef> & { verseStart?: number; verseEnd?: number }): string | null {
  const book = normalizeBibleBook(String(ref.book ?? ""));
  const chapter = Number(ref.chapter);
  if (!book || !Number.isInteger(chapter)) return null;
  const maxChapter = BOOK_CHAPTER_COUNTS[book] ?? 0;
  if (chapter < 1 || chapter > maxChapter) return null;
  const verse = ref.verseStart == null ? null : Number(ref.verseStart);
  const endVerse = ref.verseEnd == null ? null : Number(ref.verseEnd);
  if (verse !== null && (!Number.isInteger(verse) || verse < 1 || verse > 176)) return null;
  if (endVerse !== null && (!Number.isInteger(endVerse) || endVerse < 1 || endVerse > 176)) return null;
  if (verse !== null && endVerse !== null && endVerse < verse) return null;
  const params = verse === null ? "" : `?startVerse=${verse}${endVerse !== null ? `&endVerse=${endVerse}` : ""}`;
  return `/bible/read/${book}/${chapter}${params}`;
}

const BOOK_CHAPTER_COUNTS: Record<string, number> = {
  genesis: 50, exodus: 40, leviticus: 27, numbers: 36, deuteronomy: 34,
  joshua: 24, judges: 21, ruth: 4, "1samuel": 31, "2samuel": 24,
  "1kings": 22, "2kings": 25, "1chronicles": 29, "2chronicles": 36,
  ezra: 10, nehemiah: 13, esther: 10, job: 42, psalms: 150,
  proverbs: 31, ecclesiastes: 12, songofsolomon: 8, isaiah: 66,
  jeremiah: 52, lamentations: 5, ezekiel: 48, daniel: 12, hosea: 14,
  joel: 3, amos: 9, obadiah: 1, jonah: 4, micah: 7, nahum: 3,
  habakkuk: 3, zephaniah: 3, haggai: 2, zechariah: 14, malachi: 4,
  matthew: 28, mark: 16, luke: 24, john: 21, acts: 28, romans: 16,
  "1corinthians": 16, "2corinthians": 13, galatians: 6, ephesians: 6,
  philippians: 4, colossians: 4, "1thessalonians": 5, "2thessalonians": 3,
  "1timothy": 6, "2timothy": 4, titus: 3, philemon: 1, hebrews: 13,
  james: 5, "1peter": 5, "2peter": 3, "1john": 5, "2john": 1, "3john": 1,
  jude: 1, revelation: 22,
};

const TYPE_ALIASES: Record<string, EmmausResourceType> = {
  "sermon-companion": "sermon_companion",
  "bible-study": "bible_study",
  "daily-rhythm": "daily_rhythm",
  journey: "journey",
  walk: "walk",
  "walk-step": "walk_step",
  devotional: "devotional",
  sermon: "sermon",
};

function canonicalType(type: unknown): EmmausResourceType | null {
  return TYPE_ALIASES[String(type ?? "").toLowerCase()] ?? null;
}

function stripModelUrls(text: string): string {
  // Internal paths and absolute URLs are application-owned data, not prose.
  return text
    .replace(/https?:\/\/[^\s)\]}"']+/gi, "")
    .replace(/(?:^|\s)\/(?:api\/)?(?:bible|journeys?|journey|devotional|sermon(?:-companion)?|rooms?|admin)[^\s)\]}"']*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const PROSE_BOOK_NAMES = [
  "First Cor", "Second Cor", "First Thess", "Second Thess", "First Tim", "Second Tim",
  "First Pet", "Second Pet", "First Jn", "Second Jn", "Third Jn",
  "1 Cor", "2 Cor", "1 Thess", "2 Thess", "1 Tim", "2 Tim", "1 Pet", "2 Pet",
  "1 Jn", "2 Jn", "3 Jn", "Jhn", "Jn", "Heb", "Rom", "Gen",
  "First Corinthians", "Second Corinthians", "First Thessalonians",
  "Second Thessalonians", "First Timothy", "Second Timothy", "First Peter",
  "Second Peter", "First John", "Second John", "Third John",
  "Song of Solomon", "Song of Songs", "1 Corinthians", "2 Corinthians",
  "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "1 Peter",
  "2 Peter", "1 John", "2 John", "3 John", "Genesis", "Exodus", "Leviticus",
  "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth", "Samuel", "Kings",
  "Chronicles", "Ezra", "Nehemiah", "Esther", "Job", "Psalm", "Psalms",
  "Proverbs", "Ecclesiastes", "Isaiah", "Jeremiah", "Lamentations", "Ezekiel",
  "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum",
  "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi", "Matthew",
  "Mark", "Luke", "John", "Acts", "Romans", "Galatians", "Ephesians",
  "Philippians", "Colossians", "Titus", "Philemon", "Hebrews", "James",
  "Jude", "Revelation",
].sort((a, b) => b.length - a.length);

function proseBookPattern(): string {
  return PROSE_BOOK_NAMES.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}

/** Extract and validate Bible references named in final prose, independently
 * of the model's structured metadata. */
export function extractValidatedScriptureReferences(text: string): ScriptureRef[] {
  const pattern = new RegExp(
    `\\b((?:${proseBookPattern()}))\\s+(\\d{1,3})(?::(\\d{1,3})(?:\\s*[-–—]\\s*(\\d{1,3}))?(?:\\s*,\\s*\\d{1,3})?)?\\b`,
    "gi",
  );
  const found: ScriptureRef[] = [];
  for (const match of text.matchAll(pattern)) {
    const book = match[1]
      .replace(/^First /i, "1 ")
      .replace(/^Second /i, "2 ")
      .replace(/^Third /i, "3 ");
    const chapter = Number(match[2]);
    const verseStart = match[3] == null ? undefined : Number(match[3]);
    const verseEnd = match[4] == null ? verseStart : Number(match[4]);
    const ref = validateScripture({
      book,
      chapter,
      verseStart,
      verseEnd,
      reference: match[0],
      displayText: match[0],
    });
    if (ref && !found.some(existing => existing.reference.toLowerCase() === ref.reference.toLowerCase())) {
      found.push(ref);
    }
  }

  const spokenPattern = new RegExp(
    `\\b((?:${proseBookPattern()}))\\s+chapter\\s+(\\d{1,3})(?:\\s*,?\\s*verse\\s+(\\d{1,3})(?:\\s*(?:to|through|[-–—])\\s*(\\d{1,3}))?)?\\b`,
    "gi",
  );
  for (const match of text.matchAll(spokenPattern)) {
    const book = match[1]
      .replace(/^First /i, "1 ")
      .replace(/^Second /i, "2 ")
      .replace(/^Third /i, "3 ");
    const ref = validateScripture({
      book,
      chapter: Number(match[2]),
      verseStart: match[3] == null ? undefined : Number(match[3]),
      verseEnd: match[4] == null ? undefined : Number(match[4]),
      reference: match[0],
      displayText: match[0],
    });
    if (ref && !found.some(existing => existing.reference.toLowerCase() === ref.reference.toLowerCase())) {
      found.push(ref);
    }
  }
  return found;
}

/** Validate the complete model response while retaining the existing metadata shape. */
export function validateModelResponse(
  value: unknown,
  resources: EmmausResource[],
): EmmausResponseMetadata {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const scriptureReferences = Array.isArray(raw.scriptureReferences) ? raw.scriptureReferences : [];
  const validScriptures = scriptureReferences
    .map((ref) => validateScripture(ref))
    .filter((ref): ref is ScriptureRef => ref !== null);
  const primary = validateScripture(raw.scripture) ?? validScriptures[0] ?? null;
  const rawRecommendations = Array.isArray(raw.resourceRecommendations)
    ? raw.resourceRecommendations
    : Array.isArray(raw.recommendations) ? raw.recommendations : [];
  const recommendations: Recommendation[] = [];
  let rejectedRecommendations = 0;
  for (const candidate of rawRecommendations) {
    const item = (candidate && typeof candidate === "object" ? candidate : {}) as Record<string, unknown>;
    const type = canonicalType(item.resourceType ?? item.type);
    const id = String(item.resourceId ?? "");
    const match = type && id
      ? resources.find((r) => canonicalType(r.type) === type && r.resourceId === id)
      : type
        ? resources.find((r) => canonicalType(r.type) === type &&
            r.route === String(item.path ?? "") &&
            r.title === String(item.title ?? ""))
        : null;
    if (!match) {
      rejectedRecommendations++;
      continue;
    }
    recommendations.push({
      type: match.type === "bible-study" ? "bible_study"
        : match.type === "sermon-companion" ? "sermon_companion"
        : match.type === "daily-rhythm" ? "daily_rhythm"
        : match.type,
      title: match.title,
      description: typeof item.reason === "string" ? item.reason.slice(0, 240) : match.description,
      resourceId: match.resourceId,
      parentId: match.parentId,
      path: match.route,
    });
  }
  if (rejectedRecommendations > 0) {
    logger.warn({ rejectedRecommendations }, "emmaus: rejected invalid resource recommendations");
  }
  return {
    answer: typeof raw.answer === "string" ? stripModelUrls(raw.answer).slice(0, 5000) : undefined,
    scripture: primary,
    scriptureReferences: validScriptures,
    nextStep: null,
    nextSteps: [],
    recommendations,
    resourceRecommendations: recommendations.map((r) => ({
      resourceType: canonicalType(r.type)!,
      resourceId: r.resourceId!,
      ...(r.parentId ? { parentId: r.parentId } : {}),
      reason: r.description ?? "",
    })),
    prayer: typeof raw.prayer === "string" ? raw.prayer.slice(0, 1200) : null,
    followUpPrompts: Array.isArray(raw.followUpPrompts) ? raw.followUpPrompts.filter((p): p is string => typeof p === "string").slice(0, 4) : [],
    handoffType: raw.handoffType === "pastoral" || raw.handoffType === "crisis" ? raw.handoffType : null,
  };
}

/** Resolve a link only from a validated catalogue entry. */
export function resolveResourceRoute(
  resourceType: string,
  resourceId: string,
  resources: EmmausResource[],
  parentId?: string,
): string | null {
  const type = canonicalType(resourceType);
  if (!type || !resourceId) return null;
  const resource = resources.find((candidate) =>
    canonicalType(candidate.type) === type &&
    candidate.resourceId === resourceId &&
    (!parentId || candidate.parentId === parentId));
  return resource?.route ?? null;
}

export function validateScripture(value: unknown): ScriptureRef | null {
  if (!value || typeof value !== "object") return null;
  const ref = value as Record<string, unknown>;
  const book = normalizeBibleBook(String(ref.book ?? ""));
  const chapter = Number(ref.chapter);
  const verseStart = ref.verseStart == null ? undefined : Number(ref.verseStart);
  const verseEnd = ref.verseEnd == null ? undefined : Number(ref.verseEnd);
  if (!book || !Number.isInteger(chapter) || !buildScriptureRoute({ book, chapter, verseStart, verseEnd })) return null;
  const canonicalReference = `${canonicalBibleBookName(book)} ${chapter}${
    verseStart === undefined
      ? ""
      : `:${verseStart}${verseEnd !== undefined && verseEnd !== verseStart ? `–${verseEnd}` : ""}`
  }`;
  return {
    reference: canonicalReference,
    book,
    chapter,
    ...(verseStart !== undefined ? { verseStart } : {}),
    ...(verseEnd !== undefined ? { verseEnd } : {}),
    displayText: canonicalReference,
  };
}

export function validateCitations(
  metadata: EmmausResponseMetadata,
  resources: EmmausResource[],
): EmmausResponseMetadata {
  const validRoutes = new Set(resources.map(r => r.route));
  const recommendations = (metadata.recommendations ?? []).filter((item: Recommendation) => {
    if (item.type === "sermon") return false;
    if (item.type === "pastor" || item.type === "prayer") return true;
    if (item.resourceId) {
      const expected = resources.find(r => r.resourceId === item.resourceId && canonicalType(r.type) === canonicalType(item.type));
      return !!expected;
    }
    return !!item.path && validRoutes.has(item.path);
  }).map(item => ({ ...item, path: item.path }));

  let scripture = metadata.scripture;
  if (scripture) {
    scripture = validateScripture(scripture);
  }

  const nextStep = metadata.nextStep && typeof metadata.nextStep.path === "string" &&
    (validRoutes.has(metadata.nextStep.path) || /^\/bible\/read\/[a-z0-9]+\/\d+(?:\?.*)?$/.test(metadata.nextStep.path))
    ? { ...metadata.nextStep, path: metadata.nextStep.path.startsWith("http") ? "" : metadata.nextStep.path }
    : null;

  return {
    ...metadata,
    scripture,
    scriptureReferences: metadata.scriptureReferences?.map(validateScripture).filter((r): r is ScriptureRef => !!r) ?? (scripture ? [scripture] : []),
    nextStep,
    recommendations: recommendations.map(r => ({ ...r, description: r.description ? stripModelUrls(r.description) : r.description })),
  };
}