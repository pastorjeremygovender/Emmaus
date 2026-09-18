/**
 * NewJourneyModal — 2-step creation wizard
 *
 * Step 1  Choose creation method: Build with Emmaus AI | Start from Scratch
 * Step 2  Walk Details  (title, description, collection, walk type, estimated length)
 *
 * AI path    → JourneyBuilderWizard (content type defaulted to 'daily-devotional')
 * Scratch    → addJourney() → onCreated()
 */

import React, { useEffect, useState } from 'react';
import {
  X, Sparkles, PenLine, ArrowLeft, ArrowRight, Loader2,
} from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { listCollections } from '@/lib/collections-api';
import type { Collection } from '@/lib/collections-api';
import JourneyBuilderWizard from './JourneyBuilderWizard';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onCreated: (journeyId: string) => void;
  /** Pre-selects the collection dropdown when opening from a collection context */
  defaultCollectionId?: string;
}

type WizardStep     = 1 | 2;
type CreationMethod = 'ai' | 'scratch';

// Walks created from this modal are always journeyType='walk'.
// The sub-type options below are retired — journeyType is not used for
// sub-classification anywhere in the product.

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewJourneyModal({ onClose, onCreated, defaultCollectionId }: Props) {
  const { user }       = useAuth();
  const { addJourney } = useJourney();

  const [step,   setStep]   = useState<WizardStep>(1);
  const [method, setMethod] = useState<CreationMethod | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [launchBuilder, setLaunchBuilder] = useState(false);

  const [form, setForm] = useState({
    title:           '',
    description:     '',
    collectionId:    defaultCollectionId ?? '',
    journeyType:     'walk',
    estimatedLength: '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  useEffect(() => {
    listCollections().then(setCollections).catch(() => {});
  }, []);

  const patchForm = (k: keyof typeof form, v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  // ── Navigation ──────────────────────────────────────────────────────────────

  const handleBack = () => {
    if (step === 1) { onClose(); return; }
    setError('');
    setStep(1);
  };

  const handlePrimaryAction = () => {
    if (step === 1) { setStep(2); return; }
    if (method === 'scratch') { handleCreate(); return; }
    setLaunchBuilder(true);
  };

  const handleCreate = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setSaving(true); setError('');
    try {
      const created = await addJourney({
        id:             '',
        title:          form.title.trim(),
        description:    form.description,
        journeyType:    form.journeyType,
        status:         'Draft',
        durationDays:   parseInt(form.estimatedLength, 10) || 0,
        churchWide:     false,
        overloadExempt: false,
        updatedAt:      new Date().toISOString(),
        ...(form.collectionId ? { collectionId: form.collectionId } : {}),
      });
      onCreated(created.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create walk');
      setSaving(false);
    }
  };

  // ── Builder hand-off ────────────────────────────────────────────────────────

  if (launchBuilder) {
    return (
      <JourneyBuilderWizard
        initialContentType="daily-devotional"
        initialTitle={form.title}
        initialScreen={1}
        userId={user?.id}
        collections={collections}
        onClose={onClose}
        onCreated={onCreated}
      />
    );
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const STEP_TITLES: Record<WizardStep, string> = {
    1: 'Create a Walk',
    2: 'Walk Details',
  };

  const primaryDisabled =
    (step === 1 && method === null) ||
    (step === 2 && (!form.title.trim() || saving));

  const primaryLabel = (): React.ReactNode => {
    if (step === 1)          return <><span>Continue</span><ArrowRight size={15} /></>;
    if (saving)              return <><Loader2 size={15} className="animate-spin" /><span>Creating…</span></>;
    if (method === 'ai')     return <><span>Build with Emmaus AI</span><Sparkles size={15} /></>;
    return <span>Create Walk</span>;
  };

  const footerBg =
    step === 2 && method === 'scratch'
      ? 'bg-gray-900 hover:bg-gray-800 text-white'
      : 'bg-teal-600 hover:bg-teal-700 text-white';

  // ── Render ──────────────────────────────────────────────────────────────────

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
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Progress pills — 2 steps */}
        <div className="flex-shrink-0 flex items-center gap-1.5 px-5 pt-3.5 pb-1">
          {([1, 2] as WizardStep[]).map(s => (
            <div
              key={s}
              className={`h-[3px] rounded-full flex-1 transition-all duration-300 ${
                s <= step
                  ? method === 'scratch' ? 'bg-gray-800' : 'bg-teal-500'
                  : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">

          {/* ── Step 1 — Choose method ──────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-[13px] text-gray-500 leading-relaxed mb-2">
                How would you like to create this walk?
              </p>

              {/* Build with AI */}
              <button
                onClick={() => setMethod('ai')}
                className={`w-full p-5 rounded-2xl border-2 text-left transition-all ${
                  method === 'ai'
                    ? 'border-teal-500 bg-teal-50/80'
                    : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3 mb-2.5">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                    method === 'ai' ? 'bg-teal-500' : 'bg-gray-100'
                  }`}>
                    <Sparkles size={17} className={method === 'ai' ? 'text-white' : 'text-gray-500'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-gray-900 leading-tight">
                      Build with Emmaus AI
                    </p>
                    <p className="text-[12px] text-gray-500 mt-0.5">
                      Emmaus writes a full structured draft
                    </p>
                  </div>
                  {method === 'ai' && (
                    <div className="w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center flex-shrink-0">
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>
                  )}
                </div>
                <p className="text-[13px] text-gray-600 leading-relaxed">
                  Answer a few questions and Emmaus creates a complete walk — real Scripture, real sermon sources, structured steps. Always saved as Draft for you to review.
                </p>
              </button>

              {/* Start from scratch */}
              <button
                onClick={() => setMethod('scratch')}
                className={`w-full p-5 rounded-2xl border-2 text-left transition-all ${
                  method === 'scratch'
                    ? 'border-gray-800 bg-gray-50'
                    : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3 mb-2.5">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                    method === 'scratch' ? 'bg-gray-800' : 'bg-gray-100'
                  }`}>
                    <PenLine size={17} className={method === 'scratch' ? 'text-white' : 'text-gray-500'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-gray-900 leading-tight">
                      Start from Scratch
                    </p>
                    <p className="text-[12px] text-gray-500 mt-0.5">
                      Blank canvas, you write everything
                    </p>
                  </div>
                  {method === 'scratch' && (
                    <div className="w-5 h-5 rounded-full bg-gray-800 flex items-center justify-center flex-shrink-0">
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>
                  )}
                </div>
                <p className="text-[13px] text-gray-600 leading-relaxed">
                  Create an empty walk and build your steps using the block editor. Full creative control from the very first word.
                </p>
              </button>
            </div>
          )}

          {/* ── Step 2 — Walk details ───────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4">

              {/* Title */}
              <div>
                <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => patchForm('title', e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !primaryDisabled) handlePrimaryAction(); }}
                  placeholder="e.g. 10 Minutes with Jesus"
                  autoFocus
                  className="w-full px-3.5 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">
                  Description
                  <span className="ml-1.5 text-[11px] font-normal text-gray-400">optional</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={e => patchForm('description', e.target.value)}
                  placeholder="A short description for this walk…"
                  rows={2}
                  className="w-full px-3.5 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent resize-none"
                />
              </div>

              {/* Collection */}
              {collections.length > 0 && (
                <div>
                  <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">
                    Collection
                  </label>
                  <select
                    value={form.collectionId}
                    onChange={e => patchForm('collectionId', e.target.value)}
                    className="w-full px-3 py-2.5 text-[13px] text-gray-900 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
                  >
                    <option value="">None</option>
                    {collections.map(c => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Estimated length */}
              <div>
                <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">
                  Estimated Length
                  <span className="ml-1.5 text-[11px] font-normal text-gray-400">days</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={form.estimatedLength}
                  onChange={e => patchForm('estimatedLength', e.target.value)}
                  placeholder="e.g. 7"
                  className="w-full px-3.5 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
                />
              </div>

              {error && (
                <p className="text-[13px] text-red-600 font-medium">{error}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100">
          <button
            onClick={handlePrimaryAction}
            disabled={primaryDisabled}
            className={`w-full h-12 rounded-2xl text-[15px] font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${footerBg}`}
          >
            {primaryLabel()}
          </button>
        </div>

      </div>
    </div>
  );
}
