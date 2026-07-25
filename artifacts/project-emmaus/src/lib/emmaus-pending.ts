/**
 * Emmaus Pending Message Store
 *
 * Holds an in-memory message and context to hand off from the Ask Emmaus
 * home screen to the conversation screen without URL params.
 *
 * Two separate stores:
 *   1. pendingMessage + pendingContext — set by AskEmmausHome when the user
 *      submits their question; consumed by AskEmmausConversation on mount.
 *   2. pendingFabContext — set by FloatingEmmausButton before navigating to
 *      AskEmmausHome; consumed by AskEmmausHome on mount to show a context label.
 *
 * Return destination is stored in sessionStorage (not in-memory) so it
 * survives the Home → Conversation navigation and lets Conversation's back
 * button jump directly to the originating page.
 */

import type { FlatContext } from './emmaus-client';

// ─── In-memory message + context (Home → Conversation) ───────────────────────

let pendingMessage: string | null = null;
let pendingContext: FlatContext | null = null;
let pendingFabContext: FlatContext | null = null;

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
 * The return destination is written to sessionStorage separately via
 * setReturnDestination so it persists through the Home → Conversation step.
 */
export function setPendingContext(context: FlatContext): void {
  pendingFabContext = context;
}

/**
 * Called by AskEmmausHome on mount. Reads and clears the FAB context.
 * Returns null if the user arrived via the Personal tab (no FAB context).
 */
export function takePendingContext(): { context: FlatContext } | null {
  if (!pendingFabContext) return null;
  const result = { context: pendingFabContext };
  pendingFabContext = null;
  return result;
}

// ─── Return destination (sessionStorage) ─────────────────────────────────────

const RETURN_KEY = 'emmaus_return_destination';

export type SourceSection = 'walk' | 'bible' | 'journeys' | 'personal';

export interface ReturnDestination {
  /** The full pathname to navigate back to. */
  pathname: string;
  /** Approximate vertical scroll position at time of leaving. */
  scrollY: number;
  /** Which bottom-nav section was active (for nav highlighting while in Ask Emmaus). */
  sourceSection: SourceSection;
}

/** Derive source section from a pathname. */
export function sourceSectionFromPath(pathname: string): SourceSection {
  if (pathname === '/walk') return 'walk';
  if (pathname.startsWith('/bible')) return 'bible';
  if (pathname === '/journeys' || pathname.startsWith('/journey/')) return 'journeys';
  return 'personal';
}

/** Write the return destination. Called by FloatingEmmausButton before navigating. */
export function setReturnDestination(dest: ReturnDestination): void {
  try {
    sessionStorage.setItem(RETURN_KEY, JSON.stringify(dest));
  } catch {
    // sessionStorage unavailable — silently ignore; fallback will apply
  }
}

/** Read the return destination. Returns null if none is stored. */
export function getReturnDestination(): ReturnDestination | null {
  try {
    const raw = sessionStorage.getItem(RETURN_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ReturnDestination;
  } catch {
    return null;
  }
}

/** Remove the stored destination once the user has navigated back. */
export function clearReturnDestination(): void {
  try {
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // ignore
  }
}
