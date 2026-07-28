/**
 * DailyRhythmDayEditor — purpose-built editor for a single Daily Rhythm day.
 *
 * Layout: two-column split, matching the Daily Devotionals editor standard.
 *   Left panel  — all fields + toolbar (Help Me Write, Save Draft, Publish)
 *   Right panel — live DailyRhythmReading preview; updates as the admin types.
 *
 * Fields: Day Number, Title, Scripture Reference, Greeting, Reflection,
 *         Prayer, Your Next Step, Closing
 * Actions: Help Me Write, Save Draft, Publish, Duplicate, Delete
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Save, CheckCircle, Copy, Trash2,
  AlertTriangle, Loader2, X, Wand2, ChevronDown, CornerDownLeft,
} from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import type { Journey, Step } from '@/lib/journeys-api';
import { DailyRhythmReading, PreviewContinueButton, resolveDisplayName } from '@/components/DailyRhythmReading';
import { WritingAssistantPanel, type PreviousDayInfo } from '@/components/WritingAssistantPanel';
import { refineContent, type DraftField, type RefineAction } from '@/lib/writing-assistant-api';
import { ContentStudioToolbar } from '../shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  journeyId: string;
  day: number | null; // null = new day
  onBack: () => void;
  onDuplicated: (newDay: number) => void;
  onDeleted: () => void;
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
};

// ─── Field components ─────────────────────────────────────────────────────────

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <label className="text-[13px] font-semibold text-gray-700">{children}</label>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function TextArea({
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

// ─── Field refiner (inline AI editing actions) ────────────────────────────────

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

  // Close menu on outside click
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
      setError('We couldn\'t delete this day. Please try again.');
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
            <p className="text-sm text-gray-500 mt-0.5">This will permanently remove Day {dayNum} and its content. This cannot be undone.</p>
          </div>
        </div>
        {error && <p className="px-6 pt-4 text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-end gap-3 px-6 pb-6 pt-4">
          <button onClick={onCancel} disabled={busy} className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={busy} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-40">
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            Delete Day
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────

export default function DailyRhythmDayEditor({ journeyId, day, onBack, onDuplicated, onDeleted }: Props) {
  const { getJourney, getStep, steps, addStep, updateStep, deleteStep } = useJourney();
  const { user } = useAuth();
  const journey = getJourney(journeyId) as Journey | undefined;
  const isEditor = user?.role === 'admin' || user?.role === 'superAdmin';

  // Preview uses the signed-in admin's name for realism; falls back to "Jeremy".
  const previewName = resolveDisplayName(user?.preferredName) ?? 'Jeremy';

  // Compute next available day number for new days
  const nextDay = useMemo(() => computeNextDay(steps as Step[], journeyId), [steps, journeyId]);

  const [form, setForm] = useState<DayForm>(() => ({ ...EMPTY_FORM, day: day ?? nextDay }));
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingAs, setSavingAs] = useState<'draft' | 'published' | null>(null);
  const [stepStatus, setStepStatus] = useState<'Draft' | 'Published'>('Draft');
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [currentDay, setCurrentDay] = useState<number | null>(day); // tracks saved day number
  const [showAssistant, setShowAssistant] = useState(false);

  // Load existing step
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
        });
        setCurrentDay(existing.day);
        setStepStatus(((existing as Step & { status?: string }).status as 'Draft' | 'Published') ?? 'Draft');
      }
    }
    setLoaded(true);
  }, [day, journeyId]);

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
    status,
  } as Step & { closingText: string; status: string });

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
      setSuccessMsg(status === 'Published' ? 'Published successfully.' : 'Draft saved successfully.');
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
      // Save current first to preserve content
      if (currentDay === null) await handleSave('Draft');
      const newDayNum = nextDay > form.day ? nextDay : form.day + 1;
      const data = {
        ...buildStepData('Draft'),
        day: newDayNum,
      };
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

  // Previous days for Writing Assistant continuity context
  const previousDays = useMemo<PreviousDayInfo[]>(() =>
    (steps as Step[])
      .filter(s => s.journeyId === journeyId && s.day < form.day)
      .sort((a, b) => b.day - a.day)
      .slice(0, 3)
      .map(s => ({
        day: s.day,
        title: (s as Step & { title?: string }).title ?? '',
        scripture: (s as Step & { scripture?: string }).scripture ?? '',
        devotional: (s as Step & { devotional?: string }).devotional ?? '',
        actionStep: (s as Step & { actionStep?: string }).actionStep ?? '',
      })),
    [steps, journeyId, form.day]
  );

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
      {/* Writing Assistant panel — full-screen overlay; unchanged */}
      {showAssistant && user && (
        <WritingAssistantPanel
          journeyId={journeyId}
          dayNumber={form.day}
          dayTitle={form.title}
          scriptureRef={form.scripture}
          existingContent={{
            mentorIntro:  form.mentorIntro,
            devotional:   form.devotional,
            prayerPrompt: form.prayerPrompt,
            actionStep:   form.actionStep,
            closingText:  form.closingText,
          }}
          previousDays={previousDays}
          user={user}
          onApplyField={handleApplyField}
          onClose={() => setShowAssistant(false)}
        />
      )}

      {/* Delete confirm */}
      {showDelete && (
        <DeleteConfirmDialog
          dayNum={currentDay ?? form.day}
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}

      {/* ── Two-column split layout (matches Daily Devotionals editor standard) ── */}
      <div className="flex h-full min-h-0 bg-gray-50">

        {/* ── Left panel: editor fields ──────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 bg-white border-r border-gray-200 overflow-y-auto">

          {/* Sticky header — ContentStudioToolbar */}
          <ContentStudioToolbar
            onBack={onBack}
            title={journey?.title ?? 'Daily Rhythm'}
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
                {isEditor && (
                  <button
                    onClick={() => setShowAssistant(v => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[13px] transition-colors ${
                      showAssistant
                        ? 'border-teal-400 bg-teal-600 text-white hover:bg-teal-700'
                        : 'border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100'
                    }`}
                  >
                    <Wand2 size={12} />
                    Help Me Write
                  </button>
                )}
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

          {/* Fields */}
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
              <TextArea
                value={form.mentorIntro}
                onChange={v => patch('mentorIntro', v)}
                rows={3}
                placeholder="A warm opening that sets the tone for today's time…"
              />
              {isEditor && (
                <FieldRefiner field="mentorIntro" fieldLabel="Greeting" value={form.mentorIntro}
                  onApply={(v, mode) => handleApplyField('mentorIntro', v, mode)}
                  scripture={form.scripture} dayTitle={form.title}
                  userId={user?.id ?? ''} userRole={user?.role ?? ''} />
              )}
            </div>

            {/* Reflection */}
            <div>
              <FieldLabel>Reflection</FieldLabel>
              <TextArea
                value={form.devotional}
                onChange={v => patch('devotional', v)}
                rows={6}
                placeholder="The main devotional reflection for this day…"
              />
              {isEditor && (
                <FieldRefiner field="devotional" fieldLabel="Reflection" value={form.devotional}
                  onApply={(v, mode) => handleApplyField('devotional', v, mode)}
                  scripture={form.scripture} dayTitle={form.title}
                  userId={user?.id ?? ''} userRole={user?.role ?? ''} />
              )}
            </div>

            {/* Prayer */}
            <div>
              <FieldLabel>Prayer</FieldLabel>
              <TextArea
                value={form.prayerPrompt}
                onChange={v => patch('prayerPrompt', v)}
                rows={3}
                placeholder="A prayer the member can pray or adapt…"
              />
              {isEditor && (
                <FieldRefiner field="prayerPrompt" fieldLabel="Prayer" value={form.prayerPrompt}
                  onApply={(v, mode) => handleApplyField('prayerPrompt', v, mode)}
                  scripture={form.scripture} dayTitle={form.title}
                  userId={user?.id ?? ''} userRole={user?.role ?? ''} />
              )}
            </div>

            {/* Your Next Step */}
            <div>
              <FieldLabel>Your Next Step</FieldLabel>
              <TextArea
                value={form.actionStep}
                onChange={v => patch('actionStep', v)}
                rows={3}
                placeholder="One concrete action to take today…"
              />
              {isEditor && (
                <FieldRefiner field="actionStep" fieldLabel="Your Next Step" value={form.actionStep}
                  onApply={(v, mode) => handleApplyField('actionStep', v, mode)}
                  scripture={form.scripture} dayTitle={form.title}
                  userId={user?.id ?? ''} userRole={user?.role ?? ''} />
              )}
            </div>

            {/* Closing */}
            <div>
              <FieldLabel>Closing</FieldLabel>
              <TextArea
                value={form.closingText}
                onChange={v => patch('closingText', v)}
                rows={2}
                placeholder="e.g. Tomorrow we'll continue walking together."
              />
              {isEditor && (
                <FieldRefiner field="closingText" fieldLabel="Closing" value={form.closingText}
                  onApply={(v, mode) => handleApplyField('closingText', v, mode)}
                  scripture={form.scripture} dayTitle={form.title}
                  userId={user?.id ?? ''} userRole={user?.role ?? ''} />
              )}
            </div>

          </div>
        </div>

        {/* ── Right panel: live preview ───────────────────────────────────────── */}
        <div className="w-[360px] flex-shrink-0 bg-background border-l border-gray-200 overflow-y-auto">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide text-center">Preview</p>
          </div>
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
            previewMode
            actionButton={<PreviewContinueButton />}
          />
        </div>

      </div>
    </>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function computeNextDay(steps: Step[], journeyId: string): number {
  const days = steps.filter(s => s.journeyId === journeyId).map(s => s.day);
  return days.length === 0 ? 1 : Math.max(...days) + 1;
}
