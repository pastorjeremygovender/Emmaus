/**
 * Emmaus Context Builder
 *
 * Assembles a structured context object from the request's entry point
 * and any associated data (Bible passage, Journey, Sermon, user memories).
 * The resulting string is injected into the system prompt so the AI
 * knows exactly where the user is coming from without them needing to explain.
 */

import type { EntryPoint, EmmausMemory } from "./firestore-model.js";
import type { VoiceContextEnvelope } from "./voice-contracts.js";
import type { JarvisContextEnvelope } from "./jarvis-contract.js";

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface BibleContext {
  bookId: string;
  bookName: string;
  chapter: number;
  chapterHeading?: string;
  verseText?: string;       // if launched from a specific verse
  journeyId?: string;
  journeyTitle?: string;
}

export interface JourneyContext {
  journeyId: string;
  journeyTitle: string;
  currentDay: number;
  stepTitle?: string;
  stepTheme?: string;
}

export interface SermonContext {
  sermonId: string;
  sermonTitle: string;
  speaker?: string;
  scriptureReference?: string;
  sermonDate?: string;
}

export interface EmmausContextInput {
  entryPoint: EntryPoint;
  userId?: string;
  conversationId?: string;
  userName?: string;
  memories?: EmmausMemory[];

  // Optional: provided by the calling UI based on where the user came from
  bibleContext?: BibleContext;
  journeyContext?: JourneyContext;
  sermonContext?: SermonContext;

  /**
   * Phase 3: Voice Mode passes a plain-text block describing the user's
   * current app state and active reading content.  Injected verbatim into
   * the system context so Emmaus can answer voice navigation/reading
   * questions without the user being on the relevant page.
   */
  voiceAppContext?: string;
  /** Server-generated envelope for Voice requests; never supplied as prose by the model. */
  voiceContextEnvelope?: VoiceContextEnvelope;
  /** Server-assembled, owner-scoped context for typed Ask Emmaus requests. */
  jarvisContext?: JarvisContextEnvelope;
}

/** Flat context accepted from web clients and translated before orchestration. */
export interface FlatEmmausContext {
  entryPoint?: string;
  conversationId?: string;
  userName?: string;
  bookId?: string;
  bookName?: string;
  chapter?: number;
  chapterHeading?: string;
  verseText?: string;
  journeyId?: string;
  journeyTitle?: string;
  currentDay?: number;
  sermonId?: string;
  sermonTitle?: string;
  scriptureReference?: string;
  voiceAppContext?: string;
}

const VALID_ENTRY_POINTS = new Set<EntryPoint>([
  "bible",
  "walk",
  "journeys",
  "sermons",
  "personal",
  "standalone",
]);

/**
 * Converts the browser's flat context into the canonical nested shape.
 * Identity is supplied by the authenticated server session, never the body.
 */
export function toEmmausContextInput(
  flat: FlatEmmausContext | undefined,
  userId: string,
): EmmausContextInput {
  const entryPoint =
    typeof flat?.entryPoint === "string" && VALID_ENTRY_POINTS.has(flat.entryPoint as EntryPoint)
      ? flat.entryPoint as EntryPoint
      : "standalone";

  const ctx: EmmausContextInput = {
    entryPoint,
    userId,
    conversationId: flat?.conversationId,
  };

  if (flat?.bookId || flat?.bookName || flat?.chapter) {
    ctx.bibleContext = {
      bookId: flat.bookId ?? "",
      bookName: flat.bookName ?? flat.bookId ?? "",
      chapter: Number.isInteger(flat.chapter) && flat.chapter! > 0 ? flat.chapter! : 1,
      chapterHeading: flat.chapterHeading,
      verseText: flat.verseText,
      journeyId: flat.journeyId,
      journeyTitle: flat.journeyTitle,
    };
  }

  if (flat?.journeyId && !flat?.bookId) {
    ctx.journeyContext = {
      journeyId: flat.journeyId,
      journeyTitle: flat.journeyTitle ?? flat.journeyId,
      currentDay: Number.isInteger(flat.currentDay) && flat.currentDay! > 0 ? flat.currentDay! : 1,
    };
  }

  if (flat?.sermonId) {
    ctx.sermonContext = {
      sermonId: flat.sermonId,
      sermonTitle: flat.sermonTitle ?? flat.sermonId,
      scriptureReference: flat.scriptureReference,
    };
  }

  if (flat?.voiceAppContext) ctx.voiceAppContext = flat.voiceAppContext;
  return ctx;
}

