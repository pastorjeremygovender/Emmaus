/**
 * voice-context.ts — Types and fetcher for Voice Mode app context.
 *
 * The Voice Mode calls GET /api/voice/context once at session start to
 * understand what the user has active today, without re-querying for
 * every message.  All content data comes from the SAME DB queries the
 * Walk page uses — nothing is invented or hardcoded.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DailyRhythmContext {
  journeyId: string;
  journeyTitle: string;
  currentDay: number;
  totalDays: number;
  stepTitle: string;
  stepScripture: string;
  stepTeaching: string;
  stepReflection: string;
  stepPrayer: string;
}

export interface DevotionalContext {
  seriesId: string;
  seriesTitle: string;
  currentDay: number;
  totalDays: number;
  entryTitle: string;
  entryScripture: string;
  entryContent: string;
  entryPrayer: string;
}

export interface WalkContext {
  journeyId: string;
  title: string;
  slug: string;
  currentDay: number;
  totalDays: number;
  // Step content — populated from the DB so Voice can read it aloud
  stepTitle?: string;
  stepScripture?: string;
  stepTeaching?: string;
  stepReflection?: string;
  stepPrayer?: string;
}

export interface SermonCompanionContext {
  id: string;
  title: string;
  currentDay: number;
  totalDays: number;
  entryTitle: string;
  entryScripture: string;
  entryGreeting: string;
  entryReflection: string;
  entryPrayer: string;
  entryClosing: string;
}

export interface VoiceAppContext {
  dailyRhythm: DailyRhythmContext | null;
  activeDevotionals: DevotionalContext[];
  activeWalks: WalkContext[];
  sermonCompanion: SermonCompanionContext | null;
  /** Human-readable summary of what's active today (used in Emmaus context). */
  todaysSummary: string;
}

// ─── Fetcher ─────────────────────────────────────────────────────────────────

export async function fetchVoiceContext(_userId: string): Promise<VoiceAppContext | null> {
  try {
    const res = await fetch('/api/voice/context');
    if (!res.ok) return null;
    return (await res.json()) as VoiceAppContext;
  } catch {
    return null;
  }
}
