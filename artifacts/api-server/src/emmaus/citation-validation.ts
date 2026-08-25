import { BOOK_INTROS } from "../bible/book-intros.js";
import type { EmmausResponseMetadata, Recommendation, ScriptureRef } from "./firestore-model.js";
import type { EmmausResource } from "./resource-catalogue.js";

const aliases: Record<string, string> = {
  psalm: "psalms", ps: "psalms", "song of solomon": "songofsolomon",
  "song of songs": "songofsolomon", "1 samuel": "1samuel", "2 samuel": "2samuel",
  "1 kings": "1kings", "2 kings": "2kings", "1 chronicles": "1chronicles",
  "2 chronicles": "2chronicles", "1 corinthians": "1corinthians", "2 corinthians": "2corinthians",
  "1 thessalonians": "1thessalonians", "2 thessalonians": "2thessalonians",
  "1 john": "1john", "2 john": "2john", "3 john": "3john",
};

export function normalizeBibleBook(book: string): string | null {
  const raw = book.trim().toLowerCase().replace(/\s+/g, " ");
  const id = aliases[raw] ?? raw.replace(/\s/g, "");
  return Object.prototype.hasOwnProperty.call(BOOK_INTROS, id) ? id : null;
}

export function buildScriptureRoute(ref: Partial<ScriptureRef> & { verseStart?: number; verseEnd?: number }): string | null {
  const book = normalizeBibleBook(String(ref.book ?? ""));
  const chapter = Number(ref.chapter);
  if (!book || !Number.isInteger(chapter) || chapter < 1 || chapter > 150) return null;
  const verse = Number(ref.verseStart ?? 0);
  return `/bible/read/${book}/${chapter}${Number.isInteger(verse) && verse > 0 ? `?startVerse=${verse}` : ""}`;
}

export function validateCitations(
  metadata: EmmausResponseMetadata,
  resources: EmmausResource[],
): EmmausResponseMetadata {
  const validRoutes = new Set(resources.map(r => r.route));
  const recommendations = (metadata.recommendations ?? []).filter((item: Recommendation) => {
    if (item.type === "sermon") return false;
    if (item.type === "pastor" || item.type === "prayer") return true;
    return !!item.path && validRoutes.has(item.path);
  }).map(item => ({ ...item, path: item.path }));

  let scripture = metadata.scripture;
  if (scripture) {
    const book = normalizeBibleBook(scripture.book);
    const route = book ? buildScriptureRoute({ ...scripture, book }) : null;
    if (!route) scripture = null;
    else scripture = { ...scripture, book: book as string };
  }

  const nextStep = metadata.nextStep && buildScriptureRoute(metadata.nextStep as unknown as Partial<ScriptureRef>)
    ? metadata.nextStep
    : metadata.nextStep;

  return { ...metadata, scripture, nextStep, recommendations };
}