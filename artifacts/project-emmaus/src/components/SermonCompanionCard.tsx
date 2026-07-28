/**
 * SermonCompanionCard — shared layout used on both the Walk home screen
 * ("This Week's Sermon Devotional") and the Next Steps / Sermons tab
 * (current + previous companions).
 *
 * Every instance uses identical typography, spacing, and button sizing.
 * The only variation between cards is the data passed in.
 */

import { Button } from '@/components/ui/button';
import { Mic2 } from 'lucide-react';

const DEFAULT_DESCRIPTION = "Five short weekday devotionals based on Sunday's sermon.";

interface SermonCompanionCardProps {
  title: string;
  /** One-sentence description. Falls back to a pastoral default when absent. */
  description?: string;
  /** Number of days — shown as metadata beneath the description. */
  durationDays?: number;
  /** "Open Companion" (not started) | "Continue" (in progress) | "Review" (completed) */
  primaryActionLabel: string;
  onAction: () => void;
}

export function SermonCompanionCard({
  title,
  description,
  durationDays,
  primaryActionLabel,
  onAction,
}: SermonCompanionCardProps) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
      <div className="space-y-2">

        {/* ── Label ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5">
          <Mic2 size={12} className="text-primary shrink-0" />
          <p className="text-[11px] font-semibold text-primary uppercase tracking-widest">
            Sermon Companion
          </p>
        </div>

        {/* ── Title ─────────────────────────────────────────────────────── */}
        <p className="text-[17px] font-medium text-foreground leading-snug">
          {title}
        </p>

        {/* ── Description ───────────────────────────────────────────────── */}
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          {description ?? DEFAULT_DESCRIPTION}
        </p>

        {/* ── Metadata ──────────────────────────────────────────────────── */}
        {durationDays != null && durationDays > 0 && (
          <p className="text-[12px] text-muted-foreground font-medium">
            {durationDays} Days
          </p>
        )}

      </div>

      {/* ── Primary action ────────────────────────────────────────────────── */}
      <Button
        className="w-full h-11 rounded-xl text-[15px]"
        onClick={onAction}
      >
        {primaryActionLabel}
      </Button>
    </div>
  );
}
