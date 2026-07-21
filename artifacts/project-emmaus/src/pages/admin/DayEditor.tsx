import React, { useState, useCallback, useRef } from 'react';
import { useJourney, Step } from '@/contexts/JourneyContext';
import { Sparkles, Copy, Trash2, Save, Eye, EyeOff, ArrowLeft, PlayCircle, Check } from 'lucide-react';
import {
  CollapsibleCard, UnsavedBanner, ConfirmDialog, Field,
  TextInput, TextArea, AdminBtn, SaveMessage,
} from './shared';

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  journeyId: string;
  day: number | null;   // null = new day
  onBack: () => void;
};

// ─── Seed ─────────────────────────────────────────────────────────────────────

const EMPTY_STEP = (journeyId: string, day: number): Step => ({
  journeyId,
  day,
  title: '',
  mentorIntro: '',
  scripture: '',
  devotional: '',
  reflectionQuestion: '',
  prayerPrompt: '',
  actionStep: '',
});

// ─── Validation checklist ─────────────────────────────────────────────────────

type CheckItem = { label: string; ok: boolean };

function buildChecklist(form: Step): CheckItem[] {
  return [
    { label: 'Title', ok: !!form.title.trim() },
    { label: 'Scripture', ok: !!form.scripture.trim() },
    { label: 'Reflection', ok: !!form.devotional.trim() },
    { label: 'Prayer', ok: !!form.prayerPrompt.trim() },
    { label: "Today's Step", ok: !!form.actionStep.trim() },
  ];
}

// ─── Phone preview ────────────────────────────────────────────────────────────

function PhonePreview({ step, journeyTitle, durationDays }: {
  step: Step;
  journeyTitle: string;
  durationDays: number;
}) {
  const title = step.title || 'Untitled Day';

  return (
    <div className="relative mx-auto" style={{ width: 320 }}>
      {/* Phone frame */}
      <div className="rounded-[32px] border-4 border-gray-800 shadow-2xl bg-[#f9f6f1] overflow-hidden" style={{ height: 620 }}>
        {/* Status bar */}
        <div className="bg-[#f9f6f1] flex items-center justify-between px-5 py-2 text-[10px] text-gray-400 font-medium">
          <span>9:41</span>
          <span className="flex gap-1">
            <span>●●●●</span>
            <span>WiFi</span>
            <span>100%</span>
          </span>
        </div>

        {/* Sticky header */}
        <div className="bg-[#f9f6f1]/90 backdrop-blur-sm border-b border-gray-200/50 px-4 py-2">
          <div className="text-center">
            <div className="font-medium text-[11px] text-gray-800 truncate leading-tight">{journeyTitle || 'Journey Title'}</div>
            <div className="text-[10px] text-gray-400">Day {step.day} of {durationDays}</div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-4 pt-5 pb-8 space-y-6 text-gray-800" style={{ height: 530 }}>

          {/* Day + Title */}
          <div>
            <span className="text-[9px] font-bold text-teal-700 uppercase tracking-widest">Day {step.day}</span>
            <h1 className="mt-1 text-[18px] font-serif font-semibold leading-snug">{title}</h1>
          </div>

          {/* Mentor intro */}
          {step.mentorIntro && (
            <p className="text-[12px] italic text-gray-600 leading-relaxed border-l-2 border-teal-300/50 pl-3">
              {step.mentorIntro}
            </p>
          )}

          {/* Scripture */}
          {step.scripture && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-2">The Word</p>
              <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm">
                <p className="font-serif text-[12px] leading-relaxed">{step.scripture}</p>
              </div>
            </div>
          )}

          {/* Devotional */}
          {step.devotional && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-2">Reflection</p>
              <p className="text-[12px] leading-relaxed">{step.devotional}</p>
            </div>
          )}

          {/* Reflection question */}
          {step.reflectionQuestion && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-2">Consider</p>
              <p className="text-[12px] font-medium leading-relaxed">{step.reflectionQuestion}</p>
            </div>
          )}

          {/* Prayer */}
          {step.prayerPrompt && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-2">Prayer</p>
              <p className="text-[12px] font-serif italic leading-relaxed">"{step.prayerPrompt}"</p>
            </div>
          )}

          {/* Today's step */}
          {step.actionStep && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-teal-700 mb-2">Today's Step</p>
              <div className="bg-teal-50 border border-teal-200/60 rounded-xl p-3">
                <p className="text-[12px] font-medium leading-relaxed">{step.actionStep}</p>
              </div>
            </div>
          )}

          {/* Complete button */}
          <button className="w-full bg-teal-700 text-white text-[13px] font-medium rounded-xl py-3 mt-2">
            Complete Today
          </button>
        </div>
      </div>

      <p className="text-center text-[11px] text-gray-400 mt-3">Live preview — updates as you type</p>
    </div>
  );
}

