/**
 * DailyRhythmDayEditor — editor for a single Daily Rhythm OR Journey day.
 *
 * Uses EmmausContentEditor for the shared two-panel layout:
 *   Left panel  — all fields + ContentStudioToolbar
 *   Right panel — live DailyRhythmReading preview; updates as the admin types.
 *
 * Fields: Day Number, Title, Scripture Reference, Greeting,
 *         Reflection (daily-rhythm) / Today's Journey (journey),
 *         Prayer,
 *         Your Next Step (daily-rhythm) / Today's Step (journey),
 *         Closing
 *
 * Actions: Help Me Write, Save Draft, Publish, Duplicate, Delete
 *
 * Pass variant="journey" when rendering a Journey day so the correct approved
 * terminology appears. Default is 'daily-rhythm'.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Copy, Loader2, X, Wand2, ChevronDown, CornerDownLeft, AlertTriangle,
} from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import type { Journey, Step } from '@/lib/journeys-api';
import { getStepLabel } from '@/lib/step-label';
import { DailyRhythmReading, PreviewContinueButton, resolveDisplayName } from '@/components/DailyRhythmReading';
import { ShareImageField } from '@/components/ShareImageField';
import { refineContent, type DraftField, type RefineAction } from '@/lib/writing-assistant-api';
import { ContentStudioToolbar } from '../shared';
import EmmausContentEditor from './EmmausContentEditor';

// ─── Variant labels ───────────────────────────────────────────────────────────

type EditorVariant = 'daily-rhythm' | 'journey';

interface VariantLabels {
  reflection: string;
  reflectionHint: string;
  actionStep: string;
  actionStepHint: string;
}

const VARIANT_LABELS: Record<EditorVariant, VariantLabels> = {
  'daily-rhythm': {
    reflection:     'Reflection',
    reflectionHint: 'The main devotional reflection for this day — 2–4 paragraphs.',
    actionStep:     'Your Next Step',
    actionStepHint: 'One concrete action for today.',
  },
  'journey': {
    reflection:     'Consider This',
    reflectionHint: 'The main devotional reflection for this day — 2–4 paragraphs. Help members see what the scripture means for their life today.',
    actionStep:     'Your Next Step',
    actionStepHint: 'One concrete action the member can take today.',
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  journeyId: string;
  day: number | null; // null = new day
  onBack: () => void;
  onDuplicated: (newDay: number) => void;
  onDeleted: () => void;
  /** Controls field labels. Default: 'daily-rhythm' */
  variant?: EditorVariant;
}

interface DayForm {
  day: number;
  title: string;
  scripture: string;
  mentorIntro: string;
  devotional: string;
  prayerPrompt: string;
  actionStep: string;
  closingText: string;
  /** Optional display label (e.g. "1 January"). Overrides the journey-level prefix formula. */
  displayLabel: string;
  /** Optional share image — object-storage path ("/objects/…"). */
  shareImageUrl: string | null;
}

const EMPTY_FORM: DayForm = {
  day: 1,
  title: '',
  scripture: '',
  mentorIntro: '',
  devotional: '',
  prayerPrompt: '',
  actionStep: '',
  closingText: '',
  displayLabel: '',
  shareImageUrl: null,
};

// ─── Field sub-components ─────────────────────────────────────────────────────

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <label className="text-[13px] font-semibold text-gray-700">{children}</label>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function StyledTextArea({
  value, onChange, rows = 4, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full px-4 py-3 text-[14px] text-gray-800 bg-gray-50 border border-gray-200 rounded-xl
        focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent resize-none
        placeholder:text-gray-300 leading-relaxed"
    />
  );
}

// ─── Inline AI field refiner ──────────────────────────────────────────────────

