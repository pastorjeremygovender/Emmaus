/**
 * Emmaus Pending Message Store
 *
 * Holds an in-memory message and context to hand off from the Ask Emmaus
 * home screen to the conversation screen without URL params or sessionStorage.
 *
 * Two separate stores:
 *   1. pendingMessage + pendingContext — set by AskEmmausHome when the user
 *      submits their question; consumed by AskEmmausConversation on mount.
 *   2. pendingFabContext — set by FloatingEmmausButton before navigating to
 *      AskEmmausHome; consumed by AskEmmausHome on mount to show a context label.
 *
 * Usage (FAB path):
 *   FAB: setPendingContext({ entryPoint: 'bible', bookId: 'john', chapter: 3 })
 *        navigate('/personal/ask-emmaus')
 *   Home: const ctx = takePendingContext(); // reads and clears; show label
 *
 * Usage (submit path):
 *   Home: setPendingMessage("I feel far from God", { entryPoint: "personal" })
 *         navigate("/personal/ask-emmaus/conversation")
 *   Conv: const pending = takePendingMessage(); // reads and clears
 */

import type { FlatContext } from './emmaus-client';

let pendingMessage: string | null = null;
let pendingContext: FlatContext | null = null;
let pendingFabContext: FlatContext | null = null;
let pendingReturnPath: string | null = null;

// ─── Message + context (Home → Conversation) ─────────────────────────────────

export function setPendingMessage(message: string, context?: FlatContext): void {
  pendingMessage = message;
  pendingContext = context ?? null;
}

export function takePendingMessage(): { message: string; context?: FlatContext } | null {
  if (!pendingMessage) return null;
  const result: { message: string; context?: FlatContext } = { message: pendingMessage };
  if (pendingContext) result.context = pendingContext;
  pendingMessage = null;
  pendingContext = null;
  return result;
}

export function hasPendingMessage(): boolean {
  return pendingMessage !== null;
}

// ─── FAB context (FloatingEmmausButton → AskEmmausHome) ──────────────────────

/**
 * Called by FloatingEmmausButton before navigating to /personal/ask-emmaus.
 * Pass the current route as `returnPath` so AskEmmausHome can navigate back.
 */
export function setPendingContext(context: FlatContext, returnPath?: string): void {
  pendingFabContext = context;
  pendingReturnPath = returnPath ?? null;
}

/**
 * Called by AskEmmausHome on mount. Reads and clears the FAB context.
 * Returns null if the user arrived via Personal tab (no FAB context).
 */
export function takePendingContext(): { context: FlatContext; returnPath: string | null } | null {
  if (!pendingFabContext) return null;
  const result = { context: pendingFabContext, returnPath: pendingReturnPath };
  pendingFabContext = null;
  pendingReturnPath = null;
  return result;
}
