/**
 * DevotionalReading — member reader for Daily Devotional entries.
 *
 * Mirrors the DailyRhythmReading layout and typography exactly:
 * same proportions, same section rhythm, same palette.
 *
 * Fields:
 *   seriesTitle | dayNumber | title | greeting | scripture |
 *   considerThis | prayer | nextStep | closing | actionButton
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { EmbeddedScripture } from '@/components/EmbeddedScripture';
import { ShareButton } from '@/components/ShareButton';
import { ShareImageCard } from '@/components/ShareImageCard';
import type { SharePayload } from '@/lib/share';
import {
  personalizeGreeting,
} from '@/components/DailyRhythmReading';

function getTimeOfDay(): string {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
}

// ─── Body text helper ─────────────────────────────────────────────────────────

function BodyParagraphs({ text, className = '' }: { text: string; className?: string }) {
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
  return (
    <>
      {paragraphs.map((para, i) => (
        <p
          key={i}
          className={`${i > 0 ? 'mt-[0.65em]' : ''} text-[17px] text-foreground leading-[1.65] whitespace-pre-wrap ${className}`.trim()}
        >
          {para.trim()}
        </p>
      ))}
    </>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DevotionalReadingProps {
  seriesTitle: string;
  dayNumber: number;
  title?: string;
  greeting?: string;
  scripture?: string;
  considerThis?: string;
  prayer?: string;
  nextStep?: string;
  closing?: string;

  /** Signed-in member's name for personalising the greeting. */
  memberName?: string;

  /** Return path for EmbeddedScripture "Open in My Bible" link. */
  returnPath?: string;

  /** Preview mode — show placeholder labels for empty fields. */
  previewMode?: boolean;

  /** Primary action rendered at the bottom (Continue button etc.). */
  actionButton?: React.ReactNode;

  /**
   * Pre-built share payload. When provided (member view only), a subtle
   * Share button is rendered above the action button. Omit for admin previews.
   */
  sharePayload?: SharePayload;

  /**
   * Resolved display label (e.g. "1 January"). When provided and non-empty,
   * replaces the default "Day N" sub-heading. Pass the output of
   * `getDevotionalLabel(entry)` from the caller; do not pass the raw DB value.
   */
  displayLabel?: string;

  /**
   * Optional share image — object-storage path ("/objects/…").
   * When present, a "Take this with you" card is rendered above the Share button.
   * Omit for admin previews.
   */
  shareImageUrl?: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DevotionalReading({
  seriesTitle,
  dayNumber,
  title,
  greeting,
  scripture,
  considerThis,
  prayer,
  nextStep,
  closing,
  memberName,
  returnPath,
  previewMode = false,
  actionButton,
  sharePayload,
  displayLabel,
  shareImageUrl,
}: DevotionalReadingProps) {

  const greetingFull = greeting
    ? personalizeGreeting(greeting, memberName)
    : `Good ${getTimeOfDay()}${memberName ? `, ${memberName}` : ''}.`;

  const firstBreak   = greetingFull.indexOf('\n\n');
  const greetingLead = firstBreak === -1 ? greetingFull : greetingFull.slice(0, firstBreak);
  const greetingRest = firstBreak === -1 ? '' : greetingFull.slice(firstBreak + 2).trim();

  return (
    <div className="px-4 pt-8 max-w-[640px] mx-auto">

      {/* ── Identity header ─────────────────────────────────────────────────── */}
      <section className="mb-7 text-center">
        <p className="text-[14px] font-medium text-muted-foreground tracking-wide mb-1">
          {seriesTitle}
        </p>
        <p className="text-[13px] text-muted-foreground mb-4">
          {displayLabel || `Day ${dayNumber}`}
        </p>
        <h1 className="text-[26px] font-semibold text-foreground leading-snug">
          {title || (previewMode
            ? <span className="text-muted-foreground/40">Title</span>
            : null)}
        </h1>
      </section>

      {/* ── Greeting / introductory paragraph ───────────────────────────────── */}
      {(greeting || previewMode) && (
        <section className="mb-3.5">
          <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 px-4 py-4">
            <div className="flex items-center gap-1.5 mb-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">Greeting</h2>
            </div>
            {greeting ? (
              <>
                <p className="text-[17px] font-medium text-foreground leading-[1.65]">
                  {greetingLead}
                </p>
                {greetingRest && (
                  <div className="mt-[0.65em]">
                    <BodyParagraphs text={greetingRest} />
                  </div>
                )}
              </>
            ) : previewMode ? (
              <p className="text-[17px] text-muted-foreground/40 leading-[1.65]">
                What the preacher said will appear here…
              </p>
            ) : null}
          </div>
        </section>
      )}

      {/* ── Today's Reading ─────────────────────────────────────────────────── */}
      {(scripture || previewMode) && (
        <section className="mb-3.5">
          <div className="rounded-2xl border border-sky-200/60 bg-sky-50/60 px-4 py-4">
            <div className="flex items-center gap-1.5 mb-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700">Today's Reading</h2>
            </div>
            {scripture ? (
              <EmbeddedScripture scripture={scripture} returnPath={returnPath} />
            ) : previewMode ? (
              <div className="space-y-1">
                <p className="text-[18px] font-medium text-muted-foreground/40 leading-snug">Scripture reference</p>
                <p className="text-[13px] text-muted-foreground">Member's selected translation</p>
                <p className="mt-4 text-[17px] text-muted-foreground/40 leading-[1.75]">Passage text will appear here…</p>
              </div>
            ) : null}
          </div>
        </section>
      )}

      {/* ── Consider This ───────────────────────────────────────────────────── */}
      {(considerThis || previewMode) && (
        <section className="mb-3.5">
          <div className="rounded-2xl border border-violet-200/60 bg-violet-50/60 px-4 py-4">
            <div className="flex items-center gap-1.5 mb-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-700">Consider This</h2>
            </div>
            {considerThis ? (
              <BodyParagraphs text={considerThis} />
            ) : previewMode ? (
              <p className="text-[17px] text-muted-foreground/40 leading-[1.65]">Reflection will appear here…</p>
            ) : null}
          </div>
        </section>
      )}

      {/* ── Prayer ──────────────────────────────────────────────────────────── */}
      {(prayer || previewMode) && (
        <section className="mb-3.5">
          <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/60 px-4 py-4">
            <div className="flex items-center gap-1.5 mb-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">Prayer</h2>
            </div>
            {prayer ? (
              <BodyParagraphs text={prayer} />
            ) : previewMode ? (
              <p className="text-[17px] text-muted-foreground/40 leading-[1.65]">Prayer will appear here…</p>
            ) : null}
          </div>
        </section>
      )}

      {/* ── Your Next Step ───────────────────────────────────────────────────── */}
      {(nextStep || previewMode) && (
        <section className="mb-3.5">
          <div className="rounded-2xl border border-orange-200/60 bg-orange-50/60 px-4 py-4">
            <div className="flex items-center gap-1.5 mb-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-700">Your Next Step</h2>
            </div>
            {nextStep ? (
              <BodyParagraphs text={nextStep} />
            ) : previewMode ? (
              <p className="text-[17px] text-muted-foreground/40 leading-[1.65]">Next step will appear here…</p>
            ) : null}
          </div>
        </section>
      )}

      {/* ── Closing ─────────────────────────────────────────────────────────── */}
      {closing && (
        <section className="mt-2 mb-6">
          <BodyParagraphs
            text={closing}
            className="!text-[16px] !text-muted-foreground"
          />
        </section>
      )}

      {/* ── Share image ─────────────────────────────────────────────────────── */}
      {/* Share image shown even in previewMode so admins can verify what they generated. */}
      {shareImageUrl && (
        <ShareImageCard shareImageUrl={shareImageUrl} />
      )}

      {/* ── Share ───────────────────────────────────────────────────────────── */}
      {sharePayload && !previewMode && (
        <ShareButton payload={sharePayload} />
      )}

      {/* ── Action button slot ───────────────────────────────────────────────── */}
      <div className="pt-2 pb-8">
        {actionButton}
      </div>

    </div>
  );
}

// ─── Preview Continue button ──────────────────────────────────────────────────

export function PreviewDevotionalContinueButton() {
  return (
    <div
      aria-hidden="true"
      className="w-full h-14 flex items-center justify-center text-[17px] font-semibold rounded-2xl bg-primary text-primary-foreground select-none pointer-events-none"
    >
      Continue
    </div>
  );
}
