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
 *   • Add progress bars, achievements, streaks, or confetti.
 *   • Use productivity or gamification language ("Great job!", "You did it!", XP, etc.).
 *   • Create a separate completion layout on any page.
 * ═════════════════════════════════════════════════════════════════════════════════
 *
 * Self-paced content (Devotionals, Sermon Companions, Journeys):
 *   When `onContinue` + `continueLabel` are supplied, Continue becomes the primary
 *   action and `returnLabel` / `onReturn` render as a secondary text link below.
 *   This preserves the locked card design while offering the Emmaus Invitation
 *   Principle: "Continue when you're ready."
 *
 * Usage — self-paced with next entry available:
 *   <EmmausCompletionCard
 *     heading="Day 2 complete."
 *     subMessage="Continue when you're ready."
 *     continueLabel="Continue to Next Devotional"
 *     onContinue={() => setLocation('/devotional/series/day/3?source=today')}
 *     returnLabel="Back to Next Steps"
 *     onReturn={() => setLocation('/journeys')}
 *     previousDaysLabel="View Previous Entries →"
 *     onPreviousDays={() => setLocation('/devotional/series/previous')}
 *   />
 *
 * Usage — series complete / no next entry:
 *   <EmmausCompletionCard
 *     heading="Devotional complete."
 *     subMessage="May the Lord continue His work in your heart today."
 *     returnLabel="Back to Next Steps"
 *     onReturn={() => setLocation('/journeys')}
 *   />
 *
 * Usage — full screen (journey final-step completion):
 *   <EmmausCompletionCard
 *     fullScreen
 *     heading="Journey complete."
 *     subMessage="May the Lord continue His work in your heart today."
 *     returnLabel="Back to Next Steps"
 *     onReturn={() => setLocation('/journeys')}
 *   />
 */

import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmmausCompletionCardProps {
  /** Short completion heading. E.g. "Day 5 complete." or "Journey complete." */
  heading: string;
  /** One gentle pastoral sentence. Optional — omit for final days where no "next" exists. */
  subMessage?: string;
  /** Button label for the primary return action. */
  returnLabel: string;
  /** Navigation callback fired when the return button/link is tapped. */
  onReturn: () => void;
  /**
   * When provided together with `continueLabel`, renders a "Continue to Next…"
   * primary button. `onReturn` then becomes a secondary text link.
   * Self-paced content only — do NOT supply for Daily Rhythm.
   */
  onContinue?: () => void;
  /** Label for the Continue primary button (e.g. "Continue to Next Devotional"). */
  continueLabel?: string;
  /**
   * When provided, renders a previous-entries secondary link beneath the action buttons.
   * Supply only when completed entries exist.
   */
  onPreviousDays?: () => void;
  /**
   * Label for the previous-entries link.
   * Defaults to "See Previous Days →".
   * Use content-appropriate wording:
   *   Daily Rhythm:       "See Previous Days →"
   *   Daily Devotional:   "View Previous Entries →"
   *   Sermon Companion:   "View Previous Reflections →"
   *   Journey:            "View Previous Steps →"
   */
  previousDaysLabel?: string;
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
  onContinue,
  continueLabel,
  onPreviousDays,
  previousDaysLabel = 'See Previous Days →',
  className = '',
}: Pick<EmmausCompletionCardProps,
  'heading' | 'subMessage' | 'returnLabel' | 'onReturn' |
  'onContinue' | 'continueLabel' | 'onPreviousDays' | 'previousDaysLabel' | 'className'
>) {
  const hasContinue = !!onContinue && !!continueLabel;

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

      {/* Primary action — Continue when available, otherwise Return */}
      {hasContinue ? (
        <Button
          className="w-full rounded-xl h-11 text-[15px]"
          onClick={onContinue}
        >
          {continueLabel}
        </Button>
      ) : (
        <Button
          className="w-full rounded-xl h-11 text-[15px]"
          onClick={onReturn}
        >
          {returnLabel}
        </Button>
      )}

      {/* Secondary links — shown below the primary action */}
      {(hasContinue || onPreviousDays) && (
        <div className="flex flex-col items-center gap-2 pt-0.5">
          {/* When Continue is primary, Back becomes a secondary link */}
          {hasContinue && (
            <button
              onClick={onReturn}
              className="text-[13px] text-teal-600 font-medium hover:text-teal-800 transition-colors"
            >
              {returnLabel}
            </button>
          )}
          {onPreviousDays && (
            <button
              onClick={onPreviousDays}
              className="text-[13px] text-teal-600 font-medium hover:text-teal-800 transition-colors"
            >
              {previousDaysLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function EmmausCompletionCard({
  heading,
  subMessage,
  returnLabel,
  onReturn,
  onContinue,
  continueLabel,
  onPreviousDays,
  previousDaysLabel,
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
            onContinue={onContinue}
            continueLabel={continueLabel}
            onPreviousDays={onPreviousDays}
            previousDaysLabel={previousDaysLabel}
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
      onContinue={onContinue}
      continueLabel={continueLabel}
      onPreviousDays={onPreviousDays}
      previousDaysLabel={previousDaysLabel}
      className={className}
    />
  );
}
