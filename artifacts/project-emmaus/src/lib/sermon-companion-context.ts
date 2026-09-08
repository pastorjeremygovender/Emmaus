/**
 * sermon-companion-context.ts — lightweight module-level singleton that lets
 * Sermon Companion pages broadcast their current sermon identity to the global
 * FloatingEmmausButton without prop-drilling.
 *
 * Usage:
 *   // In SermonCompanionOverview / SermonCompanionReader, after data loads:
 *   setActiveSermonCompanionContext({ companionId, sermonId, sermonTitle, scriptureReference });
 *
 *   // In FloatingEmmausButton buildContext:
 *   const ctx = getActiveSermonCompanionContext();
 *
 *   // On unmount:
 *   setActiveSermonCompanionContext(null);
 */

export interface SermonCompanionCtx {
  companionId: string;
  sermonId?: string;
  sermonTitle?: string;
  scriptureReference?: string;
}

let _active: SermonCompanionCtx | null = null;

export function setActiveSermonCompanionContext(ctx: SermonCompanionCtx | null): void {
  _active = ctx;
}

export function getActiveSermonCompanionContext(): SermonCompanionCtx | null {
  return _active;
}
