import React, { useState, useCallback } from 'react';
import { useJourney, Step } from '@/contexts/JourneyContext';
import {
  UnsavedBanner, SaveMessage, ConfirmDialog, PageHeader,
  Field, TextInput, TextArea, AdminBtn,
} from './shared';

type Props = {
  journeyId: string;
  day: number | null;   // null = new day
  onBack: () => void;
};

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

export default function DayEditor({ journeyId, day, onBack }: Props) {
  const { getStep, getStepsForJourney, addStep, updateStep, getJourney } = useJourney();
  const journey = getJourney(journeyId);
  const isCompanion = journey?.journeyType === 'companion';

  const nextDay = day ?? (getStepsForJourney(journeyId).reduce((m, s) => Math.max(m, s.day), 0) + 1);
  const existing = day !== null ? getStep(journeyId, day) : undefined;

  const [form, setForm] = useState<Step>(() => existing ? { ...existing } : EMPTY_STEP(journeyId, nextDay));
  const [isDirty, setIsDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmBack, setConfirmBack] = useState(false);

  const patch = (k: keyof Step, v: unknown) => {
    setForm(f => ({ ...f, [k]: v }));
    setIsDirty(true);
    setErrors(e => { const n = { ...e }; delete n[k as string]; return n; });
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = 'Required';
    if (!form.mentorIntro.trim()) errs.mentorIntro = 'Required';
    if (!form.scripture.trim()) errs.scripture = 'Required';
    if (!form.devotional.trim()) errs.devotional = 'Required';
    if (!form.reflectionQuestion.trim()) errs.reflectionQuestion = 'Required';
    if (!form.prayerPrompt.trim()) errs.prayerPrompt = 'Required';
    if (!form.actionStep.trim()) errs.actionStep = 'Required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = useCallback(() => {
    if (!validate()) return;
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

  const handleBackClick = () => {
    if (isDirty) { setConfirmBack(true); return; }
    onBack();
  };

  const title = existing ? `Edit Day ${form.day}` : `New Day ${form.day}`;

  return (
    <div className="max-w-3xl">
      {isDirty && (
        <UnsavedBanner
          onDiscard={() => { setIsDirty(false); setForm(existing ? { ...existing } : EMPTY_STEP(journeyId, nextDay)); }}
        />
      )}

      <div className="p-6 lg:p-8 space-y-6">
        <PageHeader
          title={title}
          subtitle={journey?.title}
          onBack={handleBackClick}
          action={
            <div className="flex items-center gap-3">
              <SaveMessage state={saveState} />
              <AdminBtn variant="primary" onClick={handleSave}>Save Day</AdminBtn>
            </div>
          }
        />

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Day number" required>
              <TextInput
                type="number"
                min={1}
                value={form.day}
                onChange={e => patch('day', parseInt(e.target.value, 10) || 1)}
              />
            </Field>
          </div>

          <Field label="Title" required error={errors.title}>
            <TextInput
              value={form.title}
              onChange={e => patch('title', e.target.value)}
              placeholder="e.g. Jesus Meets You Here"
              error={!!errors.title}
            />
          </Field>

          <Field label="Mentor introduction" required error={errors.mentorIntro}>
            <TextArea
              rows={3}
              value={form.mentorIntro}
              onChange={e => patch('mentorIntro', e.target.value)}
              placeholder="The opening sentence or two shown in italic."
              error={!!errors.mentorIntro}
            />
          </Field>

          <Field label="Scripture reference" required error={errors.scripture}>
            <TextInput
              value={form.scripture}
              onChange={e => patch('scripture', e.target.value)}
              placeholder="e.g. John 1:14 — 'The Word became flesh…'"
              error={!!errors.scripture}
            />
          </Field>

          <Field label="Devotional reflection" required error={errors.devotional}>
            <TextArea
              rows={6}
              value={form.devotional}
              onChange={e => patch('devotional', e.target.value)}
              placeholder="The main devotional body text."
              error={!!errors.devotional}
            />
          </Field>

          <Field label="Reflection question" required error={errors.reflectionQuestion}>
            <TextInput
              value={form.reflectionQuestion}
              onChange={e => patch('reflectionQuestion', e.target.value)}
              placeholder="The question shown under CONSIDER."
              error={!!errors.reflectionQuestion}
            />
          </Field>

          <Field label="Prayer prompt" required error={errors.prayerPrompt}>
            <TextArea
              rows={3}
              value={form.prayerPrompt}
              onChange={e => patch('prayerPrompt', e.target.value)}
              placeholder="Shown in italic as a guided prayer."
              error={!!errors.prayerPrompt}
            />
          </Field>

          <Field label="Action step" required error={errors.actionStep}>
            <TextArea
              rows={3}
              value={form.actionStep}
              onChange={e => patch('actionStep', e.target.value)}
              placeholder="Shown under TODAY'S STEP."
              error={!!errors.actionStep}
            />
          </Field>
        </div>

        {/* Sermon fields — companion journeys only */}
        {isCompanion && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h3 className="text-sm font-semibold text-gray-700">Sermon Moment</h3>
            <p className="text-xs text-gray-400">
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
          </div>
        )}

        <div className="flex gap-3">
          <AdminBtn variant="secondary" onClick={handleBackClick}>Cancel</AdminBtn>
          <AdminBtn variant="primary" onClick={handleSave}>Save Day</AdminBtn>
        </div>
      </div>

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
    </div>
  );
}
