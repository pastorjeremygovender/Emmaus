/**
 * badge-api.ts — Client helpers for the Smart Content Indicators badge system.
 *
 * Dismiss a badge by calling this immediately before navigating to the content.
 * The call is fire-and-forget — don't await it in navigation handlers.
 */

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

export type Badge = 'NEW' | 'UPDATED' | null;
export type BadgeContentType = 'journey' | 'devotional' | 'companion';

/**
 * Mark this content as "seen" for the current user.
 * Sets last_opened_at on an existing progress record, clearing any UPDATED badge.
 * If no progress row exists (content not yet started) the call is a server-side
 * no-op — it never creates a progress row or changes enrollment state.
 * NEW badges clear automatically once the member starts the content via the
 * normal begin/enrollment flow.
 */
export async function dismissBadge(
  contentType: BadgeContentType,
  contentId: string,
): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/badges/dismiss`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType, contentId }),
    });
  } catch {
    // Non-fatal — badge will clear on next page load
  }
}

/**
 * Client-side badge computation for Today's Steps journey cards.
 * Today's Steps only shows UPDATED — never NEW.
 *
 * @param notifyPublishedAt — ISO string from FrontendJourney.notifyPublishedAt
 * @param lastOpenedAt      — ISO string from FrontendProgress.lastOpenedAt
 * @param hasProgress       — true when progress record exists
 */
export function computeUpdatedBadge(
  notifyPublishedAt: string | null | undefined,
  lastOpenedAt: string | null | undefined,
  hasProgress: boolean,
): 'UPDATED' | null {
  if (!notifyPublishedAt || !hasProgress) return null;
  const notifyAt = new Date(notifyPublishedAt);
  if (!lastOpenedAt) return 'UPDATED';
  return notifyAt > new Date(lastOpenedAt) ? 'UPDATED' : null;
}
