/**
 * Emmaus Pending Message Store
 *
 * Holds an in-memory message and context to hand off from the Ask Emmaus
 * home screen to the conversation screen without URL params or sessionStorage.
 *
 * Usage:
 *   Home: setPendingMessage("I feel far from God", { entryPoint: "personal" })
 *         navigate("/personal/ask-emmaus/conversation")
 *   Conv: const pending = takePendingMessage(); // reads and clears
 */

import type { FlatContext } from './emmaus-client';

let pendingMessage: string | null = null;
let pendingContext: FlatContext | null = null;

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
