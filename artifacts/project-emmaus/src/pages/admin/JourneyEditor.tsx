import React, { useState, useEffect, useCallback } from 'react';
import { useJourney, Journey, Step } from '@/contexts/JourneyContext';
import { Plus, Pencil, Eye, Trash2, ChevronUp, ChevronDown, Copy } from 'lucide-react';
import {
  StatusBadge, AdminBtn, ConfirmDialog, PageHeader, UnsavedBanner,
  SaveMessage, Field, TextInput, TextArea, Select,
} from './shared';

type Props = {
  journeyId: string | null;
  freshlyGenerated?: boolean;
  onBack: () => void;
  onEditDay: (journeyId: string, day: number) => void;
  onPreviewDay: (journeyId: string, day: number) => void;
};

const STATUS_SEQUENCE = ['Draft', 'Pastoral Review', 'Approved', 'Published'];
const EMPTY_JOURNEY: Omit<Journey, 'id'> = {
  title: '',
  description: '',
  journeyType: 'core',
  durationDays: 7,
  status: 'Draft',
  churchWide: false,
  overloadExempt: false,
  updatedAt: new Date().toISOString(),
};

function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
}

function validatePublish(journey: Journey, steps: Step[]): string[] {
  const errors: string[] = [];
  if (!journey.title.trim()) errors.push('Title is required.');
  if (!journey.description.trim()) errors.push('Description is required.');
  if (steps.length === 0) errors.push('At least one day is required.');
  steps.forEach((s) => {
    if (!s.scripture?.trim()) errors.push(`Day ${s.day}: Scripture reference is required.`);
    if (!s.devotional?.trim()) errors.push(`Day ${s.day}: Devotional reflection is required.`);
    if (!s.prayerPrompt?.trim()) errors.push(`Day ${s.day}: Prayer prompt is required.`);
    if (!s.actionStep?.trim()) errors.push(`Day ${s.day}: Action step is required.`);
  });
  if (journey.journeyType === 'companion') {
    if (!journey.linkedSermonId) errors.push('Companion journeys require a linked sermon.');
    steps.forEach((s) => {
      if (!s.sermonTimestampSeconds) errors.push(`Day ${s.day}: Sermon timestamp is required.`);
    });
  }
  return errors;
}

