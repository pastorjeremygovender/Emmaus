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
  bibleReference?: ReturnType<typeof classifyEmmausIntent>["bibleRef"];
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

export function routeAskEmmausRequest(message: string): TypedAskEmmausIntent {
  const value = clean(message);
  const shared = classifyEmmausIntent(message);
  const capability = capabilityForText(value);

  if (/^what can (?:emmaus|you) (?:help me with|do)|^what can emmaus help me with/.test(value)) {
    return {
      intent: "APP_HELP",
      confidence: 0.99,
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

  if (/^(?:read|show me|open|go to|take me to)\s+(?:today's|todays|the current)\s+devotional\b/.test(value)) {
    return {
      intent: "DIRECT_ACTION",
      requestedCapability: "daily-devotional",
      requestedOperation: "READ",
      confidence: 0.99,
      clarificationRequired: false,
    };
  }

  if (/^(?:read|show me|open|go to|take me to)\s+(?:today's|todays|the current)\s+(?:daily rhythm|rhythm)\b/.test(value)) {
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

  if (/^(?:continue|resume)\s+(?:my\s+)?walk\b/.test(value)) {
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

  if (/^(?:what have we preached|find|search|show me).*\b(?:sermon|sermons|preached|preaching)\b/.test(value)
    || /\bsermon archive\b/.test(value)) {
    return {
      intent: "RESOURCE_SEARCH",
      requestedCapability: "sermons",
      requestedOperation: "FIND",
      resourceQuery: message.replace(/^(?:what have we preached|find|search|show me)\s+(?:about\s+)?/i, "").trim() || message.trim(),
      confidence: 0.96,
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