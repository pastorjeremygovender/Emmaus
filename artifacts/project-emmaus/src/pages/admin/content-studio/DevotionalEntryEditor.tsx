/**
 * DevotionalEntryEditor — edit a single devotional entry (day).
 *
 * Uses EmmausContentEditor for the shared two-panel layout:
 *   Left panel:  all text fields + ContentStudioToolbar
 *   Right panel: live DevotionalReading preview (actual member renderer)
 *
 * This editor is the approved visual benchmark for all Emmaus day editors.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  getSeriesWithEntries,
  saveEntry,
  deleteEntry,
  type SeriesWithEntries,
  type DevotionalEntry,
} from '@/lib/devotionals-api';
import { ShareImageField } from '@/components/ShareImageField';
import { getDevotionalLabel } from '@/lib/step-label';
import { DevotionalReading, PreviewDevotionalContinueButton } from '@/components/DevotionalReading';
import { resolveDisplayName } from '@/components/DailyRhythmReading';
import { Field, ContentStudioToolbar, ConfirmDialog } from '../shared';
import { useAuth } from '@/contexts/AuthContext';
import EmmausContentEditor from './EmmausContentEditor';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  seriesId: string;
  day: number;
  onBack: () => void;
}

export default function DevotionalEntryEditor({ seriesId, day, onBack }: Props) {
  const { user } = useAuth();
  const auth = user ? { userId: user.id, userRole: user.role } : undefined;

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
  const [displayLabel, setDisplayLabel] = useState('');
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null);
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
        setDisplayLabel(entry.displayLabel ?? '');
        setShareImageUrl(entry.shareImageUrl ?? null);
        setStatus(entry.status);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [seriesId, day]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const doSave = useCallback(async (fields: Partial<DevotionalEntry>) => {
    setSaveStatus('saving');
    try {
      await saveEntry(seriesId, day, fields, auth);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  }, [seriesId, day]); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleSave = useCallback((fields: Partial<DevotionalEntry>) => {
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => doSave(fields), 1200);
  }, [doSave]);

  const currentFields = (): Partial<DevotionalEntry> => ({
    title, scriptureReference, greeting, considerThis, prayer, nextStep, closing,
    displayLabel: displayLabel || null,
    shareImageUrl: shareImageUrl ?? null,
    status,
  });

  function patch<T>(setter: (v: T) => void, key: keyof DevotionalEntry) {
    return (v: T) => {
      setter(v);
      const fields = { ...currentFields(), [key]: v };
      scheduleSave(fields);
    };
  }

  const handleSaveDraft = async () => {
    setSavingAs('draft');
    setSuccessMsg('');
    setErrorMsg('');
    try {
      await doSave(currentFields());
      setSuccessMsg(status === 'Published' ? 'Changes saved successfully.' : 'Draft saved successfully.');
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
      setSavingAs(null);
      toast.success('Day published successfully.');
      onBack();
    } catch {
      setErrorMsg('Publish failed — please try again.');
      setTimeout(() => setErrorMsg(''), 4000);
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
    } catch {
      setErrorMsg('Unpublish failed — please try again.');
      setTimeout(() => setErrorMsg(''), 4000);
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

  const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300";
  const textareaCls = `${inputCls} resize-none`;

  return (
    <EmmausContentEditor
      toolbar={
        <ContentStudioToolbar
          onBack={onBack}
          title={seriesTitle || 'Daily Devotionals'}
          subtitle={`Day ${day}`}
          status={status}
          isSaving={savingAs === 'draft'}
          isPublishing={savingAs === 'publish' || savingAs === 'unpublish'}
          successMessage={successMsg}
          errorMessage={errorMsg}
          onSaveDraft={handleSaveDraft}
          onPublish={handlePublish}
          onUnpublish={handleUnpublish}
          onDelete={() => setConfirmDelete(true)}
        />
      }
      fields={
        <div className="flex-1 p-6 space-y-5 max-w-2xl">
          <Field label="Title">
            <input
              value={title}
              onChange={e => patch(setTitle, 'title')(e.target.value)}
              placeholder="e.g. When God Restores"
              className={inputCls}
            />
          </Field>

          <Field label="Scripture Reference">
            <input
              value={scriptureReference}
              onChange={e => patch(setScriptureReference, 'scriptureReference')(e.target.value)}
              placeholder="Psalm 23:1-6"
              className={inputCls}
            />
            <p className="mt-1 text-[11px] text-gray-400">e.g. Psalm 23:1-6 or John 15:1-11</p>
          </Field>

          <Field label="Greeting">
            <textarea
              value={greeting}
              onChange={e => patch(setGreeting, 'greeting')(e.target.value)}
              rows={3}
              placeholder="Good morning, [name]. Today we begin…"
              className={textareaCls}
            />
            <p className="mt-1 text-[11px] text-gray-400">Use [name] — it will be replaced with the member's first name.</p>
          </Field>

          <Field label="Consider This">
            <textarea
              value={considerThis}
              onChange={e => patch(setConsiderThis, 'considerThis')(e.target.value)}
              rows={6}
              placeholder="When the Psalmist wrote these words…"
              className={`${inputCls} resize-y`}
            />
            <p className="mt-1 text-[11px] text-gray-400">The devotional reflection — 2–4 paragraphs.</p>
          </Field>

          <Field label="Prayer">
            <textarea
              value={prayer}
              onChange={e => patch(setPrayer, 'prayer')(e.target.value)}
              rows={4}
              placeholder="Lord, today I come to you with…"
              className={textareaCls}
            />
            <p className="mt-1 text-[11px] text-gray-400">Written in first person for the member to pray aloud.</p>
          </Field>

          <Field label="Your Next Step">
            <textarea
              value={nextStep}
              onChange={e => patch(setNextStep, 'nextStep')(e.target.value)}
              rows={2}
              placeholder="Take five minutes today to…"
              className={textareaCls}
            />
            <p className="mt-1 text-[11px] text-gray-400">One concrete action for today.</p>
          </Field>

          <Field label="Closing">
            <textarea
              value={closing}
              onChange={e => patch(setClosing, 'closing')(e.target.value)}
              rows={2}
              placeholder="Walk with grace today."
              className={textareaCls}
            />
            <p className="mt-1 text-[11px] text-gray-400">Optional send-off at the bottom of the reading.</p>
          </Field>

          <Field label="Display Label">
            <input
              type="text"
              value={displayLabel}
              onChange={e => patch(setDisplayLabel, 'displayLabel')(e.target.value)}
              placeholder="e.g. 1 January"
              className={textareaCls}
            />
            <p className="mt-1 text-[11px] text-gray-400">Optional. Members see this instead of "Day N" when set.</p>
          </Field>

          <Field label="Share Image">
            <ShareImageField
              value={shareImageUrl}
              onChange={(path) => {
                setShareImageUrl(path);
                doSave({ ...currentFields(), shareImageUrl: path });
              }}
              autoGenerate={!shareImageUrl}
              stepContent={[
                scriptureReference,
                greeting,
                considerThis,
                prayer,
                nextStep,
                closing,
              ].filter(Boolean).join('\n\n')}
            />
          </Field>
        </div>
      }
      preview={
        <DevotionalReading
          seriesTitle={seriesTitle}
          dayNumber={day}
          displayLabel={getDevotionalLabel({ dayNumber: day, displayLabel: displayLabel || null })}
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
      }
      dialogs={
        confirmDelete ? (
          <ConfirmDialog
            title="Delete Day?"
            message={`Day ${day} will be permanently deleted. This cannot be undone.`}
            confirmLabel={deleting ? 'Deleting…' : 'Delete Permanently'}
            danger
            onConfirm={handleDelete}
            onCancel={() => setConfirmDelete(false)}
          />
        ) : null
      }
    />
  );
}
