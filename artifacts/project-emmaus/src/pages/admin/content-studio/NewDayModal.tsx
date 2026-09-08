/**
 * NewDayModal — AI-generated or from-scratch Daily Rhythm day creation.
 *
 * Step 1  Choose method: Build with Emmaus AI | Start from Scratch
 *
 * AI path   → Step 2: Scripture ref + day title + central truth + writing style
 *           → Generation phase: fetches passage → generateDraft → addStep → onCreated(day)
 *
 * Scratch   → Step 1 footer "Start from Scratch" directly navigates to the blank day editor.
 */

import React, { useState, useCallback } from 'react';
import {
  X, ArrowLeft, ArrowRight, Sparkles, PenLine, BookOpen,
  CheckCircle2, Loader2, AlertTriangle, ChevronDown,
} from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import type { Step } from '@/lib/journeys-api';
import { validateScriptureRef } from '@/lib/journeys-api';
import { parseScriptureRef } from '@/lib/scripture-ref';
import {
  generateDraft, fetchPassageText,
  type WritingStyle, type GenerationInputs,
} from '@/lib/writing-assistant-api';

// ─── Writing styles ──────────────────────────────────────────────────────────

const WRITING_STYLES: { value: WritingStyle; label: string; desc: string }[] = [
  { value: 'pastor-jeremy',   label: 'Pastor Jeremy Style',  desc: 'Warm, direct and Christ-centred' },
  { value: 'emmaus-standard', label: 'Emmaus Standard',       desc: 'Clear, pastoral and accessible' },
  { value: 'new-believer',    label: 'New Believer',          desc: 'Simple language for new Christians' },
  { value: 'bible-study',     label: 'Bible Study',           desc: 'Structured and text-focused' },
  { value: 'youth',           label: 'Youth',                 desc: 'Conversational and engaging' },
];

// ─── Generation progress messages ───────────────────────────────────────────