const FIELD_REFINE_ACTIONS: Record<string, Array<{ action: RefineAction; label: string }>> = {
  mentorIntro:  [
    { action: 'warmer',      label: 'Make warmer' },
    { action: 'clearer',     label: 'Make clearer' },
    { action: 'shorter',     label: 'Shorten' },
    { action: 'new-believer',label: 'For new believers' },
  ],
  devotional: [
    { action: 'warmer',         label: 'Make warmer' },
    { action: 'clearer',        label: 'Make clearer' },
    { action: 'shorter',        label: 'Shorten' },
    { action: 'paragraph-flow', label: 'Improve paragraph flow' },
    { action: 'jesus-central',  label: 'Keep Jesus central' },
    { action: 'new-believer',   label: 'For new believers' },
  ],
  prayerPrompt: [
    { action: 'warmer',         label: 'Make warmer' },
    { action: 'clearer',        label: 'Make clearer' },
    { action: 'shorter',        label: 'Shorten' },
    { action: 'new-believer',   label: 'For new believers' },
    { action: 'another-prayer', label: 'New version' },
  ],
  actionStep: [
    { action: 'clearer',          label: 'Make clearer' },
    { action: 'shorter',          label: 'Shorten' },
    { action: 'another-next-step',label: 'Suggest different step' },
    { action: 'check-repetition', label: 'Check for repetition' },
  ],
  closingText: [
    { action: 'warmer',  label: 'Make warmer' },
    { action: 'clearer', label: 'Make clearer' },
    { action: 'shorter', label: 'Shorten' },
  ],
};

interface FieldRefinerProps {
  field: DraftField;
  fieldLabel: string;
  value: string;
  onApply: (v: string, mode: 'replace' | 'append') => void;
  scripture: string;
  dayTitle: string;
  userId: string;
  userRole: string;
}

