/**
 * NewSeriesModal — AI-guided or from-scratch Daily Devotional series creation.
 *
 * Step 1  Choose method: Build with Emmaus AI | Start from Scratch
 * AI path   → Step 2: What's this series about? (theme, scripture, audience)
 *           → Step 3: Series details (title, type, length) → create → onCreated
 * Scratch   → Step 2: Title + type → create → onCreated
 */

import React, { useState } from 'react';
import {
  X, ArrowLeft, ArrowRight, Sparkles, PenLine, BookHeart, Loader2,
} from 'lucide-react';
import { createSeries } from '@/lib/devotionals-api';
import { useAuth } from '@/contexts/AuthContext';

const TYPE_OPTIONS: Record<string, string> = {
  general:           'General',
  psalms:            'Psalms',
  proverbs:          'Proverbs',
  seasonal:          'Seasonal',
  'church-specific': 'Church Series',
};

const AUDIENCE_OPTIONS = [
  'Whole congregation',
  'New believers',
  "Men's group",
  "Women's group",
  'Young adults',
  'Small groups',
  'Youth',
];

type Method = 'ai' | 'scratch';
type WizardStep = 1 | 2 | 3;

interface Props {
  onClose: () => void;
  onCreated: (seriesId: string) => void;
}

export default function NewSeriesModal({ onClose, onCreated }: Props) {
  const { user } = useAuth();
  const auth = user ? { userId: user.id, userRole: user.role } : undefined;

  const [step, setStep]     = useState<WizardStep>(1);
  const [method, setMethod] = useState<Method | null>(null);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // AI path fields
  const [theme,      setTheme]      = useState('');
  const [scripture,  setScripture]  = useState('');
  const [audience,   setAudience]   = useState('');
  const [aiLength,   setAiLength]   = useState('');

  // Shared / Scratch fields
  const [title,      setTitle]      = useState('');
  const [seriesType, setSeriesType] = useState('general');
  const [length,     setLength]     = useState('');

  // ── Navigation ──────────────────────────────────────────────────────────────

  const handleBack = () => {
    if (step === 1) { onClose(); return; }
    setError('');
    setStep(s => (s - 1) as WizardStep);
  };

  const maxStep: WizardStep = method === 'scratch' ? 2 : 3;

  const primaryDisabled = (() => {
    if (step === 1) return method === null;
    if (step === 2 && method === 'scratch') return !title.trim();
    if (step === 2 && method === 'ai') return !theme.trim();
    if (step === 3) return !title.trim();
    return false;
  })();

  const handleContinue = async () => {
    setError('');
    if (step < maxStep) {
      // Pre-fill title from theme on AI step 2→3
      if (step === 2 && method === 'ai' && !title && theme.trim()) {
        setTitle(theme.trim().charAt(0).toUpperCase() + theme.trim().slice(1));
        if (aiLength) setLength(aiLength);
      }
      setStep(s => (s + 1) as WizardStep);
      return;
    }
    // Final create
    await handleCreate();
  };

  const handleCreate = async () => {
    if (!title.trim()) { setError('Title is required.'); return; }
    setSaving(true);
    try {
      const description = method === 'ai'
        ? [
            theme.trim() ? `Theme: ${theme.trim()}.` : '',
            scripture.trim() ? `Scripture: ${scripture.trim()}.` : '',
            audience.trim() ? `For: ${audience.trim()}.` : '',
          ].filter(Boolean).join(' ')
        : undefined;

      const created = await createSeries(
        { title: title.trim(), seriesType, description: description || undefined },
        auth,
      );
      onCreated(created.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create series. Please try again.');
      setSaving(false);
    }
  };

  // ── Step titles ──────────────────────────────────────────────────────────────

  const STEP_TITLES: Record<WizardStep, string> = {
    1: 'Create a Series',
    2: method === 'scratch' ? 'Series Details' : "What\u2019s This About?",
    3: 'Series Details',
  };

  const totalSteps = maxStep;

  // ── Footer label ─────────────────────────────────────────────────────────────

  const footerLabel = (): React.ReactNode => {
    if (saving)       return <><Loader2 size={15} className="animate-spin" /><span>Creating…</span></>;
    if (step < maxStep) return <><span>Continue</span><ArrowRight size={15} /></>;
    if (method === 'ai') return <><span>Create Series</span><Sparkles size={15} /></>;
    return <span>Create Series</span>;
  };

  const footerBg =
    step === maxStep && method === 'scratch'
      ? 'bg-gray-900 hover:bg-gray-800 text-white'
      : 'bg-teal-600 hover:bg-teal-700 text-white';

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[calc(100dvh-2rem)]">

        {/* Header */}
        <div className="flex-shrink-0 flex items-center px-5 pt-5 pb-4 border-b border-gray-100">
          <button
            onClick={handleBack}
            aria-label={step === 1 ? 'Close' : 'Back'}
            className="flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-900 transition-colors w-20 flex-shrink-0"
          >
            <ArrowLeft size={14} />
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          <h2 className="flex-1 text-[15px] font-semibold text-gray-900 text-center">
            {STEP_TITLES[step]}
          </h2>
          <div className="w-20 flex-shrink-0 flex justify-end">
            <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Progress pills */}
        <div className="flex-shrink-0 flex items-center gap-1.5 px-5 pt-3.5 pb-1">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`h-[3px] rounded-full flex-1 transition-all duration-300 ${i < step ? 'bg-teal-500' : 'bg-gray-200'}`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">

          {/* ── Step 1: Method selection ────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-[13px] text-gray-500 leading-relaxed mb-2">
                How would you like to create this series?
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
                    <p className="text-[12px] text-gray-500 mt-0.5">Emmaus shapes the series around your theme</p>
                  </div>
                  {method === 'ai' && (
                    <div className="w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center flex-shrink-0">
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>
                  )}
                </div>
                <p className="text-[13px] text-gray-600 leading-relaxed">
                  Answer a few questions and Emmaus structures the series — theme, scripture focus, audience, and type — ready for you to write each day.
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
                    <p className="text-[12px] text-gray-500 mt-0.5">Blank canvas, you write everything</p>
                  </div>
                  {method === 'scratch' && (
                    <div className="w-5 h-5 rounded-full bg-gray-800 flex items-center justify-center flex-shrink-0">
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>
                  )}
                </div>
                <p className="text-[13px] text-gray-600 leading-relaxed">
                  Create an empty series and write each devotional entry yourself. Full creative control from day one.
                </p>
              </button>
            </div>
          )}

          {/* ── Step 2 (AI): What's this about? ────────────────────────────── */}
          {step === 2 && method === 'ai' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                  <BookHeart size={17} className="text-teal-600" />
                </div>
                <p className="text-[13px] text-gray-500 leading-relaxed">
                  Help Emmaus shape this series by answering a few questions.
                </p>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">
                  What's the theme or topic? <span className="text-red-500">*</span>
                </label>
                <textarea
                  autoFocus
                  value={theme}
                  onChange={e => setTheme(e.target.value)}
                  rows={3}
                  placeholder="e.g. Finding rest in God's presence during difficult seasons"
                  className="w-full px-3.5 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent resize-none"
                />
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">
                  Scripture focus
                  <span className="ml-1.5 text-[11px] font-normal text-gray-400">optional</span>
                </label>
                <input
                  type="text"
                  value={scripture}
                  onChange={e => setScripture(e.target.value)}
                  placeholder="e.g. Psalm 23, Matthew 11:28–30"
                  className="w-full px-3.5 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">
                  Who is this for?
                  <span className="ml-1.5 text-[11px] font-normal text-gray-400">optional</span>
                </label>
                <select
                  value={audience}
                  onChange={e => setAudience(e.target.value)}
                  className="w-full px-3 py-2.5 text-[13px] text-gray-900 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
                >
                  <option value="">— Select audience —</option>
                  {AUDIENCE_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">
                  Estimated number of days
                  <span className="ml-1.5 text-[11px] font-normal text-gray-400">optional</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={aiLength}
                  onChange={e => setAiLength(e.target.value)}
                  placeholder="e.g. 7"
                  className="w-full px-3.5 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
                />
              </div>
            </div>
          )}

          {/* ── Step 2 (Scratch): Quick details ───────────────────────────── */}
          {step === 2 && method === 'scratch' && (
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  autoFocus
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && title.trim() && !saving) handleCreate(); }}
                  placeholder="e.g. Psalms Daily Devotional"
                  className="w-full px-3.5 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">Series Type</label>
                <select
                  value={seriesType}
                  onChange={e => setSeriesType(e.target.value)}
                  className="w-full px-3 py-2.5 text-[13px] text-gray-900 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
                >
                  {Object.entries(TYPE_OPTIONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* ── Step 3 (AI): Confirm details ──────────────────────────────── */}
          {step === 3 && method === 'ai' && (
            <div className="space-y-4">
              <div className="bg-teal-50 border border-teal-100 rounded-xl p-3 flex gap-2.5 mb-1">
                <Sparkles size={14} className="text-teal-600 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-teal-700 leading-relaxed">
                  Emmaus has pre-filled these details from your answers. Adjust anything before creating.
                </p>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">
                  Series Title <span className="text-red-500">*</span>
                </label>
                <input
                  autoFocus
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Finding Rest in God"
                  className="w-full px-3.5 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">Series Type</label>
                <select
                  value={seriesType}
                  onChange={e => setSeriesType(e.target.value)}
                  className="w-full px-3 py-2.5 text-[13px] text-gray-900 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
                >
                  {Object.entries(TYPE_OPTIONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>

              {error && <p className="text-[13px] text-red-600 font-medium">{error}</p>}
            </div>
          )}

          {step === 2 && error && <p className="text-[13px] text-red-600 font-medium mt-3">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100">
          <button
            onClick={handleContinue}
            disabled={primaryDisabled || saving}
            className={`w-full h-12 rounded-2xl text-[15px] font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${footerBg}`}
          >
            {footerLabel()}
          </button>
        </div>

      </div>
    </div>
  );
}
