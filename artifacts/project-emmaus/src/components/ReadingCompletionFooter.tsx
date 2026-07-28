/**
 * ReadingCompletionFooter — shared completion / replay ending for reading screens.
 *
 * Used by:
 *   - DailyRhythmDay.tsx   (10 Minutes with Jesus)
 *   - DevotionalDay.tsx    (Daily Devotionals)
 *
 * Two modes:
 *   completed  — first-time or same-day revisit; shows confirmation text + link.
 *   replay     — older completed day opened from Previous Days; shows link only.
 *
 * Visual source of truth: Daily Devotional completion styling.
 *   - centred text
 *   - understated teal text action
 *   - generous vertical padding
 *   - no large buttons, no confetti, no badges
 */

import React from 'react';

interface ReadingCompletionFooterProps {
  /** When true the member has just completed (or is reviewing) today's entry.
   *  When false this is an older replay entry — show the link only. */
  completedToday?: boolean;
  /** Called when "Back to Today's Steps" is tapped. */
  onReturn: () => void;
}

export function ReadingCompletionFooter({
  completedToday = true,
  onReturn,
}: ReadingCompletionFooterProps) {
  return (
    <div className="w-full text-center py-4 space-y-1">
      {completedToday && (
        <p className="text-sm text-muted-foreground">
          You've completed today's reading.
        </p>
      )}
      <button
        onClick={onReturn}
        className="text-sm text-primary font-medium hover:underline"
      >
        Back to Today's Steps
      </button>
    </div>
  );
}
