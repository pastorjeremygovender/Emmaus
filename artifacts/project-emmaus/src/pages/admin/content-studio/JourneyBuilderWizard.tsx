/**
 * JourneyBuilderWizard — guided AI Journey creation flow (6 screens)
 *
 * Screen 1: Journey (content type + title)
 * Screen 2: Purpose (purpose + desired outcome)
 * Screen 3: Audience (multi-select + custom)
 * Screen 4: Structure (collection, rhythm, length, time)
 * Screen 5: Scripture & Sermons (validate refs, search/add sermons, components, style)
 * Screen 6: Review & Generate
 *
 * Draft state auto-saved to localStorage under emmaus_builder_draft_{userId}.
 * Nothing publishes automatically — result is always Draft.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, ArrowRight, ArrowLeft, Sparkles, CheckCircle2, Circle,
  Search, Plus, Trash2, AlertCircle, Loader2, CheckCheck,
  BookOpen, RefreshCw,
} from 'lucide-react';
import type { Collection } from '@/lib/collections-api';
import {
  validateScriptureRef, searchSermonsForBuilder, buildJourneyWithAI,
  type ValidatedScripture, type ApprovedSermon, type BuilderPayload,
} from '@/lib/journeys-api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  initialContentType: string;
  /** Pre-fill the title field (set by NewJourneyModal when skipping screen 0) */
  initialTitle?: string;
  /** Start at this screen index instead of 0 (NewJourneyModal passes 1 to skip Step 1) */
  initialScreen?: number;
  userId?: string;
  collections: Collection[];
  onClose: () => void;
  onCreated: (journeyId: string) => void;
}

type WizardState = {
  // Screen 1
  contentType: string;
  title: string;
  // Screen 2
  purpose: string;
  desiredOutcome: string;
  // Screen 3
  audience: string[];
  customAudience: string;
  // Screen 4
  collectionId: string;
  rhythm: string;
  length: number;
  estimatedTime: string;
  // Screen 5
  scriptureInput: string;
  scriptureRefs: ValidatedScripture[];
  sermonQuery: string;
  sermonSources: ApprovedSermon[];
  components: string[];
  writingStyle: string;
  requiresDailyGate: boolean;
  specialInstructions: string;
};

const INITIAL_STATE: WizardState = {
  contentType: 'daily-devotional',
  title: '',
  purpose: '',
  desiredOutcome: '',
  audience: [],
  customAudience: '',
  collectionId: '',
  rhythm: 'daily',
  length: 7,
  estimatedTime: 'About 15 minutes',
  scriptureInput: '',
  scriptureRefs: [],
  sermonQuery: '',
  sermonSources: [],
  components: ['scripture', 'reflection', 'prayer', 'action', 'opening-thought'],
  writingStyle: 'Emmaus Standard',
  requiresDailyGate: false,
  specialInstructions: '',
};

const AUDIENCE_OPTIONS = [
  'New Believers', 'Young Adults', 'Adults', 'Parents', 'Men', 'Women',
  'Small Groups', 'Leaders', 'Everyone',
];

const RHYTHM_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'self-paced', label: 'Self-paced' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'guided', label: 'Guided' },
];

const TIME_OPTIONS = [
  'About 5 minutes', 'About 10 minutes', 'About 15 minutes',
  'About 20 minutes', 'About 30 minutes', '45+ minutes',
];

const COMPONENT_OPTIONS = [
  { id: 'opening-thought', label: 'Opening thought', desc: 'Warm mentor-style intro' },
  { id: 'scripture', label: 'Scripture', desc: 'Verified Bible text' },
  { id: 'reflection', label: 'Reflection', desc: 'Personal reflection question' },
  { id: 'prayer', label: 'Prayer', desc: 'Guided prayer prompt' },
  { id: 'action', label: 'Action step', desc: 'Concrete response for today' },
  { id: 'journal-prompt', label: 'Journal prompt', desc: 'Space for written reflection' },
  { id: 'discussion-question', label: 'Discussion question', desc: 'For group or partner use' },
  { id: 'memory-verse', label: 'Memory verse', desc: 'Short verse to memorise' },
  { id: 'closing-encouragement', label: 'Closing encouragement', desc: 'Affirming send-off' },
  { id: 'completion-prompt', label: 'Completion prompt', desc: 'Step completion marker' },
];

