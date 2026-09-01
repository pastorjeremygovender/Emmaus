/**
 * PreviousDaysScreen — shared "See Previous Days" UI for ALL sequential content types.
 *
 * ═══ PLATFORM STANDARD ════════════════════════════════════════════════════════
 * "See Previous Days" is a platform feature, not a Daily Rhythm feature.
 * Every sequential content type in Emmaus (10 Minutes with Jesus, Daily Devotionals,
 * Sermon Companions, Journeys, future courses) uses this single component.
 * Do NOT create a per-content-type previous days screen.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Behaviour rules:
 *   • Completed and elapsed available days show a "Review →" action.
 *   • Current / future days show a status badge without a review link.
 *   • Review is always read-only — the reading page is responsible for
 *     never advancing progress when opened in replay mode.
 *   • The back button returns to the screen the member came from (onBack).
 *
 * Props:
 *   contentTitle  — e.g. "10 Minutes with Jesus", "Psalms of Comfort"
 *   entries       — list of PreviousDayEntry objects (caller provides them)
 *   loading       — shows a spinner while data loads
 *   onBack        — called when the back arrow is tapped
 *   onReviewDay   — called with dayNumber when "Review →" is tapped
 *   backLabel     — label shown next to the back chevron, default "Back"
 */

import React from 'react';
import { ArrowLeft, CheckCircle2, ChevronRight, Lock } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PreviousDayEntry {
  dayNumber: number;
  /** Title of the day/step — used as the primary row text. */
  title: string;
  /** Optional sub-text, e.g. scripture reference or series name. */
  subtitle?: string;
  /**
   * Optional override for the eyebrow label above the title.
   * Defaults to "Day {dayNumber}". Use e.g. "WELCOME", "STEP 1", "WALK COMPLETE".
   */
  label?: string;
  /**
   * 'completed' — member has completed this day; shows "Review →" action.
   * 'available' — elapsed day is available to review but unfinished.
   * 'current'   — today's in-progress or latest available day.
   * 'locked'    — not yet available; shown but not tappable.
   */
  status: 'completed' | 'available' | 'current' | 'locked';
}

interface PreviousDaysScreenProps {
  /** Name of the content this list belongs to, e.g. "10 Minutes with Jesus". */
  contentTitle: string;
  /** Ordered list of entries to display (typically sorted most-recent first). */
  entries: PreviousDayEntry[];
  loading?: boolean;
  onBack: () => void;
  onReviewDay: (dayNumber: number) => void;
  /**
   * Called when the user taps "Continue →" on a 'current' entry.
   * When provided, current entries show a "Continue →" button.
   */
  onContinueDay?: (dayNumber: number) => void;
  /** Text next to the back arrow. Default: "Back". */
  backLabel?: string;
  /** Custom empty-state message. */
  emptyMessage?: string;
  /**
   * Subtitle shown in the page header, below contentTitle.
   * Default: "Previous Days".
   */
  screenTitle?: string;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PreviousDayEntry['status'] }) {
  if (status === 'completed') {
    return (
      <span className="flex items-center gap-1 text-[12px] font-medium text-green-600">
        <CheckCircle2 size={13} />
        Completed
      </span>
    );
  }
  if (status === 'available') {
    return (
      <span className="text-[12px] font-medium text-primary">
        Available to review
      </span>
    );
  }
  if (status === 'current') {
    return (
      <span className="text-[12px] font-medium text-primary">
        In Progress
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[12px] text-muted-foreground/70">
      <Lock size={12} />
      Locked
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PreviousDaysScreen({
  contentTitle,
  entries,
  loading = false,
  onBack,
  onReviewDay,
  onContinueDay,
  backLabel = 'Back',
  emptyMessage = 'No previous days are available yet.',
  screenTitle = 'Previous Days',
}: PreviousDaysScreenProps) {
  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">

      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto">
          <button
            onClick={onBack}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={backLabel}
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 min-w-0 text-center px-3">
            <div className="font-medium text-sm text-foreground leading-tight truncate">
              {contentTitle}
            </div>
            <div className="text-[12px] text-muted-foreground">{screenTitle}</div>
          </div>
          {/* Spacer balances the back arrow */}
          <div className="min-w-[44px]" />
        </div>
      </header>

      <main className="px-5 pt-4 max-w-[480px] mx-auto">

        {entries.length === 0 ? (

          /* ── Empty state ──────────────────────────────────────────────── */
          <div className="text-center space-y-5 mt-20">
            <p className="text-[15px] text-muted-foreground">{emptyMessage}</p>
            <Button
              variant="outline"
              className="rounded-xl px-8"
              onClick={onBack}
            >
              {backLabel}
            </Button>
          </div>

        ) : (

          /* ── Day list ─────────────────────────────────────────────────── */
          <div className="divide-y divide-border/50">
            {entries.map(entry => {
              const isReviewable = entry.status === 'completed' || entry.status === 'available';
              const isContinuable = entry.status === 'current' && !!onContinueDay;
              const eyebrow = entry.label ?? `Day ${entry.dayNumber}`;
              return (
                <div
                  key={entry.dayNumber}
                  className="py-4 px-1"
                >
                  <div className="flex items-center justify-between gap-3">
                    {/* Left: day info */}
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">
                        {eyebrow}
                      </div>
                      <div className="text-[15px] font-medium text-foreground leading-snug truncate">
                        {entry.title}
                      </div>
                      {entry.subtitle && (
                        <div className="text-[12px] text-muted-foreground mt-0.5 truncate">
                          {entry.subtitle}
                        </div>
                      )}
                      <div className="mt-1.5">
                        <StatusBadge status={entry.status} />
                      </div>
                    </div>

                    {/* Right: action button */}
                    {isReviewable ? (
                      <button
                        onClick={() => onReviewDay(entry.dayNumber)}
                        className="flex items-center gap-1 text-[14px] font-medium text-primary hover:text-primary/80 transition-colors flex-shrink-0"
                        data-testid={`review-day-${entry.dayNumber}`}
                      >
                        Review
                        <ChevronRight size={16} />
                      </button>
                    ) : isContinuable ? (
                      <button
                        onClick={() => onContinueDay!(entry.dayNumber)}
                        className="flex items-center gap-1 text-[14px] font-medium text-primary hover:text-primary/80 transition-colors flex-shrink-0"
                        data-testid={`continue-day-${entry.dayNumber}`}
                      >
                        Continue
                        <ChevronRight size={16} />
                      </button>
                    ) : (
                      /* Locked / no-action — placeholder keeps layout aligned */
                      <div className="w-[70px]" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        )}
      </main>

      <BottomNav />
    </div>
  );
}
