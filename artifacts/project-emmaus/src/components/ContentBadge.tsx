/**
 * ContentBadge — small NEW / UPDATED indicator badge.
 *
 * Renders absolutely at top-right of its nearest `relative` ancestor.
 * The parent card container must have `position: relative` (or `relative` class).
 *
 * Design rules:
 *   - Small, unobtrusive
 *   - No animation, no pulsing
 *   - Only one badge at a time (caller decides which to show)
 *   - null → renders nothing
 */

import type { Badge } from '@/lib/badge-api';

interface ContentBadgeProps {
  badge: Badge;
}

export function ContentBadge({ badge }: ContentBadgeProps) {
  if (!badge) return null;

  if (badge === 'NEW') {
    return (
      <span
        className="absolute top-3 right-3 z-10 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500 text-white select-none pointer-events-none"
        aria-label="New content"
      >
        New
      </span>
    );
  }

  // UPDATED
  return (
    <span
      className="absolute top-3 right-3 z-10 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-blue-500 text-white select-none pointer-events-none"
      aria-label="Updated content"
    >
      Updated
    </span>
  );
}
