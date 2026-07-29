/**
 * EmmausCompletionCard — the ONE canonical completion component for Project Emmaus.
 *
 * ═══ DESIGN IS LOCKED ════════════════════════════════════════════════════════════
 * The approved design (soft teal/blue background, centred green success icon,
 * rounded corners, generous white space, calm minimalist appearance) must never
 * be changed. Only the heading text, supporting sentence, and button destination
 * may differ between content types.
 *
 * Do NOT:
 *   • Redesign or replace the teal card.
 *   • Add secondary buttons, progress bars, achievements, streaks, or confetti.
 *   • Use productivity or gamification language ("Great job!", "You did it!", XP, etc.).
 *   • Create a separate completion layout on any page.
 * ═════════════════════════════════════════════════════════════════════════════════
 *
 * Usage — inline (reading pages):
 *   <EmmausCompletionCard
 *     heading="Today's time with Jesus is complete."
 *     subMessage="We'll continue walking together tomorrow."
 *     returnLabel="Back to Today's Steps"
 *     onReturn={() => setLocation('/walk')}
 *   />
 *
 * Usage — full screen (journey completion after final step):
 *   <EmmausCompletionCard
 *     heading="Journey complete."
 *     subMessage="May the Lord continue His work in your heart today."
 *     returnLabel="Back to Next Steps"
 *     onReturn={() => setLocation('/journeys')}
 *     fullScreen
 *   />
 *
 * Heading examples (from spec):
 *   "Today's time with Jesus is complete."
 *   "Day 2 complete."
 *   "Journey complete."
 *   "Companion complete."
 *   "Devotional complete."
 *
 * Supporting sentence tone: warm, gentle, pastoral — never productivity language.
 *   "We'll continue walking together tomorrow."
 *   "Tomorrow's reading will be ready."
 *   "May the Lord continue His work in your heart today."
 *
 * Button destinations (spec):
 *   10 Minutes with Jesus   → "Back to Today's Steps" → /walk
 *   Daily Devotional        → "Back to Next Steps"    → /journeys
 *   Journey                 → "Back to Next Steps"    → /journeys
 *   Sermon Companion        → "Back to Next Steps"    → /journeys
 *   Bible Study             → "Back to Next Steps"    → /journeys
 */

import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmmausCompletionCardProps {
  /** Short completion heading. E.g. "Day 5 complete." or "Journey complete." */
  heading: string;
  /** One gentle pastoral sentence. Optional — omit for final days where no "next" exists. */
  subMessage?: string;
  /** Button label. E.g. "Back to Today's Steps" or "Back to Next Steps". */
  returnLabel: string;
  /** Navigation callback fired when the primary button is tapped. */
  onReturn: () => void;
  /**
   * When provided, renders a "See Previous Days →" secondary link beneath
   * the primary button. Only supply this when previous completed days exist.
   * Platform standard: every sequential content type supports previous-day review.
   */
  onPreviousDays?: () => void;
  /**
   * When true the card is centred in a full-screen container (for post-reading
   * completion screens in JourneyDay). When false (default) it renders as an
   * inline card suitable for use inside a reading page's action-button area.
   */
  fullScreen?: boolean;
  /** Extra classes applied to the outer card wrapper. */
  className?: string;
}

function CompletionCardInner({
  heading,
  subMessage,
  returnLabel,
  onReturn,
  onPreviousDays,
  className = '',
}: Pick<EmmausCompletionCardProps, 'heading' | 'subMessage' | 'returnLabel' | 'onReturn' | 'onPreviousDays' | 'className'>) {
  return (
    <div
      className={`bg-teal-50 border border-teal-200 rounded-2xl px-5 py-6 text-center space-y-4 ${className}`}
    >
      {/* Green success icon — locked, do not change colour or size */}
      <CheckCircle2 size={28} className="text-green-500 mx-auto" />

      {/* Heading */}
      <p className="text-[16px] font-medium text-teal-900 leading-snug">
        {heading}
      </p>

      {/* Pastoral supporting sentence — optional */}
      {subMessage && (
        <p className="text-[13px] text-teal-700 leading-relaxed">
          {subMessage}
        </p>
      )}

      {/* Primary return button — locked, do not change to outline or ghost */}
      <Button
        className="w-full rounded-xl h-11 text-[15px]"
        onClick={onReturn}
      >
        {returnLabel}
      </Button>

      {/* Secondary link — "See Previous Days →" (platform standard) */}
      {onPreviousDays && (
        <button
          onClick={onPreviousDays}
          className="text-[13px] text-teal-600 font-medium hover:text-teal-800 transition-colors"
        >
          See Previous Days →
        </button>
      )}
    </div>
  );
}

export function EmmausCompletionCard({
  heading,
  subMessage,
  returnLabel,
  onReturn,
  onPreviousDays,
  fullScreen = false,
  className = '',
}: EmmausCompletionCardProps) {
  if (fullScreen) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background px-6">
        <div className="w-full max-w-[360px]">
          <CompletionCardInner
            heading={heading}
            subMessage={subMessage}
            returnLabel={returnLabel}
            onReturn={onReturn}
            onPreviousDays={onPreviousDays}
            className={className}
          />
        </div>
      </div>
    );
  }

  return (
    <CompletionCardInner
      heading={heading}
      subMessage={subMessage}
      returnLabel={returnLabel}
      onReturn={onReturn}
      onPreviousDays={onPreviousDays}
      className={className}
    />
  );
}
