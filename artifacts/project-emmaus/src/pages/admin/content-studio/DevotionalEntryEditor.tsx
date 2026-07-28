/**
 * DevotionalEntryEditor — edit a single devotional entry (day).
 *
 * Left panel:  all text fields + status/publish controls
 * Right panel: live DevotionalReading preview
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ArrowLeft, Eye, EyeOff, Check, Clock, AlertCircle,
  PanelRightOpen, PanelRightClose, Loader2,
} from 'lucide-react';
import {
  getSeriesWithEntries,
  saveEntry,
  type SeriesWithEntries,
  type DevotionalEntry,
} from '@/lib/devotionals-api';
import { DevotionalReading, PreviewDevotionalContinueButton } from '@/components/DevotionalReading';
import { resolveDisplayName } from '@/components/DailyRhythmReading';
import { Field } from '../shared';
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
  const [rightOpen, setRightOpen] = useState(true);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading entry…
      </div>
    );
  }

  const seriesTitle = seriesData?.title ?? '';

  return (
    <div className="flex h-full min-h-0 bg-gray-50">

      {/* ── Editor panel ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 bg-white border-r border-gray-200 overflow-y-auto">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft size={13} /> {seriesTitle}
            </button>
            <span className="text-gray-200">·</span>
            <span className="text-[13px] text-gray-500 font-medium">Day {day}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Save status */}
            <span className={`text-xs transition-all ${
              saveStatus === 'saving' ? 'text-gray-400' :
              saveStatus === 'saved'  ? 'text-emerald-600' :
              saveStatus === 'error'  ? 'text-red-500' : 'invisible'
            }`}>
              {saveStatus === 'saving' && <><Clock size={11} className="inline animate-spin mr-1" />Saving…</>}
              {saveStatus === 'saved'  && <><Check size={11} className="inline mr-1" />Saved</>}
              {saveStatus === 'error'  && <><AlertCircle size={11} className="inline mr-1" />Error</>}
            </span>

            {/* Publish toggle */}
            <button
              onClick={handleTogglePublish}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                status === 'Published'
                  ? 'bg-teal-50 text-teal-700 hover:bg-teal-100'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {status === 'Published' ? <><EyeOff size={12} /> Unpublish</> : <><Eye size={12} /> Publish</>}
            </button>

            {/* Preview toggle */}
            <button
              onClick={() => setRightOpen(!rightOpen)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
            >
              {rightOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
            </button>
          </div>
        </div>

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
      {rightOpen && (
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
      )}
    </div>
  );
}