export default function JourneyEditor({ journeyId, freshlyGenerated, onBack, onEditDay, onPreviewDay }: Props) {
  const { journeys, getStepsForJourney, updateJourney, addJourney, addStep, deleteStep } = useJourney();

  const isNew = !journeyId;
  const existing = journeyId ? journeys.find(j => j.id === journeyId) : undefined;

  const [form, setForm] = useState<Omit<Journey, 'id'>>(() =>
    existing ? { ...existing } : { ...EMPTY_JOURNEY }
  );
  const [isDirty, setIsDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errors, setErrors] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Step | null>(null);
  const [confirmBack, setConfirmBack] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [resolvedId, setResolvedId] = useState<string | null>(journeyId);

  const steps = resolvedId ? getStepsForJourney(resolvedId) : [];

  const patch = (k: keyof typeof form, v: unknown) => {
    setForm(f => ({ ...f, [k]: v }));
    setIsDirty(true);
  };

  const handleSave = useCallback(
    async (overrideStatus?: string) => {
      if (!form.title.trim()) {
        setErrors(['Title is required.']);
        return;
      }
      setErrors([]);
      setSaveState('saving');
      const ts = new Date().toISOString();
      const status = overrideStatus ?? form.status;

      try {
        if (isNew) {
          const id = slugify(form.title) || `journey-${Date.now()}`;
          const newJ: Journey = { ...form, id, status, updatedAt: ts, durationDays: steps.length || form.durationDays };
          const created = await addJourney(newJ);
          setResolvedId(created.id);
        } else if (resolvedId) {
          const updated: Journey = {
            ...form,
            id: resolvedId,
            status,
            updatedAt: ts,
            durationDays: steps.length || form.durationDays,
          };
          const saved = await updateJourney(updated);
          setForm(saved);
        }
        setIsDirty(false);
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 2500);
      } catch (err) {
        console.error('Journey save failed:', err);
        setSaveState('error');
        setTimeout(() => setSaveState('idle'), 3000);
      }
    },
    [form, isNew, resolvedId, steps.length, addJourney, updateJourney]
  );

  const handleStatusAction = (targetStatus: string) => {
    const curSteps = resolvedId ? getStepsForJourney(resolvedId) : [];
    if (targetStatus === 'Published') {
      // Guard: must be Approved first
      if (form.status !== 'Approved') {
        setErrors(['This companion must be approved before publishing.']);
        return;
      }
      const errs = validatePublish({ ...form, id: resolvedId ?? '' } as Journey, curSteps);
      if (errs.length) { setErrors(errs); return; }
    }
    handleSave(targetStatus);
    setForm(f => ({ ...f, status: targetStatus }));
  };

  const handlePublishClick = () => {
    if (form.status !== 'Approved') {
      setErrors(['This companion must be approved before publishing.']);
      return;
    }
    setConfirmPublish(true);
  };

  const handleDeleteStep = async (s: Step) => {
    try {
      await deleteStep(s.journeyId, s.day);
    } catch (err) {
      console.error('Delete step failed:', err);
    }
    setDeleteTarget(null);
  };

  // Day reordering is handled via the DayEditor (change the day number field directly).

  const handleDuplicateStep = async (s: Step) => {
    if (!resolvedId) return;
    const maxDay = steps.reduce((m, x) => Math.max(m, x.day), 0);
    try {
      await addStep({ ...s, day: maxDay + 1, journeyId: resolvedId });
    } catch (err) {
      console.error('Duplicate step failed:', err);
    }
  };

  const handleAddDay = () => {
    if (!resolvedId) { handleSave(); return; }
    const maxDay = steps.reduce((m, x) => Math.max(m, x.day), 0);
    onEditDay(resolvedId, maxDay + 1);
  };

  const canAdvance = STATUS_SEQUENCE.indexOf(form.status) >= 0;
  const statusIdx = STATUS_SEQUENCE.indexOf(form.status);
  const nextStatus = STATUS_SEQUENCE[statusIdx + 1];

  const handleBackClick = () => {
    if (isDirty) { setConfirmBack(true); return; }
    onBack();
  };

  return (
    <div className="max-w-3xl">
      {isDirty && <UnsavedBanner onDiscard={() => { setIsDirty(false); setForm(existing ? { ...existing } : { ...EMPTY_JOURNEY }); }} />}

      {/* Freshly-generated companion banner */}
      {freshlyGenerated && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-start gap-3">
          <span className="text-amber-500 mt-0.5 flex-shrink-0">⚠</span>
          <p className="text-sm text-amber-800 font-medium">
            Draft generated. Pastoral review required before publishing.
          </p>
        </div>
      )}

      <div className="p-6 lg:p-8">
        <PageHeader
          title={isNew ? 'New Journey' : form.title || 'Edit Journey'}
          subtitle={resolvedId ?? ''}
          onBack={handleBackClick}
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <SaveMessage state={saveState} />
              <AdminBtn variant="secondary" onClick={() => handleSave()}>Save Draft</AdminBtn>
              {/* Step-forward action (Draft → Review → Approved) */}
              {nextStatus && nextStatus !== 'Published' && (
                <AdminBtn variant="primary" onClick={() => handleStatusAction(nextStatus)}>
                  {nextStatus === 'Pastoral Review' ? 'Submit for Review' : nextStatus === 'Approved' ? 'Approve' : nextStatus}
                </AdminBtn>
              )}
              {/* Publish — always visible when not yet published; enforces Approved gate */}
              {form.status !== 'Published' && (
                <AdminBtn
                  variant={form.status === 'Approved' ? 'primary' : 'secondary'}
                  onClick={handlePublishClick}
                >
                  Publish
                </AdminBtn>
              )}
            </div>
          }
        />

        <div className="mb-4">
          <StatusBadge status={form.status} />
        </div>

        {errors.length > 0 && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-red-700 mb-1">
              {errors[0] === 'This companion must be approved before publishing.'
                ? 'Cannot publish yet:'
                : 'Cannot publish:'}
            </p>
            <ul className="list-disc pl-5 space-y-1">
              {errors.map((e, i) => <li key={i} className="text-sm text-red-600">{e}</li>)}
            </ul>
          </div>
        )}

        {/* Journey metadata */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-700">Journey Details</h2>

          <Field label="Title" required>
            <TextInput value={form.title} onChange={e => patch('title', e.target.value)} placeholder="Journey title" error={!form.title && isDirty} />
          </Field>
          <Field label="Description" required>
            <TextArea rows={3} value={form.description} onChange={e => patch('description', e.target.value)} placeholder="Brief description shown to users" />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Type">
              <Select value={form.journeyType} onChange={e => patch('journeyType', e.target.value)}>
                <option value="core">Core</option>
                <option value="companion">Companion</option>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={e => patch('status', e.target.value)}>
                {STATUS_SEQUENCE.map(s => <option key={s} value={s}>{s}</option>)}
                <option value="Archived">Archived</option>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Start date (optional)">
              <TextInput type="date" value={form.startDate ?? ''} onChange={e => patch('startDate', e.target.value)} />
            </Field>
            <Field label="End date (optional)">
              <TextInput type="date" value={form.endDate ?? ''} onChange={e => patch('endDate', e.target.value)} />
            </Field>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={!!form.churchWide} onChange={e => patch('churchWide', e.target.checked)} className="rounded" />
              Church-wide journey
            </label>
            {form.journeyType === 'companion' && (
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form.overloadExempt !== false} onChange={e => patch('overloadExempt', e.target.checked)} className="rounded" />
                Exempt from overload rules
              </label>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer" title="When ON (default), members must complete today's 15 Minutes with Jesus before accessing this journey. Turn OFF for pastoral journeys like Crisis Care or Grief Support.">
              <input
                type="checkbox"
                checked={(form as any).requiresDailyGate !== false}
                onChange={e => patch('requiresDailyGate' as any, e.target.checked)}
                className="rounded"
              />
              Requires daily 15 Min gate
            </label>
          </div>

          {form.journeyType === 'companion' && (
            <Field label="Linked Sermon ID">
              <TextInput value={form.linkedSermonId ?? ''} onChange={e => patch('linkedSermonId', e.target.value)} placeholder="sermon-2-samuel-9" />
            </Field>
          )}

          <Field label="Key Scripture">
            <TextInput
              value={(form as any).scriptureReference ?? ''}
              onChange={e => patch('scriptureReference' as any, e.target.value)}
              placeholder="e.g. John 3:16-17 — shown on detail screen, links to Bible reader"
            />
          </Field>

          <Field label="Next Journey (after completion)">
            <TextInput
              value={(form as any).nextJourneyId ?? ''}
              onChange={e => patch('nextJourneyId' as any, e.target.value)}
              placeholder="journey slug, e.g. prayer-basics — shown when this journey is completed"
            />
          </Field>
        </div>

        {/* Days list */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Days ({steps.length})</h2>
            <AdminBtn size="sm" variant="primary" onClick={handleAddDay}>
              <Plus size={13} /> Add Day
            </AdminBtn>
          </div>

          {steps.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400">
              No days yet. {!resolvedId ? 'Save the journey first, then add days.' : 'Click "Add Day" to create the first day.'}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {steps.map((s, idx) => (
                <div key={s.day} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/50">
                  <div className="text-xs font-semibold text-gray-400 w-10 flex-shrink-0">Day {s.day}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{s.title || '(Untitled)'}</div>
                    <div className="text-xs text-gray-400 truncate">{s.scripture}</div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {resolvedId && (
                      <>
                        <AdminBtn size="sm" variant="ghost" onClick={() => onPreviewDay(resolvedId!, s.day)}>
                          <Eye size={13} />
                        </AdminBtn>
                        <AdminBtn size="sm" variant="ghost" onClick={() => onEditDay(resolvedId!, s.day)}>
                          <Pencil size={13} />
                        </AdminBtn>
                        <AdminBtn size="sm" variant="ghost" onClick={() => handleDuplicateStep(s)}>
                          <Copy size={13} />
                        </AdminBtn>
                        <AdminBtn size="sm" variant="ghost" onClick={() => setDeleteTarget(s)}>
                          <Trash2 size={13} className="text-red-400" />
                        </AdminBtn>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex gap-3">
          <AdminBtn variant="secondary" onClick={handleBackClick}>Cancel</AdminBtn>
          <AdminBtn variant="primary" onClick={() => handleSave()}>Save</AdminBtn>
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Day"
          message={`Delete Day ${deleteTarget.day}: "${deleteTarget.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDeleteStep(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

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

      {confirmPublish && (
        <ConfirmDialog
          title="Publish this journey?"
          message="Publish this companion to all users? It will become visible in the app immediately."
          confirmLabel="Publish"
          onConfirm={() => { setConfirmPublish(false); handleStatusAction('Published'); }}
          onCancel={() => setConfirmPublish(false)}
        />
      )}
    </div>
  );
}
