/**
 * Emmaus Context Builder
 *
 * Assembles a structured context object from the request's entry point
 * and any associated data (Bible passage, Journey, Sermon, user memories).
 * The resulting string is injected into the system prompt so the AI
 * knows exactly where the user is coming from without them needing to explain.
 */

import type { EntryPoint, EmmausMemory } from "./firestore-model.js";

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
    lines.push(`\nRelevant path for recommendations: /bible/journey/${jc.journeyId}`);
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

  // Available church resources for recommendations
  lines.push(`
Available resources for recommendations:
  Journeys:
    - Walk Through John (21 chapters) → /bible/journey/walk-through-john
    - 15 Minutes With Jesus (core journey) → /journey/15-minutes-with-jesus/day/1
  Sermons: Indexed sermons are available in the church library. Reference them by title/topic.
  Emmaus Rooms: Community groups for shared journeys → /rooms
  Pastoral contact: Recommend connecting with a pastor for personal, marriage, bereavement, or safeguarding needs.
`);

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