export interface BuiltContext {
  entryPoint: EntryPoint;
  userId: string;
  conversationId?: string;
  systemContextBlock: string;     // injected into system prompt
  conversationTitle: string;      // auto-generated title for the conversation record
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export function buildContext(input: EmmausContextInput): BuiltContext {
  const userId = input.userId ?? "anonymous";
  const lines: string[] = [];

  // Entry point
  lines.push(`Entry point: ${formatEntryPoint(input.entryPoint)}`);

  if (input.userName) {
    lines.push(`User's name: ${input.userName}`);
  }

  // Bible context
  if (input.bibleContext) {
    const bc = input.bibleContext;
    lines.push(`\nThe user is currently reading:`);
    lines.push(`  Book: ${bc.bookName} (${bc.bookId})`);
    lines.push(`  Chapter: ${bc.chapter}${bc.chapterHeading ? ` — "${bc.chapterHeading}"` : ""}`);
    if (bc.verseText) {
      lines.push(`  They tapped on this verse: "${bc.verseText}"`);
    }
    if (bc.journeyId) {
      lines.push(`  They are reading this as part of: ${bc.journeyTitle ?? bc.journeyId}`);
    }
    lines.push(`  Translation: KJV`);
    lines.push(`\nEmmy should already know what this chapter is about — do not ask the user to explain it.`);
    lines.push(`If the user's message is vague (e.g. "what does this mean?"), assume they mean the chapter they are reading.`);
  }

  // Journey context
  if (input.journeyContext) {
    const jc = input.journeyContext;
    lines.push(`\nThe user is on a journey:`);
    lines.push(`  Journey: "${jc.journeyTitle}" (${jc.journeyId})`);
    lines.push(`  Current day: Day ${jc.currentDay}${jc.stepTitle ? ` — "${jc.stepTitle}"` : ""}`);
    if (jc.stepTheme) {
      lines.push(`  Today's theme: ${jc.stepTheme}`);
    }
    // Routes come only from the live, validated resource catalogue. Do not
    // expose a client-derived path as a recommendation hint.
  }

  // Sermon context
  if (input.sermonContext) {
    const sc = input.sermonContext;
    lines.push(`\nThe user came from a sermon:`);
    lines.push(`  Title: "${sc.sermonTitle}"`);
    if (sc.speaker) lines.push(`  Speaker: ${sc.speaker}`);
    if (sc.scriptureReference) lines.push(`  Scripture: ${sc.scriptureReference}`);
    if (sc.sermonDate) lines.push(`  Preached: ${sc.sermonDate}`);
    lines.push(`\nIf appropriate, recommend engaging further with this sermon or its Scripture passage.`);
  }

  // Phase 3: Voice Mode app-state context (what the user has active today)
  if (input.voiceAppContext) {
    lines.push(`\n[Voice Mode context — user's current Emmaus state]\n${input.voiceAppContext}`);
  }

  if (input.voiceContextEnvelope) {
    const envelope = input.voiceContextEnvelope;
    lines.push(
      `\n[Verified Voice context envelope]`,
      `  Schema: ${envelope.schemaVersion}`,
      `  Church: ${envelope.church.name} (${envelope.church.id})`,
      `  Verified role: ${envelope.verifiedUser.role}`,
      `  Current route: ${envelope.location?.pathname ?? "unknown"}`,
      `  Current activity: ${envelope.activity.isReading ? "reading aloud" : "not reading aloud"}`,
      `  Content, safety, and routes: server-authoritative`,
    );
  }

  if (input.jarvisContext) {
    const envelope = input.jarvisContext;
    const jc = envelope.context;
    lines.push(`\n[Verified Emmaus account context — server assembled]`);
    lines.push(`  Context schema: ${envelope.schemaVersion}; scope: ${envelope.scope}`);
    if (jc.identity.displayName) lines.push(`  Display name: ${jc.identity.displayName}`);
    if (jc.dailyRhythm) {
      lines.push(
        `  Daily Rhythm: Day ${jc.dailyRhythm.currentDay}` +
        `${jc.dailyRhythm.stepTitle ? ` — "${jc.dailyRhythm.stepTitle}"` : ""}` +
        `${jc.dailyRhythm.completedToday ? " (completed today)" : ""}` +
        `${jc.dailyRhythm.locked ? ` (next step unlocks ${jc.dailyRhythm.unlockDate ?? "later"})` : ""}`,
      );
    }
    for (const progress of jc.activeProgress.slice(0, 6)) {
      lines.push(
        `  Active ${progress.journeyType}: "${progress.title}" — Day ${progress.currentDay}` +
        `${progress.stepTitle ? `, "${progress.stepTitle}"` : ""}`,
      );
    }
    for (const progress of jc.completedProgress.slice(0, 6)) {
      lines.push(`  Completed ${progress.journeyType}: "${progress.title}"`);
    }
    if (jc.bible) {
      lines.push(`  Saved Bible position: ${jc.bible.bookName} ${jc.bible.chapter}`);
    }
    if (jc.devotional) {
      lines.push(
        `  Current devotional: "${jc.devotional.seriesTitle}" — Day ${jc.devotional.currentDay}` +
        `${jc.devotional.entryTitle ? `, "${jc.devotional.entryTitle}"` : ""}`,
      );
    }
    const unavailable = jc.sourceStatuses
      .filter((source) => source.status === "unavailable")
      .map((source) => source.source);
    if (unavailable.length > 0) {
      lines.push(`  Account context unavailable for: ${unavailable.join(", ")}. Do not infer missing data.`);
    }
  }

  // User memories (only approved ones are passed in)
  if (input.memories && input.memories.length > 0) {
    lines.push(`\nApproved notes about this user (do not reference them directly — weave them in naturally):`);
    for (const m of input.memories) {
      lines.push(`  - ${m.content}`);
    }
  }

  // Entry-point specific guidance
  const epGuidance = getEntryPointGuidance(input.entryPoint);
  if (epGuidance) {
    lines.push(`\n${epGuidance}`);
  }

  // Note: Available published journeys, devotionals, sermon companions, and room membership
  // are injected dynamically by conversation-service.ts from live DB data — not hardcoded here.

  const systemContextBlock = lines.join("\n");
  const conversationTitle = generateTitle(input);

  return {
    entryPoint: input.entryPoint,
    userId,
    conversationId: input.conversationId,
    systemContextBlock,
    conversationTitle,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEntryPoint(ep: EntryPoint): string {
  const map: Record<EntryPoint, string> = {
    bible:      "Bible module — the user is reading Scripture",
    walk:       "Walk — the user's main discipleship home",
    journeys:   "Journeys — the user is exploring content journeys",
    sermons:    "Sermons — the user came from a sermon",
    personal:   "Personal — the user's personal reflection space",
    standalone: "Standalone — the user opened Ask Emmaus directly",
  };
  return map[ep] ?? ep;
}

function getEntryPointGuidance(ep: EntryPoint): string {
  switch (ep) {
    case "bible":
      return "Since the user came from the Bible, prioritise Scripture-based responses. Your next-step should include opening a Bible passage.";
    case "walk":
      return "Since the user came from their Walk, they are likely in a regular discipleship rhythm. Encourage consistency and their next journey step.";
    case "journeys":
      return "Since the user came from Journeys, they may be looking for a new journey to begin or continuing an existing one.";
    case "sermons":
      return "Since the user came from a sermon, they may be responding to something that was said. Connect the conversation back to Scripture and encourage deeper engagement with the passage preached.";
    case "personal":
      return "Since the user came from their Personal space, this may be a private, reflective conversation. Be especially attentive and gentle.";
    default:
      return "";
  }
}

function generateTitle(input: EmmausContextInput): string {
  if (input.bibleContext) {
    return `${input.bibleContext.bookName} ${input.bibleContext.chapter}`;
  }
  if (input.sermonContext) {
    return `Sermon: ${input.sermonContext.sermonTitle}`;
  }
  if (input.journeyContext) {
    return `${input.journeyContext.journeyTitle} — Day ${input.journeyContext.currentDay}`;
  }
  const epTitles: Record<EntryPoint, string> = {
    bible:      "Bible question",
    walk:       "Walk conversation",
    journeys:   "Journeys conversation",
    sermons:    "Sermon follow-up",
    personal:   "Personal reflection",
    standalone: "Conversation",
  };
  return epTitles[input.entryPoint] ?? "Conversation";
}
