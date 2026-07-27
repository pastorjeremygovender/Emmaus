/**
 * DailyRhythmReading — single source of truth for the Daily Rhythm reading layout.
 *
 * Used by:
 *   - DailyRhythmDay.tsx          (member-facing view, live + replay)
 *   - JourneyDay.tsx              (when journey type is daily-rhythm)
 *   - DailyRhythmDayEditor.tsx    (Content Studio preview)
 *
 * Any typography, spacing, or alignment change made here automatically
 * applies to all three surfaces. The only differences allowed between surfaces
 * are controls rendered *outside* this component.
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { EmbeddedScripture } from '@/components/EmbeddedScripture';

// ─── Greeting personalization ─────────────────────────────────────────────────

/** Opening lines the editor may write that we know how to replace at runtime. */
const RECOGNIZED_OPENING_PREFIXES = [
  'good morning',
  'good afternoon',
  'good evening',
  'hello',
  'welcome',
];

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

/**
 * Returns the personalized greeting text:
 * - If the first line is a recognised greeting prefix it is replaced with
 *   the correct time-of-day salutation + name; the rest is unchanged.
 * - Otherwise the personalised salutation is prepended.
 * - If no name is available the salutation renders without one.
 */
export function personalizeGreeting(mentorIntro: string, name: string | undefined): string {
  const period = getTimeOfDay();
  const salutation = `Good ${period}`;
  const personalizedFirstLine = name ? `${salutation}, ${name}.` : `${salutation}.`;

  if (!mentorIntro) return personalizedFirstLine;

  const firstNewline = mentorIntro.indexOf('\n');
  const rawFirstLine = firstNewline === -1 ? mentorIntro : mentorIntro.slice(0, firstNewline);
  const rest         = firstNewline === -1 ? '' : mentorIntro.slice(firstNewline);

  const isRecognized = RECOGNIZED_OPENING_PREFIXES.some(
    g => rawFirstLine.trim().toLowerCase().startsWith(g)
  );

  return isRecognized
    ? personalizedFirstLine + rest
    : `${personalizedFirstLine}\n\n${mentorIntro}`;
}

/**
 * Extract a safe display name from a raw preferredName string.
 * Returns undefined when the value is blank, looks like an email, or is null/undefined.
 */
export function resolveDisplayName(
  preferredName: string | null | undefined
): string | undefined {
  const name = preferredName?.trim();
  if (!name) return undefined;
  if (name.includes('@')) return undefined;
  return name;
}

// ─── Section heading ──────────────────────────────────────────────────────────
// One shared understated style across:
// Today's Reading, Reflection, Prayer, Your Next Step.
//
// Exported so JourneyDay can reuse it for its own sections.

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[12px] font-semibold text-muted-foreground">
      {children}
    </h2>
  );
}

// ─── Body text ────────────────────────────────────────────────────────────────
// Splits authored text on double newlines so each intentional paragraph is its
// own <p> element. Single newlines within a paragraph are preserved via
// whitespace-pre-wrap. This prevents the "every sentence looks like a slide"
// problem caused by whitespace-pre-wrap on a single large <p> with large
// leading.

