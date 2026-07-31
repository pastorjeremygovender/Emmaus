/**
 * SermonEditor — URL-first sermon draft generator + two-tab review workspace.
 *
 * Phases (new sermon):
 *   url-input  → paste YouTube URL, click Generate Draft
 *   generating → progress messages while pipeline runs
 *   review     → two tabs: Sermon (editable fields) | Companion (5-day editor)
 *
 * Existing sermons go straight to 'review' with the edit form.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { useAdmin } from '@/contexts/AdminContext';
import { useAuth } from '@/contexts/AuthContext';
import { Sermon } from '@/lib/admin-demo-data';
import { DevotionalReading, PreviewDevotionalContinueButton } from '@/components/DevotionalReading';
import {
  generateSermonDraft,
  regenerateField,
  redetectSermon,
  saveCompanionEntry,
  getCompanion,
  deleteServerSermon,
  patchServerSermon,
  publishSermonCompanion,
  unpublishSermonCompanion,
  setCurrentWeekCompanion,
  suggestAlternativeTheme,
  regenerateSermonTheme,

  ApiError,
  type SermonDraftResult,
  type SermonDetectionSource,
  type ThemeConfirmationSource,
  type CompanionEntry,
} from '@/lib/sermon-generator-api';
import EmmausContentEditor from './content-studio/EmmausContentEditor';
import {
  ConfirmDialog,
  Field, TextInput, TextArea, Select, AdminBtn, StatusBadge,
  ContentStudioToolbar,
} from './shared';
import {
  Loader2, RefreshCw, Check, X, ChevronRight,
  AlertCircle, CheckCircle2, Trash2,
} from 'lucide-react';

type Props = {
  sermonId: string | null;
  onBack: () => void;
  onOpenCompanion: (journeyId: string, fresh?: boolean) => void;
};

type Phase = 'url-input' | 'generating' | 'transcript-required' | 'confirm-sermon' | 'adjust-sermon' | 'confirm-theme' | 'review';

/** Video metadata returned when transcript is unavailable */
interface TranscriptSource {
  youtubeUrl: string;
  videoId: string;
  title?: string;
  thumbnailUrl?: string;
}


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
  mainTheme: '',
  status: 'draft',
  pastorEdited: false,
  updatedAt: new Date().toISOString(),
};

// ─── Companion Day Editor ─────────────────────────────────────────────────────
// Uses the shared EmmausContentEditor layout and ContentStudioToolbar so the
// Companion tab matches the Daily Rhythm, Daily Devotionals, and Journey editors.

