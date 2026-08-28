import { classifyEmmausIntent, type EmmausIntentMode } from "@workspace/api-zod";
import {
  findEmmausCapability,
  type EmmausCapability,
  type EmmausCapabilityId,
  type EmmausCapabilityOperation,
} from "./capability-registry.js";

export type CanonicalAskIntent =
  | "APP_HELP"
  | "DIRECT_ACTION"
  | "BIBLE_READ"
  | "BIBLE_CONTINUE"
  | "RESOURCE_SEARCH"
  | "PASTORAL_QUESTION"
  | "GENERAL_BIBLICAL_QUESTION"
  | "AMBIGUOUS";

export interface TypedAskEmmausIntent {
  intent: CanonicalAskIntent;
  requestedCapability?: EmmausCapabilityId;
  requestedOperation?: EmmausCapabilityOperation;
  bibleReference?: (ReturnType<typeof classifyEmmausIntent>["bibleRef"] & { verseEnd?: number });
  resourceQuery?: string;
  confidence: number;
  clarificationRequired: boolean;
}

const clean = (value: string) => value.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

function isAppHelp(value: string): boolean {
  return /^(?:where|how|what|show|find|tell me about|can you explain)\b/.test(value)
    && /\b(?:where|access|open|use|help|do|is|are|what can)\b/.test(value);
}

function capabilityForText(value: string): EmmausCapability | null {
  return findEmmausCapability(value);
}

function classifyBibleRange(message: string): ReturnType<typeof classifyEmmausIntent> {
  // The shared classifier intentionally accepts the same compact reference
  // grammar for typed and voice transcripts. Add the range end locally so
  // typed Ask Emmaus can preserve exact starting/ending verses without
  // creating a second navigation implementation.
  const spokenNumber: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  };
  const spokenMessage = message.replace(
    /\bchapter\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen)\s+verses?\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen)\s+(?:through|to)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen)\b/i,
    (_, chapter: string, start: string, end: string) =>
      `${spokenNumber[chapter.toLowerCase()]}:${spokenNumber[start.toLowerCase()]}–${spokenNumber[end.toLowerCase()]}`,
  );
  const range = spokenMessage.match(/\b(\d{1,3})[:\s](\d{1,3})\s*[-–—]\s*(\d{1,3})\b/);
  if (!range) return classifyEmmausIntent(message);
  const base = spokenMessage.slice(0, range.index!)
    + `${range[1]}:${range[2]}`
    + spokenMessage.slice(range.index! + range[0].length);
  const classified = classifyEmmausIntent(base);
  if (!classified.bibleRef) return classified;
  return {
    ...classified,
    bibleRef: {
      ...classified.bibleRef,
      verse: Number(range[2]),
      verseEnd: Number(range[3]),
    } as routeBibleRef,
  };
}

type routeBibleRef = NonNullable<ReturnType<typeof classifyEmmausIntent>["bibleRef"]> & {
  verseEnd?: number;
};

