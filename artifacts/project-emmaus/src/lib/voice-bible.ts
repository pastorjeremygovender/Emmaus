/**
 * voice-bible.ts — Bible translation resolution for Emmaus Voice reading.
 *
 * SINGLE SOURCE OF TRUTH: This module reads the same localStorage key that
 * BibleContext uses ('emmaus_bible_translation') so Voice and the visual
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
 *   are EXCLUDED from Voice reading.  If a user's preferred or explicitly
 *   requested translation falls in this category, Voice explains and falls
 *   back to the Berean Standard Bible.
 *
 * This policy must be revisited if/when TTS licences are obtained.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VoiceTranslationResult {
  /** The translation ID that will be used for TTS. Always TTS-safe. */
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

/** The default TTS fallback when the user's preferred translation is unavailable. */
export const DEFAULT_TTS_TRANSLATION_ID   = 'bsb';
export const DEFAULT_TTS_TRANSLATION_NAME = 'Berean Standard Bible';

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
  // Licensed (will trigger a substitution notice)
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
export function getUserBibleTranslation(): string {
  try {
    const raw = localStorage.getItem(TRANSLATION_LS_KEY);
    return raw ? (JSON.parse(raw) as string) : DEFAULT_TTS_TRANSLATION_ID;
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
 *   3. Default — BSB
 *
 * If the resolved translation is not TTS-safe, falls back to BSB and sets
 * `substituted: true` so the caller can explain before reading.
 */
export function resolveVoiceTranslation(explicitId: string | null): VoiceTranslationResult {
  const userPrefId = getUserBibleTranslation();
  // What was asked for (explicit > user pref > default)
  const requestedId = explicitId ?? userPrefId ?? DEFAULT_TTS_TRANSLATION_ID;

  if (TTS_SAFE_TRANSLATIONS[requestedId]) {
    return {
      resolvedId:    requestedId,
      resolvedName:  TTS_SAFE_TRANSLATIONS[requestedId],
      userPrefId,
      substituted:   false,
      requestedId:   explicitId,
    };
  }

  // Not TTS-safe → substitute with BSB
  return {
    resolvedId:    DEFAULT_TTS_TRANSLATION_ID,
    resolvedName:  DEFAULT_TTS_TRANSLATION_NAME,
    userPrefId,
    substituted:   true,
    requestedId,
  };
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
