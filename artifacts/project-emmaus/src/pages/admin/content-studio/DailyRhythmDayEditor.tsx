/**
 * DailyRhythmDayEditor — purpose-built editor for a single Daily Rhythm day.
 *
 * Fields: Day Number, Title, Scripture Reference, Greeting, Reflection,
 *         Prayer, Your Next Step, Closing
 * Actions: Preview, Save Draft, Publish, Duplicate, Delete
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Eye, EyeOff, Save, CheckCircle, Copy, Trash2,
  AlertTriangle, Loader2, X,
} from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import type { Journey, Step } from '@/lib/journeys-api';
import { DailyRhythmReading, PreviewContinueButton, resolveDisplayName } from '@/components/DailyRhythmReading';

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

// ─── Preview overlay ──────────────────────────────────────────────────────────

// ─── Preview overlay ──────────────────────────────────────────────────────────
// Wraps the shared DailyRhythmReading component in a full-screen overlay.
// The sticky banner is the only editor-specific control; everything inside
// DailyRhythmReading is pixel-identical to what members see.

function DayPreview({ form, onClose }: { form: DayForm; onClose: () => void }) {
  const { user } = useAuth();
  // Use the signed-in admin's name so preview is realistic; fall back to
  // "Jeremy" (the spec's example) when no usable name is available.
  const previewName = resolveDisplayName(user?.preferredName) ?? 'Jeremy';
  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">

      {/* Editor control — not visible to members */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-100 flex items-center justify-between px-5 h-14">
        <div className="text-[13px] font-medium text-gray-500">Preview — member view</div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <X size={14} /> Close Preview
        </button>
      </div>

      {/* Shared reading component — identical to member experience */}
      <div className="min-h-[100dvh] bg-background pb-8">
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
  const journey = getJourney(journeyId) as Journey | undefined;

  // Compute next available day number for new days
  const nextDay = useMemo(() => computeNextDay(steps as Step[], journeyId), [steps, journeyId]);

  const [form, setForm] = useState<DayForm>(() => ({ ...EMPTY_FORM, day: day ?? nextDay }));
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'published' | 'error'>('idle');
  const [showPreview, setShowPreview] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [currentDay, setCurrentDay] = useState<number | null>(day); // tracks saved day number

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
      }
    }
    setLoaded(true);
  }, [day, journeyId]);

  const patch = useCallback(<K extends keyof DayForm>(key: K, val: DayForm[K]) => {
    setForm(f => ({ ...f, [key]: val }));
    setSaveStatus('idle');
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
    setSaveStatus('idle');
    try {
      const data = buildStepData(status);
      if (currentDay === null) {
        // New step
        const created = await addStep(data);
        setCurrentDay(created.day);
      } else {
        // Existing step — may renumber if day changed
        await updateStep(data, currentDay !== form.day ? currentDay : undefined);
        setCurrentDay(form.day);
      }
      setSaveStatus(status === 'Published' ? 'published' : 'saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
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
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (currentDay === null) { onDeleted(); return; }
    await deleteStep(journeyId, currentDay);
    onDeleted();
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <Loader2 size={18} className="animate-spin mr-2" /> Loading…
      </div>
    );
  }

  return (
    <>
      {/* Preview overlay */}
      {showPreview && (
        <DayPreview form={form} onClose={() => setShowPreview(false)} />
      )}

      {/* Delete confirm */}
      {showDelete && (
        <DeleteConfirmDialog
          dayNum={currentDay ?? form.day}
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}

      <div className="flex flex-col h-full">
        {/* Sticky editor header */}
        <div className="flex-shrink-0 px-6 py-3 bg-white border-b border-gray-100 flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft size={16} />
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-gray-700 truncate">
              {journey?.title ?? 'Daily Rhythm'} · Day {form.day}
              {form.title ? ` — ${form.title}` : ''}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Save status */}
            {saveStatus === 'saved' && (
              <span className="text-[12px] text-teal-600 font-medium flex items-center gap-1">
                <CheckCircle size={12} /> Saved
              </span>
            )}
            {saveStatus === 'published' && (
              <span className="text-[12px] text-teal-600 font-medium flex items-center gap-1">
                <CheckCircle size={12} /> Published
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="text-[12px] text-red-500 font-medium">Save failed</span>
            )}

            <button
              onClick={() => setShowPreview(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {showPreview ? <EyeOff size={13} /> : <Eye size={13} />}
              Preview
            </button>

            <button
              onClick={() => handleSave('Draft')}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save Draft
            </button>

            <button
              onClick={() => handleSave('Published')}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-[13px] font-medium hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
              Publish
            </button>

            <button
              onClick={handleDuplicate}
              disabled={saving}
              title="Duplicate this day (Day +1)"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-40"
            >
              <Copy size={15} />
            </button>

            <button
              onClick={() => setShowDelete(true)}
              title="Delete this day"
              className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* Editor body */}
        <div className="flex-1 overflow-y-auto bg-gray-50/50">
          <div className="max-w-[720px] mx-auto px-6 py-8 space-y-7">

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
            </div>

          </div>
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