function FieldRefiner({ field, fieldLabel, value, onApply, scripture, dayTitle, userId, userRole }: FieldRefinerProps) {
  const [open, setOpen] = useState(false);
  const [refining, setRefining] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [activeAction, setActiveAction] = useState<RefineAction | null>(null);
  const [refineError, setRefineError] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const actions = FIELD_REFINE_ACTIONS[field] ?? [];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleAction = async (action: RefineAction) => {
    if (!value.trim()) return;
    setOpen(false);
    setRefining(true);
    setActiveAction(action);
    setSuggestion('');
    setRefineError('');
    try {
      const result = await refineContent(userId, userRole, action, value, {
        scripture,
        dayTitle,
        fieldLabel,
      });
      setSuggestion(result.suggestion);
    } catch (err) {
      setRefineError(err instanceof Error ? err.message : 'Could not refine content. Please try again.');
    } finally {
      setRefining(false);
    }
  };

  return (
    <div className="mt-2 space-y-2">
      <div className="relative inline-block" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          disabled={!value.trim()}
          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-teal-600 disabled:opacity-30 transition-colors py-0.5"
        >
          <Wand2 size={11} />
          AI
          <ChevronDown size={10} />
        </button>
        {open && (
          <div className="absolute left-0 top-6 z-30 w-52 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden py-1">
            {actions.map(({ action, label }) => (
              <button
                key={action}
                type="button"
                onClick={() => handleAction(action)}
                className="w-full text-left px-3 py-2 text-[12px] text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {refining && (
        <div className="flex items-center gap-2 text-[12px] text-gray-400 animate-pulse">
          <Loader2 size={11} className="animate-spin" />
          Refining…
        </div>
      )}

      {refineError && (
        <p className="text-[12px] text-red-500">{refineError}</p>
      )}

      {suggestion && !refining && (
        <div className="border border-teal-200 bg-teal-50 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-teal-700 uppercase tracking-wide">AI Suggestion</span>
            <button type="button" onClick={() => { setSuggestion(''); setActiveAction(null); }}
              className="text-teal-400 hover:text-teal-600 transition-colors">
              <X size={12} />
            </button>
          </div>
          <p className="text-[13px] text-gray-700 whitespace-pre-line leading-relaxed">{suggestion}</p>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => { onApply(suggestion, 'replace'); setSuggestion(''); setActiveAction(null); }}
              className="flex items-center gap-1 px-3 py-1.5 text-[12px] bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              <CornerDownLeft size={10} /> Replace
            </button>
            <button
              type="button"
              onClick={() => { onApply(suggestion, 'append'); setSuggestion(''); setActiveAction(null); }}
              className="px-3 py-1.5 text-[12px] border border-teal-200 text-teal-700 rounded-lg hover:bg-teal-50 transition-colors"
            >
              Insert Below
            </button>
            <button
              type="button"
              onClick={() => { setSuggestion(''); setActiveAction(null); }}
              className="px-3 py-1.5 text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Delete confirmation ───────────────────────────────────────────────────────

function DeleteConfirmDialog({ dayNum, onConfirm, onCancel }: {
  dayNum: number;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    setBusy(true);
    try { await onConfirm(); } catch {
      setError("We couldn't delete this day. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-start gap-3 px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} className="text-red-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Delete Day {dayNum}?</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              This will permanently remove Day {dayNum} and its content. This cannot be undone.
            </p>
          </div>
        </div>
        {error && <p className="px-6 pt-4 text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-end gap-3 px-6 pb-6 pt-4">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            Delete Day
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────

export default function DailyRhythmDayEditor({
  journeyId,
  day,
  onBack,
  onDuplicated,
  onDeleted,
  variant = 'daily-rhythm',
}: Props) {
  const { getJourney, getStep, steps, addStep, updateStep, deleteStep } = useJourney();
  const editorJourney = getJourney(journeyId);
  const { user } = useAuth();
  const journey = getJourney(journeyId) as Journey | undefined;
  const isEditor = user?.role === 'admin' || user?.role === 'superAdmin';
  const labels = VARIANT_LABELS[variant];

  const previewName = resolveDisplayName(user?.preferredName) ?? 'Jeremy';

  const nextDay = useMemo(() => computeNextDay(steps as Step[], journeyId), [steps, journeyId]);

  const [form, setForm] = useState<DayForm>(() => ({ ...EMPTY_FORM, day: day ?? nextDay }));
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingAs, setSavingAs] = useState<'draft' | 'published' | null>(null);
  const [stepStatus, setStepStatus] = useState<'Draft' | 'Published'>('Draft');
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [currentDay, setCurrentDay] = useState<number | null>(day);
  useEffect(() => {
    if (day !== null) {
      const existing = getStep(journeyId, day) as (Step & { closingText?: string }) | undefined;
      if (existing) {
        setForm({
          day: existing.day,
          title: existing.title ?? '',
          scripture: existing.scripture ?? '',
          mentorIntro: existing.mentorIntro ?? '',
          devotional: existing.devotional ?? '',
          prayerPrompt: existing.prayerPrompt ?? '',
          actionStep: existing.actionStep ?? '',
          closingText: existing.closingText ?? '',
          displayLabel: (existing as any).displayLabel ?? '',
          shareImageUrl: existing.shareImageUrl ?? null,
        });
        setCurrentDay(existing.day);
        setStepStatus(((existing as Step & { status?: string }).status as 'Draft' | 'Published') ?? 'Draft');
      }
    }
    setLoaded(true);
  }, [day, journeyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = useCallback(<K extends keyof DayForm>(key: K, val: DayForm[K]) => {
    setForm(f => ({ ...f, [key]: val }));
  }, []);

  const buildStepData = (status: 'Draft' | 'Published') => ({
    journeyId,
    day: form.day,
    title: form.title,
    scripture: form.scripture,
    mentorIntro: form.mentorIntro,
    devotional: form.devotional,
    prayerPrompt: form.prayerPrompt,
    actionStep: form.actionStep,
    closingText: form.closingText,
    displayLabel: form.displayLabel || null,
    shareImageUrl: form.shareImageUrl ?? null,
    status,
  } as Step & { closingText: string; displayLabel: string | null; shareImageUrl: string | null; status: string });

  const handleSave = async (status: 'Draft' | 'Published' = 'Draft') => {
    if (saving) return;
    setSaving(true);
    setSavingAs(status === 'Published' ? 'published' : 'draft');
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const data = buildStepData(status);
      if (currentDay === null) {
        const created = await addStep(data);
        setCurrentDay(created.day);
      } else {
        await updateStep(data, currentDay !== form.day ? currentDay : undefined);
        setCurrentDay(form.day);
      }
      setStepStatus(status);
      setSuccessMsg(
        status === 'Published' ? 'Published successfully.' :
        stepStatus === 'Published' ? 'Changes saved successfully.' : 'Draft saved successfully.'
      );
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setErrorMsg('Save failed — please try again.');
      setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setSaving(false);
      setSavingAs(null);
    }
  };

  const handleDuplicate = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (currentDay === null) await handleSave('Draft');
      const newDayNum = nextDay > form.day ? nextDay : form.day + 1;
      const data = { ...buildStepData('Draft'), day: newDayNum };
      const created = await addStep(data);
      onDuplicated(created.day);
    } catch {
      setErrorMsg('Duplicate failed — please try again.');
      setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (currentDay === null) { onDeleted(); return; }
    await deleteStep(journeyId, currentDay);
    onDeleted();
  };

  const handleApplyField = useCallback((field: DraftField, value: string, mode: 'replace' | 'append') => {
    const existing = form[field as keyof DayForm] as string;
    patch(
      field as keyof DayForm,
      mode === 'append' && existing.trim() ? `${existing}\n\n${value}` : value
    );
  }, [form, patch]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <Loader2 size={18} className="animate-spin mr-2" /> Loading…
      </div>
    );
  }

  return (
    <>
      <EmmausContentEditor
        toolbar={
          <ContentStudioToolbar
            onBack={onBack}
            title={journey?.title ?? (variant === 'journey' ? 'Journey' : 'Daily Rhythm')}
            subtitle={`Day ${form.day}${form.title ? ` — ${form.title}` : ''}`}
            status={stepStatus}
            isSaving={savingAs === 'draft'}
            isPublishing={savingAs === 'published'}
            successMessage={successMsg}
            errorMessage={errorMsg}
            onSaveDraft={() => handleSave('Draft')}
            onPublish={() => handleSave('Published')}
            onUnpublish={() => handleSave('Draft')}
            onDelete={() => setShowDelete(true)}
            extraActions={
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleDuplicate}
                  disabled={saving}
                  title="Duplicate this day (Day +1)"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-40"
                >
                  <Copy size={15} />
                </button>
              </div>
            }
          />
        }
        fields={
          <div className="flex-1 p-6 space-y-7 max-w-2xl">

            {/* Day Number + Title row */}
            <div className="grid grid-cols-[120px_1fr] gap-4">
              <div>
                <FieldLabel hint="Integer">Day Number</FieldLabel>
                <input
                  type="number"
                  min={1}
                  value={form.day}
                  onChange={e => patch('day', parseInt(e.target.value, 10) || 1)}
                  className="w-full px-4 py-3 text-[14px] text-gray-800 bg-gray-50 border border-gray-200 rounded-xl
                    focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
                />
              </div>
              <div>
                <FieldLabel>Title</FieldLabel>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => patch('title', e.target.value)}
                  placeholder="e.g. Come and See"
                  className="w-full px-4 py-3 text-[14px] text-gray-800 bg-gray-50 border border-gray-200 rounded-xl
                    focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
                />
              </div>
            </div>

            {/* Scripture Reference */}
            <div>
              <FieldLabel hint="Store only the reference, never the text">Scripture Reference</FieldLabel>
              <input
                type="text"
                value={form.scripture}
                onChange={e => patch('scripture', e.target.value)}
                placeholder="e.g. John 1:35–39"
                className="w-full px-4 py-3 text-[14px] text-gray-800 bg-gray-50 border border-gray-200 rounded-xl
                  focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent font-mono"
              />
            </div>

            {/* Greeting */}
            <div>
              <FieldLabel>Greeting</FieldLabel>
              <StyledTextArea
                value={form.mentorIntro}
                onChange={v => patch('mentorIntro', v)}
                rows={3}
                placeholder="A warm opening that sets the tone for today's time…"
              />
              {isEditor && (
                <FieldRefiner
                  field="mentorIntro" fieldLabel="Greeting" value={form.mentorIntro}
                  onApply={(v, mode) => handleApplyField('mentorIntro', v, mode)}
                  scripture={form.scripture} dayTitle={form.title}
                  userId={user?.id ?? ''} userRole={user?.role ?? ''}
                />
              )}
            </div>

            {/* Reflection / Today's Journey */}
            <div>
              <FieldLabel hint={labels.reflectionHint}>{labels.reflection}</FieldLabel>
              <StyledTextArea
                value={form.devotional}
                onChange={v => patch('devotional', v)}
                rows={6}
                placeholder={variant === 'journey'
                  ? "Guide members through today's scripture and what it means for their life…"
                  : "The main devotional reflection for this day…"
                }
              />
              {isEditor && (
                <FieldRefiner
                  field="devotional" fieldLabel={labels.reflection} value={form.devotional}
                  onApply={(v, mode) => handleApplyField('devotional', v, mode)}
                  scripture={form.scripture} dayTitle={form.title}
                  userId={user?.id ?? ''} userRole={user?.role ?? ''}
                />
              )}
            </div>

            {/* Prayer */}
            <div>
              <FieldLabel>Prayer</FieldLabel>
              <StyledTextArea
                value={form.prayerPrompt}
                onChange={v => patch('prayerPrompt', v)}
                rows={3}
                placeholder="A prayer the member can pray or adapt…"
              />
              {isEditor && (
                <FieldRefiner
                  field="prayerPrompt" fieldLabel="Prayer" value={form.prayerPrompt}
                  onApply={(v, mode) => handleApplyField('prayerPrompt', v, mode)}
                  scripture={form.scripture} dayTitle={form.title}
                  userId={user?.id ?? ''} userRole={user?.role ?? ''}
                />
              )}
            </div>

            {/* Your Next Step / Today's Step */}
            <div>
              <FieldLabel hint={labels.actionStepHint}>{labels.actionStep}</FieldLabel>
              <StyledTextArea
                value={form.actionStep}
                onChange={v => patch('actionStep', v)}
                rows={3}
                placeholder="One concrete action to take today…"
              />
              {isEditor && (
                <FieldRefiner
                  field="actionStep" fieldLabel={labels.actionStep} value={form.actionStep}
                  onApply={(v, mode) => handleApplyField('actionStep', v, mode)}
                  scripture={form.scripture} dayTitle={form.title}
                  userId={user?.id ?? ''} userRole={user?.role ?? ''}
                />
              )}
            </div>

            {/* Closing */}
            <div>
              <FieldLabel>Closing</FieldLabel>
              <StyledTextArea
                value={form.closingText}
                onChange={v => patch('closingText', v)}
                rows={2}
                placeholder="e.g. Tomorrow we'll continue walking together."
              />
              {isEditor && (
                <FieldRefiner
                  field="closingText" fieldLabel="Closing" value={form.closingText}
                  onApply={(v, mode) => handleApplyField('closingText', v, mode)}
                  scripture={form.scripture} dayTitle={form.title}
                  userId={user?.id ?? ''} userRole={user?.role ?? ''}
                />
              )}
            </div>

            {/* Display Label (optional override) */}
            <div>
              <FieldLabel hint="Leave blank to use the default label (e.g. Day 1, Step 1)">Display Label</FieldLabel>
              <input
                type="text"
                value={form.displayLabel}
                onChange={e => patch('displayLabel', e.target.value)}
                placeholder="e.g. 1 January"
                className="w-full px-4 py-3 text-[14px] text-gray-800 bg-gray-50 border border-gray-200 rounded-xl
                  focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
              />
            </div>

            {/* Share Image */}
            <div>
              <FieldLabel hint="Members see a 'Take this with you' card with Save + Share buttons">Share Image</FieldLabel>
              <ShareImageField
                value={form.shareImageUrl}
                onChange={async (path) => {
                  // Update form state and persist immediately with the new path.
                  // Calling handleSave() would read stale form before the state update settles,
                  // so we build the payload here and call updateStep directly.
                  setForm(f => ({ ...f, shareImageUrl: path }));
                  if (currentDay !== null) {
                    await updateStep(
                      { ...buildStepData(stepStatus), shareImageUrl: path },
                      undefined
                    );
                  }
                }}
              />
            </div>

          </div>
        }
        preview={
          <DailyRhythmReading
            day={form.day}
            title={form.title}
            mentorIntro={form.mentorIntro}
            memberName={previewName}
            scripture={form.scripture}
            devotional={form.devotional}
            prayerPrompt={form.prayerPrompt}
            actionStep={form.actionStep}
            closingText={form.closingText}
            displayLabel={getStepLabel({ day: form.day, displayLabel: form.displayLabel || null }, editorJourney ?? undefined)}
            previewMode
            actionButton={<PreviewContinueButton />}
          />
        }
        dialogs={
          showDelete ? (
            <DeleteConfirmDialog
              dayNum={currentDay ?? form.day}
              onConfirm={handleDelete}
              onCancel={() => setShowDelete(false)}
            />
          ) : null
        }
      />
    </>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function computeNextDay(steps: Step[], journeyId: string): number {
  const days = steps.filter(s => s.journeyId === journeyId).map(s => s.day);
  return days.length === 0 ? 1 : Math.max(...days) + 1;
}
