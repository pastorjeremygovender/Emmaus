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
import type { SharePayload } from '@/lib/share';
import {
  SectionLabel,
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
}: DevotionalReadingProps) {

  const greetingFull = greeting
    ? personalizeGreeting(greeting, memberName)
    : `Good ${getTimeOfDay()}${memberName ? `, ${memberName}` : ''}.`;

  const firstBreak   = greetingFull.indexOf('\n\n');
  const greetingLead = firstBreak === -1 ? greetingFull : greetingFull.slice(0, firstBreak);
  const greetingRest = firstBreak === -1 ? '' : greetingFull.slice(firstBreak + 2).trim();

  return (
    <div className="px-5 pt-10 max-w-[640px] mx-auto">

      {/* ── Identity header ─────────────────────────────────────────────────── */}
      <section className="mb-10 text-center">
        <p className="text-[14px] font-medium text-muted-foreground tracking-wide mb-1">
          {seriesTitle}
        </p>
        <p className="text-[13px] text-muted-foreground mb-4">
          Day {dayNumber}
        </p>
        <h1 className="text-[26px] font-semibold text-foreground leading-snug">
          {title || (previewMode
            ? <span className="text-muted-foreground/40">Title</span>
            : null)}
        </h1>
      </section>

      {/* ── Greeting / introductory paragraph ───────────────────────────────── */}
      {(greeting || previewMode) && (
        <section className="mb-10">
          <div className="mt-3">
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
        <section className="mb-10">
          <SectionLabel>Today's Reading</SectionLabel>
          <div className="mt-3">
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
        <section className="mb-10">
          <SectionLabel>Consider This</SectionLabel>
          <div className="mt-3">
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
        <section className="mb-10">
          <SectionLabel>Prayer</SectionLabel>
          <div className="mt-3">
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
        <section className="mb-10">
          <SectionLabel>Your Next Step</SectionLabel>
          <div className="mt-3">
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
        <section className="mb-8">
          <BodyParagraphs
            text={closing}
            className="!text-[16px] !text-muted-foreground"
          />
        </section>
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
