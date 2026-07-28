/**
 * DevotionalEntryEditor — edit a single devotional entry (day).
 *
 * Left panel:  all text fields + status/publish controls
 * Right panel: live DevotionalReading preview
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import {
  getSeriesWithEntries,
  saveEntry,
  deleteEntry,
  type SeriesWithEntries,
  type DevotionalEntry,
} from '@/lib/devotionals-api';
import { DevotionalReading, PreviewDevotionalContinueButton } from '@/components/DevotionalReading';
import { resolveDisplayName } from '@/components/DailyRhythmReading';
import { Field, ContentStudioToolbar, ConfirmDialog } from '../shared';
import { useAuth } from '@/contexts/AuthContext';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  seriesId: string;
  day: number;
  onBack: () => void;
}

export default function DevotionalEntryEditor({ seriesId, day, onBack }: Props) {
  const { user } = useAuth();
  const [seriesData, setSeriesData] = useState<SeriesWithEntries | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Entry fields
  const [title, setTitle] = useState('');
  const [scriptureReference, setScriptureReference] = useState('');
  const [greeting, setGreeting] = useState('');
  const [considerThis, setConsiderThis] = useState('');
  const [prayer, setPrayer] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [closing, setClosing] = useState('');
  const [status, setStatus] = useState('Draft');

  // Toolbar state
  const [savingAs, setSavingAs] = useState<'draft' | 'publish' | 'unpublish' | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await getSeriesWithEntries(seriesId, auth);
      setSeriesData(d);
      const entry = d.entries.find(e => e.dayNumber === day);
      if (entry) {
        setTitle(entry.title ?? '');
        setScriptureReference(entry.scriptureReference ?? '');
        setGreeting(entry.greeting ?? '');
        setConsiderThis(entry.considerThis ?? '');
        setPrayer(entry.prayer ?? '');
        setNextStep(entry.nextStep ?? '');
        setClosing(entry.closing ?? '');
        setStatus(entry.status);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [seriesId, day]);

  useEffect(() => { load(); }, [load]);

  const auth = user ? { userId: user.id, userRole: user.role } : undefined;

  const doSave = useCallback(async (fields: Partial<DevotionalEntry>) => {
    setSaveStatus('saving');
    try {
      await saveEntry(seriesId, day, fields, auth);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  }, [seriesId, day]);

  const scheduleSave = useCallback((fields: Partial<DevotionalEntry>) => {
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => doSave(fields), 1200);
  }, [doSave]);

  // Build current entry snapshot for save
  const currentFields = (): Partial<DevotionalEntry> => ({
    title, scriptureReference, greeting, considerThis, prayer, nextStep, closing, status,
  });

  function patch<T>(setter: (v: T) => void, key: keyof DevotionalEntry) {
    return (v: T) => {
      setter(v);
      const fields = { ...currentFields(), [key]: v };
      scheduleSave(fields);
    };
  }

  const handleTogglePublish = async () => {
    const next = status === 'Published' ? 'Draft' : 'Published';
    setStatus(next);
    await doSave({ ...currentFields(), status: next });
  };

  const handleSaveDraft = async () => {
    setSavingAs('draft');
    setSuccessMsg('');
    setErrorMsg('');
    try {
      await doSave(currentFields());
      setSuccessMsg('Draft saved successfully.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setErrorMsg('Save failed — please try again.');
      setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setSavingAs(null);
    }
  };

  const handlePublish = async () => {
    setSavingAs('publish');
    setSuccessMsg('');
    setStatus('Published');
    try {
      await doSave({ ...currentFields(), status: 'Published' });
      setSuccessMsg('Published successfully.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } finally {
      setSavingAs(null);
    }
  };

  const handleUnpublish = async () => {
    setSavingAs('unpublish');
    setSuccessMsg('');
    setStatus('Draft');
    try {
      await doSave({ ...currentFields(), status: 'Draft' });
      setSuccessMsg('Unpublished successfully.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } finally {
      setSavingAs(null);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteEntry(seriesId, day, auth);
      setConfirmDelete(false);
      onBack();
    } catch {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading entry…
      </div>
    );
  }

  const seriesTitle = seriesData?.title ?? '';

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-50">

      {/* Shared toolbar */}
      <ContentStudioToolbar
        onBack={onBack}
        title={seriesTitle || 'Daily Devotionals'}
        subtitle={`Day ${day}`}
        status={status}
        isSaving={savingAs === 'draft'}
        isPublishing={savingAs === 'publish' || savingAs === 'unpublish'}
        successMessage={successMsg}
        onSaveDraft={handleSaveDraft}
        onPublish={handlePublish}
        onUnpublish={handleUnpublish}
        onDelete={() => setConfirmDelete(true)}
        errorMessage={errorMsg}
      />

      {/* Delete confirmation */}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete Day?"
          message={`Day ${day} will be permanently deleted. This cannot be undone.`}
          confirmLabel={deleting ? 'Deleting…' : 'Delete Permanently'}
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {/* ── Editor panel ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-w-0 bg-white border-r border-gray-200 overflow-y-auto">

        {/* Fields */}
        <div className="flex-1 p-6 space-y-5 max-w-2xl">
          <Field label="Title">
            <input
              value={title}
              onChange={e => patch(setTitle, 'title')(e.target.value)}
              placeholder="e.g. When God Restores"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
            />
          </Field>

          <Field label="Scripture Reference">
            <input
              value={scriptureReference}
              onChange={e => patch(setScriptureReference, 'scriptureReference')(e.target.value)}
              placeholder="Psalm 23:1-6"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
            />
            <p className="mt-1 text-[11px] text-gray-400">e.g. Psalm 23:1-6 or John 15:1-11</p>
          </Field>

          <Field label="Greeting">
            <textarea
              value={greeting}
              onChange={e => patch(setGreeting, 'greeting')(e.target.value)}
              rows={3}
              placeholder="Good morning, [name]. Today we begin…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none"
            />
            <p className="mt-1 text-[11px] text-gray-400">Use [name] — it will be replaced with the member's first name.</p>
          </Field>

          <Field label="Consider This">
            <textarea
              value={considerThis}
              onChange={e => patch(setConsiderThis, 'considerThis')(e.target.value)}
              rows={6}
              placeholder="When the Psalmist wrote these words…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 resize-y"
            />
            <p className="mt-1 text-[11px] text-gray-400">The devotional reflection — 2–4 paragraphs.</p>
          </Field>

          <Field label="Prayer">
            <textarea
              value={prayer}
              onChange={e => patch(setPrayer, 'prayer')(e.target.value)}
              rows={4}
              placeholder="Lord, today I come to you with…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none"
            />
            <p className="mt-1 text-[11px] text-gray-400">Written in first person for the member to pray aloud.</p>
          </Field>

          <Field label="Your Next Step">
            <textarea
              value={nextStep}
              onChange={e => patch(setNextStep, 'nextStep')(e.target.value)}
              rows={2}
              placeholder="Take five minutes today to…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none"
            />
            <p className="mt-1 text-[11px] text-gray-400">One concrete action for today.</p>
          </Field>

          <Field label="Closing">
            <textarea
              value={closing}
              onChange={e => patch(setClosing, 'closing')(e.target.value)}
              rows={2}
              placeholder="Walk with grace today."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none"
            />
            <p className="mt-1 text-[11px] text-gray-400">Optional send-off at the bottom of the reading.</p>
          </Field>
        </div>
      </div>

      {/* ── Preview panel ─────────────────────────────────────────────────────── */}
      <div className="w-[360px] flex-shrink-0 bg-background border-l border-gray-200 overflow-y-auto">
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide text-center">Preview</p>
        </div>
        <DevotionalReading
          seriesTitle={seriesTitle}
          dayNumber={day}
          title={title}
          greeting={greeting}
          scripture={scriptureReference}
          considerThis={considerThis}
          prayer={prayer}
          nextStep={nextStep}
          closing={closing}
          memberName={resolveDisplayName(user?.preferredName)}
          previewMode
          actionButton={<PreviewDevotionalContinueButton />}
        />
      </div>
      </div>{/* end flex-1 min-h-0 two-panel wrapper */}
    </div>
  );
}
