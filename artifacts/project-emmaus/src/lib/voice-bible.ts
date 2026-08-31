/**
 * voice-bible.ts — Bible translation resolution for Emmaus Voice reading.
 *
 * SINGLE SOURCE OF TRUTH: This module reads the same account-scoped key that
 * BibleContext uses so Voice and the visual
 * Bible reader always start from the same user preference.
 *
 * TTS LICENSING POLICY:
 *   Public domain (BSB, ASV, KJV) — confirmed safe for TTS audio generation.
 *
 *   Licensed (NIV, GNT, MSG via API.Bible) — standard API.Bible terms cover
 *   text display, NOT audio reproduction.  Using these translations as input
 *   to a TTS engine would constitute audio reproduction of copyrighted text,
 *   which is not permitted under the standard licence without explicit approval
 *   from the copyright holder (Zondervan, ABS, NavPress respectively).
 *
 *   Until TTS licences are confirmed with each publisher, licensed translations
 *   are EXCLUDED from Voice reading. If a user's preferred or explicitly
 *   requested translation falls in this category, Voice explains that it is
 *   unavailable rather than silently switching to BSB.
 *
 * This policy must be revisited if/when TTS licences are obtained.
 */

import { accountStorageKey } from '@/lib/account-storage';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VoiceTranslationResult {
  /** The translation selected by the user/request. Never silently substituted. */
  resolvedId: string;
  /** Human-readable name of the resolved translation. */
  resolvedName: string;
  /** The user's stored preference at resolution time. */
  userPrefId: string;
  /**
   * True when the resolved translation differs from what was asked for
   * (explicitly or via user preference).  Voice should explain this to
   * the user before reading.
   */
  substituted: boolean;
  /**
   * The translation originally requested (from voice command or user pref).
   * Null only when no preference is stored and no explicit request was made.
   */
  requestedId: string | null;
  /** False when policy does not allow this translation to be read aloud. */
  availableForTts: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Translations confirmed safe for TTS audio generation (public domain).
 * Maps translationId → human-readable display name.
 */
export const TTS_SAFE_TRANSLATIONS: Record<string, string> = {
  bsb: 'Berean Standard Bible',
  asv: 'American Standard Version',
  kjv: 'King James Version',
};

/** New accounts use NIV for both the visual reader and Voice context. */
export const DEFAULT_TTS_TRANSLATION_ID   = 'niv';
export const DEFAULT_TTS_TRANSLATION_NAME = 'New International Version';

/** localStorage key used by BibleContext for the translation preference. */
const TRANSLATION_LS_KEY = 'emmaus_bible_translation';

// ─── Map of spoken translation names → translation ID ────────────────────────
// Covers both abbreviations and common spoken/full names.

export const SPOKEN_TRANSLATION_MAP: Record<string, string> = {
  // BSB
  bsb: 'bsb',
  berean: 'bsb',
  'berean standard': 'bsb',
  'berean standard bible': 'bsb',
  // ASV
  asv: 'asv',
  'american standard': 'asv',
  'american standard version': 'asv',
  // KJV
  kjv: 'kjv',
  'king james': 'kjv',
  'king james version': 'kjv',
  // Licensed (remain selected but are unavailable for TTS)
  niv: 'niv',
  'new international': 'niv',
  'new international version': 'niv',
  gnt: 'gnt',
  'good news': 'gnt',
  'good news translation': 'gnt',
  msg: 'msg',
  message: 'msg',
  'the message': 'msg',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Read the user's stored Bible translation preference from localStorage. */
export function getUserBibleTranslation(subject: string | null): string {
  if (!subject) return DEFAULT_TTS_TRANSLATION_ID;
  try {
    const raw = localStorage.getItem(accountStorageKey(TRANSLATION_LS_KEY, subject));
    const value = raw ? JSON.parse(raw) as string : DEFAULT_TTS_TRANSLATION_ID;
    return typeof value === 'string' && (
      Boolean(TTS_SAFE_TRANSLATIONS[value]) || ['niv', 'gnt', 'msg'].includes(value)
    ) ? value : DEFAULT_TTS_TRANSLATION_ID;
  } catch {
    return DEFAULT_TTS_TRANSLATION_ID;
  }
}

/**
 * Resolve the translation to use for Voice Bible reading.
 *
 * Resolution order (per spec):
 *   1. Explicitly requested in the voice command (explicitId)
 *   2. User's stored preference (localStorage)
 *   3. Default — NIV
 *
 * If the resolved translation is not TTS-safe, it remains selected and is
 * marked unavailable. The caller must not feed that text into TTS.
 */
export function resolveVoiceTranslation(
  explicitId: string | null,
  subject: string | null,
  preferenceOverride?: string | null,
): VoiceTranslationResult {
  const userPrefId = preferenceOverride ?? getUserBibleTranslation(subject);
  // What was asked for (explicit > user pref > default)
  const requestedId = explicitId ?? userPrefId ?? DEFAULT_TTS_TRANSLATION_ID;

  return {
    resolvedId: requestedId,
    resolvedName: TTS_SAFE_TRANSLATIONS[requestedId] ?? (
      requestedId === 'niv' ? 'New International Version' :
      requestedId === 'gnt' ? 'Good News Translation' :
      requestedId === 'msg' ? 'The Message' : requestedId.toUpperCase()
    ),
    userPrefId,
    substituted: false,
    requestedId,
    availableForTts: Boolean(TTS_SAFE_TRANSLATIONS[requestedId]),
  };
}

export function buildUnavailableTranslationNotice(
  requestedId: string,
  requestedName: string,
): string {
  return `${requestedName} is selected, but I can't read that translation aloud until audio permission is available. I have not switched translations.`;
}

/**
 * Build a spoken notice explaining why a different translation was used.
 *
 * @param requestedId   The translation that was asked for (by command or pref).
 * @param fallbackName  The translation that will actually be used.
 * @param wasExplicit   True if the user explicitly named the translation in
 *                      their command ("read John 3 in NIV"), false if it was
 *                      inferred from their saved preference.
 */
export function buildSubstitutionNotice(
  requestedId: string | null,
  fallbackName: string,
  wasExplicit: boolean,
): string {
  const label = requestedId?.toUpperCase() ?? 'your preferred translation';
  if (wasExplicit) {
    return (
      `I can't read ${label} aloud at the moment — ` +
      `I'll read this from the ${fallbackName}.`
    );
  }
  return (
    `Your Bible is set to ${label}, which I can't use for audio reading. ` +
    `I'll read this from the ${fallbackName}.`
  );
}

/**
 * Parse an explicit translation request from a normalised voice transcript.
 * Looks for patterns like "read John 3 in ASV" or "read Psalm 23 in the NIV".
 *
 * Returns the translation ID string, or null if no match found.
 */
export function parseExplicitTranslation(normalisedText: string): string | null {
  // Match "in [the] [translation name]" or "using [the] [translation name]" at end
  const m = /(?: in| using) (?:the )?(.+)$/.exec(normalisedText);
  if (!m) return null;
  const spoken = m[1].trim();
  return SPOKEN_TRANSLATION_MAP[spoken] ?? null;
}
