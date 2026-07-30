/**
 * NewSermonCompanionModal — creation entry point for Sermon Companions.
 *
 * Follows the same modal shell as NewJourneyModal (the reference pattern):
 *  • Fixed modal, max-h = 100dvh − padding — never clips the viewport
 *  • Header: ← Cancel | centred title | ✕ Close — always visible
 *  • Step progress pill (single step, always filled)
 *  • Scrollable content area only
 *  • Sticky footer with single primary CTA
 *
 * The actual companion creation (YouTube URL → generation pipeline → review)
 * lives in SermonEditor. This modal is the consistent creation entry point;
 * "Start Creating" hands off to SermonEditor with sermonId = null.
 */

import React from 'react';
import { ArrowLeft, X, Headphones, Youtube, Sparkles, BookOpen } from 'lucide-react';

interface Props {
  onClose: () => void;
  /** Navigate to SermonEditor with sermonId = null */
  onContinue: () => void;
}

export default function NewSermonCompanionModal({ onClose, onContinue }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[calc(100dvh-2rem)]">

        {/* ── Header — always visible ──────────────────────────────────────── */}
        <div className="flex-shrink-0 flex items-center px-5 pt-5 pb-4 border-b border-gray-100">
          {/* Cancel — fixed width so title stays centred */}
          <button
            onClick={onClose}
            aria-label="Cancel"
            className="flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-900 transition-colors w-20 flex-shrink-0"
          >
            <ArrowLeft size={14} />
            Cancel
          </button>

          {/* Step title — centred */}
          <h2 className="flex-1 text-[15px] font-semibold text-gray-900 text-center">
            New Sermon Companion
          </h2>

          {/* Close — fixed width, right-aligned */}
          <div className="w-20 flex-shrink-0 flex justify-end">
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Step progress — single filled pill ───────────────────────────── */}
        <div className="flex-shrink-0 flex items-center gap-1.5 px-5 pt-3.5 pb-1">
          <div className="h-[3px] rounded-full flex-1 bg-teal-500" />
        </div>

        {/* ── Scrollable content ────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          <div className="space-y-4">

            {/* Intro card */}
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                <Headphones size={17} className="text-teal-600" />
              </div>
              <p className="text-[13px] text-gray-500 leading-relaxed">
                Turn Sunday's message into a week of discipleship for your members.
              </p>
            </div>

            {/* How it works steps */}
            <div className="space-y-2.5">
              <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide">
                How it works
              </p>

              {[
                {
                  Icon: Youtube,
                  colour: 'bg-red-50 text-red-500',
                  title: 'Paste the YouTube URL',
                  desc: 'Link to the full service recording or a sermon clip.',
                },
                {
                  Icon: Sparkles,
                  colour: 'bg-teal-50 text-teal-600',
                  title: 'Emmaus generates a draft',
                  desc: 'Sermon detection, scripture, theme, and a 5-day companion — all in one pass.',
                },
                {
                  Icon: BookOpen,
                  colour: 'bg-indigo-50 text-indigo-500',
                  title: 'Review and publish',
                  desc: 'Edit every field, adjust the companion days, then publish when it\'s ready.',
                },
              ].map(({ Icon, colour, title, desc }) => (
                <div key={title} className="flex items-start gap-3 p-3.5 rounded-xl border border-gray-100 bg-gray-50/60">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colour}`}>
                    <Icon size={14} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900 leading-tight">{title}</p>
                    <p className="text-[12px] text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[12px] text-gray-400 leading-relaxed">
              The companion is always saved as a Draft first — nothing goes live until you publish.
            </p>
          </div>
        </div>

        {/* ── Footer — always visible ───────────────────────────────────────── */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100">
          <button
            onClick={onContinue}
            className="w-full h-12 rounded-2xl text-[15px] font-semibold transition-all flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white"
          >
            <span>Start Creating</span>
          </button>
        </div>

      </div>
    </div>
  );
}
