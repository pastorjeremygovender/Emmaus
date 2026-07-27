import React, { useState, useCallback } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import { useJourney } from '@/contexts/JourneyContext';
import { Sermon } from '@/lib/admin-demo-data';
import {
  UnsavedBanner, SaveMessage, ConfirmDialog, PageHeader,
  Field, TextInput, TextArea, Select, AdminBtn, StatusBadge,
} from './shared';

type Props = {
  sermonId: string | null;
  onBack: () => void;
  onOpenCompanion: (journeyId: string, fresh?: boolean) => void;
};

const STATUS_SEQ = ['draft', 'review', 'published'] as const;

const EMPTY_SERMON: Omit<Sermon, 'id'> = {
  title: '',
  speaker: '',
  sermonDate: new Date().toISOString().split('T')[0],
  series: '',
  scriptureReference: '',
  youtubeUrl: '',
  summary: '',
  topics: [],
  keywords: [],
  transcript: '',
  transcriptStatus: 'none',
  aiIndexStatus: 'none',
  companionJourneyId: '',
  status: 'draft',
  pastorEdited: false,
  updatedAt: new Date().toISOString(),
};

export default function SermonEditor({ sermonId, onBack, onOpenCompanion }: Props) {
  const { sermons, addSermon, updateSermon } = useAdmin();
  const { journeys, addJourney, addStep, updateJourney } = useJourney();

  const isNew = !sermonId;
  const existing = sermonId ? sermons.find(s => s.id === sermonId) : undefined;

  const [form, setForm] = useState<Omit<Sermon, 'id'>>(() =>
    existing ? { ...existing } : { ...EMPTY_SERMON }
  );
  const [isDirty, setIsDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmBack, setConfirmBack] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [resolvedId, setResolvedId] = useState<string | null>(sermonId);

  const patch = (k: keyof typeof form, v: unknown) => {
    setForm(f => ({ ...f, [k]: v }));
    setIsDirty(true);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = 'Required';
    if (!form.speaker.trim()) errs.speaker = 'Required';
    if (!form.scriptureReference.trim()) errs.scriptureReference = 'Required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = useCallback(() => {
    if (!validate()) return;
    setSaveState('saving');
    const id = resolvedId ?? `sermon-${Date.now()}`;
    const sermon: Sermon = { ...form, id, updatedAt: new Date().toISOString() } as Sermon;
    if (isNew) { addSermon(sermon); setResolvedId(id); }
    else updateSermon(sermon);
    setIsDirty(false);
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 2500);
  }, [form, isNew, resolvedId]);

  // Create the companion journey and navigate into it immediately
  const doGenerateCompanion = () => {
    handleSave();
    const sid = resolvedId ?? `sermon-${Date.now()}`;
    const jId = `companion-${sid}-${Date.now()}`;
    // Status is ALWAYS Draft — never published automatically
    const newJourney = {
      id: jId,
      title: `Companion: ${form.title}`,
      description: `Five-day devotional companion to the sermon "${form.title}".`,
      journeyType: 'companion',
      durationDays: 5,
      status: 'Draft',
      linkedSermonId: sid,
      overloadExempt: true,
      pastorEdited: false,
      updatedAt: new Date().toISOString(),
    };
    addJourney(newJourney);
    for (let d = 1; d <= 5; d++) {
      addStep({
        journeyId: jId,
        day: d,
        title: `[Day ${d} title — pastoral review required]`,
        status: 'Draft',
        mentorIntro: '[Mentor introduction — edit before publication]',
        scripture: form.scriptureReference,
        devotional: '[Devotional reflection — edit before publication]',
        reflectionQuestion: '[Reflection question — edit before publication]',
        prayerPrompt: '[Prayer prompt — edit before publication]',
        actionStep: '[Action step — edit before publication]',
        sermonContextualSentence: `This moment in Sunday's sermon on "${form.title}" connects directly with today's reflection.`,
      });
    }
    // Link companion to sermon record
    patch('companionJourneyId', jId);
    // Navigate to companion editor immediately, showing the review banner
    onOpenCompanion(jId, true);
  };

  // Reset an existing Approved/Published companion back to Draft, then open editor
  const doOverwriteCompanion = () => {
    const existing = form.companionJourneyId
      ? journeys.find(j => j.id === form.companionJourneyId)
      : null;
    if (!existing) return;
    updateJourney({ ...existing, status: 'Draft', updatedAt: new Date().toISOString() });
    setConfirmOverwrite(false);
    onOpenCompanion(existing.id, true);
  };

  const handleGenerateCompanion = () => {
    const existingCompanion = form.companionJourneyId
      ? journeys.find(j => j.id === form.companionJourneyId)
      : null;

    if (existingCompanion) {
      if (existingCompanion.status === 'Approved' || existingCompanion.status === 'Published') {
        // Must confirm before resetting an approved/published companion back to Draft
        setConfirmOverwrite(true);
        return;
      }
      // Draft companion already exists — just open it (no banner needed)
      onOpenCompanion(existingCompanion.id, false);
      return;
    }

    // No companion yet — create one
    doGenerateCompanion();
  };

  const handleBackClick = () => {
    if (isDirty) { setConfirmBack(true); return; }
    onBack();
  };

  return (
    <div className="max-w-3xl">
      {isDirty && <UnsavedBanner onDiscard={() => { setIsDirty(false); setForm(existing ? { ...existing } : { ...EMPTY_SERMON }); }} />}

      <div className="p-6 lg:p-8 space-y-6">
        <PageHeader
          title={isNew ? 'New Sermon' : form.title || 'Edit Sermon'}
          onBack={handleBackClick}
          action={
            <div className="flex items-center gap-3 flex-wrap">
              <SaveMessage state={saveState} />
              <AdminBtn variant="secondary" onClick={handleSave}>Save</AdminBtn>
            </div>
          }
        />

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-700">Sermon Details</h2>

          <Field label="Title" required error={errors.title}>
            <TextInput value={form.title} onChange={e => patch('title', e.target.value)} placeholder="Sermon title" error={!!errors.title} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Speaker" required error={errors.speaker}>
              <TextInput value={form.speaker} onChange={e => patch('speaker', e.target.value)} placeholder="Pastor name" error={!!errors.speaker} />
            </Field>
            <Field label="Date">
              <TextInput type="date" value={form.sermonDate} onChange={e => patch('sermonDate', e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Series">
              <TextInput value={form.series ?? ''} onChange={e => patch('series', e.target.value)} placeholder="Series name" />
            </Field>
            <Field label="Scripture reference" required error={errors.scriptureReference}>
              <TextInput value={form.scriptureReference} onChange={e => patch('scriptureReference', e.target.value)} placeholder="e.g. 2 Samuel 9" error={!!errors.scriptureReference} />
            </Field>
          </div>

          <Field label="YouTube URL">
            <TextInput value={form.youtubeUrl} onChange={e => patch('youtubeUrl', e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
          </Field>

          <Field label="Summary">
            <TextArea rows={3} value={form.summary ?? ''} onChange={e => patch('summary', e.target.value)} placeholder="Brief summary of the sermon." />
          </Field>

          <Field label="Topics (comma-separated)">
            <TextInput
              value={(form.topics ?? []).join(', ')}
              onChange={e => patch('topics', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
              placeholder="grace, restoration, identity"
            />
          </Field>

          <Field label="Keywords (comma-separated)">
            <TextInput
              value={(form.keywords ?? []).join(', ')}
              onChange={e => patch('keywords', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
              placeholder="Mephibosheth, covenant, kindness"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Status">
              <Select value={form.status} onChange={e => patch('status', e.target.value)}>
                {STATUS_SEQ.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Transcript status">
              <Select value={form.transcriptStatus} onChange={e => patch('transcriptStatus', e.target.value)}>
                <option value="none">None</option>
                <option value="pending">Pending</option>
                <option value="complete">Complete</option>
              </Select>
            </Field>
          </div>

          <Field label="Transcript">
            <TextArea rows={6} value={form.transcript ?? ''} onChange={e => patch('transcript', e.target.value)} placeholder="Full sermon transcript (optional)." />
          </Field>
        </div>

        {/* Companion Journey */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Companion Journey</h2>
          <Field label="Linked Companion Journey ID">
            <TextInput
              value={form.companionJourneyId ?? ''}
              onChange={e => patch('companionJourneyId', e.target.value)}
              placeholder="gods-kindness-restores-the-broken"
            />
          </Field>
          <div className="flex gap-3 flex-wrap">
            <AdminBtn variant="secondary" onClick={handleGenerateCompanion}>
              {form.companionJourneyId ? 'Regenerate Companion Draft' : 'Generate Companion Draft'}
            </AdminBtn>
            {form.companionJourneyId && (
              <AdminBtn variant="ghost" onClick={() => form.companionJourneyId && onOpenCompanion(form.companionJourneyId, false)}>
                Open Companion Editor
              </AdminBtn>
            )}
          </div>
          <p className="text-xs text-gray-400">
            Generated drafts always start as Draft. Pastoral review and approval are required before the companion is visible to users.
          </p>
        </div>

        <div className="flex gap-3">
          <AdminBtn variant="secondary" onClick={handleBackClick}>Cancel</AdminBtn>
          <AdminBtn variant="primary" onClick={handleSave}>Save Sermon</AdminBtn>
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

      {confirmOverwrite && (
        <ConfirmDialog
          title="Overwrite Approved Companion?"
          message="This companion has already been approved or published. Regenerating will reset it to Draft and require pastoral review again before it can be published. Continue?"
          confirmLabel="Reset to Draft"
          danger
          onConfirm={doOverwriteCompanion}
          onCancel={() => setConfirmOverwrite(false)}
        />
      )}
    </div>
  );
}
