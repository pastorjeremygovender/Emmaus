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
import { ShareImageCard } from '@/components/ShareImageCard';
import type { SharePayload } from '@/lib/share';
import {
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

  /**
   * Optional share image — object-storage path ("/objects/…").
   * When present, a "Take this with you" card is rendered above the Share button.
   */
  shareImageUrl?: string | null;
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
  shareImageUrl,
}: SermonCompanionReadingProps) {

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
        <section className="mb-3.5">
          <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 px-4 py-4">
            <div className="flex items-center gap-1.5 mb-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">Greeting</h2>
            </div>
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
        <section className="mb-3.5">
          <div className="rounded-2xl border border-sky-200/60 bg-sky-50/60 px-4 py-4">
            <div className="flex items-center gap-1.5 mb-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700">Today's Reading</h2>
            </div>
            <EmbeddedScripture scripture={scripture} returnPath={returnPath} />
          </div>
        </section>
      )}

      {/* ── Consider This ───────────────────────────────────────────────────── */}
      {considerThis && (
        <section className="mb-3.5">
          <div className="rounded-2xl border border-violet-200/60 bg-violet-50/60 px-4 py-4">
            <div className="flex items-center gap-1.5 mb-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-700">Consider This</h2>
            </div>
            <BodyParagraphs text={considerThis} />
          </div>
        </section>
      )}

      {/* ── Prayer ──────────────────────────────────────────────────────────── */}
      {prayer && (
        <section className="mb-3.5">
          <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/60 px-4 py-4">
            <div className="flex items-center gap-1.5 mb-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">Prayer</h2>
            </div>
            <BodyParagraphs text={prayer} />
          </div>
        </section>
      )}

      {/* ── Your Next Step ───────────────────────────────────────────────────── */}
      {nextStep && (
        <section className="mb-3.5">
          <div className="rounded-2xl border border-orange-200/60 bg-orange-50/60 px-4 py-4">
            <div className="flex items-center gap-1.5 mb-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-700">Your Next Step</h2>
            </div>
            <BodyParagraphs text={nextStep} />
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

      {/* ── Share (text) — above the image card so it's clearly about the content ── */}
      {sharePayload && (
        <ShareButton payload={sharePayload} />
      )}

      {/* ── Share image ─────────────────────────────────────────────────────── */}
      {shareImageUrl && (
        <ShareImageCard shareImageUrl={shareImageUrl} />
      )}

      {/* ── Action button slot ───────────────────────────────────────────────── */}
      <div className="pt-2 pb-8">
        {actionButton}
      </div>

    </div>
  );
}
