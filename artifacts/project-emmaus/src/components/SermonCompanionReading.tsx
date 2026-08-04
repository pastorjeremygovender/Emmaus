/**
 * SermonCompanionReading — member reader for a single Sermon Companion step.
 *
 * Dedicated companion for the Sermon Companion reader; uses "Step X" labelling
 * rather than the legacy "Day X" used by DevotionalReading. Layout and
 * typography are intentionally consistent with the rest of the reading surfaces.
 *
 * Fields mirror the AI-generated SCEntry shape:
 *   companionTitle | stepNumber | title | greeting | scripture |
 *   considerThis   | prayer     | nextStep | closing | actionButton
 */

import React from 'react';
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

export interface SermonCompanionReadingProps {
  companionTitle: string;
  stepNumber: number;
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

  /** Primary action rendered at the bottom (Continue button etc.). */
  actionButton?: React.ReactNode;

  /**
   * Pre-built share payload. When provided (member view only), a subtle
   * Share button is rendered above the action button.
   */
  sharePayload?: SharePayload;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SermonCompanionReading({
  companionTitle,
  stepNumber,
  title,
  greeting,
  scripture,
  considerThis,
  prayer,
  nextStep,
  closing,
  memberName,
  returnPath,
  actionButton,
  sharePayload,
}: SermonCompanionReadingProps) {

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
          {companionTitle}
        </p>
        <p className="text-[13px] text-muted-foreground mb-4">
          Step {stepNumber}
        </p>
        {title && (
          <h1 className="text-[26px] font-semibold text-foreground leading-snug">
            {title}
          </h1>
        )}
      </section>

      {/* ── Greeting / introductory paragraph ───────────────────────────────── */}
      {greeting && (
        <section className="mb-10">
          <div className="mt-3">
            <p className="text-[17px] font-medium text-foreground leading-[1.65]">
              {greetingLead}
            </p>
            {greetingRest && (
              <div className="mt-[0.65em]">
                <BodyParagraphs text={greetingRest} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Today's Reading ─────────────────────────────────────────────────── */}
      {scripture && (
        <section className="mb-10">
          <SectionLabel>Today's Reading</SectionLabel>
          <div className="mt-3">
            <EmbeddedScripture scripture={scripture} returnPath={returnPath} />
          </div>
        </section>
      )}

      {/* ── Consider This ───────────────────────────────────────────────────── */}
      {considerThis && (
        <section className="mb-10">
          <SectionLabel>Consider This</SectionLabel>
          <div className="mt-3">
            <BodyParagraphs text={considerThis} />
          </div>
        </section>
      )}

      {/* ── Prayer ──────────────────────────────────────────────────────────── */}
      {prayer && (
        <section className="mb-10">
          <SectionLabel>Prayer</SectionLabel>
          <div className="mt-3">
            <BodyParagraphs text={prayer} />
          </div>
        </section>
      )}

      {/* ── Your Next Step ───────────────────────────────────────────────────── */}
      {nextStep && (
        <section className="mb-10">
          <SectionLabel>Your Next Step</SectionLabel>
          <div className="mt-3">
            <BodyParagraphs text={nextStep} />
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
      {sharePayload && (
        <ShareButton payload={sharePayload} />
      )}

      {/* ── Action button slot ───────────────────────────────────────────────── */}
      <div className="pt-2 pb-8">
        {actionButton}
      </div>

    </div>
  );
}
