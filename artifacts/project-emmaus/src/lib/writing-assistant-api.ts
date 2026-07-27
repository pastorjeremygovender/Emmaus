/**
 * writing-assistant-api.ts — client calls to the Emmaus Writing Assistant API
 *
 * All functions require the current user's id and role (admin or superAdmin).
 * Normal members cannot access these endpoints.
 */

import { getApiUrl } from './api';
import type { SermonSearchHit } from './journeys-api';

// ─── Shared types (mirrors server-side types) ─────────────────────────────────

export type WritingStyle =
  | 'emmaus-standard'
  | 'pastor-jeremy'
  | 'new-believer'
  | 'bible-study'
  | 'youth';

export type DraftField =
  | 'mentorIntro'
  | 'devotional'
  | 'prayerPrompt'
  | 'actionStep'
  | 'closingText';

export type RefineAction =
  | 'warmer'
  | 'clearer'
  | 'shorter'
  | 'paragraph-flow'
  | 'new-believer'
  | 'jesus-central'
  | 'another-prayer'
  | 'another-next-step'
  | 'check-repetition';

export interface SermonContextInput {
  sermonId: string;
  sermonTitle: string;
  timestamp?: number;
  snippet?: string;
}

export interface PreviousDayContextInput {
  day: number;
  title: string;
  scripture: string;
  reflection: string;
  nextStep: string;
}

export interface GenerationInputs {
  dayNumber: number;
  title: string;
  scriptureRef: string;
  passageText: string; // retrieved from Bible system — used in prompt only, never stored
  centralTruth: string;
  connectionToPrevious?: string;
  desiredNextStep?: string;
  additionalDirection?: string;
  writingStyle: WritingStyle;
  sermonContext?: SermonContextInput;
  previousDayContext?: PreviousDayContextInput;
  targetField?: DraftField; // when set, regenerate only this field
}

export interface DraftResult {
  mentorIntro: string;
  devotional: string;
  prayerPrompt: string;
  actionStep: string;
  closingText: string;
  review: {
    scriptureUsed: string;
    centralTruth: string;
    sermonSource: string | null;
    warnings: string[];
  };
}

export interface RefineContext {
  scripture: string;
  dayTitle: string;
  centralTruth?: string;
  fieldLabel: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function assistantFetch<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const res = await fetch(getApiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(
      data.error ??
      "We couldn't complete this request. Your current content has been preserved. Please try again."
    );
  }
  return res.json() as Promise<T>;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a complete Daily Rhythm draft from the provided inputs.
 * Requires an authorised admin or superAdmin user.
 */
export async function generateDraft(
  userId: string,
  userRole: string,
  inputs: GenerationInputs
): Promise<DraftResult> {
  return assistantFetch<DraftResult>('/api/writing-assistant/generate', {
    userId,
    userRole,
    inputs,
  });
}

/**
 * Regenerate a single field within an existing draft.
 * Provide the targetField in the inputs object.
 */
export async function regenerateField(
  userId: string,
  userRole: string,
  inputs: GenerationInputs
): Promise<DraftResult> {
  return assistantFetch<DraftResult>('/api/writing-assistant/generate', {
    userId,
    userRole,
    inputs,
  });
}

/**
 * Apply a focused editing action to a single field's content.
 * Returns a suggestion — the caller decides whether to apply it.
 */
export async function refineContent(
  userId: string,
  userRole: string,
  action: RefineAction,
  content: string,
  context: RefineContext
): Promise<{ suggestion: string }> {
  return assistantFetch<{ suggestion: string }>('/api/writing-assistant/refine', {
    userId,
    userRole,
    action,
    content,
    context,
  });
}

// ─── Scripture passage retrieval ──────────────────────────────────────────────
// Fetches the passage text for inclusion in the generation prompt.
// The text is used only in the AI prompt — it is never stored in the draft output.

export async function fetchPassageText(
  bookId: string,
  chapter: number,
  startVerse: number | null,
  endVerse: number | null,
  translation = 'bsb'
): Promise<string> {
  const res = await fetch(getApiUrl(`/api/bible/${translation}/${bookId}/${chapter}`));
  if (!res.ok) return '';

  const data = await res.json() as { verses?: Array<{ verse: number; text: string }> };
  const verses = data.verses ?? [];

  const filtered = verses.filter(v => {
    if (startVerse === null) return true;
    if (v.verse < startVerse) return false;
    if (endVerse !== null && v.verse > endVerse) return false;
    return true;
  });

  return filtered.map(v => `${v.verse} ${v.text}`).join(' ');
}