function BodyParagraphs({
  text,
  className = '',
}: {
  text: string;
  className?: string;
}) {
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
  return (
    <>
      {paragraphs.map((para, i) => (
        <p
          key={i}
          className={`${i > 0 ? 'mt-4' : ''} text-[17px] text-foreground leading-[1.65] whitespace-pre-wrap ${className}`.trim()}
        >
          {para.trim()}
        </p>
      ))}
    </>
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
   * The member's resolved first name used to personalise the greeting at runtime.
   * Member view: pass the signed-in user's preferredName (after stripping emails).
   * Preview:     pass the admin's name or a sample like "Jeremy".
   */
  memberName?: string;

  /**
   * The Daily Rhythm page path the member is reading (e.g. "/daily-rhythm/day/2").
   * Passed through to EmbeddedScripture so "Open in My Bible" can carry a returnTo
   * context and My Bible's back arrow returns to the correct day.
   * Omit in Content Studio preview — the link will still appear but without context.
   */
  returnPath?: string;

  /**
   * Preview mode: shows placeholder labels for empty fields so the editor
   * can see the full page structure even before content is written.
   * Default: false.
   */
  previewMode?: boolean;

  /**
   * The primary call-to-action rendered at the bottom of the reading.
   *   Member view:  Continue | Back to Previous Days
   *   Preview:      a mocked non-interactive Continue affordance
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
  memberName,
  returnPath,
  previewMode = false,
  actionButton,
}: DailyRhythmReadingProps) {

  // ── Greeting text ───────────────────────────────────────────────────────────
  // First paragraph (personalised salutation) gets slightly stronger weight.
  // Remaining paragraphs render at normal body weight.
  const greetingFull = mentorIntro
    ? personalizeGreeting(mentorIntro, memberName)
    : `Good ${getTimeOfDay()}${memberName ? `, ${memberName}` : ''}.`;

  const firstBreak   = greetingFull.indexOf('\n\n');
  const greetingLead = firstBreak === -1 ? greetingFull : greetingFull.slice(0, firstBreak);
  const greetingRest = firstBreak === -1 ? '' : greetingFull.slice(firstBreak + 2).trim();

  return (
    <div className="px-5 pt-10 max-w-[640px] mx-auto">

      {/* ── Identity header — centered ─────────────────────────────────────── */}
      <section className="mb-10 text-center">
        <p className="text-[14px] font-medium text-muted-foreground tracking-wide mb-1">
          10 Minutes with Jesus
        </p>
        <p className="text-[13px] text-muted-foreground mb-4">
          Day {day}
        </p>
        <h1 className="text-[26px] font-semibold text-foreground leading-snug">
          {title || (previewMode
            ? <span className="text-muted-foreground/40">Title</span>
            : null)}
        </h1>
      </section>

      {/* ── Greeting — left-aligned, body weight ───────────────────────────── */}
      {(mentorIntro || previewMode) && (
        <section className="mb-10">
          {previewMode && (
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Greeting · personalized automatically per member
            </p>
          )}
          {mentorIntro ? (
            <>
              {/* Salutation line — slightly stronger weight, body scale */}
              <p className="text-[17px] font-medium text-foreground leading-[1.65]">
                {greetingLead}
              </p>
              {/* Remaining paragraphs */}
              {greetingRest && (
                <div className="mt-4">
                  <BodyParagraphs text={greetingRest} />
                </div>
              )}
            </>
          ) : previewMode ? (
            <p className="text-[17px] text-muted-foreground/40 leading-[1.65]">
              Greeting will appear here…
            </p>
          ) : null}
        </section>
      )}

      {/* ── Today's Reading ────────────────────────────────────────────────── */}
      {(scripture || previewMode) && (
        <section className="mb-10">
          <SectionLabel>Today's Reading</SectionLabel>
          <div className="mt-3">
            {scripture ? (
              <EmbeddedScripture scripture={scripture} returnPath={returnPath} />
            ) : previewMode ? (
              <div className="space-y-1">
                <p className="text-[18px] font-medium text-muted-foreground/40 leading-snug">
                  Scripture reference
                </p>
                <p className="text-[13px] text-muted-foreground">
                  Member's selected translation
                </p>
                <p className="mt-4 text-[17px] text-muted-foreground/40 leading-[1.75]">
                  Passage text will appear here…
                </p>
              </div>
            ) : null}
          </div>
        </section>
      )}

      {/* ── Reflection ─────────────────────────────────────────────────────── */}
      {(devotional || previewMode) && (
        <section className="mb-10">
          <SectionLabel>Reflection</SectionLabel>
          <div className="mt-3">
            {devotional ? (
              <BodyParagraphs text={devotional} />
            ) : previewMode ? (
              <p className="text-[17px] text-muted-foreground/40 leading-[1.65]">
                Reflection will appear here…
              </p>
            ) : null}
          </div>
        </section>
      )}

      {/* ── Prayer ─────────────────────────────────────────────────────────── */}
      {(prayerPrompt || previewMode) && (
        <section className="mb-10">
          <SectionLabel>Prayer</SectionLabel>
          <div className="mt-3">
            {prayerPrompt ? (
              <BodyParagraphs text={prayerPrompt} />
            ) : previewMode ? (
              <p className="text-[17px] text-muted-foreground/40 leading-[1.65]">
                Prayer will appear here…
              </p>
            ) : null}
          </div>
        </section>
      )}

      {/* ── Your Next Step ──────────────────────────────────────────────────── */}
      {(actionStep || previewMode) && (
        <section className="mb-10">
          <SectionLabel>Your Next Step</SectionLabel>
          <div className="mt-3">
            {actionStep ? (
              <BodyParagraphs text={actionStep} />
            ) : previewMode ? (
              <p className="text-[17px] text-muted-foreground/40 leading-[1.65]">
                Next step will appear here…
              </p>
            ) : null}
          </div>
        </section>
      )}

      {/* ── Closing ────────────────────────────────────────────────────────── */}
      {closingText && (
        <section className="mb-8">
          <BodyParagraphs
            text={closingText}
            className="!text-[16px] !text-muted-foreground"
          />
        </section>
      )}

      {/* ── Action button slot ──────────────────────────────────────────────── */}
      <div className="pt-2 pb-8">
        {actionButton}
      </div>

    </div>
  );
}

// ─── Preview Continue button ──────────────────────────────────────────────────

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
