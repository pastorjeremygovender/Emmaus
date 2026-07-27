/**
 * DailyRhythmReading — single source of truth for the Daily Rhythm reading layout.
 *
 * Used by:
 *   - JourneyDay.tsx          (member-facing view)
 *   - DailyRhythmDayEditor.tsx (Content Studio preview)
 *
 * Any typography, spacing, or alignment change made here automatically
 * applies to both surfaces. The only differences allowed between the two
 * surfaces are editor controls rendered *outside* this component.
 */

import React from 'react';
import { Button } from '@/components/ui/button';

// ─── Section heading ──────────────────────────────────────────────────────────
// Exported so JourneyDay can reuse it for non-daily-rhythm sections (Sermon Moment,
// Consider, etc.) and keep a single consistent style across the whole page.

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </h2>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DailyRhythmReadingProps {
  day: number;
  title?: string;
  mentorIntro?: string;
  scripture?: string;
  devotional?: string;
  prayerPrompt?: string;
  actionStep?: string;
  closingText?: string;

  /**
   * Member view: navigate to the Bible reader when "Read in Bible" is tapped.
   * Preview: omit — a note is shown in its place instead.
   */
  onReadInBible?: () => void;

  /**
   * Preview mode: shows placeholder labels for empty fields so the editor
   * can see the full page structure even before content is written.
   * Default: false.
   */
  previewMode?: boolean;

  /**
   * The primary call-to-action rendered at the bottom of the reading.
   *   Member view:  <Button> Continue | Back to Walk </Button>
   *   Preview:      a mocked, non-interactive Continue affordance
   */
  actionButton?: React.ReactNode;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DailyRhythmReading({
  day,
  title,
  mentorIntro,
  scripture,
  devotional,
  prayerPrompt,
  actionStep,
  closingText,
  onReadInBible,
  previewMode = false,
  actionButton,
}: DailyRhythmReadingProps) {
  return (
    <div className="px-5 pt-10 max-w-[640px] mx-auto">

      {/* ── Header — centered per typography spec ────────────────────── */}
      <section className="mb-12 text-center">
        <p className="text-[28px] font-bold text-foreground leading-tight mb-2">
          10 Minutes with Jesus
        </p>
        <p className="text-[15px] font-medium text-muted-foreground mb-3">
          Day {day}
        </p>
        <h1 className="text-[26px] font-bold text-foreground leading-snug">
          {title || (previewMode
            ? <span className="text-muted-foreground/40">Title</span>
            : null)}
        </h1>
      </section>

      {/* ── Greeting ─────────────────────────────────────────────────── */}
      {(mentorIntro || previewMode) && (
        <section className="mb-12">
          <p className="text-[18px] text-foreground leading-[1.8]">
            {mentorIntro || (previewMode
              ? <span className="text-muted-foreground/40">Greeting will appear here…</span>
              : null)}
          </p>
        </section>
      )}

      {/* ── Scripture ─────────────────────────────────────────────────── */}
      {(scripture || previewMode) && (
        <section className="mb-12">
          <SectionLabel>Scripture</SectionLabel>
          <p className="mt-3 text-[18px] text-foreground leading-[1.8]">
            {scripture || (previewMode
              ? <span className="text-muted-foreground/40">No scripture reference yet</span>
              : null)}
          </p>
          {previewMode ? (
            <p className="mt-2 text-[13px] text-muted-foreground">
              The member's chosen Bible translation will appear here.
            </p>
          ) : (scripture && onReadInBible) ? (
            <button
              onClick={onReadInBible}
              className="mt-2 text-[14px] text-primary font-medium hover:underline"
            >
              Read in Bible
            </button>
          ) : null}
        </section>
      )}

      {/* ── Reflection ───────────────────────────────────────────────── */}
      {(devotional || previewMode) && (
        <section className="mb-12">
          <SectionLabel>Reflection</SectionLabel>
          <p className="mt-3 text-[18px] leading-[1.8] text-foreground whitespace-pre-wrap">
            {devotional || (previewMode
              ? <span className="text-muted-foreground/40">Reflection will appear here…</span>
              : null)}
          </p>
        </section>
      )}

      {/* ── Prayer ───────────────────────────────────────────────────── */}
      {(prayerPrompt || previewMode) && (
        <section className="mb-12">
          <SectionLabel>Prayer</SectionLabel>
          <p className="mt-3 text-[18px] text-foreground leading-[1.8] whitespace-pre-wrap">
            {prayerPrompt || (previewMode
              ? <span className="text-muted-foreground/40">Prayer will appear here…</span>
              : null)}
          </p>
        </section>
      )}

      {/* ── Your Next Step ───────────────────────────────────────────── */}
      {(actionStep || previewMode) && (
        <section className="mb-12">
          <SectionLabel>Your Next Step</SectionLabel>
          <p className="mt-3 text-[18px] text-foreground leading-[1.8] whitespace-pre-wrap">
            {actionStep || (previewMode
              ? <span className="text-muted-foreground/40">Next step will appear here…</span>
              : null)}
          </p>
        </section>
      )}

      {/* ── Closing ──────────────────────────────────────────────────── */}
      {closingText && (
        <section className="mb-8">
          <p className="text-[16px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {closingText}
          </p>
        </section>
      )}

      {/* ── Action button slot ───────────────────────────────────────── */}
      <div className="pt-2 pb-8">
        {actionButton}
      </div>

    </div>
  );
}

// ─── Preview Continue button ──────────────────────────────────────────────────
// A non-interactive mock of the member's Continue button, used in the editor
// preview so the bottom of the page looks exactly like the member experience.

export function PreviewContinueButton() {
  return (
    <div
      aria-hidden="true"
      className="w-full h-14 flex items-center justify-center text-[17px] font-semibold rounded-2xl bg-primary text-primary-foreground select-none pointer-events-none"
    >
      Continue
    </div>
  );
}