const PROGRESS_MESSAGES = [
  'Reading the passage…',
  'Finding the heart of the text…',
  'Writing the devotional reflection…',
  'Crafting the prayer…',
  'Shaping the next step…',
  'Finishing up…',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeNextDay(steps: Step[], journeyId: string): number {
  const days = steps.filter(s => s.journeyId === journeyId).map(s => s.day);
  return days.length === 0 ? 1 : Math.max(...days) + 1;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Method = 'ai' | 'scratch';
type ScriptureStatus = 'idle' | 'checking' | 'valid' | 'invalid';
type Phase = 'form' | 'generating' | 'error';

interface Props {
  journeyId: string;
  onClose: () => void;
  /** Scratch path — navigate to blank day editor (day: null) */
  onScratch: () => void;
  /** AI path — navigate to the newly-created day in the editor */
  onCreated: (day: number) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function NewDayModal({ journeyId, onClose, onScratch, onCreated }: Props) {
  const { user } = useAuth();
  const { steps, addStep } = useJourney();

  const [step,   setStep]   = useState<1 | 2>(1);
  const [method, setMethod] = useState<Method | null>(null);
  const [phase,  setPhase]  = useState<Phase>('form');
  const [progressIdx, setProgressIdx] = useState(0);
  const [errorMsg,    setErrorMsg]    = useState('');

  // ── AI form fields ──────────────────────────────────────────────────────────
  const [scripture,    setScripture]    = useState('');
  const [dayTitle,     setDayTitle]     = useState('');
  const [centralTruth, setCentralTruth] = useState('');
  const [writingStyle, setWritingStyle] = useState<WritingStyle>('pastor-jeremy');
  const [scriptureStatus, setScriptureStatus] = useState<ScriptureStatus>('idle');
  const [scriptureTimer,  setScriptureTimer]  = useState<ReturnType<typeof setTimeout> | null>(null);

  // ── Scripture live validation ───────────────────────────────────────────────
  const handleScriptureChange = useCallback((val: string) => {
    setScripture(val);
    setScriptureStatus('idle');
    if (scriptureTimer) clearTimeout(scriptureTimer);
    if (!val.trim()) return;
    const timer = setTimeout(async () => {
      setScriptureStatus('checking');
      try {
        const result = await validateScriptureRef(val.trim());
        setScriptureStatus(result.valid ? 'valid' : 'invalid');
      } catch {
        setScriptureStatus('invalid');
      }
    }, 700);
    setScriptureTimer(timer);
  }, [scriptureTimer]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const handleBack = () => {
    if (phase === 'error') { setPhase('form'); setErrorMsg(''); return; }
    if (step === 2) { setStep(1); return; }
    onClose();
  };

  // ── Primary action ──────────────────────────────────────────────────────────
  const handleContinue = async () => {
    if (step === 1) {
      if (method === 'scratch') { onScratch(); onClose(); return; }
      setStep(2);
      return;
    }
    // Step 2 AI — run generation
    await handleGenerate();
  };

  const handleGenerate = async () => {
    if (!scripture.trim()) { setErrorMsg('Please enter a scripture reference.'); return; }
    if (!centralTruth.trim()) { setErrorMsg('Please describe the central truth or theme.'); return; }
    if (!user) { setErrorMsg('You must be signed in to use Emmaus AI.'); return; }

    setPhase('generating');
    setErrorMsg('');
    setProgressIdx(0);

    // Progress ticker
    const ticker = setInterval(() => {
      setProgressIdx(i => (i < PROGRESS_MESSAGES.length - 1 ? i + 1 : i));
    }, 2500);

    try {
      const nextDay = computeNextDay(steps as Step[], journeyId);

      // 1. Parse + fetch passage text
      let passageText = '';
      const parsed = parseScriptureRef(scripture.trim());
      if (parsed) {
        passageText = await fetchPassageText(
          parsed.bookId, parsed.chapter, parsed.startVerse, parsed.endVerse
        );
      }

      // 2. Generate draft
      const inputs: GenerationInputs = {
        dayNumber:    nextDay,
        title:        dayTitle.trim() || `Day ${nextDay}`,
        scriptureRef: scripture.trim(),
        passageText,
        centralTruth: centralTruth.trim(),
        writingStyle,
      };
      const draft = await generateDraft(user.id, user.role, inputs);

      // 3. Create the step
      const created = await addStep({
        journeyId,
        day:          nextDay,
        title:        dayTitle.trim() || `Day ${nextDay}`,
        scripture:    scripture.trim(),
        mentorIntro:  draft.mentorIntro,
        devotional:   draft.devotional,
        prayerPrompt: draft.prayerPrompt,
        actionStep:   draft.actionStep,
        closingText:  draft.closingText,
        status:       'Draft',
      } as Step & { closingText: string; status: string });

      clearInterval(ticker);
      onCreated(created.day);
      onClose();
    } catch (e: unknown) {
      clearInterval(ticker);
      setPhase('error');
      setErrorMsg(
        e instanceof Error
          ? e.message
          : 'Generation failed. Your progress has been saved as a draft — please try again.'
      );
    }
  };

  // ── Disabled guard ──────────────────────────────────────────────────────────
  const primaryDisabled = (() => {
    if (step === 1) return method === null;
    if (phase === 'generating') return true;
    return false;
  })();

  // ── Footer label ─────────────────────────────────────────────────────────────
  const footerLabel = (): React.ReactNode => {
    if (phase === 'generating') return <><Loader2 size={15} className="animate-spin" /><span>Generating…</span></>;
    if (phase === 'error') return <><span>Try Again</span><Sparkles size={15} /></>;
    if (step === 1 && method === 'scratch') return <><PenLine size={14} /><span>Start from Scratch</span></>;
    if (step === 1) return <><span>Continue</span><ArrowRight size={15} /></>;
    return <><span>Generate Day</span><Sparkles size={15} /></>;
  };

  const footerBg = (() => {
    if (phase === 'error') return 'bg-amber-600 hover:bg-amber-700 text-white';
    if (step === 1 && method === 'scratch') return 'bg-gray-900 hover:bg-gray-800 text-white';
    return 'bg-teal-600 hover:bg-teal-700 text-white';
  })();

  const stepTitle = step === 1 ? 'New Day' : 'Tell Emmaus About This Day';

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[calc(100dvh-2rem)]">

        {/* Header */}
        <div className="flex-shrink-0 flex items-center px-5 pt-5 pb-4 border-b border-gray-100">
          <button
            onClick={handleBack}
            disabled={phase === 'generating'}
            aria-label={step === 1 ? 'Close' : 'Back'}
            className="flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-900 transition-colors w-20 flex-shrink-0 disabled:opacity-40"
          >
            <ArrowLeft size={14} />
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          <h2 className="flex-1 text-[15px] font-semibold text-gray-900 text-center">
            {stepTitle}
          </h2>
          <div className="w-20 flex-shrink-0 flex justify-end">
            <button
              onClick={onClose}
              disabled={phase === 'generating'}
              aria-label="Close"
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Progress pills */}
        <div className="flex-shrink-0 flex items-center gap-1.5 px-5 pt-3.5 pb-1">
          {[1, 2].map(i => (
            <div
              key={i}
              className={`h-[3px] rounded-full flex-1 transition-all duration-300 ${
                method === 'scratch'
                  ? (step >= i ? 'bg-gray-800' : 'bg-gray-200')
                  : (step >= i ? 'bg-teal-500' : 'bg-gray-200')
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">

          {/* ── Step 1: Method ─────────────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-[13px] text-gray-500 leading-relaxed mb-2">
                How would you like to create this day?
              </p>

              {/* AI card */}
              <button
                onClick={() => setMethod('ai')}
                className={`w-full p-5 rounded-2xl border-2 text-left transition-all ${
                  method === 'ai' ? 'border-teal-500 bg-teal-50/80' : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3 mb-2.5">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${method === 'ai' ? 'bg-teal-500' : 'bg-gray-100'}`}>
                    <Sparkles size={17} className={method === 'ai' ? 'text-white' : 'text-gray-500'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-gray-900 leading-tight">Build with Emmaus AI</p>
                    <p className="text-[12px] text-gray-500 mt-0.5">Emmaus writes a full devotional day for you</p>
                  </div>
                  {method === 'ai' && (
                    <div className="w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center flex-shrink-0">
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>
                  )}
                </div>
                <p className="text-[13px] text-gray-600 leading-relaxed">
                  Give Emmaus a scripture passage and a central truth — it writes the greeting, devotional, prayer, next step, and closing for you.
                </p>
              </button>

              {/* Scratch card */}
              <button
                onClick={() => setMethod('scratch')}
                className={`w-full p-5 rounded-2xl border-2 text-left transition-all ${
                  method === 'scratch' ? 'border-gray-800 bg-gray-50' : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3 mb-2.5">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${method === 'scratch' ? 'bg-gray-800' : 'bg-gray-100'}`}>
                    <PenLine size={17} className={method === 'scratch' ? 'text-white' : 'text-gray-500'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-gray-900 leading-tight">Start from Scratch</p>
                    <p className="text-[12px] text-gray-500 mt-0.5">Open a blank day editor and write everything yourself</p>
                  </div>
                  {method === 'scratch' && (
                    <div className="w-5 h-5 rounded-full bg-gray-800 flex items-center justify-center flex-shrink-0">
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>
                  )}
                </div>
                <p className="text-[13px] text-gray-600 leading-relaxed">
                  Open a blank day editor with a pre-filled day number. You write the scripture, devotional, prayer, and action step yourself.
                </p>
              </button>
            </div>
          )}

          {/* ── Step 2 (AI): Form ─────────────────────────────────────────── */}
          {step === 2 && phase === 'form' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                  <BookOpen size={17} className="text-teal-600" />
                </div>
                <p className="text-[13px] text-gray-500 leading-relaxed">
                  Emmaus writes the full day from a passage and a central truth. The more you give it, the better the result.
                </p>
              </div>

              {/* Scripture */}
              <div>
                <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">
                  Scripture Reference <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    autoFocus
                    type="text"
                    value={scripture}
                    onChange={e => handleScriptureChange(e.target.value)}
                    placeholder="e.g. John 3:16, Psalm 23, Romans 8:1-4"
                    className={`w-full pl-3.5 pr-10 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent ${
                      scriptureStatus === 'invalid' ? 'border-red-300' :
                      scriptureStatus === 'valid'   ? 'border-green-300' :
                      'border-gray-200'
                    }`}
                  />
                  {/* Status icon */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {scriptureStatus === 'checking' && <Loader2 size={14} className="animate-spin text-gray-400" />}
                    {scriptureStatus === 'valid'    && <CheckCircle2 size={14} className="text-green-500" />}
                    {scriptureStatus === 'invalid'  && <AlertTriangle size={14} className="text-red-400" />}
                  </div>
                </div>
                {scriptureStatus === 'invalid' && (
                  <p className="text-[11px] text-red-500 mt-1">
                    This reference wasn't found in the Bible library — check spelling or try a shorter reference.
                  </p>
                )}
                {scriptureStatus === 'valid' && (
                  <p className="text-[11px] text-green-600 mt-1">Passage found — Emmaus will use it in generation.</p>
                )}
              </div>

              {/* Central truth */}
              <div>
                <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">
                  Central Truth / Theme <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={centralTruth}
                  onChange={e => setCentralTruth(e.target.value)}
                  rows={3}
                  placeholder="e.g. God's love is unconditional — there is nothing we can do to earn or lose it."
                  className="w-full px-3.5 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent resize-none"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  The one truth you want members to carry away from this day.
                </p>
              </div>

              {/* Day title */}
              <div>
                <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">
                  Day Title
                  <span className="ml-1.5 text-[11px] font-normal text-gray-400">optional — Emmaus will suggest one if blank</span>
                </label>
                <input
                  type="text"
                  value={dayTitle}
                  onChange={e => setDayTitle(e.target.value)}
                  placeholder="e.g. The God Who Sees You"
                  className="w-full px-3.5 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
                />
              </div>

              {/* Writing style */}
              <div>
                <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">Writing Style</label>
                <div className="relative">
                  <select
                    value={writingStyle}
                    onChange={e => setWritingStyle(e.target.value as WritingStyle)}
                    className="w-full appearance-none pl-3 pr-8 py-2.5 text-[13px] text-gray-900 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
                  >
                    {WRITING_STYLES.map(s => (
                      <option key={s.value} value={s.value}>{s.label} — {s.desc}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {errorMsg && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                  <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[12px] text-red-700">{errorMsg}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2 (AI): Generating ──────────────────────────────────── */}
          {step === 2 && phase === 'generating' && (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-5">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-teal-50 flex items-center justify-center">
                  <Sparkles size={28} className="text-teal-500" />
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center">
                  <Loader2 size={11} className="animate-spin text-white" />
                </div>
              </div>
              <div>
                <p className="text-[15px] font-semibold text-gray-900 mb-1">Emmaus is writing your day</p>
                <p className="text-[13px] text-gray-500 transition-all duration-500">
                  {PROGRESS_MESSAGES[progressIdx]}
                </p>
              </div>
              <div className="flex gap-1.5 mt-2">
                {PROGRESS_MESSAGES.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i <= progressIdx ? 'w-5 bg-teal-500' : 'w-1.5 bg-gray-200'
                    }`}
                  />
                ))}
              </div>
              <p className="text-[12px] text-gray-400 max-w-[260px]">
                This takes about 30–90 seconds. The day will open in the editor when ready.
              </p>
            </div>
          )}

          {/* ── Step 2 (AI): Error ────────────────────────────────────────── */}
          {step === 2 && phase === 'error' && (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center">
                <AlertTriangle size={28} className="text-amber-500" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-gray-900 mb-1">Generation didn't complete</p>
                <p className="text-[13px] text-gray-500 max-w-[300px] leading-relaxed">{errorMsg}</p>
              </div>
              <button
                onClick={() => setPhase('form')}
                className="text-[13px] font-medium text-teal-600 hover:text-teal-800 underline underline-offset-2"
              >
                Edit inputs and try again
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100">
          <button
            onClick={handleContinue}
            disabled={primaryDisabled || phase === 'generating'}
            className={`w-full h-12 rounded-2xl text-[15px] font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${footerBg}`}
          >
            {footerLabel()}
          </button>
        </div>

      </div>
    </div>
  );
}
