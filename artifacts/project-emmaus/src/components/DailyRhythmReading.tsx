/**
 * DailyRhythmReading — single source of truth for the Daily Rhythm reading layout.
 *
 * Used by:
 *   - DailyRhythmDay.tsx          (member-facing view)
 *   - DailyRhythmDayEditor.tsx    (Content Studio preview)
 *
 * Any typography, spacing, or alignment change made here automatically
 * applies to both surfaces. The only differences allowed between the two
 * surfaces are editor controls rendered *outside* this component.
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { useBible } from '@/contexts/BibleContext';
import { useTranslations } from '@/hooks/useTranslations';

// ─── Greeting personalization ─────────────────────────────────────────────────
//
// Editors author one generic greeting (e.g. "Good morning.\n\nI'm glad you're here.").
// At render time the first line is replaced (or prepended) with a personalised
// time-of-day + first-name greeting.  The rest of the text is never altered.

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
  return 'evening';  // 18:00–04:59
}

/**
 * Returns the personalized greeting text:
 *
 * - If the first line is a recognised greeting, that line is replaced with the
 *   correct time-of-day salutation + name; the rest of the content is unchanged.
 * - If the first line is not recognised, the personalised greeting is prepended.
 * - If no name is available, the salutation is rendered without a name.
 */
export function personalizeGreeting(mentorIntro: string, name: string | undefined): string {
  const period = getTimeOfDay();
  const salutation = `Good ${period}`;
  const personalizedFirstLine = name ? `${salutation}, ${name}.` : `${salutation}.`;

  if (!mentorIntro) return personalizedFirstLine;

  const firstNewline = mentorIntro.indexOf('\n');
  const rawFirstLine = firstNewline === -1
    ? mentorIntro
    : mentorIntro.slice(0, firstNewline);
  const rest = firstNewline === -1 ? '' : mentorIntro.slice(firstNewline);

  const isRecognized = RECOGNIZED_OPENING_PREFIXES.some(
    g => rawFirstLine.trim().toLowerCase().startsWith(g)
  );

  if (isRecognized) {
    // Replace the authored opening line; keep everything after it untouched.
    return personalizedFirstLine + rest;
  } else {
    // Authored content doesn't start with a greeting — prepend ours.
    return `${personalizedFirstLine}\n\n${mentorIntro}`;
  }
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
  if (name.includes('@')) return undefined; // never expose email
  return name;
}

