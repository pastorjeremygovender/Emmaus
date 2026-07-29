/**
 * EmmausContentCard — the single universal content card for Project Emmaus.
 *
 * Every member-facing content card (Daily Rhythm, Daily Devotionals, Journeys,
 * Sermon Companions, Bible Studies, Future Courses) renders with this component.
 *
 * Structure (always in this order):
 *   1. Category label  — uppercase, Emmaus green
 *   2. Title           — semibold, max 2 lines
 *   3. Description     — one sentence, muted
 *   4. Metadata        — small muted text (e.g. "5 Days", "Day 3")
 *   5. Primary button  — full-width, green
 *
 * Spacing tokens (spec-locked):
 *   Label → 12px → Title → 8px → Description → 12px → Metadata → 20px → Button
 *
 * Never change the internal spacing or typography without a corresponding spec update.
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

// ─── Design tokens (change here to propagate everywhere) ──────────────────────

const T = {
  label:       'text-[11px] font-semibold text-primary uppercase tracking-widest',
  title:       'text-[17px] font-semibold text-foreground leading-snug line-clamp-2',
  description: 'text-[13px] text-muted-foreground leading-relaxed',
  metadata:    'text-[12px] text-muted-foreground font-medium',
  button:      'w-full h-11 rounded-xl text-[15px] font-medium',
} as const;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface EmmausContentCardProps {
  /** Uppercase category label — "DAILY RHYTHM", "JOURNEY", "SERMON COMPANION" etc. */
  label: string;
  /** Main content title — max 2 lines, never an AI-generated subtitle. */
  title: string;
  /** One sentence (≤25 words) describing what the member will experience. */
  description?: string;
  /** Small muted metadata — "5 Days", "Day 3", "7 Days · Beginner". */
  metadata?: string;
  /**
   * Primary action button label — use Emmaus language (Open / Continue / Review).
   * Omit to suppress the button entirely (e.g. completed state with no next action).
   */
  primaryActionLabel?: string;
  onAction?: () => void;
  /** Disable the primary button without removing it. */
  disabled?: boolean;
  /** Show a spinner inside the button while an async action fires. */
  loading?: boolean;
  /**
   * Optional element shown at the trailing end of the label row.
   * Use for completion checkmarks, more-menus, or other contextual controls.
   */
  headerTrailing?: React.ReactNode;
  /**
   * 0-100 — renders a thin progress bar between metadata and button,
   * useful for in-progress journeys.
   */
  progressPercent?: number;
  /**
   * When set, replaces the primary button with this gated message button.
   * Pair with onGate to handle the tap.
   */
  gatedMessage?: string;
  onGate?: () => void;
  /** Optional text link shown below the primary button. */
  secondaryAction?: { label: string; onPress: () => void };
  /**
   * 'featured' — subtle primary tint (bg-primary/5 border-primary/20).
   * Use for the highest-priority card on the home screen.
   * Default: plain bg-card border-border.
   */
  variant?: 'default' | 'featured';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EmmausContentCard({
  label,
  title,
  description,
  metadata,
  primaryActionLabel,
  onAction,
  disabled = false,
  loading = false,
  headerTrailing,
  progressPercent,
  gatedMessage,
  onGate,
  secondaryAction,
  variant = 'default',
}: EmmausContentCardProps) {
  const cardClass = variant === 'featured'
    ? 'rounded-2xl border p-5 bg-primary/5 border-primary/20'
    : 'rounded-2xl border p-5 bg-card border-border';

  // ── Spacing: Label→12px→Title→8px→Desc→12px→Meta→20px→Button ────────────────
  // Each element carries its own bottom margin so omitting an element doesn't
  // leave a gap. The last visible element before the button always uses mb-5.
  // When there is no button, mb-5 is replaced with mb-0 — the card's own p-5
  // padding provides the bottom breathing room.

  const hasButton = !!(primaryActionLabel || gatedMessage);

  const titleMb = description
    ? 'mb-2'
    : metadata != null
      ? 'mb-3'
      : progressPercent != null
        ? 'mb-3'
        : hasButton ? 'mb-5' : 'mb-0';

  const descMb = metadata != null
    ? 'mb-3'
    : progressPercent != null
      ? 'mb-3'
      : hasButton ? 'mb-5' : 'mb-0';

  const metaMb = progressPercent != null ? 'mb-3' : hasButton ? 'mb-5' : 'mb-0';

  return (
    <div className={cardClass}>

      {/* ── 1. Label row ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className={T.label}>{label}</p>
        {headerTrailing}
      </div>

      {/* ── 2. Title ───────────────────────────────────────────────────────── */}
      <p className={`${T.title} ${titleMb}`}>{title}</p>

      {/* ── 3. Description ─────────────────────────────────────────────────── */}
      {description != null && (
        <p className={`${T.description} ${descMb}`}>{description}</p>
      )}

      {/* ── 4. Metadata ────────────────────────────────────────────────────── */}
      {metadata != null && (
        <p className={`${T.metadata} ${metaMb}`}>{metadata}</p>
      )}

      {/* ── Progress bar (optional — in-progress journeys) ─────────────────── */}
      {progressPercent != null && (
        <div className="h-0.5 rounded-full bg-primary/15 overflow-hidden mb-5">
          <div
            className="h-full rounded-full bg-primary/40 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
          />
        </div>
      )}

      {/* ── 5. Primary button (omitted when neither primaryActionLabel nor gatedMessage) */}
      {gatedMessage ? (
        <Button className={T.button} onClick={onGate}>
          {gatedMessage}
        </Button>
      ) : primaryActionLabel ? (
        <Button
          className={T.button}
          onClick={onAction}
          disabled={disabled || loading}
        >
          {loading
            ? <Loader2 size={16} className="animate-spin" />
            : primaryActionLabel}
        </Button>
      ) : null}

      {/* ── Secondary text link (optional) ─────────────────────────────────── */}
      {secondaryAction && (
        <button
          onClick={secondaryAction.onPress}
          className="w-full text-center text-[13px] text-muted-foreground hover:text-foreground transition-colors mt-3"
        >
          {secondaryAction.label}
        </button>
      )}

    </div>
  );
}