function CompanionDayEditor({
  companionId,
  companionTitle,
  entries,
  auth,
  companionStatus,
  notifyMembers,
  onNotifyMembersChange,
  onCompanionPublish,
  onCompanionUnpublish,
  onBack,
}: {
  companionId: string;
  companionTitle: string;
  entries: CompanionEntry[];
  auth: { userId: string; userRole: string };
  companionStatus: string;
  /** Smart Content Indicator — show to members as new/updated when published */
  notifyMembers: boolean;
  onNotifyMembersChange: (v: boolean) => void;
  onCompanionPublish: () => Promise<void>;
  onCompanionUnpublish: () => Promise<void>;
  onBack: () => void;
}) {
  const [selectedDay, setSelectedDay] = useState(1);
  const [localEntries, setLocalEntries] = useState<CompanionEntry[]>(entries);
  const [savingAs, setSavingAs] = useState<'draft' | 'publish' | 'unpublish' | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<Partial<CompanionEntry> | null>(null);

  const current = localEntries.find(e => e.dayNumber === selectedDay);

  const patchEntry = useCallback((field: keyof CompanionEntry, value: string) => {
    setLocalEntries(prev => {
      const updated = prev.map(e =>
        e.dayNumber === selectedDay ? { ...e, [field]: value } : e
      );
      const entry = updated.find(e => e.dayNumber === selectedDay);
      if (entry) {
        pendingSaveRef.current = {
          title: entry.title,
          scriptureReference: entry.scriptureReference,
          greeting: entry.greeting,
          reflection: entry.reflection,
          prayer: entry.prayer,
          nextStep: entry.nextStep,
          closing: entry.closing,
          sermonLink: entry.sermonLink,
        };
      }
      return updated;
    });

    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(async () => {
      const toSave = pendingSaveRef.current;
      if (!toSave) return;
      pendingSaveRef.current = null;
      try {
        await saveCompanionEntry(companionId, selectedDay, toSave, auth);
      } catch {
        // Autosave failure is silent; the pastor can retry with Save Draft
      }
    }, 1200);
  }, [companionId, selectedDay, auth]);

  /** Flush any pending debounced autosave immediately */
  const flushSave = useCallback(async () => {
    if (autosaveRef.current) { clearTimeout(autosaveRef.current); autosaveRef.current = null; }
    const toSave = pendingSaveRef.current;
    if (!toSave) return;
    pendingSaveRef.current = null;
    await saveCompanionEntry(companionId, selectedDay, toSave, auth);
  }, [companionId, selectedDay, auth]);

  const handleSaveDraft = async () => {
    setSavingAs('draft');
    setSuccessMsg('');
    setErrorMsg('');
    try {
      await flushSave();
      // Also save the full current entry to ensure nothing is missed
      const entry = localEntries.find(e => e.dayNumber === selectedDay);
      if (entry) {
        await saveCompanionEntry(companionId, selectedDay, {
          title: entry.title,
          scriptureReference: entry.scriptureReference,
          greeting: entry.greeting,
          reflection: entry.reflection,
          prayer: entry.prayer,
          nextStep: entry.nextStep,
          closing: entry.closing,
          sermonLink: entry.sermonLink,
        }, auth);
      }
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
    setErrorMsg('');
    try {
      await flushSave();
      await onCompanionPublish();
      setSavingAs(null);
      toast.success('Sermon Companion published successfully.');
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
    setErrorMsg('');
    try {
      await onCompanionUnpublish();
      setSuccessMsg('Unpublished successfully.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setErrorMsg('Unpublish failed — please try again.');
      setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setSavingAs(null);
    }
  };

  if (!current) return (
    <div className="flex items-center justify-center h-48 text-gray-400">No entries found.</div>
  );

  const InputCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300";
  const TextareaCls = `${InputCls} resize-none`;

  // Day selector strip rendered between toolbar and field panel
  const daySelector = (
    <div className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 bg-gray-50 border-b border-gray-100 flex-wrap">
      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mr-1">Day</span>
      {localEntries.map(e => (
        <button
          key={e.dayNumber}
          onClick={() => setSelectedDay(e.dayNumber)}
          className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
            selectedDay === e.dayNumber
              ? 'bg-teal-50 text-teal-700 border border-teal-200'
              : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          {e.dayNumber}
        </button>
      ))}
    </div>
  );

  return (
    <EmmausContentEditor
      toolbar={
        <ContentStudioToolbar
          onBack={onBack}
          title={companionTitle}
          subtitle={`Day ${selectedDay}`}
          status={companionStatus}
          isSaving={savingAs === 'draft'}
          isPublishing={savingAs === 'publish' || savingAs === 'unpublish'}
          successMessage={successMsg}
          errorMessage={errorMsg}
          onSaveDraft={handleSaveDraft}
          onPublish={handlePublish}
          onUnpublish={handleUnpublish}
          extraActions={
            companionStatus !== 'Published' ? (
              <label className="flex items-center gap-1.5 text-[12px] text-gray-500 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={notifyMembers}
                  onChange={e => onNotifyMembersChange(e.target.checked)}
                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                Notify members
              </label>
            ) : undefined
          }
        />
      }
      aboveSplit={daySelector}
      fields={
        <div className="flex-1 p-6 space-y-5 max-w-2xl">
          <div className="flex items-center gap-2 text-xs text-gray-400 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <AlertCircle size={12} className="text-amber-500 flex-shrink-0" />
            All companion days are saved as Draft. Pastoral review required before publishing.
          </div>

          <Field label="Title">
            <input value={current.title} onChange={e => patchEntry('title', e.target.value)}
              placeholder="e.g. When Grace Finds You" className={InputCls} />
          </Field>

          <Field label="Scripture Reference">
            <input value={current.scriptureReference} onChange={e => patchEntry('scriptureReference', e.target.value)}
              placeholder="e.g. Psalm 23:1-6" className={InputCls} />
          </Field>

          <Field label="From the Sermon">
            <textarea value={current.greeting} onChange={e => patchEntry('greeting', e.target.value)}
              rows={3} placeholder="A concise restatement of what the preacher actually said on this day's theme…" className={TextareaCls} />
            <p className="mt-1 text-[11px] text-gray-400">What the preacher actually said — quote or close paraphrase only. No new teaching.</p>
          </Field>

          <Field label="Reflection">
            <textarea value={current.reflection} onChange={e => patchEntry('reflection', e.target.value)}
              rows={7} placeholder="Help the reader think about what was preached — stay inside the preacher's point…" className={`${InputCls} resize-y`} />
            <p className="mt-1 text-[11px] text-gray-400">2–3 paragraphs grounded in the sermon. No outside teaching or Scriptures.</p>
          </Field>

          <Field label="Prayer">
            <textarea value={current.prayer} onChange={e => patchEntry('prayer', e.target.value)}
              rows={4} placeholder="Lord, today I come to you with…" className={TextareaCls} />
            <p className="mt-1 text-[11px] text-gray-400">Written in first person for the member to pray aloud.</p>
          </Field>

          <Field label="Your Next Step">
            <textarea value={current.nextStep} onChange={e => patchEntry('nextStep', e.target.value)}
              rows={2} placeholder="Take five minutes today to…" className={TextareaCls} />
          </Field>

          <Field label="Closing">
            <textarea value={current.closing} onChange={e => patchEntry('closing', e.target.value)}
              rows={2} placeholder="Walk with grace today." className={TextareaCls} />
          </Field>

          <Field label="Sermon Link (timestamped)">
            <input value={current.sermonLink ?? ''} onChange={e => patchEntry('sermonLink', e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…&t=…s" className={InputCls} />
            {current.sermonLink && (
              <a href={current.sermonLink} target="_blank" rel="noopener noreferrer"
                className="mt-1 text-[11px] text-teal-600 hover:underline block">
                ↗ Open sermon at this point
              </a>
            )}
            <p className="mt-1 text-[11px] text-gray-400">Auto-generated timestamped link to the relevant sermon segment.</p>
          </Field>
        </div>
      }
      preview={
        <DevotionalReading
          seriesTitle={companionTitle}
          dayNumber={selectedDay}
          title={current.title}
          greeting={current.greeting}
          scripture={current.scriptureReference}
          considerThis={current.reflection}
          prayer={current.prayer}
          nextStep={current.nextStep}
          closing={current.closing}
          memberName={undefined}
          previewMode
          actionButton={<PreviewDevotionalContinueButton />}
        />
      }
    />
  );
}

// ─── Field regeneration button ────────────────────────────────────────────────

function RegenButton({
  onRegen,
  loading,
}: { onRegen: () => void; loading: boolean }) {
  return (
    <button
      onClick={onRegen}
      disabled={loading}
      className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-teal-600 transition-colors disabled:opacity-50"
    >
      {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
      Regenerate
    </button>
  );
}

function ProposedValue({
  value,
  onApply,
  onDismiss,
}: {
  value: string | string[];
  onApply: () => void;
  onDismiss: () => void;
}) {
  const display = Array.isArray(value) ? value.join(', ') : value;
  return (
    <div className="mt-2 border border-amber-200 bg-amber-50 rounded-xl p-3 space-y-2">
      <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide">Proposed replacement</p>
      <p className="text-sm text-gray-700 whitespace-pre-line">{display}</p>
      <div className="flex gap-2">
        <button
          onClick={onApply}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
        >
          <Check size={11} /> Apply
        </button>
        <button
          onClick={onDismiss}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <X size={11} /> Dismiss
        </button>
      </div>
    </div>
  );
}

// ─── URL Input Phase ──────────────────────────────────────────────────────────

function UrlInputPhase({
  onGenerate,
  onBack,
}: {
  onGenerate: (url: string) => void;
  onBack: () => void;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    const trimmed = url.trim();
    if (!trimmed) { setError('Please enter a YouTube URL'); return; }
    if (!trimmed.includes('youtube.com') && !trimmed.includes('youtu.be')) {
      setError('Please enter a valid YouTube URL');
      return;
    }
    setError('');
    onGenerate(trimmed);
  };

  return (
    <div className="max-w-xl mx-auto px-6 py-12 space-y-6">
      <div className="space-y-1">
        <h2 className="text-[18px] font-semibold text-gray-900">Generate Sermon Draft</h2>
        <p className="text-sm text-gray-500">
          Paste a YouTube URL and Emmaus will build a sermon record and 5-day companion draft for your review.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <Field label="YouTube URL" error={error}>
          <TextInput
            value={url}
            onChange={e => { setUrl(e.target.value); setError(''); }}
            placeholder="https://www.youtube.com/watch?v=…"
            error={!!error}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
          />
        </Field>

        <div className="flex gap-3">
          <AdminBtn variant="primary" onClick={handleSubmit}>
            Generate Draft
          </AdminBtn>
          <AdminBtn variant="ghost" onClick={onBack}>
            Cancel
          </AdminBtn>
        </div>
      </div>

      <div className="text-xs text-gray-400 space-y-1">
        <p>• Sermon fields and summary are generated by AI from the video's title, description, and captions.</p>
        <p>• All output is Draft. Nothing is published automatically.</p>
        <p>• You can edit any field after generation.</p>
      </div>
    </div>
  );
}

// ─── Generating Phase ─────────────────────────────────────────────────────────

function GeneratingPhase({ url }: { url: string }) {
  return (
    <div className="max-w-xl mx-auto px-6 py-16 space-y-6 text-center">
      <Loader2 size={32} className="animate-spin text-teal-600 mx-auto" />
      <div className="space-y-1">
        <p className="text-[17px] font-medium text-gray-900">Generating Draft…</p>
        <p className="text-sm text-gray-500 break-all">{url}</p>
      </div>
      <div className="text-[13px] text-gray-400 space-y-1">
        <p>Fetching video details from YouTube</p>
        <p>Analysing with AI · Building companion</p>
        <p className="text-xs">This usually takes 20–40 seconds.</p>
      </div>
    </div>
  );
}

// ─── Transcript Fallback Phase ────────────────────────────────────────────────

function TranscriptFallbackPhase({
  source,
  onContinue,
  onBack,
}: {
  source: TranscriptSource;
  onContinue: (transcript: string) => void;
  onBack: () => void;
}) {
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!transcript.trim() || transcript.trim().split(/\s+/).length < 20) {
      setError('Please paste the sermon transcript before continuing.');
      return;
    }
    setError('');
    onContinue(transcript.trim());
  };

  return (
    <div className="max-w-xl mx-auto px-6 py-12 space-y-6">
      <div className="space-y-1">
        <h2 className="text-[18px] font-semibold text-gray-900">Transcript Required</h2>
        <p className="text-sm text-gray-500">
          We couldn't retrieve a transcript from this video.
        </p>
      </div>

      {/* Video context card */}
      <div className="flex items-start gap-4 p-4 bg-gray-50 border border-gray-200 rounded-2xl">
        {source.thumbnailUrl && (
          <img
            src={source.thumbnailUrl}
            alt=""
            className="w-24 h-14 object-cover rounded-lg shrink-0"
          />
        )}
        <div className="min-w-0">
          {source.title && (
            <p className="text-[14px] font-medium text-gray-900 line-clamp-2">{source.title}</p>
          )}
          <p className="text-xs text-gray-400 mt-1 break-all">{source.youtubeUrl}</p>
        </div>
      </div>

      {/* Transcript paste area */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <div className="space-y-1">
          <p className="text-[14px] font-medium text-gray-800">Sermon Transcript</p>
          <p className="text-sm text-gray-500">
            Paste the sermon transcript below and Emmaus will continue preparing the draft.
          </p>
        </div>

        <div>
          <textarea
            className={`w-full h-56 text-sm p-3 border rounded-xl resize-y font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500 ${
              error ? 'border-red-400 bg-red-50' : 'border-gray-200'
            }`}
            placeholder="Paste the full sermon transcript here…"
            value={transcript}
            onChange={e => { setTranscript(e.target.value); setError(''); }}
          />
          {error && (
            <p className="mt-1 text-xs text-red-600">{error}</p>
          )}
        </div>

        <div className="flex gap-3">
          <AdminBtn variant="primary" onClick={handleSubmit}>
            Continue Generating Draft
          </AdminBtn>
          <AdminBtn variant="ghost" onClick={onBack}>
            Cancel
          </AdminBtn>
        </div>
      </div>

      <div className="text-xs text-gray-400 space-y-1">
        <p>• You can find the transcript via YouTube's "Show transcript" option below the video.</p>
        <p>• All generated output is Draft. Nothing is published automatically.</p>
      </div>
    </div>
  );
}

// ─── Confirm Sermon Phase ─────────────────────────────────────────────────────
// Shown when AI detection confidence < 0.85. Asks pastor to confirm or adjust
// the detected sermon boundaries before generation continues.

function formatHMS(secs: number | null): string {
  if (secs == null) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function formatDuration(secs: number | null): string {
  if (secs == null) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

function ConfirmSermonPhase({
  detection,
  youtubeUrl,
  onConfirm,
  onAdjust,
  onBack,
}: {
  detection: SermonDetectionSource;
  youtubeUrl: string;
  onConfirm: (src: SermonDetectionSource) => void;
  onAdjust: (src: SermonDetectionSource) => void;
  onBack: () => void;
}) {
  const confidencePct = Math.round(detection.confidence * 100);

  return (
    <div className="max-w-xl mx-auto px-6 py-12 space-y-6">
      <div className="space-y-1">
        <h2 className="text-[18px] font-semibold text-gray-900">Confirm Sermon Section</h2>
        <p className="text-sm text-gray-500">
          Emmaus identified the sermon portion of this recording. Please confirm the boundaries before generating the companion.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        {/* Confidence badge */}
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
            ${confidencePct >= 70 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            <AlertCircle size={11} />
            {confidencePct}% confidence
          </span>
          <span className="text-xs text-gray-400">Manual confirmation requested</span>
        </div>

        {/* Times */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-0.5">Start</p>
            <p className="text-[15px] font-semibold text-gray-900 font-mono">{formatHMS(detection.startSecs)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-0.5">End</p>
            <p className="text-[15px] font-semibold text-gray-900 font-mono">{formatHMS(detection.endSecs)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-0.5">Duration</p>
            <p className="text-[15px] font-semibold text-gray-900">{formatDuration(detection.durationSecs)}</p>
          </div>
        </div>

        {/* Preview */}
        {detection.previewText && (
          <div>
            <p className="text-xs text-gray-400 mb-1">Detected sermon opening</p>
            <p className="text-sm text-gray-700 leading-relaxed line-clamp-4 italic">
              "{detection.previewText}…"
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-3 flex-wrap">
        <AdminBtn variant="primary" onClick={() => onConfirm(detection)}>
          <Check size={14} className="mr-1" />
          Looks Correct — Generate
        </AdminBtn>
        {/* Only show Adjust when we have timestamps to reason from */}
        {detection.startSecs !== null && detection.endSecs !== null && (
          <AdminBtn variant="secondary" onClick={() => onAdjust(detection)}>
            Adjust Boundaries
          </AdminBtn>
        )}
        <AdminBtn variant="ghost" onClick={onBack}>
          Cancel
        </AdminBtn>
      </div>

      <p className="text-xs text-gray-400">
        Emmaus analysed {detection.segmentCount} transcript segments ({detection.segmentCount * 200}-word blocks).
        Confirming means generation will use only the detected sermon section.
      </p>
    </div>
  );
}

// ─── Adjust Sermon Phase ──────────────────────────────────────────────────────
// Lets the pastor manually enter corrected start/end timestamps.
// Word-offset computation is handled server-side against the timed VTT cue index.

function AdjustSermonPhase({
  detection,
  youtubeUrl,
  onApply,
  onBack,
}: {
  detection: SermonDetectionSource;
  youtubeUrl: string;
  onApply: (adjusted: { startSecs: number; endSecs: number }) => void;
  onBack: () => void;
}) {
  function secsToInput(secs: number | null): string {
    if (secs == null) return '';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function inputToSecs(str: string): number | null {
    const parts = str.split(':').map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return null;
  }

  const [startStr, setStartStr] = useState(secsToInput(detection.startSecs));
  const [endStr, setEndStr] = useState(secsToInput(detection.endSecs));
  const [error, setError] = useState('');

  const handleApply = () => {
    const startSecs = inputToSecs(startStr);
    const endSecs = inputToSecs(endStr);
    if (startSecs == null || endSecs == null) {
      setError('Enter times as M:SS or H:MM:SS (e.g. 12:30 or 1:05:00)');
      return;
    }
    if (endSecs <= startSecs) {
      setError('End time must be after start time');
      return;
    }
    // Send corrected seconds only — the server maps them to word offsets using
    // the timed VTT cue index from the original transcript retrieval.
    onApply({ startSecs, endSecs });
  };

  return (
    <div className="max-w-xl mx-auto px-6 py-12 space-y-6">
      <div className="space-y-1">
        <h2 className="text-[18px] font-semibold text-gray-900">Adjust Sermon Boundaries</h2>
        <p className="text-sm text-gray-500">
          Enter the correct start and end times for the sermon portion of this recording.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Sermon start (M:SS)">
            <TextInput
              value={startStr}
              onChange={e => { setStartStr(e.target.value); setError(''); }}
              placeholder="e.g. 15:30"
              error={!!error}
            />
          </Field>
          <Field label="Sermon end (M:SS)">
            <TextInput
              value={endStr}
              onChange={e => { setEndStr(e.target.value); setError(''); }}
              placeholder="e.g. 55:00"
              error={!!error}
            />
          </Field>
        </div>
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
        <p className="text-xs text-gray-400">
          Formats: <span className="font-mono">12:30</span>, <span className="font-mono">1:05:00</span>
        </p>
      </div>

      <div className="flex gap-3">
        <AdminBtn variant="primary" onClick={handleApply}>Apply & Generate</AdminBtn>
        <AdminBtn variant="ghost" onClick={onBack}>Back</AdminBtn>
      </div>
    </div>
  );
}

// ─── Main Theme Card (review tab) ────────────────────────────────────────────
// Shows the confirmed theme in the Sermon Details panel with Edit + Regenerate.

function MainThemeCard({
  theme,
  sermonId,
  auth,
  onChange,
}: {
  theme: string;
  sermonId: string | null;
  auth: { userId: string; userRole: string } | null;
  onChange: (v: string) => void;
}) {
  const [editMode, setEditMode]         = useState(false);
  const [editValue, setEditValue]       = useState(theme);
  const [regenerating, setRegenerating] = useState(false);
  const [proposed, setProposed]         = useState<string | null>(null);
  const [regenError, setRegenError]     = useState('');

  // Keep edit value in sync if parent changes the theme externally
  React.useEffect(() => { setEditValue(theme); }, [theme]);

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    onChange(trimmed);
    setEditMode(false);
  };

  const handleRegenerate = async () => {
    if (!sermonId || !auth) return;
    setRegenerating(true);
    setRegenError('');
    try {
      const newTheme = await regenerateSermonTheme(sermonId, auth);
      setProposed(newTheme);
    } catch {
      setRegenError('Regeneration failed. Please try again.');
      setTimeout(() => setRegenError(''), 4000);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-teal-200 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Main Theme</h2>
        <div className="flex items-center gap-2">
          {!editMode && (
            <>
              <button
                onClick={() => { setEditValue(theme); setEditMode(true); setProposed(null); }}
                className="text-[11px] text-gray-400 hover:text-teal-700 font-medium transition-colors"
              >
                Edit
              </button>
              {sermonId && (
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-teal-600 transition-colors disabled:opacity-50"
                >
                  {regenerating
                    ? <Loader2 size={11} className="animate-spin" />
                    : <RefreshCw size={11} />}
                  {regenerating ? 'Generating…' : theme ? 'Regenerate' : 'Generate Theme'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {!editMode ? (
        <>
          <p className="text-sm text-gray-800 italic leading-relaxed">
            {theme ? `"${theme}"` : (
              <span className="text-gray-400 not-italic">No theme set — generate a sermon to create one.</span>
            )}
          </p>
          {regenError && <p className="text-xs text-red-600">{regenError}</p>}
          {proposed && (
            <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 space-y-2">
              <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide">Proposed replacement</p>
              <p className="text-sm text-gray-700 italic">"{proposed}"</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { onChange(proposed); setProposed(null); }}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                >
                  <Check size={11} /> Apply
                </button>
                <button
                  onClick={() => setProposed(null)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <X size={11} /> Dismiss
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            rows={2}
            placeholder="e.g. Following Jesus means putting Him first in every area of life."
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none"
          />
          <p className="text-[11px] text-gray-400">One sentence — the Big Idea that ties every companion day together.</p>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              Save Theme
            </button>
            <button
              onClick={() => { setEditMode(false); setEditValue(theme); }}
              className="px-3 py-1.5 text-xs font-medium bg-white text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Confirm Theme Phase ──────────────────────────────────────────────────────
// Shown after sermon boundaries are confirmed. AI produces a one-sentence Big
// Idea; the pastor can accept, edit, or regenerate it before generation begins.

function ConfirmThemePhase({
  theme: initialTheme,
  sermonSnippet,
  onConfirm,
  onBack,
  onSuggest,
}: {
  theme: string;
  sermonSnippet: string;
  onConfirm: (theme: string) => void;
  onBack: () => void;
  onSuggest: (prev: string) => Promise<string>;
}) {
  const [editMode, setEditMode]           = useState(false);
  const [editValue, setEditValue]         = useState(initialTheme);
  const [activeTheme, setActiveTheme]     = useState(initialTheme);
  const [regenerating, setRegenerating]   = useState(false);
  const [suggestions, setSuggestions]     = useState<{ a: string; b: string } | null>(null);
  const [selected, setSelected]           = useState<'a' | 'b' | null>(null);
  const [regenError, setRegenError]       = useState('');

  const handleRegenerate = async () => {
    setRegenerating(true);
    setRegenError('');
    try {
      const alt = await onSuggest(activeTheme);
      setSuggestions({ a: activeTheme, b: alt });
      setSelected(null);
    } catch {
      setRegenError('Could not generate a suggestion. Please try again.');
    } finally {
      setRegenerating(false);
    }
  };

  const handlePickSuggestion = () => {
    if (!suggestions || !selected) return;
    const chosen = selected === 'a' ? suggestions.a : suggestions.b;
    setActiveTheme(chosen);
    setEditValue(chosen);
    setSuggestions(null);
    setSelected(null);
  };

  const handleSaveEdit = () => {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    setActiveTheme(trimmed);
    setEditMode(false);
    setSuggestions(null);
  };

  const displayTheme = activeTheme;

  return (
    <div className="max-w-xl mx-auto px-6 py-12 space-y-6">
      <div className="space-y-1">
        <h2 className="text-[18px] font-semibold text-gray-900">Main Theme</h2>
        <p className="text-sm text-gray-500">
          Emmaus identified the main idea from the sermon. Confirm it before generating the Companion.
        </p>
      </div>

      {/* Theme card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        {!editMode && !suggestions && (
          <>
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-5">
              <p className="text-xs font-semibold text-teal-600 uppercase tracking-wide mb-2">
                I believe this sermon is about:
              </p>
              <p className="text-[17px] font-medium text-gray-900 leading-relaxed italic">
                "{displayTheme}"
              </p>
            </div>

            <div className="flex gap-2 flex-wrap">
              <AdminBtn variant="primary" onClick={() => onConfirm(displayTheme)}>
                <Check size={14} className="mr-1" />
                That's Correct
              </AdminBtn>
              <AdminBtn
                variant="secondary"
                onClick={() => { setEditValue(displayTheme); setEditMode(true); }}
              >
                ✏ Edit Main Theme
              </AdminBtn>
            </div>

            <div className="pt-1 border-t border-gray-100">
              {regenError && (
                <p className="text-xs text-red-600 mb-2">{regenError}</p>
              )}
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-teal-600 transition-colors disabled:opacity-50"
              >
                {regenerating
                  ? <Loader2 size={12} className="animate-spin" />
                  : <RefreshCw size={12} />}
                {regenerating ? 'Generating suggestion…' : 'Regenerate Theme'}
              </button>
            </div>
          </>
        )}

        {editMode && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">
                Main Theme (one sentence)
              </label>
              <textarea
                autoFocus
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                rows={3}
                placeholder="e.g. Following Jesus means putting Him first in every area of life."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                One sentence — the Big Idea the pastor wants every devotional to reinforce.
              </p>
            </div>
            <div className="flex gap-2">
              <AdminBtn
                variant="primary"
                onClick={handleSaveEdit}
              >
                Save Theme
              </AdminBtn>
              <AdminBtn variant="ghost" onClick={() => { setEditMode(false); setEditValue(activeTheme); }}>
                Cancel
              </AdminBtn>
            </div>
          </div>
        )}

        {suggestions && !editMode && (
          <div className="space-y-4">
            <p className="text-[13px] font-medium text-gray-700">Choose a suggestion or write your own:</p>

            {(['a', 'b'] as const).map(key => (
              <button
                key={key}
                onClick={() => setSelected(key)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${
                  selected === key
                    ? 'border-teal-500 bg-teal-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">
                  Suggestion {key.toUpperCase()}
                </span>
                <span className="text-sm text-gray-800 italic">"{suggestions[key]}"</span>
              </button>
            ))}

            <div className="flex gap-2 flex-wrap">
              <AdminBtn
                variant="primary"
                onClick={handlePickSuggestion}
              >
                <Check size={14} className="mr-1" />
                Use Selected
              </AdminBtn>
              <AdminBtn
                variant="secondary"
                onClick={() => { setEditValue(activeTheme); setEditMode(true); setSuggestions(null); }}
              >
                ✏ Write My Own
              </AdminBtn>
              <AdminBtn variant="ghost" onClick={() => { setSuggestions(null); setSelected(null); }}>
                Back
              </AdminBtn>
            </div>
          </div>
        )}
      </div>

      {!editMode && !suggestions && (
        <AdminBtn variant="ghost" onClick={onBack}>
          ← Back
        </AdminBtn>
      )}

      <div className="text-xs text-gray-400 space-y-1">
        <p>• The confirmed theme becomes the unifying thread for every day of the Companion.</p>
        <p>• You can edit it later from the Sermon Editor.</p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SermonEditor({ sermonId, onBack, onOpenCompanion }: Props) {
  const { sermons, addSermon, updateSermon, removeSermon, settings, updateSettings } = useAdmin();
  const { user } = useAuth();

  const isNew = !sermonId;
  const existing = sermonId ? sermons.find(s => s.id === sermonId) : undefined;

  const [phase, setPhase] = useState<Phase>(isNew ? 'url-input' : 'review');
  const [generatingUrl, setGeneratingUrl] = useState('');
  const [generationError, setGenerationError] = useState('');
  const [transcriptSource, setTranscriptSource] = useState<TranscriptSource | null>(null);
  const [detectionSource, setDetectionSource] = useState<SermonDetectionSource | null>(null);
  const [themeSource, setThemeSource] = useState<ThemeConfirmationSource | null>(null);
  const [activeTab, setActiveTab] = useState<'sermon' | 'companion'>('sermon');
  const [sermonTranscriptOpen, setSermonTranscriptOpen] = useState(false);
  const [redetecting, setRedetecting] = useState(false);

  // Companion state (from generation result or loaded for existing)
  const [companionData, setCompanionData] = useState<SermonDraftResult['companion'] | null>(null);
  // Companion publish status — tracked separately so the CompanionDayEditor toolbar
  // shows the correct Published/Draft state and Publish/Unpublish buttons.
  const [companionStatusLocal, setCompanionStatusLocal] = useState<string>('Draft');
  const [companionPublishing, setCompanionPublishing] = useState(false);
  // Smart Content Indicators: notify members on companion publish. Defaults ON.
  const [companionNotifyMembers, setCompanionNotifyMembers] = useState(true);

  // Sermon form state
  const [form, setForm] = useState<Omit<Sermon, 'id'>>(() =>
    existing ? { ...existing } : { ...EMPTY_SERMON }
  );
  const [sermonId_, setSermonId_] = useState<string | null>(sermonId);
  const [isDirty, setIsDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmBack, setConfirmBack] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState('');
  const [publishError, setPublishError] = useState('');

  // Per-field regen state
  type RegenField = 'title' | 'speaker' | 'scriptureReference' | 'summary' | 'topics' | 'keywords';
  const [regenLoading, setRegenLoading] = useState<Partial<Record<RegenField, boolean>>>({});
  const [proposed, setProposed] = useState<Partial<Record<RegenField, string | string[]>>>({});

  const auth = user ? { userId: user.id, userRole: user.role } : null;

  // ── Companion hydration for existing sermons ─────────────────────────────────
  // When opening an existing sermon whose companionJourneyId is a UUID (new-style
  // companion saved in DB), fetch the full companion so the Companion tab works.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  useEffect(() => {
    const cid = existing?.companionJourneyId;
    if (!cid || !UUID_RE.test(cid) || !auth) return;
    // Only fetch if we don't already have data (avoids duplicate fetches when
    // either sermonId or user?.id change independently).
    if (companionData) return;

    getCompanion(cid, auth).then(c => {
      setCompanionData({
        id: c.id,
        title: c.title,
        isCurrentWeek: c.isCurrentWeek ?? false,
        entries: c.entries ?? [],
      });
      setCompanionStatusLocal(c.status ?? 'Draft');
    }).catch(() => {
      // Non-fatal: companion tab shows "No companion found" as an indicator
      // without breaking the sermon editing flow.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sermonId, user?.id]);  // re-runs when auth hydrates (null → userId) after mount

  // Keep companionStatusLocal in sync when companionData arrives from generation result
  useEffect(() => {
    if (companionData) {
      // Generation always creates companions as Draft; only update when we have real status
      setCompanionStatusLocal((companionData as { status?: string }).status ?? 'Draft');
    }
  }, [companionData?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCompanionPublish = useCallback(async () => {
    if (!companionData?.id || !auth) return;
    setCompanionPublishing(true);
    try {
      // publishSermonCompanion calls POST /api/sermon-companions/:id/publish which
      // atomically sets the companion status to Published AND publishes all entries.
      await publishSermonCompanion(companionData.id, auth, companionNotifyMembers);
      setCompanionStatusLocal('Published');
    } finally {
      setCompanionPublishing(false);
    }
  }, [companionData?.id, auth, companionNotifyMembers]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCompanionUnpublish = useCallback(async () => {
    if (!companionData?.id || !auth) return;
    setCompanionPublishing(true);
    try {
      await unpublishSermonCompanion(companionData.id, auth);
      setCompanionStatusLocal('Draft');
    } finally {
      setCompanionPublishing(false);
    }
  }, [companionData?.id, auth]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSetCurrentWeek = useCallback(async () => {
    if (!companionData?.id || !auth) return;
    try {
      await setCurrentWeekCompanion(companionData.id, auth);
      setCompanionData(prev => prev ? { ...prev, isCurrentWeek: true } : null);
    } catch (err) {
      console.error('Failed to set current week companion', err);
    }
  }, [companionData?.id, auth]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setPublishSuccess('');
    setPublishError('');
    const id = sermonId_ ?? `sermon-${Date.now()}`;
    const sermon: Sermon = { ...form, id, updatedAt: new Date().toISOString() } as Sermon;
    if (!sermonId_) { addSermon(sermon); setSermonId_(id); }
    else updateSermon(sermon);
    setIsDirty(false);
    setSaveState('saved');
    setPublishSuccess('Draft saved successfully.');
    setTimeout(() => { setSaveState('idle'); setPublishSuccess(''); }, 3000);
  }, [form, sermonId_]);

  const handlePublish = useCallback(async () => {
    if (!validate()) return;
    if (!auth) return;
    setPublishing(true);
    setPublishError('');
    setPublishSuccess('');
    try {
      const id = sermonId_ ?? `sermon-${Date.now()}`;
      const now = new Date().toISOString();
      const updated: Sermon = { ...form as Sermon, id, status: 'published', updatedAt: now };
      if (!sermonId_) {
        // New sermon — create it first (no transcript yet, so payload is small)
        addSermon(updated);
        setSermonId_(id);
      } else {
        // Use minimal status-only payload to avoid 413 from large transcripts
        await patchServerSermon(id, { status: 'published', updatedAt: now }, auth);
        updateSermon(updated);
      }
      setForm(f => ({ ...f, status: 'published' }));
      setIsDirty(false);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2500);
      setPublishSuccess('Published successfully.');
      setTimeout(() => setPublishSuccess(''), 4000);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Failed to publish. Please try again.');
    } finally {
      setPublishing(false);
    }
  }, [form, sermonId_, auth, validate, addSermon, updateSermon]);

  const handleUnpublishConfirm = useCallback(async () => {
    if (!auth || !sermonId_) return;
    setPublishing(true);
    setPublishError('');
    try {
      const now = new Date().toISOString();
      // Minimal payload — status change only
      await patchServerSermon(sermonId_, { status: 'draft', updatedAt: now }, auth);
      const updated: Sermon = { ...form as Sermon, id: sermonId_, status: 'draft', updatedAt: now };
      updateSermon(updated);
      setForm(f => ({ ...f, status: 'draft' }));
      setPublishSuccess('Unpublished successfully.');
      setTimeout(() => setPublishSuccess(''), 3000);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Failed to unpublish. Please try again.');
    } finally {
      setPublishing(false);
    }
  }, [form, sermonId_, auth, updateSermon]);

  // ── Generation flow ──────────────────────────────────────────────────────────

  /** Maps server error codes to user-friendly messages (per spec Task 12) */
  function errorMessage(err: unknown): string {
    if (err instanceof ApiError) {
      switch (err.code) {
        case 'INVALID_YOUTUBE_URL':   return 'Please enter a valid YouTube video link.';
        case 'UNAUTHENTICATED':        return 'Your session has expired. Please sign in again.';
        case 'FORBIDDEN':              return "You don't have permission to generate sermon drafts.";
        case 'VIDEO_UNAVAILABLE':      return "We couldn't access this YouTube video. Check that it is public and try again.";
        case 'AI_NOT_CONFIGURED':      return 'Sermon generation is not configured yet.';
        case 'GENERATION_TIMEOUT':     return 'Emmaus took too long to prepare this draft. Please try again.';
        case 'GENERATION_FAILED':      return "We couldn't prepare the sermon draft. Your sermon has not been saved.";
        default:                       return err.message || 'Generation failed. Please try again.';
      }
    }
    return err instanceof Error ? err.message : 'Generation failed. Please try again.';
  }

  const applyGenerationResult = useCallback((result: SermonDraftResult) => {
    setForm({
      title: result.sermon.title,
      speaker: result.sermon.speaker,
      sermonDate: result.sermon.sermonDate,
      series: result.sermon.series,
      scriptureReference: result.sermon.scriptureReference,
      youtubeUrl: result.sermon.youtubeUrl,
      summary: result.sermon.summary,
      topics: result.sermon.topics,
      keywords: result.sermon.keywords,
      transcript: result.sermon.transcript,
      sermonTranscript: result.sermon.sermonTranscript,
      sermonStartTime: result.sermon.sermonStartTime,
      sermonEndTime: result.sermon.sermonEndTime,
      detectionConfidence: result.sermon.detectionConfidence,
      detectionMethod: result.sermon.detectionMethod,
      transcriptStatus: result.sermon.transcriptStatus,
      aiIndexStatus: result.sermon.aiIndexStatus,
      companionJourneyId: result.companion.id,
      mainTheme: result.sermon.mainTheme ?? '',
      status: 'draft',
      pastorEdited: false,
      updatedAt: new Date().toISOString(),
    });
    const sermonRecord: Sermon = {
      ...result.sermon,
      companionJourneyId: result.companion.id,
      status: 'draft',
    };
    addSermon(sermonRecord);
    setSermonId_(result.sermon.id);
    setCompanionData(result.companion);
    setIsDirty(false);
    setPhase('review');
  }, [addSermon]);

  const handleGenerate = useCallback(async (
    url: string,
    opts?: {
      transcript?: string;
      sermonStartSec?: number;
      sermonEndSec?: number;
      sermonStartWord?: number;
      sermonEndWord?: number;
      confirmedTheme?: string;
    }
  ) => {
    if (!auth) return;
    setGeneratingUrl(url);
    setGenerationError('');
    setPhase('generating');

    try {
      const result = await generateSermonDraft(url, auth, opts);
      applyGenerationResult(result);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TRANSCRIPT_REQUIRED') {
        const src = err.source as TranscriptSource | null;
        setTranscriptSource({
          youtubeUrl: url,
          videoId: (src?.videoId as string) ?? '',
          title: src?.title as string | undefined,
          thumbnailUrl: src?.thumbnailUrl as string | undefined,
        });
        setPhase('transcript-required');
        return;
      }
      if (err instanceof ApiError && err.code === 'SERMON_CONFIRMATION_REQUIRED') {
        setDetectionSource(err.source as unknown as SermonDetectionSource);
        setGeneratingUrl(url);
        setPhase('confirm-sermon');
        return;
      }
      if (err instanceof ApiError && err.code === 'THEME_CONFIRMATION_REQUIRED') {
        setThemeSource(err.source as unknown as ThemeConfirmationSource);
        setGeneratingUrl(url);
        setPhase('confirm-theme');
        return;
      }
      setGenerationError(errorMessage(err));
      setPhase('url-input');
    }
  }, [auth, applyGenerationResult]);

  const handleTranscriptContinue = useCallback(async (transcript: string) => {
    if (!auth || !transcriptSource) return;
    setGenerationError('');
    setPhase('generating');
    try {
      const result = await generateSermonDraft(transcriptSource.youtubeUrl, auth, {
        transcript,
        videoId: transcriptSource.videoId,
      });
      applyGenerationResult(result);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SERMON_CONFIRMATION_REQUIRED') {
        setDetectionSource(err.source as unknown as SermonDetectionSource);
        setPhase('confirm-sermon');
        return;
      }
      if (err instanceof ApiError && err.code === 'THEME_CONFIRMATION_REQUIRED') {
        setThemeSource(err.source as unknown as ThemeConfirmationSource);
        setPhase('confirm-theme');
        return;
      }
      setGenerationError(errorMessage(err));
      setPhase('transcript-required');
    }
  }, [auth, transcriptSource, applyGenerationResult]);

  const handleThemeConfirm = useCallback((confirmedTheme: string) => {
    if (!themeSource) {
      // Defensive: themeSource should always be set when ConfirmThemePhase is shown.
      // If boundaries were lost (e.g. source was null due to a prior HTTP status mismatch),
      // retry with just the confirmed theme — the server will re-detect boundaries.
      handleGenerate(generatingUrl, { confirmedTheme });
      return;
    }
    handleGenerate(generatingUrl, {
      sermonStartWord: themeSource.startWord,
      sermonEndWord:   themeSource.endWord,
      sermonStartSec:  themeSource.startSecs  ?? undefined,
      sermonEndSec:    themeSource.endSecs    ?? undefined,
      confirmedTheme,
    });
  }, [themeSource, generatingUrl, handleGenerate]);

  const handleSermonConfirm = useCallback((src: SermonDetectionSource) => {
    handleGenerate(generatingUrl, {
      sermonStartSec:  src.startSecs  ?? undefined,
      sermonEndSec:    src.endSecs    ?? undefined,
      sermonStartWord: src.startWord,
      sermonEndWord:   src.endWord,
    });
  }, [generatingUrl, handleGenerate]);

  const handleSermonAdjust = useCallback((adjusted: { startSecs: number; endSecs: number }) => {
    // Pass only seconds — the server maps them to word offsets via the timed VTT cue index
    handleGenerate(generatingUrl, {
      sermonStartSec: adjusted.startSecs,
      sermonEndSec:   adjusted.endSecs,
    });
  }, [generatingUrl, handleGenerate]);

  const handleDelete = useCallback(async () => {
    if (!auth || !sermonId_) return;
    setDeleting(true);
    setDeleteError('');
    try {
      // Pass companionJourneyId so the server handles legacy companions
      // that have no admin-sermon JSON record (slug-based journeys entries).
      await deleteServerSermon(sermonId_, auth, {
        companionJourneyId: form.companionJourneyId,
      });
      // Clear the "This Week's Sermon" assignment if it pointed here
      if (
        form.companionJourneyId &&
        settings.currentWeeklySermonCompanionId === form.companionJourneyId
      ) {
        updateSettings({ ...settings, currentWeeklySermonCompanionId: undefined });
      }
      removeSermon(sermonId_);
      onBack();
    } catch {
      setDeleteError("We couldn't delete this Sermon Companion. Nothing was removed. Please try again.");
      setDeleting(false);
    }
  }, [auth, sermonId_, form.companionJourneyId, settings, updateSettings, removeSermon, onBack]);

  const handleRedetect = useCallback(async () => {
    if (!auth || !sermonId_) return;
    setRedetecting(true);
    try {
      const detection = await redetectSermon(sermonId_, auth);
      setForm(f => ({
        ...f,
        sermonTranscript: detection.sermonTranscript,
        sermonStartTime: detection.sermonStartTime,
        sermonEndTime: detection.sermonEndTime,
        detectionConfidence: detection.detectionConfidence,
        detectionMethod: detection.detectionMethod,
      }));
      setIsDirty(true);
    } catch {
      // non-fatal — user can retry
    } finally {
      setRedetecting(false);
    }
  }, [auth, sermonId_]);

  // ── Field-level regeneration ─────────────────────────────────────────────────

  const handleRegen = useCallback(async (field: RegenField) => {
    if (!auth || !sermonId_) return;
    setRegenLoading(prev => ({ ...prev, [field]: true }));
    try {
      const result = await regenerateField(sermonId_, field, {
        currentTitle: form.title,
        currentSummary: form.summary ?? '',
        scriptureReference: form.scriptureReference,
        transcript: form.sermonTranscript ?? form.transcript ?? '',
        description: form.summary ?? '',
      }, auth);
      setProposed(prev => ({ ...prev, [field]: result.value }));
    } catch {
      // silently ignore — user can retry
    } finally {
      setRegenLoading(prev => ({ ...prev, [field]: false }));
    }
  }, [auth, sermonId_, form]);

  const applyProposed = (field: RegenField) => {
    const val = proposed[field];
    if (val === undefined) return;
    if (field === 'topics' || field === 'keywords') {
      patch(field, Array.isArray(val) ? val : []);
    } else {
      patch(field as keyof typeof form, String(val));
    }
    setProposed(prev => { const n = { ...prev }; delete n[field]; return n; });
  };

  const dismissProposed = (field: RegenField) => {
    setProposed(prev => { const n = { ...prev }; delete n[field]; return n; });
  };

  // ── Render phases ────────────────────────────────────────────────────────────

  if (phase === 'url-input') {
    return (
      <div className="h-full overflow-y-auto">
        {generationError && (
          <div className="max-w-xl mx-auto px-6 pt-6">
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{generationError}</span>
            </div>
          </div>
        )}
        <UrlInputPhase onGenerate={handleGenerate} onBack={onBack} />
      </div>
    );
  }

  if (phase === 'generating') {
    return <GeneratingPhase url={generatingUrl} />;
  }

  if (phase === 'transcript-required' && transcriptSource) {
    return (
      <div className="h-full overflow-y-auto">
        {generationError && (
          <div className="max-w-xl mx-auto px-6 pt-6">
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{generationError}</span>
            </div>
          </div>
        )}
        <TranscriptFallbackPhase
          source={transcriptSource}
          onContinue={handleTranscriptContinue}
          onBack={() => { setPhase('url-input'); setGenerationError(''); }}
        />
      </div>
    );
  }

  if (phase === 'confirm-sermon' && detectionSource) {
    return (
      <div className="h-full overflow-y-auto">
        <ConfirmSermonPhase
          detection={detectionSource}
          youtubeUrl={generatingUrl}
          onConfirm={handleSermonConfirm}
          onAdjust={(src) => { setDetectionSource(src); setPhase('adjust-sermon'); }}
          onBack={() => setPhase('url-input')}
        />
      </div>
    );
  }

  if (phase === 'confirm-theme' && themeSource) {
    return (
      <div className="h-full overflow-y-auto">
        <ConfirmThemePhase
          theme={themeSource.theme}
          sermonSnippet={themeSource.sermonSnippet}
          onConfirm={handleThemeConfirm}
          onBack={() => {
            // Go back to boundary confirmation if we came from there, else url-input
            if (detectionSource) setPhase('confirm-sermon');
            else setPhase('url-input');
          }}
          onSuggest={async (prev) => {
            if (!auth) return prev;
            return suggestAlternativeTheme(themeSource.sermonSnippet, prev, auth);
          }}
        />
      </div>
    );
  }

  if (phase === 'adjust-sermon' && detectionSource) {
    return (
      <div className="h-full overflow-y-auto">
        <AdjustSermonPhase
          detection={detectionSource}
          youtubeUrl={generatingUrl}
          onApply={handleSermonAdjust}
          onBack={() => setPhase('confirm-sermon')}
        />
      </div>
    );
  }

  // ── Review / edit phase ──────────────────────────────────────────────────────

  const showCompanionTab = !!companionData || !!form.companionJourneyId;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Shared toolbar */}
      <ContentStudioToolbar
        onBack={() => { if (isDirty) { setConfirmBack(true); return; } onBack(); }}
        title={isNew ? (form.title || 'New Sermon') : (form.title || 'Edit Sermon')}
        status={form.status}
        isSaving={saveState === 'saving'}
        isPublishing={publishing}
        successMessage={publishSuccess}
        errorMessage={publishError}
        onSaveDraft={handleSave}
        onPublish={handlePublish}
        onUnpublish={handleUnpublishConfirm}
        onDelete={sermonId_ ? () => { setConfirmDelete(true); setDeleteError(''); } : undefined}
      />

      {/* Tabs */}
      <div className="flex-shrink-0 px-6 lg:px-8 border-b border-gray-200">
        <div className="flex gap-0">
          {(['sermon', 'companion'] as const).filter(t => t === 'sermon' || showCompanionTab).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors capitalize ${
                activeTab === tab
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {tab === 'companion' ? 'Companion' : 'Sermon'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'sermon' && (
          <div className="h-full overflow-y-auto px-6 lg:px-8 py-6 max-w-3xl space-y-6">
            {/* AI draft banner — only when generation produced real content.
                isNew = was created in this session (sermonId prop was null at mount).
                We also check summary and companion to guard against false-success:
                a blank record must never show this banner. */}
            {isNew && !!form.summary && (companionData?.entries?.length ?? 0) >= 5 && (
              <div className="flex items-start gap-2 p-3 bg-teal-50 border border-teal-200 rounded-xl text-sm text-teal-700">
                <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                <span>AI draft generated. Review all fields carefully — use Regenerate to get a new suggestion for any field.</span>
              </div>
            )}

            {/* Main Theme card — visible after generation */}
            {(form.mainTheme || sermonId_) && (
              <MainThemeCard
                theme={form.mainTheme ?? ''}
                sermonId={sermonId_}
                auth={auth}
                onChange={v => patch('mainTheme', v)}
              />
            )}

            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
              <h2 className="text-sm font-semibold text-gray-700">Sermon Details</h2>

              {/* Title */}
              <Field label="Title" required error={errors.title}>
                <div className="flex items-center justify-between mb-1">
                  <span />
                  <RegenButton onRegen={() => handleRegen('title')} loading={!!regenLoading.title} />
                </div>
                <TextInput value={form.title} onChange={e => patch('title', e.target.value)} placeholder="Sermon title" error={!!errors.title} />
                {proposed.title && (
                  <ProposedValue value={proposed.title} onApply={() => applyProposed('title')} onDismiss={() => dismissProposed('title')} />
                )}
              </Field>

              <div className="grid grid-cols-2 gap-4">
                {/* Speaker */}
                <Field label="Speaker" required error={errors.speaker}>
                  <div className="flex items-center justify-between mb-1">
                    <span />
                    <RegenButton onRegen={() => handleRegen('speaker')} loading={!!regenLoading.speaker} />
                  </div>
                  <TextInput value={form.speaker} onChange={e => patch('speaker', e.target.value)} placeholder="Pastor name" error={!!errors.speaker} />
                  {proposed.speaker && (
                    <ProposedValue value={proposed.speaker} onApply={() => applyProposed('speaker')} onDismiss={() => dismissProposed('speaker')} />
                  )}
                </Field>
                <Field label="Date">
                  <TextInput type="date" value={form.sermonDate} onChange={e => patch('sermonDate', e.target.value)} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Series">
                  <TextInput value={form.series ?? ''} onChange={e => patch('series', e.target.value)} placeholder="Series name" />
                </Field>
                {/* Scripture */}
                <Field label="Scripture reference" required error={errors.scriptureReference}>
                  <div className="flex items-center justify-between mb-1">
                    <span />
                    <RegenButton onRegen={() => handleRegen('scriptureReference')} loading={!!regenLoading.scriptureReference} />
                  </div>
                  <TextInput value={form.scriptureReference} onChange={e => patch('scriptureReference', e.target.value)} placeholder="e.g. John 3:1-21" error={!!errors.scriptureReference} />
                  {proposed.scriptureReference && (
                    <ProposedValue value={proposed.scriptureReference} onApply={() => applyProposed('scriptureReference')} onDismiss={() => dismissProposed('scriptureReference')} />
                  )}
                </Field>
              </div>

              <Field label="YouTube URL">
                <TextInput value={form.youtubeUrl} onChange={e => patch('youtubeUrl', e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
              </Field>

              {/* Summary */}
              <Field label="Summary">
                <div className="flex items-center justify-between mb-1">
                  <span />
                  <RegenButton onRegen={() => handleRegen('summary')} loading={!!regenLoading.summary} />
                </div>
                <TextArea rows={3} value={form.summary ?? ''} onChange={e => patch('summary', e.target.value)} placeholder="Brief summary of the sermon." />
                {proposed.summary && (
                  <ProposedValue value={proposed.summary} onApply={() => applyProposed('summary')} onDismiss={() => dismissProposed('summary')} />
                )}
              </Field>

              {/* Topics */}
              <Field label="Topics (comma-separated)">
                <div className="flex items-center justify-between mb-1">
                  <span />
                  <RegenButton onRegen={() => handleRegen('topics')} loading={!!regenLoading.topics} />
                </div>
                <TextInput
                  value={(form.topics ?? []).join(', ')}
                  onChange={e => patch('topics', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                  placeholder="grace, restoration, identity"
                />
                {proposed.topics && (
                  <ProposedValue value={proposed.topics} onApply={() => applyProposed('topics')} onDismiss={() => dismissProposed('topics')} />
                )}
              </Field>

              {/* Keywords */}
              <Field label="Keywords (comma-separated)">
                <div className="flex items-center justify-between mb-1">
                  <span />
                  <RegenButton onRegen={() => handleRegen('keywords')} loading={!!regenLoading.keywords} />
                </div>
                <TextInput
                  value={(form.keywords ?? []).join(', ')}
                  onChange={e => patch('keywords', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                  placeholder="Mephibosheth, covenant, kindness"
                />
                {proposed.keywords && (
                  <ProposedValue value={proposed.keywords} onApply={() => applyProposed('keywords')} onDismiss={() => dismissProposed('keywords')} />
                )}
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Status">
                  <div className="flex items-center gap-2 h-[38px] px-1">
                    <StatusBadge status={form.status} />
                    <span className="text-xs text-gray-400">
                      {form.status === 'published'
                        ? 'Use Unpublish in the toolbar to change.'
                        : 'Use Publish in the toolbar to publish.'}
                    </span>
                  </div>
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

          </div>
        )}

        {/* Sermon transcript section (collapsible) */}
        {activeTab === 'sermon' && (() => {
          const st = form.sermonTranscript;
          const conf = form.detectionConfidence;
          const startT = form.sermonStartTime;
          const endT = form.sermonEndTime;
          if (!st) return null;
          return (
            <div className="px-6 lg:px-8 pb-2 max-w-3xl">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  onClick={() => setSermonTranscriptOpen(o => !o)}
                >
                  <span className="flex items-center gap-2">
                    Sermon Transcript
                    {conf != null && (
                      <span className="text-xs text-gray-400 font-normal">
                        · {Math.round(conf * 100)}% confidence
                        {startT ? ` · ${startT} → ${endT}` : ''}
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-3">
                    {sermonId_ && (
                      <button
                        className="text-xs text-teal-700 hover:text-teal-900 flex items-center gap-1 px-2 py-1 bg-teal-50 rounded-md"
                        onClick={e => { e.stopPropagation(); handleRedetect(); }}
                        disabled={redetecting}
                      >
                        {redetecting ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                        Re-detect Sermon
                      </button>
                    )}
                    <ChevronRight size={14} className={`text-gray-400 transition-transform ${sermonTranscriptOpen ? 'rotate-90' : ''}`} />
                  </div>
                </button>
                {sermonTranscriptOpen && (
                  <div className="border-t border-gray-100 px-5 py-4">
                    <p className="text-xs text-gray-500 mb-3">
                      This is the portion Emmaus identified as the sermon. All AI generation (topics, summary, companion) is based on this text only — not the full service recording.
                    </p>
                    <pre className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-lg p-4 max-h-72 overflow-y-auto font-sans">
                      {st}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {activeTab === 'companion' && companionData && (
          <>
            {/* "This Week's Sermon" admin control */}
            <div className="flex items-center justify-between gap-3 px-6 lg:px-8 py-3 bg-gray-50 border-b border-gray-200">
              {companionData.isCurrentWeek ? (
                <span className="text-sm text-teal-700 font-medium flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-teal-500" />
                  Currently set as This Week's Sermon
                </span>
              ) : (
                <span className="text-sm text-gray-500">Not set as This Week's Sermon</span>
              )}
              {!companionData.isCurrentWeek && (
                <button
                  onClick={handleSetCurrentWeek}
                  className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 transition-colors shrink-0"
                >
                  Set as This Week's Sermon
                </button>
              )}
            </div>
            <CompanionDayEditor
              companionId={companionData.id}
              companionTitle={companionData.title}
              entries={companionData.entries}
              auth={auth!}
              companionStatus={companionStatusLocal}
              notifyMembers={companionNotifyMembers}
              onNotifyMembersChange={setCompanionNotifyMembers}
              onCompanionPublish={handleCompanionPublish}
              onCompanionUnpublish={handleCompanionUnpublish}
              onBack={() => setActiveTab('sermon')}
            />
          </>
        )}

        {activeTab === 'companion' && !companionData && (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            No companion found for this sermon.
          </div>
        )}
      </div>

      {confirmBack && (
        <ConfirmDialog
          title="Discard your unsaved changes?"
          message="Your changes will be lost."
          confirmLabel="Discard Changes"
          danger
          onConfirm={() => { setConfirmBack(false); onBack(); }}
          onCancel={() => setConfirmBack(false)}
        />
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete Sermon?</h3>
            <p className="text-sm text-gray-500 mb-3">
              You are about to permanently delete this sermon.
              {form.companionJourneyId && (
                <> The linked sermon companion draft will also be deleted.</>
              )}
              {' '}This action cannot be undone.
            </p>
            {form.status === 'published' && (
              <div className="mb-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                This sermon is currently visible to members. Deleting it will immediately remove it from Emmaus.
              </div>
            )}
            {deleteError && (
              <p className="text-sm text-red-600 mb-3">{deleteError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setConfirmDelete(false); setDeleteError(''); }}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {deleting
                  ? <><Loader2 size={13} className="animate-spin" /> Deleting…</>
                  : 'Delete Permanently'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