// ─── Section heading ──────────────────────────────────────────────────────────
// Shared understated style across all section labels:
// Today's Reading, Reflection, Prayer, Your Next Step.
//
// Exported so JourneyDay can reuse it for non-daily-rhythm sections (Sermon Moment,
// Consider, etc.) and keep a single consistent style across the whole page.

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[12px] font-semibold text-muted-foreground">
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
   * The member's resolved first name used to personalise the greeting at runtime.
   *
   * Member view: pass the signed-in user's preferredName (after stripping emails).
   * Preview:     pass the admin's name, or a clearly labelled sample such as "Jeremy".
   * If omitted or undefined, the greeting renders without a name ("Good morning.").
   */
  memberName?: string;

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
   *   Member view:  <Button> Continue | Back to Previous Days </Button>
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
  memberName,
  onReadInBible,
  previewMode = false,
  actionButton,
}: DailyRhythmReadingProps) {

  // Translation name for the Scripture section — resolved from the member's
  // current Bible selection. Falls back to the abbreviation if the full name
  // is not yet loaded.
  const { translationId } = useBible();
  const { translations } = useTranslations();
  const translationName =
    translations.find(t => t.id === translationId)?.name ??
    translationId.toUpperCase();

  // ── Greeting text split ─────────────────────────────────────────────────────
  // The first paragraph (personalised salutation) gets slightly stronger weight.
  // Remaining paragraphs render in normal body style.
  const greetingFull = mentorIntro
    ? personalizeGreeting(mentorIntro, memberName)
    : (memberName ? `Good ${getTimeOfDay()}, ${memberName}.` : `Good ${getTimeOfDay()}.`);

  const firstBreak      = greetingFull.indexOf('\n\n');
  const greetingLead    = firstBreak === -1 ? greetingFull : greetingFull.slice(0, firstBreak);
  const greetingBody    = firstBreak === -1 ? '' : greetingFull.slice(firstBreak + 2).trim();

  return (
    <div className="px-5 pt-10 max-w-[640px] mx-auto">

      {/* ── Identity header — centered ────────────────────────────────────── */}
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

      {/* ── Greeting — left-aligned, body weight ─────────────────────────── */}
      {(mentorIntro || previewMode) && (
        <section className="mb-10">
          {previewMode && (
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Greeting · personalized automatically per member
            </p>
          )}
          {/* Salutation line — slightly stronger weight, still body-scale */}
          <p className="text-[17px] font-medium text-foreground leading-[1.8]">
            {mentorIntro
              ? greetingLead
              : previewMode
                ? <span className="text-muted-foreground/40">Greeting will appear here…</span>
                : null}
          </p>
          {/* Remaining paragraphs — normal body weight */}
          {greetingBody ? (
            <p className="mt-4 text-[17px] text-foreground leading-[1.8] whitespace-pre-wrap">
              {greetingBody}
            </p>
          ) : null}
        </section>
      )}

      {/* ── Today's Reading ───────────────────────────────────────────────── */}
      {(scripture || previewMode) && (
        <section className="mb-10">
          <SectionLabel>Today's Reading</SectionLabel>

          {/* Reference */}
          <p className="mt-3 text-[18px] font-medium text-foreground leading-snug">
            {scripture || (previewMode
              ? <span className="text-muted-foreground/40">Scripture reference</span>
              : null)}
          </p>

          {/* Translation name */}
          {previewMode ? (
            <p className="mt-1 text-[13px] text-muted-foreground">
              Member's selected translation
            </p>
          ) : scripture ? (
            <p className="mt-1 text-[13px] text-muted-foreground">
              {translationName}
            </p>
          ) : null}

          {/* Read in Bible link */}
          {!previewMode && scripture && onReadInBible && (
            <button
              onClick={onReadInBible}
              className="mt-3 text-[14px] text-primary font-medium hover:underline"
            >
              Read in Bible
            </button>
          )}
        </section>
      )}

      {/* ── Reflection ───────────────────────────────────────────────────── */}
      {(devotional || previewMode) && (
        <section className="mb-10">
          <SectionLabel>Reflection</SectionLabel>
          <p className="mt-3 text-[17px] leading-[1.8] text-foreground whitespace-pre-wrap">
            {devotional || (previewMode
              ? <span className="text-muted-foreground/40">Reflection will appear here…</span>
              : null)}
          </p>
        </section>
      )}

      {/* ── Prayer ───────────────────────────────────────────────────────── */}
      {(prayerPrompt || previewMode) && (
        <section className="mb-10">
          <SectionLabel>Prayer</SectionLabel>
          <p className="mt-3 text-[17px] text-foreground leading-[1.8] whitespace-pre-wrap">
            {prayerPrompt || (previewMode
              ? <span className="text-muted-foreground/40">Prayer will appear here…</span>
              : null)}
          </p>
        </section>
      )}

      {/* ── Your Next Step ───────────────────────────────────────────────── */}
      {(actionStep || previewMode) && (
        <section className="mb-10">
          <SectionLabel>Your Next Step</SectionLabel>
          <p className="mt-3 text-[17px] text-foreground leading-[1.8] whitespace-pre-wrap">
            {actionStep || (previewMode
              ? <span className="text-muted-foreground/40">Next step will appear here…</span>
              : null)}
          </p>
        </section>
      )}

      {/* ── Closing ──────────────────────────────────────────────────────── */}
      {closingText && (
        <section className="mb-8">
          <p className="text-[16px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {closingText}
          </p>
        </section>
      )}

      {/* ── Action button slot ───────────────────────────────────────────── */}
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
