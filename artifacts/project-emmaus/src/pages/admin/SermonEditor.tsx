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
  ApiError,
  type SermonDraftResult,
  type SermonDetectionSource,
  type CompanionEntry,
} from '@/lib/sermon-generator-api';
import {
  UnsavedBanner, SaveMessage, ConfirmDialog, PageHeader,
  Field, TextInput, TextArea, Select, AdminBtn, StatusBadge,
} from './shared';
import {
  Loader2, RefreshCw, Check, X, ChevronRight,
  PanelRightClose, PanelRightOpen, Clock, AlertCircle, CheckCircle2,
} from 'lucide-react';

type Props = {
  sermonId: string | null;
  onBack: () => void;
  onOpenCompanion: (journeyId: string, fresh?: boolean) => void;
};

type Phase = 'url-input' | 'generating' | 'transcript-required' | 'confirm-sermon' | 'adjust-sermon' | 'review';

/** Video metadata returned when transcript is unavailable */
interface TranscriptSource {
  youtubeUrl: string;
  videoId: string;
  title?: string;
  thumbnailUrl?: string;
}

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

// ─── Companion Day Editor ─────────────────────────────────────────────────────

function CompanionDayEditor({
  companionId,
  companionTitle,
  entries,
  auth,
}: {
  companionId: string;
  companionTitle: string;
  entries: CompanionEntry[];
  auth: { userId: string; userRole: string };
}) {
  const [selectedDay, setSelectedDay] = useState(1);
  const [localEntries, setLocalEntries] = useState<CompanionEntry[]>(entries);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [rightOpen, setRightOpen] = useState(true);
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Holds the complete entry snapshot to save — captures all field changes
  // within a debounce window so rapid edits never drop earlier changes.
  const pendingSaveRef = useRef<Partial<CompanionEntry> | null>(null);

  const current = localEntries.find(e => e.dayNumber === selectedDay);

  const patchEntry = useCallback((field: keyof CompanionEntry, value: string) => {
    setLocalEntries(prev => {
      const updated = prev.map(e =>
        e.dayNumber === selectedDay ? { ...e, [field]: value } : e
      );
      // Capture the complete current entry so we always save all fields
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
        };
      }
      return updated;
    });

    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(async () => {
      const toSave = pendingSaveRef.current;
      if (!toSave) return;
      pendingSaveRef.current = null;
      setSaveStatus('saving');
      try {
        await saveCompanionEntry(companionId, selectedDay, toSave, auth);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('error');
      }
    }, 1200);
  }, [companionId, selectedDay, auth]);

  if (!current) return (
    <div className="flex items-center justify-center h-48 text-gray-400">
      No entries found.
    </div>
  );

  const InputCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300";
  const TextareaCls = `${InputCls} resize-none`;

  return (
    <div className="flex h-full min-h-0 bg-gray-50">
      {/* Editor panel */}
      <div className="flex flex-col flex-1 min-w-0 bg-white border-r border-gray-200 overflow-y-auto">
        {/* Header with day selector */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-100 gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {localEntries.map(e => (
              <button
                key={e.dayNumber}
                onClick={() => setSelectedDay(e.dayNumber)}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                  selectedDay === e.dayNumber
                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                Day {e.dayNumber}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-xs transition-all ${
              saveStatus === 'saving' ? 'text-gray-400' :
              saveStatus === 'saved'  ? 'text-emerald-600' :
              saveStatus === 'error'  ? 'text-red-500' : 'invisible'
            }`}>
              {saveStatus === 'saving' && <><Clock size={11} className="inline animate-spin mr-1" />Saving…</>}
              {saveStatus === 'saved'  && <><Check size={11} className="inline mr-1" />Saved</>}
              {saveStatus === 'error'  && <><AlertCircle size={11} className="inline mr-1" />Error</>}
            </span>
            <button
              onClick={() => setRightOpen(r => !r)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
            >
              {rightOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
            </button>
          </div>
        </div>

        {/* Fields */}
        <div className="flex-1 p-6 space-y-5 max-w-2xl">
          <div className="flex items-center gap-2 text-xs text-gray-400 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <AlertCircle size={12} className="text-amber-500 flex-shrink-0" />
            All companion days are saved as Draft. Pastoral review required before publishing.
          </div>

          <Field label="Title">
            <input
              value={current.title}
              onChange={e => patchEntry('title', e.target.value)}
              placeholder="e.g. When Grace Finds You"
              className={InputCls}
            />
          </Field>

          <Field label="Scripture Reference">
            <input
              value={current.scriptureReference}
              onChange={e => patchEntry('scriptureReference', e.target.value)}
              placeholder="e.g. Psalm 23:1-6"
              className={InputCls}
            />
          </Field>

          <Field label="Greeting">
            <textarea
              value={current.greeting}
              onChange={e => patchEntry('greeting', e.target.value)}
              rows={3}
              placeholder="Good morning, [name]. Today we begin…"
              className={TextareaCls}
            />
            <p className="mt-1 text-[11px] text-gray-400">Use [name] — replaced with the member's first name.</p>
          </Field>

          <Field label="Reflection">
            <textarea
              value={current.reflection}
              onChange={e => patchEntry('reflection', e.target.value)}
              rows={7}
              placeholder="The devotional reflection…"
              className={`${InputCls} resize-y`}
            />
            <p className="mt-1 text-[11px] text-gray-400">2–4 paragraphs grounded in the day's scripture.</p>
          </Field>

          <Field label="Prayer">
            <textarea
              value={current.prayer}
              onChange={e => patchEntry('prayer', e.target.value)}
              rows={4}
              placeholder="Lord, today I come to you with…"
              className={TextareaCls}
            />
            <p className="mt-1 text-[11px] text-gray-400">Written in first person for the member to pray aloud.</p>
          </Field>

          <Field label="Next Step">
            <textarea
              value={current.nextStep}
              onChange={e => patchEntry('nextStep', e.target.value)}
              rows={2}
              placeholder="Take five minutes today to…"
              className={TextareaCls}
            />
          </Field>

          <Field label="Closing">
            <textarea
              value={current.closing}
              onChange={e => patchEntry('closing', e.target.value)}
              rows={2}
              placeholder="Walk with grace today."
              className={TextareaCls}
            />
          </Field>
        </div>
      </div>

      {/* Preview panel */}
      {rightOpen && (
        <div className="w-[360px] flex-shrink-0 bg-background border-l border-gray-200 overflow-y-auto">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide text-center">Preview</p>
          </div>
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
            memberName="Friend"
            previewMode
            actionButton={<PreviewDevotionalContinueButton />}
          />
        </div>
      )}
    </div>
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
        <AdminBtn variant="secondary" onClick={() => onAdjust(detection)}>
          Adjust Boundaries
        </AdminBtn>
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

function AdjustSermonPhase({
  detection,
  youtubeUrl,
  onApply,
  onBack,
}: {
  detection: SermonDetectionSource;
  youtubeUrl: string;
  onApply: (updated: SermonDetectionSource) => void;
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
    // Compute approximate word boundaries proportional to time
    const totalWords = detection.endWord + detection.startWord; // rough proxy
    const videoDuration = (detection.endSecs ?? 0) + (detection.startSecs ?? 0);
    const totalWords2 = detection.segmentCount > 0
      ? detection.segmentCount * 200 : totalWords || 10000;
    const estimatedDuration = videoDuration > 0 ? videoDuration : totalWords2 / 2.5;
    const startWord = Math.round((startSecs / estimatedDuration) * totalWords2);
    const endWord   = Math.round((endSecs   / estimatedDuration) * totalWords2);

    onApply({
      ...detection,
      startSecs,
      endSecs,
      durationSecs: endSecs - startSecs,
      startWord,
      endWord,
    });
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SermonEditor({ sermonId, onBack, onOpenCompanion }: Props) {
  const { sermons, addSermon, updateSermon } = useAdmin();
  const { user } = useAuth();

  const isNew = !sermonId;
  const existing = sermonId ? sermons.find(s => s.id === sermonId) : undefined;

  const [phase, setPhase] = useState<Phase>(isNew ? 'url-input' : 'review');
  const [generatingUrl, setGeneratingUrl] = useState('');
  const [generationError, setGenerationError] = useState('');
  const [transcriptSource, setTranscriptSource] = useState<TranscriptSource | null>(null);
  const [detectionSource, setDetectionSource] = useState<SermonDetectionSource | null>(null);
  const [activeTab, setActiveTab] = useState<'sermon' | 'companion'>('sermon');
  const [sermonTranscriptOpen, setSermonTranscriptOpen] = useState(false);
  const [redetecting, setRedetecting] = useState(false);

  // Companion state (from generation result or loaded for existing)
  const [companionData, setCompanionData] = useState<SermonDraftResult['companion'] | null>(null);

  // Sermon form state
  const [form, setForm] = useState<Omit<Sermon, 'id'>>(() =>
    existing ? { ...existing } : { ...EMPTY_SERMON }
  );
  const [sermonId_, setSermonId_] = useState<string | null>(sermonId);
  const [isDirty, setIsDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmBack, setConfirmBack] = useState(false);

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
        entries: c.entries ?? [],
      });
    }).catch(() => {
      // Non-fatal: companion tab shows "No companion found" as an indicator
      // without breaking the sermon editing flow.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sermonId, user?.id]);  // re-runs when auth hydrates (null → userId) after mount

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
    const id = sermonId_ ?? `sermon-${Date.now()}`;
    const sermon: Sermon = { ...form, id, updatedAt: new Date().toISOString() } as Sermon;
    if (!sermonId_) { addSermon(sermon); setSermonId_(id); }
    else updateSermon(sermon);
    setIsDirty(false);
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 2500);
  }, [form, sermonId_]);

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
      transcriptStatus: result.sermon.transcriptStatus,
      aiIndexStatus: result.sermon.aiIndexStatus,
      companionJourneyId: result.companion.id,
      status: 'draft',
      pastorEdited: false,
      updatedAt: new Date().toISOString(),
    });
    const sermonRecord: Sermon = {
      ...result.sermon,
      companionJourneyId: result.companion.id,
      status: 'draft',
    } as Sermon;
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
      setGenerationError(errorMessage(err));
      setPhase('transcript-required');
    }
  }, [auth, transcriptSource, applyGenerationResult]);

  const handleSermonConfirm = useCallback((src: SermonDetectionSource) => {
    handleGenerate(generatingUrl, {
      sermonStartSec:  src.startSecs  ?? undefined,
      sermonEndSec:    src.endSecs    ?? undefined,
      sermonStartWord: src.startWord,
      sermonEndWord:   src.endWord,
    });
  }, [generatingUrl, handleGenerate]);

  const handleSermonAdjust = useCallback((updated: SermonDetectionSource) => {
    handleGenerate(generatingUrl, {
      sermonStartSec:  updated.startSecs  ?? undefined,
      sermonEndSec:    updated.endSecs    ?? undefined,
      sermonStartWord: updated.startWord,
      sermonEndWord:   updated.endWord,
    });
  }, [generatingUrl, handleGenerate]);

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
      } as typeof f));
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
        transcript: form.transcript ?? '',
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
      {isDirty && (
        <UnsavedBanner
          onDiscard={() => {
            setIsDirty(false);
            setForm(existing ? { ...existing } : { ...EMPTY_SERMON });
          }}
        />
      )}

      {/* Header */}
      <div className="flex-shrink-0 px-6 lg:px-8 pt-6 pb-0">
        <PageHeader
          title={isNew ? (form.title || 'New Sermon') : (form.title || 'Edit Sermon')}
          onBack={() => { if (isDirty) { setConfirmBack(true); return; } onBack(); }}
          action={
            <div className="flex items-center gap-3 flex-wrap">
              <SaveMessage state={saveState} />
              <AdminBtn variant="secondary" onClick={handleSave}>Save</AdminBtn>
            </div>
          }
        />

        {/* Tabs */}
        <div className="flex gap-0 mt-4 border-b border-gray-200">
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
            {/* AI notice for new sermons */}
            {isNew && (
              <div className="flex items-start gap-2 p-3 bg-teal-50 border border-teal-200 rounded-xl text-sm text-teal-700">
                <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                <span>AI draft generated. Review all fields carefully — use Regenerate to get a new suggestion for any field.</span>
              </div>
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

            <div className="flex gap-3">
              <AdminBtn variant="secondary" onClick={() => { if (isDirty) { setConfirmBack(true); return; } onBack(); }}>Cancel</AdminBtn>
              <AdminBtn variant="primary" onClick={handleSave}>Save Sermon</AdminBtn>
            </div>
          </div>
        )}

        {/* Sermon transcript section (collapsible) */}
        {activeTab === 'sermon' && (() => {
          const f = form as Record<string, unknown>;
          const st = f.sermonTranscript as string | undefined;
          const conf = f.detectionConfidence as number | undefined;
          const startT = f.sermonStartTime as string | undefined;
          const endT = f.sermonEndTime as string | undefined;
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
          <CompanionDayEditor
            companionId={companionData.id}
            companionTitle={companionData.title}
            entries={companionData.entries}
            auth={auth!}
          />
        )}

        {activeTab === 'companion' && !companionData && (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            No companion found for this sermon.
          </div>
        )}
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