const STYLE_OPTIONS = [
  'Emmaus Standard', 'Pastor Jeremy Style', 'New Believer', 'Bible Study',
  'Small Group', 'Youth', 'Children',
];

const CONTENT_TYPE_LABELS: Record<string, string> = {
  'daily-devotional': 'Daily Devotional',
  'sermon-companion': 'Sermon Companion',
  'bible-study': 'Bible Study',
  'prayer-journey': 'Prayer Journey',
  'small-group': 'Small Group',
  'core': 'Core Discipleship',
};

// ─── Field wrapper ────────────────────────────────────────────────────────────

function WizardField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-800">{label}</label>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const TOTAL_SCREENS = 6;

export default function JourneyBuilderWizard({ initialContentType, initialTitle, initialScreen, userId, collections, onClose, onCreated }: Props) {
  const storageKey = userId ? `emmaus_builder_draft_${userId}` : null;

  // Load persisted draft, always honouring initialContentType and initialTitle
  // (these are set by the new 3-step wizard and take precedence over any saved draft)
  const loadDraft = (): WizardState => {
    const base: WizardState = {
      ...INITIAL_STATE,
      contentType: initialContentType,
      title: initialTitle ?? '',
    };
    if (!storageKey) return base;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        return {
          ...base,
          ...JSON.parse(raw) as Partial<WizardState>,
          // Always override with what the caller passed — never let a stale
          // draft overwrite the user's freshly selected type or title.
          contentType: initialContentType,
          title: initialTitle ?? '',
        };
      }
    } catch { /* ignore */ }
    return base;
  };

  const [screen, setScreen] = useState(initialScreen ?? 0);
  const [state, setState] = useState<WizardState>(loadDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [validatingRef, setValidatingRef] = useState(false);
  const [refError, setRefError] = useState('');
  const [searchingSermons, setSearchingSermons] = useState(false);
  const [sermonResults, setSermonResults] = useState<ApprovedSermon[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  const patch = useCallback(<K extends keyof WizardState>(k: K, v: WizardState[K]) => {
    setState(s => {
      const next = { ...s, [k]: v };
      if (storageKey) {
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      }
      return next;
    });
  }, [storageKey]);

  // ─── Validation per screen ─────────────────────────────────────────────────

  const validate = (s: number): boolean => {
    const errs: Record<string, string> = {};
    if (s === 0) {
      if (!state.title.trim()) errs.title = 'Please add a title.';
    }
    if (s === 1) {
      if (!state.purpose.trim()) errs.purpose = 'Please describe the purpose.';
      if (!state.desiredOutcome.trim()) errs.desiredOutcome = 'Please add a desired outcome.';
    }
    if (s === 2) {
      if (state.audience.length === 0 && !state.customAudience.trim()) errs.audience = 'Select at least one audience.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => {
    if (!validate(screen)) return;
    setErrors({});
    setScreen(s => Math.min(s + 1, TOTAL_SCREENS - 1));
  };
  const back = () => { setErrors({}); setScreen(s => Math.max(s - 1, 0)); };

  // ─── Scripture validation ──────────────────────────────────────────────────

  const handleAddScripture = async () => {
    const raw = state.scriptureInput.trim();
    if (!raw) return;
    if (state.scriptureRefs.some(r => r.reference.toLowerCase() === raw.toLowerCase())) {
      setRefError('Already added.'); return;
    }
    setValidatingRef(true); setRefError('');
    try {
      const result = await validateScriptureRef(raw);
      if (!result.valid) { setRefError('Reference not recognised. Try "John 15" or "Psalm 23:1".'); return; }
      patch('scriptureRefs', [
        ...state.scriptureRefs,
        {
          reference: result.reference ?? raw,
          bookId: result.bookId ?? '',
          chapter: result.chapter ?? 1,
          verseText: result.verseText,
        },
      ]);
      patch('scriptureInput', '');
    } catch {
      setRefError('Could not validate. Check your internet connection and try again.');
    } finally {
      setValidatingRef(false);
    }
  };

  const removeScripture = (ref: string) =>
    patch('scriptureRefs', state.scriptureRefs.filter(r => r.reference !== ref));

  // ─── Sermon search ─────────────────────────────────────────────────────────

  const handleSermonSearch = async () => {
    const q = state.sermonQuery.trim();
    if (!q) return;
    setSearchingSermons(true);
    try {
      const results = await searchSermonsForBuilder(q, userId);
      setSermonResults(results);
    } catch {
      setSermonResults([]);
    } finally {
      setSearchingSermons(false);
    }
  };

  const addSermon = (s: ApprovedSermon) => {
    if (state.sermonSources.some(ss => ss.sermonId === s.sermonId)) return;
    patch('sermonSources', [...state.sermonSources, s]);
  };
  const removeSermon = (id: string) =>
    patch('sermonSources', state.sermonSources.filter(s => s.sermonId !== id));

  const toggleComponent = (id: string) => {
    patch('components', state.components.includes(id)
      ? state.components.filter(c => c !== id)
      : [...state.components, id]);
  };

  // ─── Generate ──────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    setGenerating(true); setGenerateError('');
    try {
      const payload: BuilderPayload = {
        contentType: state.contentType,
        title: state.title.trim(),
        purpose: state.purpose.trim(),
        desiredOutcome: state.desiredOutcome.trim(),
        audience: state.audience,
        customAudience: state.customAudience.trim() || undefined,
        collectionId: state.collectionId || undefined,
        rhythm: state.rhythm,
        length: state.length,
        estimatedTime: state.estimatedTime,
        scriptureRefs: state.scriptureRefs,
        sermonSources: state.sermonSources,
        components: state.components,
        requiresDailyGate: state.requiresDailyGate,
        writingStyle: state.writingStyle,
        specialInstructions: state.specialInstructions.trim() || undefined,
      };

      const result = await buildJourneyWithAI(payload, userId);

      // Clear saved draft on success
      if (storageKey) { try { localStorage.removeItem(storageKey); } catch { /* ignore */ } }

      onCreated(result.journeyId);
    } catch (e: unknown) {
      setGenerateError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      setGenerating(false);
    }
  };

  // ─── Render screens ────────────────────────────────────────────────────────

  const renderScreen = () => {
    switch (screen) {
      case 0: return <Screen1 state={state} patch={patch} errors={errors} />;
      case 1: return <Screen2 state={state} patch={patch} errors={errors} />;
      case 2: return <Screen3 state={state} patch={patch} errors={errors} />;
      case 3: return <Screen4 state={state} patch={patch} collections={collections} />;
      case 4: return (
        <Screen5
          state={state} patch={patch}
          onAddScripture={handleAddScripture}
          onRemoveScripture={removeScripture}
          validatingRef={validatingRef} refError={refError}
          onSearchSermons={handleSermonSearch}
          searchingSermons={searchingSermons}
          sermonResults={sermonResults}
          onAddSermon={addSermon} onRemoveSermon={removeSermon}
          onToggleComponent={toggleComponent}
        />
      );
      case 5: return (
        <Screen6
          state={state} patch={patch}
          generating={generating} generateError={generateError}
        />
      );
      default: return null;
    }
  };

  const SCREEN_TITLES = [
    'Journey', 'Purpose', 'Audience',
    'Structure', 'Scripture & Sermons', 'Style & Review',
  ];

  const isLastScreen = screen === TOTAL_SCREENS - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[calc(100dvh-2rem)]">

        {/* ── Header — always visible ──────────────────────────────────────── */}
        <div className="flex-shrink-0 flex items-center px-5 pt-5 pb-4 border-b border-gray-100">
          {/* Back / Cancel — fixed width so title stays centred */}
          <button
            onClick={screen > 0 ? back : onClose}
            disabled={generating}
            aria-label={screen === 0 ? 'Close' : 'Back'}
            className="flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-900 transition-colors w-20 flex-shrink-0 disabled:opacity-40"
          >
            <ArrowLeft size={14} />
            {screen === 0 ? 'Cancel' : 'Back'}
          </button>

          {/* Screen title — centred */}
          <h2 className="flex-1 text-[15px] font-semibold text-gray-900 text-center">
            {SCREEN_TITLES[screen]}
          </h2>

          {/* Close — fixed width, right-aligned */}
          <div className="w-20 flex-shrink-0 flex justify-end">
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Step progress — thin pills ───────────────────────────────────── */}
        <div className="flex-shrink-0 flex items-center gap-1.5 px-5 pt-3.5 pb-1">
          {Array.from({ length: TOTAL_SCREENS }).map((_, i) => (
            <div
              key={i}
              className={`h-[3px] rounded-full flex-1 transition-all duration-300 ${
                i <= screen ? 'bg-teal-500' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* ── Scrollable content ───────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
          {renderScreen()}
        </div>

        {/* ── Footer — always visible ──────────────────────────────────────── */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100">
          {isLastScreen ? (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full h-12 rounded-2xl text-[15px] font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed bg-teal-600 hover:bg-teal-700 text-white"
            >
              {generating ? (
                <><Loader2 size={15} className="animate-spin" /><span>Generating…</span></>
              ) : (
                <><span>Generate Journey</span><Sparkles size={15} /></>
              )}
            </button>
          ) : (
            <button
              onClick={next}
              className="w-full h-12 rounded-2xl text-[15px] font-semibold transition-all flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white"
            >
              <span>Continue</span><ArrowRight size={15} />
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Screen 1: Journey ────────────────────────────────────────────────────────

function Screen1({ state, patch, errors }: {
  state: WizardState;
  patch: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  errors: Record<string, string>;
}) {
  const CONTENT_TYPES = [
    { id: 'daily-devotional', label: 'Daily Devotional' },
    { id: 'sermon-companion', label: 'Sermon Companion' },
    { id: 'bible-study', label: 'Bible Study' },
    { id: 'prayer-journey', label: 'Prayer Journey' },
    { id: 'small-group', label: 'Small Group' },
    { id: 'core', label: 'Core Discipleship' },
  ];

  return (
    <div className="space-y-5">
      <WizardField label="Content type">
        <div className="grid grid-cols-2 gap-2">
          {CONTENT_TYPES.map(ct => (
            <button
              key={ct.id}
              onClick={() => patch('contentType', ct.id)}
              className={`px-3 py-2 rounded-lg text-xs font-medium text-left transition-colors border ${
                state.contentType === ct.id
                  ? 'bg-teal-50 border-teal-300 text-teal-700'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {ct.label}
            </button>
          ))}
        </div>
      </WizardField>

      <WizardField label="Journey title *" hint="What will this Journey be called in the app?">
        <input
          type="text"
          value={state.title}
          onChange={e => patch('title', e.target.value)}
          placeholder="e.g. 10 Minutes with Jesus"
          autoFocus
          className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300 ${
            errors.title ? 'border-red-300' : 'border-gray-200'
          }`}
        />
        {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
      </WizardField>
    </div>
  );
}

// ─── Screen 2: Purpose ────────────────────────────────────────────────────────

function Screen2({ state, patch, errors }: {
  state: WizardState;
  patch: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-5">
      <WizardField
        label="Purpose *"
        hint="What is this Journey about? One or two sentences."
      >
        <textarea
          value={state.purpose}
          onChange={e => patch('purpose', e.target.value)}
          placeholder="e.g. A 7-day journey through John 15 exploring what it means to abide in Christ and bear fruit."
          rows={3}
          autoFocus
          className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none ${
            errors.purpose ? 'border-red-300' : 'border-gray-200'
          }`}
        />
        {errors.purpose && <p className="text-xs text-red-500 mt-1">{errors.purpose}</p>}
      </WizardField>

      <WizardField
        label="Desired outcome *"
        hint="What should someone experience or know by the end?"
      >
        <textarea
          value={state.desiredOutcome}
          onChange={e => patch('desiredOutcome', e.target.value)}
          placeholder="e.g. Members will develop a daily habit of abiding in Jesus through Scripture, prayer, and response."
          rows={3}
          className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none ${
            errors.desiredOutcome ? 'border-red-300' : 'border-gray-200'
          }`}
        />
        {errors.desiredOutcome && <p className="text-xs text-red-500 mt-1">{errors.desiredOutcome}</p>}
      </WizardField>
    </div>
  );
}

// ─── Screen 3: Audience ───────────────────────────────────────────────────────

function Screen3({ state, patch, errors }: {
  state: WizardState;
  patch: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  errors: Record<string, string>;
}) {
  const toggle = (a: string) =>
    patch('audience', state.audience.includes(a)
      ? state.audience.filter(x => x !== a)
      : [...state.audience, a]);

  return (
    <div className="space-y-5">
      <WizardField label="Who is this Journey for? *" hint="Select all that apply.">
        <div className="flex flex-wrap gap-2 mt-1">
          {AUDIENCE_OPTIONS.map(a => (
            <button
              key={a}
              onClick={() => toggle(a)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                state.audience.includes(a)
                  ? 'bg-teal-50 border-teal-300 text-teal-700'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {state.audience.includes(a) && <CheckCheck size={11} className="inline mr-1" />}
              {a}
            </button>
          ))}
        </div>
        {errors.audience && <p className="text-xs text-red-500 mt-1">{errors.audience}</p>}
      </WizardField>

      <WizardField label="Other (optional)" hint="Add a specific group not listed above.">
        <input
          type="text"
          value={state.customAudience}
          onChange={e => patch('customAudience', e.target.value)}
          placeholder="e.g. First-time visitors, Recovery group…"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300"
        />
      </WizardField>
    </div>
  );
}

// ─── Screen 4: Structure ──────────────────────────────────────────────────────

function Screen4({ state, patch, collections }: {
  state: WizardState;
  patch: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  collections: Collection[];
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <WizardField label="Rhythm">
          <select
            value={state.rhythm}
            onChange={e => patch('rhythm', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
          >
            {RHYTHM_OPTIONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </WizardField>

        <WizardField label="Number of steps">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1} max={40} step={1}
              value={state.length}
              onChange={e => patch('length', Number(e.target.value))}
              className="flex-1 accent-teal-500"
            />
            <span className="w-8 text-sm font-semibold text-teal-700 text-right">{state.length}</span>
          </div>
        </WizardField>
      </div>

      <WizardField label="Time per step" hint="How long should each step take?">
        <div className="flex flex-wrap gap-2">
          {TIME_OPTIONS.map(t => (
            <button
              key={t}
              onClick={() => patch('estimatedTime', t)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                state.estimatedTime === t
                  ? 'bg-teal-50 border-teal-300 text-teal-700'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </WizardField>

      {collections.length > 0 && (
        <WizardField label="Collection (optional)" hint="Assign this Journey to a series or programme.">
          <select
            value={state.collectionId}
            onChange={e => patch('collectionId', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
          >
            <option value="">No collection</option>
            {collections.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </WizardField>
      )}

      <WizardField label="Require daily 10 Min gate?">
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => patch('requiresDailyGate', !state.requiresDailyGate)}
            className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${
              state.requiresDailyGate ? 'bg-teal-500' : 'bg-gray-200'
            }`}
          >
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              state.requiresDailyGate ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </div>
          <span className="text-sm text-gray-600">
            Members must complete 10 Minutes with Jesus before unlocking each step
          </span>
        </label>
      </WizardField>
    </div>
  );
}

