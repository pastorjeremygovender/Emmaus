/**
 * WritingAssistantPanel — pastoral writing assistant for Daily Rhythm content.
 *
 * Authorised pastors and content editors only. Never shown to members.
 * All generated content remains Draft until the pastor publishes manually.
 *
 * Flow:  Inputs → Validate Scripture → Generate → Review (field-by-field) → Apply to Editor
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Wand2, X, CheckCircle2, RotateCcw, Edit3, BookOpen, Search, AlertTriangle, Loader2, ChevronDown, ChevronUp, FlaskConical } from 'lucide-react';
import {
  generateDraft,
  regenerateField as regenerateFieldApi,
  fetchPassageText,
  type WritingStyle,
  type DraftField,
  type DraftResult,
  type GenerationInputs,
  type PreviousDayContextInput,
} from '@/lib/writing-assistant-api';
import { validateScriptureRef, searchSermonsForBuilder, type SermonSearchHit } from '@/lib/journeys-api';
import { parseScriptureRef } from '@/lib/scripture-ref';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PreviousDayInfo {
  day: number;
  title: string;
  scripture: string;
  devotional: string;
  actionStep: string;
}

interface Props {
  journeyId: string;
  dayNumber: number;
  dayTitle: string;
  scriptureRef: string;
  existingContent: Record<DraftField, string>;
  previousDays: PreviousDayInfo[];
  user: { id: string; role: string };
  onApplyField: (field: DraftField, value: string, mode: 'replace' | 'append') => void;
  onClose: () => void;
}

type PanelStep = 'inputs' | 'generating' | 'review' | 'error';
type ScriptureStatus = 'idle' | 'validating' | 'valid' | 'invalid';
type FieldStatus = 'pending' | 'accepted' | 'editing' | 'kept' | 'regenerating';

interface FieldReviewState {
  status: FieldStatus;
  editedValue: string;
}

const DRAFT_FIELDS: DraftField[] = ['mentorIntro', 'devotional', 'prayerPrompt', 'actionStep', 'closingText'];

const FIELD_LABELS: Record<DraftField, string> = {
  mentorIntro: 'Greeting',
  devotional: 'Reflection',
  prayerPrompt: 'Prayer',
  actionStep: 'Your Next Step',
  closingText: 'Closing',
};

const STYLE_OPTIONS: { value: WritingStyle; label: string; desc: string }[] = [
  { value: 'pastor-jeremy',   label: 'Pastor Jeremy Style',  desc: 'Warm, direct and Christ-centred' },
  { value: 'emmaus-standard', label: 'Emmaus Standard',       desc: 'Clear, pastoral and accessible' },
  { value: 'new-believer',    label: 'New Believer',           desc: 'Gentle; assumes no church background' },
  { value: 'bible-study',     label: 'Bible Study',           desc: 'More textual depth, still pastoral' },
  { value: 'youth',           label: 'Youth',                  desc: 'For secondary school and young adults' },
];

function initFieldStates(draft: DraftResult | null): Record<DraftField, FieldReviewState> {
  const obj = {} as Record<DraftField, FieldReviewState>;
  DRAFT_FIELDS.forEach(f => {
    obj[f] = { status: 'pending', editedValue: draft?.[f] ?? '' };
  });
  return obj;
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function WritingAssistantPanel({
  dayNumber, dayTitle, scriptureRef: initialScriptureRef,
  existingContent, previousDays, user, onApplyField, onClose,
}: Props) {
  // ── Inputs state ───────────────────────────────────────────────────────────
  const [scripture, setScripture]               = useState(initialScriptureRef);
  const [centralTruth, setCentralTruth]         = useState('');
  const [connection, setConnection]             = useState('');
  const [nextStepHint, setNextStepHint]         = useState('');
  const [direction, setDirection]               = useState('');
  const [style, setStyle]                       = useState<WritingStyle>('pastor-jeremy');
  const [useSermon, setUseSermon]               = useState(false);
  const [sermonQuery, setSermonQuery]           = useState('');
  const [sermons, setSermons]                   = useState<SermonSearchHit[]>([]);
  const [searchingSermons, setSearchingSermons] = useState(false);
  const [selectedSermon, setSelectedSermon]     = useState<SermonSearchHit | null>(null);

  // ── Scripture validation ───────────────────────────────────────────────────
  const [scriptureStatus, setScriptureStatus]   = useState<ScriptureStatus>('idle');
  const [passageText, setPassageText]           = useState('');
  const [verseCount, setVerseCount]             = useState(0);

  // ── Panel flow ─────────────────────────────────────────────────────────────
  const [step, setStep]     = useState<PanelStep>('inputs');
  const [draft, setDraft]   = useState<DraftResult | null>(null);
  const [error, setError]   = useState('');
  const [generating, setGenerating] = useState(false);

  // ── Review state ───────────────────────────────────────────────────────────
  const [fieldStates, setFieldStates] = useState<Record<DraftField, FieldReviewState>>(
    initFieldStates(null)
  );
  const [conflictField, setConflictField] = useState<DraftField | null>(null);
  const [pendingApply, setPendingApply]   = useState<{ field: DraftField; value: string } | null>(null);

  // Auto-validate scripture on mount if pre-filled
  useEffect(() => {
    if (initialScriptureRef.trim()) handleValidateScripture(initialScriptureRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Scripture validation ───────────────────────────────────────────────────
  const handleValidateScripture = useCallback(async (ref: string) => {
    const trimmed = ref.trim();
    if (!trimmed) { setScriptureStatus('idle'); return; }
    setScriptureStatus('validating');
    try {
      const result = await validateScriptureRef(trimmed);
      if (result.valid) {
        setScriptureStatus('valid');
        setVerseCount(result.verseCount ?? 0);
        // Retrieve passage text for the prompt (not stored — used in generation only)
        const parsed = parseScriptureRef(trimmed);
        if (parsed) {
          const text = await fetchPassageText(
            parsed.bookId, parsed.chapter, parsed.startVerse, parsed.endVerse
          );
          setPassageText(text);
        }
      } else {
        setScriptureStatus('invalid');
        setPassageText('');
      }
    } catch {
      setScriptureStatus('invalid');
      setPassageText('');
    }
  }, []);

  // ── Sermon search ──────────────────────────────────────────────────────────
  const handleSermonSearch = async () => {
    if (!sermonQuery.trim()) return;
    setSearchingSermons(true);
    try {
      const results = await searchSermonsForBuilder(sermonQuery.trim(), user.id);
      setSermons(results);
    } catch {
      setSermons([]);
    } finally {
      setSearchingSermons(false);
    }
  };

  // ── Previous day context ───────────────────────────────────────────────────
  const prevDay = previousDays.find(d => d.day === dayNumber - 1) ?? previousDays.at(-1);
  const prevDayContext: PreviousDayContextInput | undefined = prevDay ? {
    day: prevDay.day,
    title: prevDay.title,
    scripture: prevDay.scripture,
    reflection: prevDay.devotional,
    nextStep: prevDay.actionStep,
  } : undefined;

  // ── Generate draft ─────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (scriptureStatus !== 'valid' || !centralTruth.trim() || generating) return;
    setGenerating(true);
    setStep('generating');
    setError('');
    try {
      const inputs: GenerationInputs = {
        dayNumber,
        title: dayTitle,
        scriptureRef: scripture.trim(),
        passageText,
        centralTruth: centralTruth.trim(),
        connectionToPrevious: connection.trim() || undefined,
        desiredNextStep: nextStepHint.trim() || undefined,
        additionalDirection: direction.trim() || undefined,
        writingStyle: style,
        previousDayContext: prevDayContext,
        sermonContext: selectedSermon ? {
          sermonId: selectedSermon.sermonId,
          sermonTitle: selectedSermon.title,
        } : undefined,
      };
      const result = await generateDraft(user.id, user.role, inputs);
      setDraft(result);
      setFieldStates(initFieldStates(result));
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We couldn\'t create this draft. Your current content has been preserved. Please try again.');
      setStep('error');
    } finally {
      setGenerating(false);
    }
  };

  // ── Regenerate single field ────────────────────────────────────────────────
  const handleRegenerateField = async (field: DraftField) => {
    if (!draft || scriptureStatus !== 'valid') return;
    setFieldStates(fs => ({ ...fs, [field]: { ...fs[field], status: 'regenerating' } }));
    try {
      const inputs: GenerationInputs = {
        dayNumber,
        title: dayTitle,
        scriptureRef: scripture.trim(),
        passageText,
        centralTruth: centralTruth.trim(),
        connectionToPrevious: connection.trim() || undefined,
        desiredNextStep: nextStepHint.trim() || undefined,
        additionalDirection: direction.trim() || undefined,
        writingStyle: style,
        previousDayContext: prevDayContext,
        targetField: field,
      };
      const result = await regenerateFieldApi(user.id, user.role, inputs);
      setDraft(d => d ? { ...d, [field]: result[field] } : d);
      setFieldStates(fs => ({
        ...fs,
        [field]: { status: 'pending', editedValue: result[field] },
      }));
    } catch {
      setFieldStates(fs => ({ ...fs, [field]: { ...fs[field], status: 'pending' } }));
    }
  };

  // ── Field actions ──────────────────────────────────────────────────────────
  const acceptField = (field: DraftField) => {
    setFieldStates(fs => ({
      ...fs,
      [field]: { ...fs[field], status: 'accepted', editedValue: draft?.[field] ?? fs[field].editedValue },
    }));
  };

  const keepField = (field: DraftField) => {
    setFieldStates(fs => ({ ...fs, [field]: { ...fs[field], status: 'kept' } }));
  };

  const startEditing = (field: DraftField) => {
    setFieldStates(fs => ({
      ...fs,
      [field]: { status: 'editing', editedValue: draft?.[field] ?? fs[field].editedValue },
    }));
  };

  const saveEdit = (field: DraftField) => {
    setFieldStates(fs => ({
      ...fs,
      [field]: { ...fs[field], status: 'accepted' },
    }));
  };

  const cancelEdit = (field: DraftField) => {
    setFieldStates(fs => ({
      ...fs,
      [field]: { ...fs[field], status: 'pending' },
    }));
  };

  // ── Apply single field to editor ──────────────────────────────────────────
  const applyFieldToEditor = (field: DraftField, value: string) => {
    const hasExisting = existingContent[field]?.trim();
    if (hasExisting) {
      setPendingApply({ field, value });
      setConflictField(field);
    } else {
      onApplyField(field, value, 'replace');
    }
  };

  // ── Apply all accepted fields ──────────────────────────────────────────────
  const handleApplyAll = () => {
    DRAFT_FIELDS.forEach(field => {
      const state = fieldStates[field];
      if (state.status === 'accepted' || state.status === 'editing') {
        applyFieldToEditor(field, state.editedValue);
      }
    });
  };

  const acceptedCount = DRAFT_FIELDS.filter(
    f => fieldStates[f].status === 'accepted' || fieldStates[f].status === 'editing'
  ).length;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-y-0 right-0 w-[440px] z-40 bg-white border-l border-gray-200 flex flex-col shadow-2xl">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 h-14 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-2">
          <Wand2 size={15} className="text-teal-600" />
          <span className="text-[14px] font-semibold text-gray-800">Writing Assistant</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          aria-label="Close Writing Assistant"
        >
          <X size={16} />
        </button>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Conflict resolution dialog ────────────────────────────────────── */}
        {conflictField && pendingApply && (
          <div className="absolute inset-0 z-50 bg-black/30 flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
              <h3 className="font-semibold text-gray-900 text-[15px]">Replace existing content?</h3>
              <p className="text-sm text-gray-500">
                Your <strong>{FIELD_LABELS[conflictField]}</strong> already has content.
              </p>
              <div className="space-y-2 pt-1">
                {[
                  { label: 'Replace', action: () => { onApplyField(pendingApply.field, pendingApply.value, 'replace'); setConflictField(null); setPendingApply(null); }},
                  { label: 'Insert Below', action: () => { onApplyField(pendingApply.field, pendingApply.value, 'append'); setConflictField(null); setPendingApply(null); }},
                  { label: 'Keep Existing', action: () => { setConflictField(null); setPendingApply(null); }},
                ].map(({ label, action }) => (
                  <button key={label} onClick={action}
                    className="w-full px-4 py-2.5 text-sm text-left rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={() => { setConflictField(null); setPendingApply(null); }}
                className="w-full text-sm text-gray-400 hover:text-gray-600 mt-1">Cancel</button>
            </div>
          </div>
        )}

        {/* ── Inputs view ────────────────────────────────────────────────────── */}
        {step === 'inputs' && (
          <div className="px-5 py-6 space-y-5">
            <p className="text-[12px] text-gray-400">
              Day {dayNumber}{dayTitle ? ` — ${dayTitle}` : ''}
            </p>

            {/* Scripture */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-gray-600 uppercase tracking-wide">Scripture Reference *</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={scripture}
                  onChange={e => { setScripture(e.target.value); setScriptureStatus('idle'); }}
                  onBlur={() => scripture.trim() && handleValidateScripture(scripture)}
                  placeholder="e.g. John 3:16–21"
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 font-mono"
                />
                <button
                  onClick={() => handleValidateScripture(scripture)}
                  disabled={!scripture.trim() || scriptureStatus === 'validating'}
                  className="px-3 py-2 text-sm bg-gray-100 rounded-xl hover:bg-gray-200 disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  {scriptureStatus === 'validating' ? <Loader2 size={13} className="animate-spin" /> : 'Validate'}
                </button>
              </div>
              {scriptureStatus === 'valid' && (
                <p className="text-[12px] text-teal-600 flex items-center gap-1">
                  <CheckCircle2 size={11} /> {scripture}{verseCount > 0 ? ` · ${verseCount} verses` : ''}
                </p>
              )}
              {scriptureStatus === 'invalid' && (
                <p className="text-[12px] text-red-500 flex items-center gap-1">
                  <AlertTriangle size={11} /> We couldn't find that Scripture reference. Please check it before continuing.
                </p>
              )}
            </div>

            {/* Central truth */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-gray-600 uppercase tracking-wide">Central Truth about Jesus *</label>
              <p className="text-[11px] text-gray-400">What should this passage help people see about Jesus?</p>
              <textarea
                value={centralTruth}
                onChange={e => setCentralTruth(e.target.value)}
                rows={2}
                placeholder="e.g. Jesus came because God loves us and wants to save rather than condemn us."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none leading-relaxed"
              />
            </div>

            {/* Connection to previous day */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-gray-600 uppercase tracking-wide">Connection to Previous Day
                <span className="ml-1 text-gray-400 normal-case font-normal">(optional)</span>
              </label>
              {prevDay && (
                <p className="text-[11px] text-gray-400">Previous: Day {prevDay.day} — {prevDay.title} ({prevDay.scripture})</p>
              )}
              <textarea
                value={connection}
                onChange={e => setConnection(e.target.value)}
                rows={2}
                placeholder="How should this continue from yesterday?"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none leading-relaxed"
              />
            </div>

            {/* Desired next step */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-gray-600 uppercase tracking-wide">Desired Next Step
                <span className="ml-1 text-gray-400 normal-case font-normal">(optional)</span>
              </label>
              <textarea
                value={nextStepHint}
                onChange={e => setNextStepHint(e.target.value)}
                rows={2}
                placeholder="What is one faithful response you would like to encourage?"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none leading-relaxed"
              />
            </div>

            {/* Additional pastoral direction */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-gray-600 uppercase tracking-wide">Additional Direction
                <span className="ml-1 text-gray-400 normal-case font-normal">(optional)</span>
              </label>
              <textarea
                value={direction}
                onChange={e => setDirection(e.target.value)}
                rows={3}
                placeholder="e.g. Keep it warm and suitable for someone exploring faith. Use natural paragraphs. Avoid guilt-based language."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none leading-relaxed"
              />
            </div>

            {/* Writing style */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-gray-600 uppercase tracking-wide">Writing Style</label>
              <div className="space-y-1.5">
                {STYLE_OPTIONS.map(opt => (
                  <label key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      style === opt.value ? 'border-teal-300 bg-teal-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="writingStyle"
                      value={opt.value}
                      checked={style === opt.value}
                      onChange={() => setStyle(opt.value)}
                      className="mt-0.5 accent-teal-600"
                    />
                    <div>
                      <div className="text-[13px] font-medium text-gray-800">{opt.label}</div>
                      <div className="text-[11px] text-gray-500">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* ICC Sermon */}
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useSermon}
                  onChange={e => setUseSermon(e.target.checked)}
                  className="w-4 h-4 accent-teal-600"
                />
                <div>
                  <div className="text-[13px] font-medium text-gray-800">Use an ICC sermon</div>
                  <div className="text-[11px] text-gray-500">Search for a sermon to use as supporting context</div>
                </div>
              </label>

              {useSermon && (
                <div className="space-y-2 pl-7">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={sermonQuery}
                      onChange={e => setSermonQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSermonSearch()}
                      placeholder="Search sermons…"
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300"
                    />
                    <button
                      onClick={handleSermonSearch}
                      disabled={searchingSermons || !sermonQuery.trim()}
                      className="px-3 py-2 text-sm bg-gray-100 rounded-xl hover:bg-gray-200 disabled:opacity-40 transition-colors"
                    >
                      {searchingSermons ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                    </button>
                  </div>

                  {selectedSermon && (
                    <div className="flex items-center justify-between px-3 py-2 bg-teal-50 border border-teal-200 rounded-xl">
                      <div className="text-[12px] text-teal-800 font-medium truncate">{selectedSermon.title}</div>
                      <button onClick={() => setSelectedSermon(null)} className="text-teal-500 hover:text-teal-700 ml-2">
                        <X size={13} />
                      </button>
                    </div>
                  )}

                  {sermons.length > 0 && !selectedSermon && (
                    <div className="border border-gray-200 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                      {sermons.map(s => (
                        <button
                          key={s.sermonId}
                          onClick={() => { setSelectedSermon(s); setSermons([]); }}
                          className="w-full text-left px-3 py-2.5 text-[12px] hover:bg-gray-50 border-b border-gray-100 last:border-0"
                        >
                          <div className="font-medium text-gray-800 truncate">{s.title}</div>
                          <div className="text-gray-400 text-[11px]">{s.scriptureReference ?? s.date ?? ''}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Generate button */}
            <div className="pt-2">
              <button
                onClick={handleGenerate}
                disabled={scriptureStatus !== 'valid' || !centralTruth.trim() || generating}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 text-white text-[14px] font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-40 transition-colors"
              >
                <Wand2 size={15} />
                Create Draft
              </button>
              {scriptureStatus !== 'valid' && (
                <p className="text-[11px] text-gray-400 text-center mt-2">Validate the Scripture reference first</p>
              )}
            </div>
          </div>
        )}

        {/* ── Generating view ─────────────────────────────────────────────────── */}
        {step === 'generating' && (
          <div className="flex flex-col items-center justify-center h-64 gap-4 px-8 text-center">
            <Loader2 size={28} className="animate-spin text-teal-600" />
            <p className="text-[14px] font-medium text-gray-700">Creating your draft…</p>
            <p className="text-[12px] text-gray-400">This may take a moment. Your current content is safe.</p>
          </div>
        )}

        {/* ── Error view ──────────────────────────────────────────────────────── */}
        {step === 'error' && (
          <div className="px-5 py-8 space-y-4">
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
              <div className="text-sm text-red-700">{error || "We couldn't create this draft. Your current content has been preserved. Please try again."}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep('inputs')}
                className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                ← Back to Inputs
              </button>
              <button onClick={handleGenerate}
                className="flex-1 px-4 py-2.5 text-sm bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors">
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* ── Review view ─────────────────────────────────────────────────────── */}
        {step === 'review' && draft && (
          <div className="px-5 py-6 space-y-5">

            {/* AI notice */}
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-[12px] text-amber-800">
                AI-assisted draft. Please review the Scripture, theology and wording before publishing.
              </p>
            </div>

            {/* Review summary */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-2 text-[12px]">
              <div className="font-semibold text-gray-600 uppercase tracking-wide text-[11px]">Review Summary</div>
              <div><span className="text-gray-500">Scripture: </span><span className="text-gray-800 font-medium">{draft.review.scriptureUsed}</span></div>
              <div><span className="text-gray-500">Central truth: </span><span className="text-gray-800">{draft.review.centralTruth}</span></div>
              {draft.review.sermonSource && (
                <div><span className="text-gray-500">Sermon source: </span><span className="text-gray-800">{draft.review.sermonSource}</span></div>
              )}
              {draft.review.warnings.length > 0 && draft.review.warnings.map((w, i) => (
                <div key={i} className="text-amber-700">⚠ {w}</div>
              ))}
            </div>

            {/* Field reviews */}
            {DRAFT_FIELDS.map(field => (
              <FieldReview
                key={field}
                field={field}
                label={FIELD_LABELS[field]}
                generatedValue={draft[field]}
                state={fieldStates[field]}
                onAccept={() => acceptField(field)}
                onKeep={() => keepField(field)}
                onStartEdit={() => startEditing(field)}
                onSaveEdit={(v) => { setFieldStates(fs => ({ ...fs, [field]: { status: 'accepted', editedValue: v } })); }}
                onCancelEdit={() => cancelEdit(field)}
                onRegenerate={() => handleRegenerateField(field)}
                onEditChange={(v) => setFieldStates(fs => ({ ...fs, [field]: { ...fs[field], editedValue: v } }))}
              />
            ))}

            {/* Footer actions */}
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <button
                onClick={handleApplyAll}
                disabled={acceptedCount === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 text-white text-[13px] font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-40 transition-colors"
              >
                <BookOpen size={14} />
                Apply {acceptedCount > 0 ? `${acceptedCount} Accepted` : ''} Field{acceptedCount !== 1 ? 's' : ''} to Editor
              </button>
              <button
                onClick={() => setStep('inputs')}
                className="w-full px-4 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                ← Revise Inputs
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FieldReview sub-component ─────────────────────────────────────────────────

interface FieldReviewProps {
  field: DraftField;
  label: string;
  generatedValue: string;
  state: FieldReviewState;
  onAccept: () => void;
  onKeep: () => void;
  onStartEdit: () => void;
  onSaveEdit: (v: string) => void;
  onCancelEdit: () => void;
  onRegenerate: () => void;
  onEditChange: (v: string) => void;
}

function FieldReview({
  label, generatedValue, state,
  onAccept, onKeep, onStartEdit, onSaveEdit, onCancelEdit, onRegenerate, onEditChange,
}: FieldReviewProps) {
  const [expanded, setExpanded] = useState(true);

  const statusBadge = {
    pending:      null,
    accepted:     <span className="text-[11px] text-teal-700 font-semibold bg-teal-50 px-2 py-0.5 rounded-full">Accepted</span>,
    editing:      <span className="text-[11px] text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded-full">Editing</span>,
    kept:         <span className="text-[11px] text-gray-500 font-semibold bg-gray-100 px-2 py-0.5 rounded-full">Original kept</span>,
    regenerating: <span className="text-[11px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-full flex items-center gap-1"><Loader2 size={9} className="animate-spin" /> Regenerating</span>,
  }[state.status];

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-gray-800">{label}</span>
          {statusBadge}
        </div>
        {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-3 space-y-3">
          {state.status === 'regenerating' ? (
            <div className="flex items-center gap-2 py-4 justify-center text-[13px] text-gray-400">
              <Loader2 size={14} className="animate-spin" /> Regenerating…
            </div>
          ) : state.status === 'editing' ? (
            <>
              <textarea
                value={state.editedValue}
                onChange={e => onEditChange(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none leading-relaxed"
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={() => onSaveEdit(state.editedValue)}
                  className="flex-1 px-3 py-2 text-[12px] bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
                  Save Edit
                </button>
                <button onClick={onCancelEdit}
                  className="px-3 py-2 text-[12px] text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[13px] text-gray-700 whitespace-pre-line leading-relaxed">
                {generatedValue}
              </p>
              {state.status === 'kept' ? (
                <div className="flex gap-2">
                  <button onClick={onAccept}
                    className="px-3 py-1.5 text-[12px] border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    Use this instead
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={onAccept}
                    className={`flex items-center gap-1 px-3 py-1.5 text-[12px] rounded-lg transition-colors ${
                      state.status === 'accepted'
                        ? 'bg-teal-600 text-white'
                        : 'bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100'
                    }`}>
                    <CheckCircle2 size={11} />
                    {state.status === 'accepted' ? 'Accepted' : 'Accept'}
                  </button>
                  <button onClick={onStartEdit}
                    className="flex items-center gap-1 px-3 py-1.5 text-[12px] border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    <Edit3 size={11} /> Edit
                  </button>
                  <button onClick={onRegenerate}
                    className="flex items-center gap-1 px-3 py-1.5 text-[12px] border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    <RotateCcw size={11} /> Regenerate
                  </button>
                  <button onClick={onKeep}
                    className="px-3 py-1.5 text-[12px] border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-500">
                    Keep Existing
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
