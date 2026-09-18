/**
 * Emmaus Safety & Discernment Layer
 *
 * Scans incoming user messages for crisis signals BEFORE the LLM is called.
 * When triggered:
 *   - Returns a dedicated `safety_handover` response immediately
 *   - Skips the LLM entirely
 *   - Logs a safety flag (async, non-blocking)
 *
 * Crisis signals are intentionally broad to avoid missing genuine need.
 * False positives are acceptable — a gentle safety response does no harm.
 */

import type { ConversationStore } from "./firestore-model.js";

// ─── Crisis Signal Definitions ────────────────────────────────────────────────

interface CrisisSignal {
  keywords: string[];
  category: "self_harm" | "suicide" | "abuse" | "child_safeguarding" | "medical_emergency" | "domestic_violence";
  severity: "high" | "critical";
}

const CRISIS_SIGNALS: CrisisSignal[] = [
  {
    keywords: ["kill myself", "end my life", "want to die", "suicidal", "suicide", "take my life", "not worth living", "better off dead", "no reason to live"],
    category: "suicide",
    severity: "critical",
  },
  {
    keywords: ["self harm", "self-harm", "cutting myself", "hurting myself", "hurt myself"],
    category: "self_harm",
    severity: "critical",
  },
  {
    keywords: ["being abused", "he hits me", "she hits me", "hitting me", "beating me", "domestic violence", "abusing me"],
    category: "domestic_violence",
    severity: "critical",
  },
  {
    keywords: ["abusing a child", "child abuse", "child is being hurt", "someone hurting a child", "safeguarding"],
    category: "child_safeguarding",
    severity: "critical",
  },
  {
    keywords: ["having a heart attack", "chest pain", "can't breathe", "stroke", "emergency", "call an ambulance"],
    category: "medical_emergency",
    severity: "critical",
  },
  {
    keywords: ["sexually abused", "sexual abuse", "rape", "raped", "assaulted"],
    category: "abuse",
    severity: "critical",
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SafetyCheckResult {
  isSafe: boolean;
  triggeredCategory?: CrisisSignal["category"];
  triggeredKeywords?: string[];
  safetyResponse?: string;
}

// ─── Main Check ───────────────────────────────────────────────────────────────

/**
 * Keyword-only crisis check — no store required.
 * Use when a ConversationStore is not available (e.g., Room shared Ask Emmaus).
 * Flag logging is skipped; detection logic is identical to checkSafety.
 */
export function checkSafetyKeywordsOnly(message: string): SafetyCheckResult {
  const lc = message.toLowerCase();
  for (const signal of CRISIS_SIGNALS) {
    const matched = signal.keywords.filter(kw => lc.includes(kw));
    if (matched.length > 0) {
      return {
        isSafe: false,
        triggeredCategory: signal.category,
        triggeredKeywords: matched,
        safetyResponse: buildCrisisResponse(signal.category),
      };
    }
  }
  return { isSafe: true };
}

export function checkSafety(
  message: string,
  store: ConversationStore,
  opts: { userId: string; conversationId: string }
): SafetyCheckResult {
  const lc = message.toLowerCase();

  for (const signal of CRISIS_SIGNALS) {
    const matched = signal.keywords.filter(kw => lc.includes(kw));
    if (matched.length > 0) {
      // Log async — do not await, do not block the response
      void store.flagSafety({
        userId: opts.userId,
        conversationId: opts.conversationId,
        messageContent: message.substring(0, 500),
        triggerKeywords: matched,
        responseType: "crisis",
      });

      return {
        isSafe: false,
        triggeredCategory: signal.category,
        triggeredKeywords: matched,
        safetyResponse: buildCrisisResponse(signal.category),
      };
    }
  }

  return { isSafe: true };
}

// ─── Pastoral Handoff Check (softer) ─────────────────────────────────────────

const PASTORAL_SIGNALS = [
  "getting married", "marriage", "my marriage", "relationship breakdown",
  "want to be baptised", "baptism", "want to join the church", "membership",
  "want to serve", "serving role", "grief", "bereavement", "someone died",
  "addiction", "addicted to", "pornography", "alcohol problem",
];

export function checkPastoralHandoff(message: string): boolean {
  const lc = message.toLowerCase();
  return PASTORAL_SIGNALS.some(signal => lc.includes(signal));
}

// ─── Response Copy ────────────────────────────────────────────────────────────

function buildCrisisResponse(category: CrisisSignal["category"]): string {
  switch (category) {
    case "suicide":
    case "self_harm":
      return `What you've shared matters, and I'm glad you said something.

Please reach out for support right now. These services are here for you:

**Samaritans (UK):** Call or text **116 123** — available 24 hours a day, every day. Free and confidential.

**Crisis Text Line:** Text HELLO to **85258** — free, confidential, 24/7.

**If you're in immediate danger, please call 999 or go to your nearest A&E.**

You do not have to face this alone. Your pastor is also someone you can contact directly — they want to hear from you.`;

    case "domestic_violence":
      return `What you've shared is serious, and you were right to say it.

**National Domestic Abuse Helpline:** **0808 2000 247** — free, 24/7, confidential.

**If you are in immediate danger, call 999.**

You are not alone, and this is not your fault. Your pastor is also here and can connect you with support confidentially.`;

    case "child_safeguarding":
      return `If a child is being harmed or is at risk, please act now.

**NSPCC Helpline:** **0808 800 5000** — 24 hours, free and confidential.

**If a child is in immediate danger, call 999.**

Please do not wait. Every child deserves to be safe.`;

    case "abuse":
      return `What you've shared takes courage to say.

**Rape Crisis (England & Wales):** **0808 500 2222** — free, confidential.

**If you are in immediate danger, call 999.**

You are not alone. Your pastor can also connect you with confidential support.`;

    case "medical_emergency":
      return `If this is a medical emergency, please call **999** immediately or ask someone near you to help.

Do not wait.`;

    default:
      return `What you've shared is important. Please reach out to someone who can help right now.

**Samaritans:** **116 123** — 24 hours, free and confidential.

**If you are in immediate danger, call 999.**

Your pastor is also someone who wants to hear from you.`;
  }
}