// ─── Screen 5: Scripture & Sermons ────────────────────────────────────────────

function Screen5({
  state, patch,
  onAddScripture, onRemoveScripture, validatingRef, refError,
  onSearchSermons, searchingSermons, sermonResults,
  onAddSermon, onRemoveSermon,
  onToggleComponent,
}: {
  state: WizardState;
  patch: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  onAddScripture: () => void;
  onRemoveScripture: (ref: string) => void;
  validatingRef: boolean;
  refError: string;
  onSearchSermons: () => void;
  searchingSermons: boolean;
  sermonResults: ApprovedSermon[];
  onAddSermon: (s: ApprovedSermon) => void;
  onRemoveSermon: (id: string) => void;
  onToggleComponent: (id: string) => void;
}) {
  return (
    <div className="space-y-5">
      {/* Scripture */}
      <WizardField
        label="Primary Scripture"
        hint="Add one or more passages. Type a reference and press Enter or click Add."
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={state.scriptureInput}
            onChange={e => patch('scriptureInput', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onAddScripture()}
            placeholder="e.g. John 15 or Psalm 23:1"
            className={`flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300 ${
              refError ? 'border-red-300' : 'border-gray-200'
            }`}
          />
          <button
            onClick={onAddScripture}
            disabled={validatingRef || !state.scriptureInput.trim()}
            className="px-3 py-2 bg-teal-600 text-white text-xs font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1"
          >
            {validatingRef ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            Add
          </button>
        </div>
        {refError && (
          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
            <AlertCircle size={11} /> {refError}
          </p>
        )}
        {state.scriptureRefs.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {state.scriptureRefs.map(r => (
              <div key={r.reference} className="flex items-center gap-1.5 px-2.5 py-1 bg-teal-50 border border-teal-200 rounded-full text-xs text-teal-700">
                <BookOpen size={10} />
                {r.reference}
                <button onClick={() => onRemoveScripture(r.reference)} className="ml-0.5 hover:text-red-500">
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </WizardField>

      {/* Sermon sources */}
      <WizardField
        label="Sermon sources (optional)"
        hint="Search your ICC sermon archive to tie this Journey to specific messages."
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={state.sermonQuery}
            onChange={e => patch('sermonQuery', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSearchSermons()}
            placeholder="Search by topic, book, or theme…"
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300"
          />
          <button
            onClick={onSearchSermons}
            disabled={searchingSermons || !state.sermonQuery.trim()}
            className="px-3 py-2 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1"
          >
            {searchingSermons ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            Search
          </button>
        </div>

        {/* Search results */}
        {sermonResults.length > 0 && (
          <div className="mt-2 border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-40 overflow-y-auto">
            {sermonResults.map(s => {
              const added = state.sermonSources.some(ss => ss.sermonId === s.sermonId);
              return (
                <div key={s.sermonId} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{s.title}</p>
                    <p className="text-[11px] text-gray-400">{s.date}{s.scriptureReference ? ` · ${s.scriptureReference}` : ''}</p>
                  </div>
                  <button
                    onClick={() => added ? onRemoveSermon(s.sermonId) : onAddSermon(s)}
                    className={`flex-shrink-0 px-2 py-1 text-xs rounded-lg transition-colors ${
                      added
                        ? 'bg-teal-50 text-teal-600 border border-teal-200'
                        : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-teal-50 hover:text-teal-600 hover:border-teal-200'
                    }`}
                  >
                    {added ? <><CheckCircle2 size={10} className="inline mr-0.5" /> Added</> : <><Plus size={10} className="inline mr-0.5" /> Add</>}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Added sermons */}
        {state.sermonSources.length > 0 && (
          <div className="mt-2 space-y-1">
            {state.sermonSources.map(s => (
              <div key={s.sermonId} className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-100 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-purple-800 truncate">{s.title}</p>
                  <p className="text-[11px] text-purple-400">{s.date}</p>
                </div>
                <button onClick={() => onRemoveSermon(s.sermonId)} className="text-purple-300 hover:text-red-400">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </WizardField>

      {/* Components */}
      <WizardField label="Include in each step" hint="Choose which block types to generate.">
        <div className="grid grid-cols-2 gap-2 mt-1">
          {COMPONENT_OPTIONS.map(c => (
            <label key={c.id} className="flex items-start gap-2 cursor-pointer group">
              <div
                onClick={() => onToggleComponent(c.id)}
                className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  state.components.includes(c.id)
                    ? 'bg-teal-500 border-teal-500 text-white'
                    : 'border-gray-300 group-hover:border-teal-300'
                }`}
              >
                {state.components.includes(c.id) && <CheckCheck size={10} />}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-700">{c.label}</p>
                <p className="text-[11px] text-gray-400">{c.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </WizardField>
    </div>
  );
}

// ─── Screen 6: Style & Review ─────────────────────────────────────────────────

function Screen6({ state, patch, generating, generateError }: {
  state: WizardState;
  patch: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  generating: boolean;
  generateError: string;
}) {
  return (
    <div className="space-y-5">
      <WizardField label="Writing style">
        <div className="flex flex-wrap gap-2">
          {STYLE_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => patch('writingStyle', s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                state.writingStyle === s
                  ? 'bg-teal-50 border-teal-300 text-teal-700'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </WizardField>

      <WizardField label="Special instructions (optional)" hint="Anything the AI should know? Themes to include, things to avoid, tone notes.">
        <textarea
          value={state.specialInstructions}
          onChange={e => patch('specialInstructions', e.target.value)}
          placeholder="e.g. Avoid mentioning denominations. Emphasise community. This series follows Pastor Jeremy's Abide series."
          rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none"
        />
      </WizardField>

      {/* Summary */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-2">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Review</p>
        <SummaryRow label="Title" value={state.title || '—'} />
        <SummaryRow label="Type" value={CONTENT_TYPE_LABELS[state.contentType] ?? state.contentType} />
        <SummaryRow label="Length" value={`${state.length} steps · ${state.estimatedTime}`} />
        <SummaryRow label="Rhythm" value={RHYTHM_OPTIONS.find(r => r.value === state.rhythm)?.label ?? state.rhythm} />
        <SummaryRow label="Scripture" value={state.scriptureRefs.map(r => r.reference).join(', ') || 'None added'} />
        <SummaryRow label="Sermons" value={state.sermonSources.length > 0 ? `${state.sermonSources.length} source${state.sermonSources.length !== 1 ? 's' : ''}` : 'None'} />
        <SummaryRow label="Audience" value={[...state.audience, state.customAudience].filter(Boolean).join(', ') || '—'} />
        <SummaryRow label="Style" value={state.writingStyle} />
      </div>

      {generateError && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
          <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-600">{generateError}</p>
        </div>
      )}

      {generating && (
        <div className="flex items-center gap-2 text-xs text-gray-500 justify-center py-2">
          <Loader2 size={14} className="animate-spin text-teal-500" />
          <span>Building your Journey draft — this takes about 30 seconds…</span>
        </div>
      )}

      <p className="text-[11px] text-gray-400 text-center">
        The Journey will be saved as a <strong>Draft</strong>. Nothing publishes automatically. You'll be taken to the editor to review and edit.
      </p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-gray-400 flex-shrink-0">{label}</span>
      <span className="text-xs text-gray-700 text-right">{value}</span>
    </div>
  );
}
