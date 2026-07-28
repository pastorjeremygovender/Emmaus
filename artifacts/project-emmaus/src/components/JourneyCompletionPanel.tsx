/**
 * JourneyCompletionPanel — shared completion panel for all journey/devotional types.
 *
 * Visual source of truth: the inline panel inside SermonCompanionReader.
 * Used by:
 *   - DailyRhythmDay.tsx    (10 Minutes with Jesus)
 *   - DevotionalDay.tsx     (Daily Devotionals)
 *   - SermonCompanionReader.tsx
 *
 * Props:
 *   heading       — "Day 7 complete" / "Journey complete" / "Today's devotional complete"
 *   subMessage    — "Come back tomorrow for Day 8." / left out on final day
 *   returnLabel   — "Back to Today's Steps" / "Back to Next Steps"
 *   onReturn      — navigation callback
 *   className     — optional extra classes on the outer div
 */

import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface JourneyCompletionPanelProps {
  heading: string;
  subMessage?: string;
  returnLabel: string;
  onReturn: () => void;
  className?: string;
}

export function JourneyCompletionPanel({
  heading,
  subMessage,
  returnLabel,
  onReturn,
  className = '',
}: JourneyCompletionPanelProps) {
  return (
    <div
      className={`bg-teal-50 border border-teal-200 rounded-2xl px-5 py-4 text-center space-y-3 ${className}`}
    >
      <CheckCircle2 size={20} className="text-teal-600 mx-auto" />
      <p className="text-sm font-medium text-teal-800">{heading}</p>
      {subMessage && (
        <p className="text-xs text-teal-600">{subMessage}</p>
      )}
      <Button
        variant="outline"
        size="sm"
        className="rounded-xl border-teal-300 text-teal-700 hover:bg-teal-100"
        onClick={onReturn}
      >
        {returnLabel}
      </Button>
    </div>
  );
}