// ─── Validation checklist panel ───────────────────────────────────────────────

function ValidationChecklist({ items }: { items: CheckItem[] }) {
  const allOk = items.every(i => i.ok);
  return (
    <div className={`rounded-xl border px-4 py-3 ${allOk ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
      <p className={`text-xs font-semibold mb-2 ${allOk ? 'text-emerald-700' : 'text-amber-700'}`}>
        {allOk ? '✓ All required fields complete' : 'Required fields'}
      </p>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {items.map(item => (
          <span key={item.label} className={`text-xs flex items-center gap-1 ${item.ok ? 'text-emerald-700' : 'text-amber-700'}`}>
            {item.ok ? <Check size={11} strokeWidth={2.5} /> : <span className="w-[11px] h-[11px] rounded-full border border-current inline-block flex-shrink-0" />}
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DayEditor({ journeyId, day, onBack }: Props) {
  const { getStep, getStepsForJourney, addStep, updateStep, deleteStep, getJourney } = useJourney();
  const journey = getJourney(journeyId);
  const isCompanion = journey?.journeyType === 'companion';

  const nextDay = day ?? (getStepsForJourney(journeyId).reduce((m, s) => Math.max(m, s.day), 0) + 1);
  const existing = day !== null ? getStep(journeyId, day) : undefined;

  const [form, setForm] = useState<Step>(() => existing ? { ...existing } : EMPTY_STEP(journeyId, nextDay));
  const [isDirty, setIsDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [confirmBack, setConfirmBack] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [aiToast, setAiToast] = useState(false);

  const aiToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patch = (k: keyof Step, v: unknown) => {
    setForm(f => ({ ...f, [k]: v }));
    setIsDirty(true);
  };

  const handleSave = useCallback(() => {
    setSaveState('saving');
    if (existing) {
      updateStep(form);
    } else {
      addStep(form);
    }
    setIsDirty(false);
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 2500);
  }, [form, existing, addStep, updateStep]);

  const handleDuplicate = () => {
    const all = getStepsForJourney(journeyId);
    const maxDay = all.reduce((m, s) => Math.max(m, s.day), 0);
    addStep({ ...form, day: maxDay + 1 });
    onBack();
  };

  const handleDelete = () => {
    deleteStep(journeyId, form.day);
    onBack();
  };

  const handleBackClick = () => {
    if (isDirty) { setConfirmBack(true); return; }
    onBack();
  };

  const showAiToast = () => {
    setAiToast(true);
    if (aiToastTimerRef.current) clearTimeout(aiToastTimerRef.current);
    aiToastTimerRef.current = setTimeout(() => setAiToast(false), 2500);
  };

  const checklist = buildChecklist(form);
  const dayLabel = existing ? `Edit Day ${form.day}` : `New Day ${form.day}`;

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Unsaved banner ── */}
      {isDirty && (
        <UnsavedBanner
          onDiscard={() => {
            setIsDirty(false);
            setForm(existing ? { ...existing } : EMPTY_STEP(journeyId, nextDay));
          }}
        />
      )}

      {/* ── Sticky toolbar ── */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-2 flex-wrap shadow-sm">
        <button
          onClick={handleBackClick}
          className="text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0 mr-1"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-gray-800 truncate block">{dayLabel}</span>
          {journey?.title && <span className="text-xs text-gray-400 truncate block">{journey.title}</span>}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <SaveMessage state={saveState} />

          {/* AI button — disabled */}
          <div className="relative">
            <button
              type="button"
              onClick={showAiToast}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg border border-dashed border-violet-300 text-violet-400 bg-violet-50/50 cursor-not-allowed select-none"
              aria-label="Generate with Emmaus AI — coming soon"
            >
              <Sparkles size={13} />
              Generate with Emmaus AI
            </button>
            {aiToast && (
              <div className="absolute right-0 top-9 z-30 bg-gray-800 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                Coming soon
              </div>
            )}
          </div>

          {/* Preview toggle (mobile only) */}
          <button
            type="button"
            onClick={() => setShowPreview(v => !v)}
            className="lg:hidden inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {showPreview ? <EyeOff size={13} /> : <Eye size={13} />}
            {showPreview ? 'Hide Preview' : 'Preview'}
          </button>

          {existing && (
            <AdminBtn size="sm" variant="secondary" onClick={handleDuplicate}>
              <Copy size={12} /> Duplicate
            </AdminBtn>
          )}

          {existing && (
            <AdminBtn size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={12} /> Delete
            </AdminBtn>
          )}

          <AdminBtn size="sm" variant="primary" onClick={handleSave}>
            <Save size={12} /> Save Draft
          </AdminBtn>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 p-4 lg:p-6">
        <div className="max-w-6xl mx-auto lg:grid lg:grid-cols-[1fr_340px] lg:gap-8 lg:items-start">

          {/* ── Editor column ── */}
          <div className="space-y-3">

            {/* Validation checklist */}
            <ValidationChecklist items={checklist} />

            {/* Mobile preview toggle */}
            {showPreview && (
              <div className="lg:hidden pt-2 pb-4 flex justify-center">
                <PhonePreview
                  step={form}
                  journeyTitle={journey?.title ?? ''}
                  durationDays={journey?.durationDays ?? form.day}
                />
              </div>
            )}

            {/* Card 1 — Today's Theme */}
            <CollapsibleCard title="Today's Theme" defaultOpen>
              <div className="grid grid-cols-3 gap-4 pt-2">
                <Field label="Day number" required>
                  <TextInput
                    type="number"
                    min={1}
                    value={form.day}
                    onChange={e => patch('day', parseInt(e.target.value, 10) || 1)}
                  />
                </Field>
              </div>
              <Field label="Title" required error={!form.title.trim() ? 'Required' : undefined}>
                <TextInput
                  value={form.title}
                  onChange={e => patch('title', e.target.value)}
                  placeholder="e.g. Jesus Meets You Here"
                  error={!form.title.trim()}
                />
              </Field>
            </CollapsibleCard>

            {/* Card 2 — Mentor */}
            <CollapsibleCard title="Mentor" defaultOpen>
              <Field label="Mentor introduction" required error={!form.mentorIntro.trim() && isDirty ? 'Required' : undefined}>
                <TextArea
                  rows={3}
                  value={form.mentorIntro}
                  onChange={e => patch('mentorIntro', e.target.value)}
                  placeholder="The opening sentence or two shown in italic below the title."
                  error={!form.mentorIntro.trim() && isDirty}
                />
              </Field>
              <Field label="Today's encouragement" required={false}>
                <TextArea
                  rows={2}
                  value={''}
                  disabled
                  placeholder="Coming in a future update…"
                  className="opacity-50 cursor-not-allowed"
                  onChange={() => {}}
                />
                <p className="text-[11px] text-gray-400 mt-1">This field will be available in a later release.</p>
              </Field>
            </CollapsibleCard>

            {/* Card 3 — The Word */}
            <CollapsibleCard title="The Word" defaultOpen>
              <Field label="Scripture reference" required error={!form.scripture.trim() && isDirty ? 'Required' : undefined}>
                <TextInput
                  value={form.scripture}
                  onChange={e => patch('scripture', e.target.value)}
                  placeholder="e.g. John 1:14 — 'The Word became flesh…'"
                  error={!form.scripture.trim() && isDirty}
                />
              </Field>
              <Field label="Scripture text (full verse)" required={false}>
                <TextArea
                  rows={3}
                  value={''}
                  disabled
                  placeholder="Optional full verse text — coming in a future update…"
                  className="opacity-50 cursor-not-allowed"
                  onChange={() => {}}
                />
              </Field>
            </CollapsibleCard>

            {/* Card 4 — Reflection */}
            <CollapsibleCard title="Reflection" defaultOpen>
              <Field label="Devotional reflection" required error={!form.devotional.trim() && isDirty ? 'Required' : undefined}>
                <TextArea
                  rows={9}
                  value={form.devotional}
                  onChange={e => patch('devotional', e.target.value)}
                  placeholder="Write the devotional body here. This is the main reading for the day."
                  error={!form.devotional.trim() && isDirty}
                />
              </Field>
            </CollapsibleCard>

            {/* Card 5 — Reflection Question */}
            <CollapsibleCard title="Reflection Question" defaultOpen>
              <Field label="Question" required error={!form.reflectionQuestion.trim() && isDirty ? 'Required' : undefined}>
                <TextInput
                  value={form.reflectionQuestion}
                  onChange={e => patch('reflectionQuestion', e.target.value)}
                  placeholder="e.g. Where in your life do you need to receive, not earn?"
                  error={!form.reflectionQuestion.trim() && isDirty}
                />
              </Field>
            </CollapsibleCard>

            {/* Card 6 — Prayer */}
            <CollapsibleCard title="Prayer" defaultOpen>
              <Field label="Prayer prompt" required error={!form.prayerPrompt.trim() && isDirty ? 'Required' : undefined}>
                <TextArea
                  rows={4}
                  value={form.prayerPrompt}
                  onChange={e => patch('prayerPrompt', e.target.value)}
                  placeholder="Shown in italic as a guided prayer. Write in the first person as the reader praying."
                  error={!form.prayerPrompt.trim() && isDirty}
                />
              </Field>
            </CollapsibleCard>

            {/* Card 7 — Today's Step */}
            <CollapsibleCard title="Today's Step" defaultOpen>
              <Field label="Action step" required error={!form.actionStep.trim() && isDirty ? 'Required' : undefined}>
                <TextArea
                  rows={3}
                  value={form.actionStep}
                  onChange={e => patch('actionStep', e.target.value)}
                  placeholder="A concrete action the reader can take today."
                  error={!form.actionStep.trim() && isDirty}
                />
              </Field>
            </CollapsibleCard>

            {/* Card 8 — Completion */}
            <CollapsibleCard title="Completion" defaultOpen={false}>
              <p className="text-xs text-gray-500 mb-3">
                This message is shown when the reader completes the day. It cannot be changed per-day at this time.
              </p>
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 text-center space-y-1">
                <p className="text-base font-serif font-medium text-gray-800">Great job.</p>
                <p className="text-sm text-gray-500">See you tomorrow.</p>
              </div>
            </CollapsibleCard>

            {/* Companion sermon fields */}
            {isCompanion && (
              <CollapsibleCard title="Sermon Moment" defaultOpen={false}>
                <p className="text-xs text-gray-400 pb-1">
                  Fill these in to add a timestamped sermon link to this day.
                </p>
                <Field label="Contextual sentence">
                  <TextInput
                    value={form.sermonContextualSentence ?? ''}
                    onChange={e => patch('sermonContextualSentence', e.target.value)}
                    placeholder="e.g. This moment connects directly with today's reflection."
                  />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Timestamp (seconds)">
                    <TextInput
                      type="number"
                      min={0}
                      value={form.sermonTimestampSeconds ?? ''}
                      onChange={e => patch('sermonTimestampSeconds', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                      placeholder="736"
                    />
                  </Field>
                  <Field label="YouTube link with timestamp">
                    <TextInput
                      value={form.sermonLink ?? ''}
                      onChange={e => patch('sermonLink', e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=…&t=736s"
                    />
                  </Field>
                </div>
              </CollapsibleCard>
            )}

            {/* Bottom save */}
            <div className="flex justify-end gap-3 pt-2 pb-8">
              <AdminBtn variant="secondary" onClick={handleBackClick}>Cancel</AdminBtn>
              <AdminBtn variant="primary" onClick={handleSave}>
                <Save size={13} /> Save Draft
              </AdminBtn>
            </div>
          </div>

          {/* ── Preview column (desktop only) ── */}
          <div className="hidden lg:block">
            <div className="sticky top-[120px]">
              <PhonePreview
                step={form}
                journeyTitle={journey?.title ?? ''}
                durationDays={journey?.durationDays ?? form.day}
              />
            </div>
          </div>

        </div>
      </div>

      {/* ── Confirm: leave without saving ── */}
      {confirmBack && (
        <ConfirmDialog
          title="Unsaved Changes"
          message="You have unsaved changes. Leave without saving?"
          confirmLabel="Leave"
          danger
          onConfirm={() => { setConfirmBack(false); onBack(); }}
          onCancel={() => setConfirmBack(false)}
        />
      )}

      {/* ── Confirm: delete day ── */}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete Day ${form.day}`}
          message={`Delete "${form.title || 'this day'}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
