/**
 * BulkImportModal — 7-screen bulk-import wizard for Content Studio.
 *
 * Destination → Upload → Map Fields → Preview → Conflicts → Importing → Results
 *
 * Supports: Daily Rhythm journey steps, Walk/Journey steps, Daily Devotional entries.
 * Uses the existing createStep / updateStep / saveEntry APIs — no parallel storage.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X, ArrowLeft, ArrowRight, Upload, FileSpreadsheet, ClipboardList,
  CheckCircle2, AlertTriangle, ChevronDown, ChevronRight, Loader2,
  Sun, BookHeart, BookOpen, SkipForward, RefreshCw, FilePlus2, Sparkles,
  AlignLeft,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { listJourneys, createStep, updateStep, listSteps } from '@/lib/journeys-api';
import { listAllSeries, getSeriesWithEntries, saveEntry } from '@/lib/devotionals-api';
import type { Journey } from '@/lib/journeys-api';
import type { DevotionalSeries } from '@/lib/devotionals-api';
import {
  parseCSVText, parseXLSXBuffer, autoDetectMapping, buildParsedRows,
  CANONICAL_FIELD_LABELS,
  type DestType, type ColumnMapping, type ParsedRow,
  type ConflictResolution, type ImportResult, type CanonicalField,
} from './bulk-import-utils';
import { parseEmmausText } from './bulk-import-emmaus-parser';

// ─── Types ─────────────────────────────────────────────────────────────────────

type Screen = 'destination' | 'upload' | 'mapping' | 'preview' | 'conflicts' | 'importing' | 'results';
type UploadMethod = 'csv' | 'xlsx' | 'emmaus';

const ALL_CANONICAL_FIELDS: CanonicalField[] = [
  'day', 'title', 'scripture', 'mentorIntro', 'devotional',
  'reflectionQuestion', 'prayerPrompt', 'actionStep', 'closingText',
  'memoryVerse', 'status',
];

interface Props {
  onClose: () => void;
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

function Pill({ label, variant }: { label: string; variant: 'amber' | 'red' | 'green' | 'gray' }) {
  const cls = {
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red:   'bg-red-50   text-red-700   border-red-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    gray:  'bg-gray-100 text-gray-500  border-gray-200',
  }[variant];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BulkImportModal({ onClose }: Props) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Loading ──────────────────────────────────────────────────────────────────
  const [journeys,   setJourneys]   = useState<Journey[]>([]);
  const [series,     setSeries]     = useState<DevotionalSeries[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  // ── Screen navigation ────────────────────────────────────────────────────────
  const [screen, setScreen] = useState<Screen>('destination');

  // ── Step 1 — Destination ─────────────────────────────────────────────────────
  const [destType, setDestType]     = useState<DestType | null>(null);
  const [destId,   setDestId]       = useState('');
  const [destLabel, setDestLabel]   = useState('');

  // ── Step 2 — Upload ───────────────────────────────────────────────────────────
  const [uploadMethod, setUploadMethod] = useState<UploadMethod>('csv');
  const [pasteText,    setPasteText]    = useState('');
  const [rawRows,      setRawRows]      = useState<Record<string, string>[]>([]);
  const [headers,      setHeaders]      = useState<string[]>([]);
  const [parseError,   setParseError]   = useState('');
  const [parsing,      setParsing]      = useState(false);

  // ── Step 3 — Mapping ──────────────────────────────────────────────────────────
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);

  // ── Step 4 — Preview ──────────────────────────────────────────────────────────
  const [parsedRows,    setParsedRows]    = useState<ParsedRow[]>([]);
  const [defaultStatus, setDefaultStatus] = useState<'Draft' | 'Published'>('Draft');
  const [expandedRow,   setExpandedRow]   = useState<number | null>(null);
  const [existingDays,  setExistingDays]  = useState<Set<number>>(new Set());
  const [loadingExisting, setLoadingExisting] = useState(false);

  // ── Step 5 — Conflicts ────────────────────────────────────────────────────────
  const [applyToAll, setApplyToAll] = useState<ConflictResolution | ''>('');

  // ── Step 6 — Importing ────────────────────────────────────────────────────────
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal,    setImportTotal]    = useState(0);
  const [importCurrent,  setImportCurrent]  = useState('');

  // ── Step 7 — Results ──────────────────────────────────────────────────────────
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // ── Load journeys + series ────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    Promise.all([
      listJourneys().catch(() => [] as Journey[]),
      listAllSeries({ userId: user?.id ?? '', userRole: user?.role ?? 'admin' }).catch(() => [] as DevotionalSeries[]),
    ]).then(([j, s]) => {
      if (!alive) return;
      setJourneys(j);
      setSeries(s);
      setLoadingMeta(false);
    });
    return () => { alive = false; };
  }, [user?.id, user?.role]);

  // ── Derived values ─────────────────────────────────────────────────────────────
  const drJourney = journeys.find(j => j.journeyType === 'daily-rhythm');
  const walkJourneys = journeys.filter(j => j.journeyType !== 'daily-rhythm');
  const conflictRows = parsedRows.filter(r => r.conflict);
  const warningRows  = parsedRows.filter(r => r.warnings.length > 0);

  const destReady =
    destType === 'daily-rhythm'
      ? !!drJourney
      : destType === 'walk'
        ? !!destId
        : destType === 'devotional'
          ? !!destId
          : false;

  // ── Apply-to-all conflict resolution ──────────────────────────────────────────
  const applyConflictToAll = useCallback((resolution: ConflictResolution) => {
    setParsedRows(rows =>
      rows.map(r => r.conflict ? { ...r, conflictResolution: resolution } : r)
    );
  }, []);

  useEffect(() => {
    if (applyToAll) applyConflictToAll(applyToAll as ConflictResolution);
  }, [applyToAll, applyConflictToAll]);

  // ── File parsing ───────────────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    setParsing(true); setParseError('');
    try {
      let result;
      if (file.name.endsWith('.csv') || uploadMethod === 'csv') {
        const text = await file.text();
        result = parseCSVText(text);
      } else {
        const buf = await file.arrayBuffer();
        result = parseXLSXBuffer(buf);
      }
      if (result.error) { setParseError(result.error); return; }
      if (result.rows.length === 0) { setParseError('No data rows found in file.'); return; }
      setHeaders(result.headers);
      setRawRows(result.rows);
      const detected = autoDetectMapping(result.headers, result.rows);
      setMappings(detected);
    } finally {
      setParsing(false);
    }
  };

  // ── Emmaus-format paste parse (skips column mapping; goes straight to preview) ─
  const handleEmmausParse = async () => {
    if (!pasteText.trim()) { setParseError('Please paste some content first.'); return; }
    setParsing(true); setParseError('');
    try {
      const result = parseEmmausText(pasteText, defaultStatus);
      if (result.error || result.items.length === 0) {
        setParseError(result.error ?? 'No items detected.');
        return;
      }

      // Fetch existing days for conflict detection (same as gotoPreview does for CSV)
      setLoadingExisting(true);
      const existing = await fetchExistingDays();
      setExistingDays(existing);
      setLoadingExisting(false);

      // Build ParsedRow[] from MappedRow[] + per-item warnings
      const seenDays = new Map<number, number>();
      const rows: ParsedRow[] = result.items.map((mapped, i) => {
        const warnings = [...result.warnings[i]];
        if (mapped.day > 0 && seenDays.has(mapped.day)) {
          warnings.push(`Duplicate day ${mapped.day} in this import`);
        } else if (mapped.day > 0) {
          seenDays.set(mapped.day, i);
        }
        const conflict = mapped.day > 0 && existing.has(mapped.day);
        return { index: i, raw: {}, mapped, warnings, conflict, conflictResolution: null };
      });

      // Mark rawRows non-empty so downstream guards pass
      setRawRows(result.items.map(() => ({})));
      setParsedRows(rows);
      setScreen('preview');
    } finally {
      setParsing(false);
      setLoadingExisting(false);
    }
  };

  // ── Fetch existing days before preview ──────────────────────────────────────
  const fetchExistingDays = useCallback(async (): Promise<Set<number>> => {
    try {
      if (destType === 'daily-rhythm' && drJourney) {
        const steps = await listSteps(drJourney.id);
        return new Set(steps.map(s => s.day));
      }
      if (destType === 'walk' && destId) {
        const steps = await listSteps(destId);
        return new Set(steps.map(s => s.day));
      }
      if (destType === 'devotional' && destId) {
        const data = await getSeriesWithEntries(destId, { userId: user?.id, userRole: user?.role });
        return new Set((data.entries ?? []).map((e: { dayNumber: number }) => e.dayNumber));
      }
    } catch { /* non-fatal */ }
    return new Set();
  }, [destType, drJourney, destId, user?.id, user?.role]);

  // ── Navigation ─────────────────────────────────────────────────────────────────
  const handleBack = () => {
    if (screen === 'destination') { onClose(); return; }
    if (screen === 'upload')     { setScreen('destination'); return; }
    if (screen === 'mapping')    { setScreen('upload'); return; }
    // Emmaus format skips the mapping screen — back goes directly to upload
    if (screen === 'preview')    { setScreen(uploadMethod === 'emmaus' ? 'upload' : 'mapping'); return; }
    if (screen === 'conflicts')  { setScreen('preview'); return; }
    if (screen === 'results')    { onClose(); return; }
  };

  const gotoUpload = () => {
    if (!destReady) return;
    // Set destination label
    if (destType === 'daily-rhythm') {
      setDestId(drJourney!.id);
      setDestLabel('Daily Rhythm');
    } else if (destType === 'walk') {
      const j = walkJourneys.find(j => j.id === destId);
      setDestLabel(j?.title ?? 'Walk');
    } else {
      const s = series.find(s => s.id === destId);
      setDestLabel(s?.title ?? 'Series');
    }
    setParseError('');
    setScreen('upload');
  };

  const gotoMapping = () => {
    if (rawRows.length === 0) { setParseError('No rows to import.'); return; }
    setScreen('mapping');
  };

  const gotoPreview = async () => {
    setLoadingExisting(true);
    const existing = await fetchExistingDays();
    setExistingDays(existing);
    const rows = buildParsedRows(rawRows, mappings, existing, defaultStatus);
    setParsedRows(rows);
    setLoadingExisting(false);
    setScreen('preview');
  };

  const gotoConflictsOrImport = () => {
    const conflicts = parsedRows.filter(r => r.conflict);
    if (conflicts.length > 0 && conflicts.some(r => r.conflictResolution === null)) {
      setScreen('conflicts');
    } else {
      startImport();
    }
  };

  const startImport = async () => {
    setScreen('importing');
    const rowsToImport = parsedRows.filter(r => !r.conflict || r.conflictResolution !== 'skip');
    setImportTotal(rowsToImport.length);
    setImportProgress(0);

    const result: ImportResult = { imported: 0, skipped: 0, failed: 0, errors: [] };

    // Compute max existing day for 'new-draft' placement
    const maxExisting = existingDays.size > 0 ? Math.max(...existingDays) : 0;
    let newDraftOffset = 0;

    const auth = { userId: user?.id ?? '', userRole: user?.role ?? 'admin' };
    const resolvedJourneyId = destType === 'daily-rhythm' ? drJourney!.id : destId;

    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      setImportCurrent(`Day ${row.mapped.day}: ${row.mapped.title || 'Untitled'}`);

      // Skip resolution
      if (row.conflict && row.conflictResolution === 'skip') {
        result.skipped++;
        continue;
      }

      try {
        if (destType === 'daily-rhythm' || destType === 'walk') {
          // Journey step
          let targetDay = row.mapped.day;

          if (row.conflict && row.conflictResolution === 'new-draft') {
            newDraftOffset++;
            targetDay = maxExisting + newDraftOffset;
          }

          const stepData = {
            journeyId:          resolvedJourneyId,
            day:                targetDay,
            title:              row.mapped.title || `Day ${targetDay}`,
            scripture:          row.mapped.scripture,
            mentorIntro:        row.mapped.mentorIntro,
            devotional:         row.mapped.devotional,
            reflectionQuestion: row.mapped.reflectionQuestion,
            prayerPrompt:       row.mapped.prayerPrompt,
            actionStep:         row.mapped.actionStep,
            closingText:        row.mapped.closingText,
            memoryVerse:        row.mapped.memoryVerse,
            status:             row.mapped.status,
          };

          if (row.conflict && row.conflictResolution === 'replace') {
            await updateStep(resolvedJourneyId, targetDay, stepData, auth.userId);
          } else {
            await createStep(resolvedJourneyId, stepData, auth.userId);
          }
        } else {
          // Devotional entry
          let targetDay = row.mapped.day;

          if (row.conflict && row.conflictResolution === 'new-draft') {
            newDraftOffset++;
            targetDay = maxExisting + newDraftOffset;
          }

          await saveEntry(
            destId,
            targetDay,
            {
              title:              row.mapped.title || `Day ${targetDay}`,
              scriptureReference: row.mapped.scripture,
              greeting:           row.mapped.mentorIntro,
              considerThis:       row.mapped.devotional,
              prayer:             row.mapped.prayerPrompt,
              nextStep:           row.mapped.actionStep,
              closing:            row.mapped.closingText,
              status:             row.mapped.status,
            },
            auth
          );
        }

        result.imported++;
      } catch (e: unknown) {
        result.failed++;
        result.errors.push({
          day:    row.mapped.day,
          title:  row.mapped.title || 'Untitled',
          reason: e instanceof Error ? e.message : 'Unknown error',
        });
      }

      setImportProgress(i + 1);
      await new Promise(r => setTimeout(r, 30)); // let UI breathe
    }

    // Count explicit skips
    result.skipped += parsedRows.filter(r => r.conflict && r.conflictResolution === 'skip').length;

    setImportResult(result);
    setScreen('results');
  };

  // ── Screen titles ──────────────────────────────────────────────────────────────
  const SCREEN_LABEL: Record<Screen, string> = {
    destination: 'Bulk Import — Destination',
    upload:      'Bulk Import — Add Content',
    mapping:     'Bulk Import — Map Fields',
    preview:     'Bulk Import — Preview',
    conflicts:   'Bulk Import — Resolve Conflicts',
    importing:   'Importing…',
    results:     'Import Complete',
  };

  const STEP_SCREENS: Screen[] = ['destination', 'upload', 'mapping', 'preview', 'importing'];
  const stepIdx = STEP_SCREENS.indexOf(screen);

  const primaryLabel = (): React.ReactNode => {
    if (screen === 'destination') return <><span>Continue</span><ArrowRight size={15} /></>;
    if (screen === 'upload') {
      if (parsing || loadingExisting) return <><Loader2 size={14} className="animate-spin" /><span>Parsing…</span></>;
      if (uploadMethod === 'emmaus') return <><span>Parse &amp; Preview</span><ArrowRight size={15} /></>;
      if (rawRows.length > 0) return <><span>Continue to Field Mapping</span><ArrowRight size={15} /></>;
      return <><span>Parse Content</span><ArrowRight size={15} /></>;
    }
    if (screen === 'mapping') {
      if (loadingExisting) return <><Loader2 size={14} className="animate-spin" /><span>Loading…</span></>;
      return <><span>Preview Import</span><ArrowRight size={15} /></>;
    }
    if (screen === 'preview')   return <><span>Continue</span><ArrowRight size={15} /></>;
    if (screen === 'conflicts') return <><span>Start Import</span><Sparkles size={15} /></>;
    return null;
  };

  const primaryDisabled = (() => {
    if (screen === 'destination') return !destReady || loadingMeta;
    if (screen === 'upload')      return parsing;
    if (screen === 'mapping')     return loadingExisting;
    if (screen === 'preview')     return parsedRows.length === 0;
    if (screen === 'conflicts')   return conflictRows.some(r => r.conflictResolution === null);
    return false;
  })();

  const handlePrimary = () => {
    if (screen === 'destination') { gotoUpload(); return; }
    if (screen === 'upload') {
      // Emmaus format: always re-parse + go directly to preview (no mapping screen)
      if (uploadMethod === 'emmaus') { void handleEmmausParse(); return; }
      if (rawRows.length > 0) { gotoMapping(); return; }
      // CSV/XLSX file already uploaded — nothing more to do on this screen
    }
    if (screen === 'mapping')    { gotoPreview(); return; }
    if (screen === 'preview')    { gotoConflictsOrImport(); return; }
    if (screen === 'conflicts')  { startImport(); return; }
  };

  const isTransition = screen === 'importing' || screen === 'results';

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className={`bg-white rounded-2xl shadow-2xl w-full flex flex-col max-h-[calc(100dvh-2rem)] transition-all ${
        screen === 'preview' || screen === 'conflicts' || screen === 'mapping' ? 'max-w-3xl' : 'max-w-lg'
      }`}>

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 flex items-center px-5 pt-5 pb-4 border-b border-gray-100">
          <button
            onClick={handleBack}
            disabled={isTransition}
            aria-label="Back"
            className="flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-900 transition-colors w-20 flex-shrink-0 disabled:opacity-30"
          >
            <ArrowLeft size={14} />
            {screen === 'destination' || screen === 'results' ? 'Close' : 'Back'}
          </button>
          <h2 className="flex-1 text-[15px] font-semibold text-gray-900 text-center truncate px-2">
            {SCREEN_LABEL[screen]}
          </h2>
          <div className="w-20 flex-shrink-0 flex justify-end">
            <button
              onClick={onClose}
              disabled={isTransition}
              aria-label="Close"
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-30"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Step progress pills ──────────────────────────────────────────────── */}
        {!isTransition && (
          <div className="flex-shrink-0 flex items-center gap-1.5 px-5 pt-3 pb-1">
            {STEP_SCREENS.map((s, i) => (
              <div
                key={s}
                className={`h-[3px] rounded-full flex-1 transition-all duration-300 ${
                  i < stepIdx ? 'bg-teal-500' :
                  i === stepIdx ? 'bg-teal-400' :
                  screen === 'conflicts' && s === 'preview' ? 'bg-teal-500' :
                  'bg-gray-200'
                }`}
              />
            ))}
          </div>
        )}

        {/* ── Scrollable content ───────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">

          {/* ══════════════════════════════════════════════════════════════════════
              Screen 1 — Destination
              ══════════════════════════════════════════════════════════════════════ */}
          {screen === 'destination' && (
            <div className="space-y-3">
              <p className="text-[13px] text-gray-500 mb-3">
                Where should the imported content be created?
              </p>

              {/* Daily Rhythm */}
              <button
                onClick={() => { setDestType('daily-rhythm'); setDestId(''); }}
                className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${
                  destType === 'daily-rhythm'
                    ? 'border-teal-500 bg-teal-50/80'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${destType === 'daily-rhythm' ? 'bg-teal-500' : 'bg-gray-100'}`}>
                    <Sun size={15} className={destType === 'daily-rhythm' ? 'text-white' : 'text-gray-500'} />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-gray-900">Daily Rhythm</p>
                    <p className="text-[12px] text-gray-500 mt-0.5">
                      {drJourney ? `Import steps into "${drJourney.title}"` : 'No Daily Rhythm journey found'}
                    </p>
                  </div>
                  {destType === 'daily-rhythm' && <CheckCircle2 size={16} className="ml-auto text-teal-500 flex-shrink-0" />}
                </div>
              </button>

              {/* Walk */}
              <button
                onClick={() => { setDestType('walk'); setDestId(''); }}
                className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${
                  destType === 'walk'
                    ? 'border-teal-500 bg-teal-50/80'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${destType === 'walk' ? 'bg-teal-500' : 'bg-gray-100'}`}>
                    <BookOpen size={15} className={destType === 'walk' ? 'text-white' : 'text-gray-500'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-gray-900">Walk / Journey</p>
                    <p className="text-[12px] text-gray-500 mt-0.5">Import steps into an existing walk</p>
                  </div>
                  {destType === 'walk' && <CheckCircle2 size={16} className="ml-auto text-teal-500 flex-shrink-0" />}
                </div>
                {destType === 'walk' && (
                  <div className="mt-3 pl-12">
                    <div className="relative">
                      <select
                        value={destId}
                        onChange={e => setDestId(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        className="w-full appearance-none pl-3 pr-8 py-2.5 text-[13px] text-gray-900 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
                      >
                        <option value="">— Select a walk —</option>
                        {walkJourneys.map(j => (
                          <option key={j.id} value={j.id}>{j.title}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                )}
              </button>

              {/* Daily Devotional */}
              <button
                onClick={() => { setDestType('devotional'); setDestId(''); }}
                className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${
                  destType === 'devotional'
                    ? 'border-teal-500 bg-teal-50/80'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${destType === 'devotional' ? 'bg-teal-500' : 'bg-gray-100'}`}>
                    <BookHeart size={15} className={destType === 'devotional' ? 'text-white' : 'text-gray-500'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-gray-900">Daily Devotional Series</p>
                    <p className="text-[12px] text-gray-500 mt-0.5">Import entries into an existing series</p>
                  </div>
                  {destType === 'devotional' && <CheckCircle2 size={16} className="ml-auto text-teal-500 flex-shrink-0" />}
                </div>
                {destType === 'devotional' && (
                  <div className="mt-3 pl-12">
                    <div className="relative">
                      <select
                        value={destId}
                        onChange={e => setDestId(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        className="w-full appearance-none pl-3 pr-8 py-2.5 text-[13px] text-gray-900 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
                      >
                        <option value="">— Select a series —</option>
                        {series.map(s => (
                          <option key={s.id} value={s.id}>{s.title}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                )}
              </button>

              {loadingMeta && (
                <p className="text-center text-[12px] text-gray-400 flex items-center justify-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> Loading walks and series…
                </p>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              Screen 2 — Upload / Paste
              ══════════════════════════════════════════════════════════════════════ */}
          {screen === 'upload' && (
            <div className="space-y-4">
              <p className="text-[13px] text-gray-500">
                Importing into: <span className="font-semibold text-gray-800">{destLabel}</span>
              </p>

              {/* Method selector */}
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'csv',    label: 'CSV File',       Icon: FileSpreadsheet },
                  { id: 'xlsx',   label: 'XLSX File',      Icon: FileSpreadsheet },
                  { id: 'emmaus', label: 'Emmaus Format',  Icon: AlignLeft       },
                ] as const).map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    onClick={() => { setUploadMethod(id); setParseError(''); setRawRows([]); setParsedRows([]); }}
                    className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1.5 transition-all ${
                      uploadMethod === id
                        ? 'border-teal-500 bg-teal-50/80'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <Icon size={18} className={uploadMethod === id ? 'text-teal-600' : 'text-gray-400'} />
                    <span className={`text-[12px] font-medium ${uploadMethod === id ? 'text-teal-700' : 'text-gray-600'}`}>{label}</span>
                  </button>
                ))}
              </div>

              {/* File upload */}
              {(uploadMethod === 'csv' || uploadMethod === 'xlsx') && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={uploadMethod === 'csv' ? '.csv,text/csv' : '.xlsx,.xls'}
                    className="hidden"
                    onChange={async e => {
                      const file = e.target.files?.[0];
                      if (file) await handleFile(file);
                    }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-300 hover:border-teal-400 hover:bg-teal-50/40 rounded-2xl p-8 flex flex-col items-center gap-3 transition-all"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                      <Upload size={20} className="text-gray-400" />
                    </div>
                    <div className="text-center">
                      <p className="text-[14px] font-medium text-gray-700">
                        Click to upload a .{uploadMethod} file
                      </p>
                      <p className="text-[12px] text-gray-400 mt-0.5">
                        First row must be a header row
                      </p>
                    </div>
                  </button>
                </div>
              )}

              {/* Emmaus format textarea */}
              {uploadMethod === 'emmaus' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">
                      Paste your Emmaus content below
                    </label>
                    <textarea
                      value={pasteText}
                      onChange={e => { setPasteText(e.target.value); setRawRows([]); setParsedRows([]); setParseError(''); }}
                      rows={12}
                      placeholder={
                        'Day: 10\nTitle: Faith That Trusts Jesus\nScripture Reference: John 4:43\u201354\n\nGreeting:\nGood morning. I\u2019m glad you\u2019re here.\n\nReflection:\nA royal official came to Jesus because his son was dying.\n\nPrayer:\nFather, help me to trust You. Amen.\n\nYour Next Step:\nThink of an area where you need to trust God today.\n\nClosing:\nTomorrow we\u2019ll discover what happens when Jesus meets someone who has lost hope.'
                      }
                      className="w-full px-3 py-2.5 text-[12px] font-mono text-gray-800 placeholder:text-gray-300 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 resize-y leading-relaxed"
                    />
                  </div>

                  {/* Format hint */}
                  <div className="p-3 bg-teal-50 border border-teal-100 rounded-xl space-y-1">
                    <p className="text-[11px] font-semibold text-teal-700">Emmaus format — recognised labels</p>
                    <div className="grid grid-cols-2 gap-x-4 text-[11px] text-teal-600 leading-relaxed">
                      <div>
                        <span className="font-medium">Day / Step:</span> day number<br />
                        <span className="font-medium">Title:</span> step title<br />
                        <span className="font-medium">Scripture Reference:</span> passage<br />
                        <span className="font-medium">Greeting / Intro:</span> opening
                      </div>
                      <div>
                        <span className="font-medium">Reflection / Teaching:</span> body<br />
                        <span className="font-medium">Prayer:</span> prayer text<br />
                        <span className="font-medium">Your Next Step:</span> action<br />
                        <span className="font-medium">Closing:</span> send-off
                      </div>
                    </div>
                    <p className="text-[10px] text-teal-500 mt-1">
                      Paste multiple days together &mdash; a new item begins whenever a new Day: or Step: line appears.
                    </p>
                  </div>
                </div>
              )}

              {/* Parse success — CSV/XLSX only (emmaus goes straight to preview) */}
              {uploadMethod !== 'emmaus' && rawRows.length > 0 && !parseError && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                  <CheckCircle2 size={15} className="text-green-600 flex-shrink-0" />
                  <p className="text-[13px] text-green-800 font-medium">
                    {rawRows.length} row{rawRows.length !== 1 ? 's' : ''} detected across {headers.length} column{headers.length !== 1 ? 's' : ''}.
                    Click &ldquo;Continue&rdquo; to map fields.
                  </p>
                </div>
              )}

              {/* Error */}
              {parseError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[12px] text-red-700">{parseError}</p>
                </div>
              )}

              {/* Column hint — CSV/XLSX only */}
              {uploadMethod !== 'emmaus' && (
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-[11px] text-gray-500 font-medium mb-1">Supported column names (auto-detected):</p>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Day / Step, Title, Scripture / Verse, Greeting / Intro, Reflection / Devotional,
                    Prayer, Next Step / Action, Closing, Status
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              Screen 3 — Map Fields
              ══════════════════════════════════════════════════════════════════════ */}
          {screen === 'mapping' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[13px] text-gray-500">
                  {mappings.filter(m => m.canonicalField).length} of {mappings.length} column{mappings.length !== 1 ? 's' : ''} auto-detected.
                  Adjust any that are wrong.
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400">Default status:</span>
                  <select
                    value={defaultStatus}
                    onChange={e => setDefaultStatus(e.target.value as 'Draft' | 'Published')}
                    className="text-[12px] text-gray-700 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-300"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Published">Published</option>
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-3 py-2.5 font-semibold text-gray-600 w-[30%]">CSV Column</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-gray-600 w-[35%]">Maps To</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Sample Values</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((m, i) => (
                      <tr key={m.sourceColumn} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-3 py-2 font-medium text-gray-800">
                          <div className="flex items-center gap-1.5">
                            {m.canonicalField && m.autoDetected && (
                              <CheckCircle2 size={11} className="text-green-500 flex-shrink-0" />
                            )}
                            <span className="truncate">{m.sourceColumn}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="relative">
                            <select
                              value={m.canonicalField ?? ''}
                              onChange={e => {
                                const val = e.target.value as CanonicalField | '';
                                setMappings(prev => {
                                  const next = [...prev];
                                  // Clear any other column already using this canonical field
                                  if (val) {
                                    for (let j = 0; j < next.length; j++) {
                                      if (j !== i && next[j].canonicalField === val) {
                                        next[j] = { ...next[j], canonicalField: null, autoDetected: false };
                                      }
                                    }
                                  }
                                  next[i] = { ...next[i], canonicalField: val || null, autoDetected: false };
                                  return next;
                                });
                              }}
                              className="w-full appearance-none pl-2 pr-6 py-1 text-[12px] text-gray-800 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-300 bg-white"
                            >
                              <option value="">— Skip this column —</option>
                              {ALL_CANONICAL_FIELDS.map(f => (
                                <option key={f} value={f}>{CANONICAL_FIELD_LABELS[f]}</option>
                              ))}
                            </select>
                            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-gray-500 max-w-0">
                          <p className="truncate">{m.sampleValues.join(' · ') || '—'}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Warn if day column not mapped */}
              {!mappings.some(m => m.canonicalField === 'day') && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
                  <p className="text-[12px] text-amber-800">
                    No column is mapped to <strong>Day / Step Number</strong>. Every row will receive day 0 (invalid).
                    Map a column before continuing.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              Screen 4 — Preview
              ══════════════════════════════════════════════════════════════════════ */}
          {screen === 'preview' && (
            <div className="space-y-3">
              {/* Summary bar */}
              <div className="flex items-center gap-3 flex-wrap">
                <Pill label={`${parsedRows.length} rows`} variant="gray" />
                {warningRows.length > 0 && (
                  <Pill label={`${warningRows.length} warning${warningRows.length !== 1 ? 's' : ''}`} variant="amber" />
                )}
                {conflictRows.length > 0 && (
                  <Pill label={`${conflictRows.length} conflict${conflictRows.length !== 1 ? 's' : ''}`} variant="red" />
                )}
                {warningRows.length === 0 && conflictRows.length === 0 && (
                  <Pill label="Ready to import" variant="green" />
                )}
              </div>

              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-3 py-2.5 font-semibold text-gray-600 w-12">Day</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Title</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Scripture</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-gray-600 w-20">Status</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-gray-600 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row, i) => (
                      <React.Fragment key={row.index}>
                        <tr
                          onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                          className={`border-b border-gray-100 last:border-0 cursor-pointer transition-colors ${
                            row.conflict    ? 'bg-red-50/60 hover:bg-red-50' :
                            row.warnings.length > 0 ? 'bg-amber-50/60 hover:bg-amber-50' :
                            'hover:bg-gray-50'
                          }`}
                        >
                          <td className="px-3 py-2.5 font-semibold text-gray-800">
                            {row.mapped.day || <span className="text-red-400">!</span>}
                          </td>
                          <td className="px-3 py-2.5 text-gray-800 max-w-0">
                            <p className="truncate">{row.mapped.title || <span className="text-gray-400 italic">Untitled</span>}</p>
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 max-w-0">
                            <p className="truncate">{row.mapped.scripture || '—'}</p>
                          </td>
                          <td className="px-3 py-2.5">
                            <Pill
                              label={row.mapped.status}
                              variant={row.mapped.status === 'Published' ? 'green' : 'gray'}
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1">
                              {row.conflict && <AlertTriangle size={12} className="text-red-400" />}
                              {!row.conflict && row.warnings.length > 0 && <AlertTriangle size={12} className="text-amber-400" />}
                              <ChevronRight
                                size={12}
                                className={`text-gray-300 transition-transform ${expandedRow === i ? 'rotate-90' : ''}`}
                              />
                            </div>
                          </td>
                        </tr>

                        {/* Expanded detail */}
                        {expandedRow === i && (
                          <tr className="bg-gray-50/80 border-b border-gray-100">
                            <td colSpan={5} className="px-4 py-3">
                              <div className="grid grid-cols-2 gap-2 text-[11px]">
                                {[
                                  ['Greeting / Intro', row.mapped.mentorIntro],
                                  ['Devotional',       row.mapped.devotional],
                                  ['Prayer',           row.mapped.prayerPrompt],
                                  ['Next Step',        row.mapped.actionStep],
                                  ['Closing',          row.mapped.closingText],
                                  ['Memory Verse',     row.mapped.memoryVerse],
                                ].map(([label, value]) => value ? (
                                  <div key={label}>
                                    <p className="font-semibold text-gray-500 mb-0.5">{label}</p>
                                    <p className="text-gray-700 line-clamp-3">{value}</p>
                                  </div>
                                ) : null)}
                              </div>
                              {row.conflict && (
                                <div className="mt-2 p-2 bg-red-50 rounded-lg border border-red-100">
                                  <p className="text-[11px] text-red-700 font-medium">
                                    ⚠ Day {row.mapped.day} already exists in the destination. Resolve in the next step.
                                  </p>
                                </div>
                              )}
                              {row.warnings.map((w, wi) => (
                                <div key={wi} className="mt-1 p-2 bg-amber-50 rounded-lg border border-amber-100">
                                  <p className="text-[11px] text-amber-700">{w}</p>
                                </div>
                              ))}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              Screen 5 — Conflicts
              ══════════════════════════════════════════════════════════════════════ */}
          {screen === 'conflicts' && (
            <div className="space-y-4">
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-[13px] text-red-800">
                  <strong>{conflictRows.length} day{conflictRows.length !== 1 ? 's' : ''}</strong> already exist in the destination.
                  Choose how to handle each conflict — or apply one resolution to all.
                </p>
              </div>

              {/* Apply to all */}
              <div className="flex items-center gap-3">
                <span className="text-[12px] font-semibold text-gray-700 whitespace-nowrap">Apply to all conflicts:</span>
                <div className="flex gap-2">
                  {([
                    { id: 'skip',     label: 'Skip',              Icon: SkipForward },
                    { id: 'replace',  label: 'Replace',           Icon: RefreshCw   },
                    { id: 'new-draft',label: 'Import at new day', Icon: FilePlus2   },
                  ] as const).map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      onClick={() => {
                        setApplyToAll(id);
                        applyConflictToAll(id);
                      }}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] font-medium transition-all ${
                        applyToAll === id
                          ? 'border-teal-500 bg-teal-50 text-teal-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <Icon size={11} /> {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Per-row conflict cards */}
              <div className="space-y-2">
                {conflictRows.map(row => (
                  <div
                    key={row.index}
                    className="p-3 border border-red-200 rounded-xl bg-red-50/40"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[13px] font-semibold text-gray-800">
                        Day {row.mapped.day} — {row.mapped.title || 'Untitled'}
                      </p>
                      {row.mapped.scripture && (
                        <span className="text-[11px] text-gray-500">{row.mapped.scripture}</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {([
                        { id: 'skip',     label: 'Skip existing',        desc: 'Don\'t import this row', Icon: SkipForward },
                        { id: 'replace',  label: 'Replace',              desc: 'Overwrite with new data', Icon: RefreshCw },
                        { id: 'new-draft',label: 'Import at new day',    desc: 'Add at next available day', Icon: FilePlus2 },
                      ] as const).map(({ id, label, desc, Icon }) => (
                        <button
                          key={id}
                          onClick={() =>
                            setParsedRows(rows => rows.map(r =>
                              r.index === row.index ? { ...r, conflictResolution: id } : r
                            ))
                          }
                          className={`flex-1 flex flex-col items-center gap-1 p-2 rounded-lg border text-[11px] transition-all ${
                            row.conflictResolution === id
                              ? 'border-teal-500 bg-teal-50 text-teal-700'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <Icon size={13} />
                          <span className="font-medium">{label}</span>
                          <span className="text-gray-400">{desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              Screen 6 — Importing
              ══════════════════════════════════════════════════════════════════════ */}
          {screen === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12 gap-6 text-center">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-teal-50 flex items-center justify-center">
                  <Upload size={26} className="text-teal-500" />
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center">
                  <Loader2 size={11} className="animate-spin text-white" />
                </div>
              </div>
              <div>
                <p className="text-[15px] font-semibold text-gray-900 mb-1">Importing content…</p>
                <p className="text-[13px] text-gray-500">{importCurrent}</p>
              </div>
              <div className="w-full max-w-xs">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-full transition-all duration-300"
                    style={{ width: importTotal > 0 ? `${(importProgress / importTotal) * 100}%` : '0%' }}
                  />
                </div>
                <p className="text-[12px] text-gray-400 mt-1.5">
                  {importProgress} of {importTotal}
                </p>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              Screen 7 — Results
              ══════════════════════════════════════════════════════════════════════ */}
          {screen === 'results' && importResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 justify-center py-2">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${importResult.failed === 0 ? 'bg-green-50' : 'bg-amber-50'}`}>
                  {importResult.failed === 0
                    ? <CheckCircle2 size={28} className="text-green-500" />
                    : <AlertTriangle size={28} className="text-amber-500" />}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 bg-green-50 border border-green-100 rounded-xl text-center">
                  <p className="text-2xl font-bold text-green-700">{importResult.imported}</p>
                  <p className="text-[12px] text-green-600 mt-0.5">Imported</p>
                </div>
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-center">
                  <p className="text-2xl font-bold text-gray-700">{importResult.skipped}</p>
                  <p className="text-[12px] text-gray-500 mt-0.5">Skipped</p>
                </div>
                <div className={`p-4 rounded-xl text-center border ${importResult.failed > 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-200'}`}>
                  <p className={`text-2xl font-bold ${importResult.failed > 0 ? 'text-red-700' : 'text-gray-700'}`}>{importResult.failed}</p>
                  <p className={`text-[12px] mt-0.5 ${importResult.failed > 0 ? 'text-red-500' : 'text-gray-500'}`}>Failed</p>
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
                <p className="text-[12px] text-blue-700">
                  All imported content is saved as <strong>{defaultStatus}</strong> and is ready to edit, reorder, and publish from the Content Studio.
                </p>
              </div>

              {importResult.errors.length > 0 && (
                <div>
                  <p className="text-[13px] font-semibold text-gray-800 mb-2">Failed items:</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {importResult.errors.map((err, i) => (
                      <div key={i} className="p-2.5 bg-red-50 border border-red-100 rounded-lg">
                        <p className="text-[12px] font-medium text-red-800">Day {err.day} — {err.title}</p>
                        <p className="text-[11px] text-red-600 mt-0.5">{err.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────────── */}
        {!isTransition && screen !== 'results' && (
          <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100">
            <button
              onClick={handlePrimary}
              disabled={primaryDisabled}
              className="w-full h-12 rounded-2xl text-[15px] font-semibold bg-teal-600 hover:bg-teal-700 text-white transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {primaryLabel()}
            </button>
          </div>
        )}

        {screen === 'results' && (
          <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100">
            <button
              onClick={onClose}
              className="w-full h-12 rounded-2xl text-[15px] font-semibold bg-gray-900 hover:bg-gray-800 text-white transition-all"
            >
              Done — Back to Content Studio
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
