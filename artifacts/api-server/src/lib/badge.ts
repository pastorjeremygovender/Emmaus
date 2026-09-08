/**
 * badge.ts — Shared badge computation for Smart New Content Indicators.
 *
 * Rules:
 *   🟢 NEW     — notify_published_at within last 7 days AND user has no progress
 *   🔵 UPDATED — user has progress AND notify_published_at > last_opened_at
 *   null       — no badge (notify_published_at not set, or user already seen update)
 *
 * UPDATED overrides NEW (if user has progress, only UPDATED is ever returned).
 */

export type Badge = 'NEW' | 'UPDATED' | null;

const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Compute the badge to display for a piece of content.
 *
 * @param notifyPublishedAt — when the admin last opted-in to notify members (null = never)
 * @param lastOpenedAt      — when this member last opened the content (null = never)
 * @param hasProgress       — true if the member has any progress record for this content
 */
export function computeBadge(
  notifyPublishedAt: Date | string | null | undefined,
  lastOpenedAt: Date | string | null | undefined,
  hasProgress: boolean,
): Badge {
  if (!notifyPublishedAt) return null;

  const notifyAt = typeof notifyPublishedAt === 'string'
    ? new Date(notifyPublishedAt)
    : notifyPublishedAt;

  if (hasProgress) {
    // UPDATED: member has opened this before — show badge if notified after their last open.
    if (!lastOpenedAt) return 'UPDATED'; // started but never opened since notify was set
    const openedAt = typeof lastOpenedAt === 'string'
      ? new Date(lastOpenedAt)
      : lastOpenedAt;
    return notifyAt > openedAt ? 'UPDATED' : null;
  } else {
    // NEW: member has never started — show badge if notified within 7-day window.
    const now = Date.now();
    return (now - notifyAt.getTime()) <= NEW_WINDOW_MS ? 'NEW' : null;
  }
}