export function routeAskEmmausRequest(message: string): TypedAskEmmausIntent {
  const value = clean(message);
  const shared = classifyBibleRange(message);
  const capability = capabilityForText(value);
  const routingValue = value.replace(/^please\s+/, "");

  if (/^what can (?:emmaus|you) (?:help me with|do)|^what can emmaus help me with/.test(value)) {
    return {
      intent: "APP_HELP",
      confidence: 0.99,
      clarificationRequired: false,
    };
  }

  if (/^(?:what(?:'s| is)|show me)\s+(?:in|on)\s+(?:my\s+)?(?:journey|walk)\b/.test(value)
    || /^what am i currently (?:doing|working through)\b/.test(value)
    || /^which (?:walk|journey) am i (?:currently )?(?:on|doing)\b/.test(value)) {
    return {
      intent: "DIRECT_ACTION",
      requestedCapability: "active-progress",
      requestedOperation: "READ",
      confidence: 0.94,
      clarificationRequired: false,
    };
  }

  if (isAppHelp(value) && capability) {
    return {
      intent: "APP_HELP",
      requestedCapability: capability.id,
      requestedOperation: "DESCRIBE",
      confidence: 0.98,
      clarificationRequired: false,
    };
  }

  if (/^(?:read|show me|open|go to|take me to|get to|access)\s+(?:my\s+|today's\s+|todays\s+|the current\s+)?(?:daily\s+)?devotional\b/.test(value)
    || /^can you open my devotional\b/.test(value)) {
    return {
      intent: "DIRECT_ACTION",
      requestedCapability: "daily-devotional",
      requestedOperation: "READ",
      confidence: 0.99,
      clarificationRequired: false,
    };
  }

  if (/^(?:read|show me|open|go to|take me to|get to)\s+(?:today's|todays|the current)\s+(?:daily rhythm|rhythm)\b/.test(value)) {
    return {
      intent: "DIRECT_ACTION",
      requestedCapability: "daily-rhythm",
      requestedOperation: "READ",
      confidence: 0.99,
      clarificationRequired: false,
    };
  }

  if (/^(?:continue|resume)\s+(?:reading\s+)?my\s+bible\b/.test(value)) {
    return {
      intent: "BIBLE_CONTINUE",
      requestedCapability: "saved-bible-position",
      requestedOperation: "CONTINUE",
      confidence: 0.99,
      clarificationRequired: false,
    };
  }

  if (/^(?:continue|resume)\s+(?:my\s+)?walk\b/.test(value)
    || /^i want to continue my current walk\b/.test(value)) {
    return {
      intent: "DIRECT_ACTION",
      requestedCapability: "walks",
      requestedOperation: "CONTINUE",
      confidence: 0.99,
      clarificationRequired: false,
    };
  }

  if (/^(?:continue|resume)\s+(?:my\s+)?journey\b/.test(value)) {
    return {
      intent: "DIRECT_ACTION",
      requestedCapability: "journeys",
      requestedOperation: "CONTINUE",
      confidence: 0.99,
      clarificationRequired: false,
    };
  }

  if (/^(?:what have we preached|find|search|show me).*\b(?:sermon|sermons|preached|preaching)\b/.test(routingValue)
    || /^(?:show me|find|search for)\b.*\b(?:teaching|message|talk)\b.*\b(?:in|on)\b/.test(routingValue)
    || /^has .*\bpreached on\b/.test(routingValue)
    || /\bsermon archive\b/.test(routingValue)) {
    return {
      intent: "RESOURCE_SEARCH",
      requestedCapability: "sermons",
      requestedOperation: "FIND",
      resourceQuery: message.trim(),
      confidence: 0.96,
      clarificationRequired: false,
    };
  }

  if (/^(?:take me to|open|go to|show me|get me to)\s+(?:the\s+)?(?:my\s+)?bible\b/.test(value)) {
    return {
      intent: "DIRECT_ACTION",
      requestedCapability: "my-bible",
      requestedOperation: "OPEN",
      confidence: 0.99,
      clarificationRequired: false,
    };
  }

  if (/^(?:show me|find|search for|do we have anything in emmaus about|what resources can help me with|what resources can help me when)\b/.test(routingValue)
    || /^has .*\bpreached on\b/.test(routingValue)) {
    const study = /\bbible stud(?:y|ies)\b/.test(value);
    const pastoral = /\b(?:resources can help|anxious|afraid|lonely|grief|ashamed|overwhelmed)\b/.test(value);
    return {
      intent: "RESOURCE_SEARCH",
      requestedCapability: study ? "bible-studies" : pastoral ? "discover" : "discover",
      requestedOperation: "FIND",
      resourceQuery: message
        .replace(/^(?:please\s+)?(?:show me|find|search for)\s+/i, "")
        .replace(/^(?:a\s+)?bible stud(?:y|ies)\s+(?:about|on)\s+/i, "")
        .replace(/^.*?\babout\s+/i, "")
        .trim() || message.trim(),
      confidence: 0.9,
      clarificationRequired: false,
    };
  }

  if (/^(?:what journey|which journey|what walk)\b.*\b(?:busy with|doing|active|on)\b/.test(value)) {
    return {
      intent: "DIRECT_ACTION",
      requestedCapability: "active-progress",
      requestedOperation: "READ",
      confidence: 0.94,
      clarificationRequired: false,
    };
  }

  if (shared.mode === "READ" || shared.mode === "OPEN") {
    return {
      intent: "BIBLE_READ",
      requestedCapability: "my-bible",
      requestedOperation: shared.mode,
      bibleReference: shared.bibleRef,
      confidence: shared.bibleRef ? 0.99 : 0.88,
      clarificationRequired: !shared.bibleRef,
    };
  }

  if (/\b(?:afraid|anxious|anxiety|scared|lonely|grief|grieving|ashamed|guilty|overwhelmed|hurt|struggling)\b/.test(value)
    && !/^(?:what|why|how|where|who|explain)\b/.test(value)) {
    return {
      intent: "PASTORAL_QUESTION",
      confidence: 0.9,
      clarificationRequired: false,
    };
  }

  if (/^(?:what|why|how|when|who|explain|tell me about|help me understand)\b/.test(value)) {
    return {
      intent: "GENERAL_BIBLICAL_QUESTION",
      confidence: 0.86,
      clarificationRequired: false,
    };
  }

  return {
    intent: "AMBIGUOUS",
    confidence: 0.35,
    clarificationRequired: true,
  };
}

export function promptIntentMode(intent: TypedAskEmmausIntent): EmmausIntentMode {
  switch (intent.intent) {
    case "BIBLE_READ":
      return intent.requestedOperation === "OPEN" ? "OPEN" : "READ";
    case "RESOURCE_SEARCH":
      return "FIND";
    default:
      return "ASK";
  }
}