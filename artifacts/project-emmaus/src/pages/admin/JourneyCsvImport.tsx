/**
 * JourneyCsvImport — modal for importing journeys from a CSV file.
 *
 * Flow:
 *  1. User selects a .csv file
 *  2. Client-side pre-validation shows errors immediately (no round-trip)
 *  3. User can fix issues and re-upload, or proceed with valid rows
 *  4. On confirm → POST /api/journeys/import → shows results
 */

import React, { useRef, useState, useCallback } from 'react';
import { Upload, FileText, AlertTriangle, CheckCircle, X, ChevronDown, ChevronUp } from 'lucide-react';
import { importJourneys } from '@/lib/journeys-api';
import type { ImportResult, ImportValidationError } from '@/lib/journeys-api';
import { useAuth } from '@/contexts/AuthContext';

// ─── CSV_HEADERS (must match server) ─────────────────────────────────────────

const CSV_HEADERS = [
  'journey_title', 'journey_description', 'journey_type', 'journey_status', 'journey_tags',
  'step_number', 'step_title', 'mentor_intro', 'scripture', 'translation', 'memory_verse',
  'teaching', 'reflection_question', 'prayer', 'todays_response', 'ask_emmaus_prompt',
  'sermon_reference', 'completion_text', 'estimated_time_minutes',
] as const;

// ─── Client-side parse (mirrors server logic) ─────────────────────────────────

function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\r' && text[i + 1] === '\n') { row.push(field); field = ''; rows.push(row); row = []; i++; }
      else if (ch === '\n' || ch === '\r') { row.push(field); field = ''; rows.push(row); row = []; }
      else { field += ch; }
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  while (rows.length && rows[rows.length - 1].every(c => c.trim() === '')) rows.pop();
  return rows;
}

interface PreviewJourney { title: string; stepCount: number; description?: string }
interface ClientValidation {
  errors: ImportValidationError[];
  warnings: ImportValidationError[];
  journeys: PreviewJourney[];
  totalRows: number;
}

function validateLocally(csvText: string): ClientValidation {
  const errors: ImportValidationError[] = [];
  const warnings: ImportValidationError[] = [];
  const rawRows = parseCsvText(csvText.trim());
  if (rawRows.length < 2) {
    return { errors: [{ row: 1, column: 'file', message: 'No data rows found' }], warnings: [], journeys: [], totalRows: 0 };
  }
  const headers = rawRows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const known = new Set(CSV_HEADERS as readonly string[]);
  headers.forEach(h => { if (!known.has(h)) warnings.push({ row: 0, column: h, message: `Unknown column "${h}"` }); });

  const journeyMap = new Map<string, PreviewJourney>();
  rawRows.slice(1).forEach((cells, idx) => {
    const row = idx + 2;
    const get = (col: string) => cells[headers.indexOf(col)]?.trim() ?? '';
    const title = get('journey_title');
    const stepNum = get('step_number');
    const teaching = get('teaching');
    const stepTitle = get('step_title');

    if (!title) errors.push({ row, column: 'journey_title', message: 'Journey title is required' });
    if (!stepNum) errors.push({ row, column: 'step_number', message: 'Step number is required' });
    else if (isNaN(parseInt(stepNum, 10)) || parseInt(stepNum, 10) < 1) errors.push({ row, column: 'step_number', message: 'Must be a positive integer' });
    if (!stepTitle) errors.push({ row, column: 'step_title', message: 'Step title is required' });
    if (!teaching) errors.push({ row, column: 'teaching', message: 'Teaching content is required' });

    if (title && !journeyMap.has(title)) {
      journeyMap.set(title, { title, stepCount: 0, description: get('journey_description') });
    }
    if (title && journeyMap.has(title)) {
      journeyMap.get(title)!.stepCount++;
    }
  });

  return {
    errors,
    warnings,
    journeys: Array.from(journeyMap.values()),
    totalRows: rawRows.length - 1,
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onImported: (journeyIds: string[]) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function JourneyCsvImport({ onClose, onImported }: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [validation, setValidation] = useState<ClientValidation | null>(null);
  const [showErrors, setShowErrors] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      setImportError('Please select a .csv file');
      return;
    }
    setFileName(file.name);
    setResult(null);
    setImportError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvText(text);
      setValidation(validateLocally(text));
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleImport = async () => {
    if (!csvText || importing) return;
    setImporting(true);
    setImportError('');
    try {
      const res = await importJourneys(csvText, user?.id);
      setResult(res);
      onImported(res.journeyIds);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const blockingErrors = validation?.errors ?? [];
  const canImport = csvText && blockingErrors.length === 0 && !result;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Import Journeys from CSV</h2>
            <p className="text-xs text-gray-400 mt-0.5">Imported journeys are saved as Draft and must be reviewed before publishing.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* Drop zone */}
          {!result && (
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-[#7C3AED]/40 hover:bg-violet-50/30 transition-colors"
            >
              <Upload size={24} className="mx-auto text-gray-300 mb-2" />
              {fileName ? (
                <div className="flex items-center justify-center gap-2 text-sm font-medium text-gray-700">
                  <FileText size={14} /> {fileName}
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-500">Drop a <span className="font-medium">.csv</span> file here, or click to browse</p>
                  <p className="text-xs text-gray-400 mt-1">Supports single or multi-journey files</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          )}

          {/* Preview after file selected */}
          {validation && !result && (
            <>
              {/* Journey preview */}
              {validation.journeys.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    {validation.journeys.length} journey{validation.journeys.length !== 1 ? 's' : ''} · {validation.totalRows} rows
                  </p>
                  <div className="space-y-1">
                    {validation.journeys.slice(0, 8).map(j => (
                      <div key={j.title} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 font-medium truncate max-w-xs">{j.title}</span>
                        <span className="text-gray-400 text-xs ml-2 flex-shrink-0">{j.stepCount} step{j.stepCount !== 1 ? 's' : ''}</span>
                      </div>
                    ))}
                    {validation.journeys.length > 8 && (
                      <p className="text-xs text-gray-400">+{validation.journeys.length - 8} more…</p>
                    )}
                  </div>
                </div>
              )}

              {/* Errors */}
              {blockingErrors.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-xl overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                    onClick={() => setShowErrors(v => !v)}
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={14} className="text-red-500" />
                      <span className="text-sm font-medium text-red-700">{blockingErrors.length} error{blockingErrors.length !== 1 ? 's' : ''} — fix before importing</span>
                    </div>
                    {showErrors ? <ChevronUp size={14} className="text-red-400" /> : <ChevronDown size={14} className="text-red-400" />}
                  </button>
                  {showErrors && (
                    <div className="border-t border-red-100 divide-y divide-red-50 max-h-48 overflow-y-auto">
                      {blockingErrors.map((e, i) => (
                        <div key={i} className="px-4 py-2 flex gap-3 text-xs">
                          <span className="text-red-400 font-mono flex-shrink-0 w-12">Row {e.row}</span>
                          <span className="text-red-600 font-medium flex-shrink-0 w-28 capitalize">{e.column.replace(/_/g, ' ')}</span>
                          <span className="text-red-700">{e.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Warnings */}
              {validation.warnings.length > 0 && blockingErrors.length === 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                  <p className="text-xs font-medium text-amber-700 mb-1 flex items-center gap-1.5">
                    <AlertTriangle size={12} /> {validation.warnings.length} warning{validation.warnings.length !== 1 ? 's' : ''} (will be ignored)
                  </p>
                  {validation.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-600">{w.message}</p>
                  ))}
                </div>
              )}

              {/* Ready */}
              {blockingErrors.length === 0 && validation.journeys.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3">
                  <CheckCircle size={14} className="text-emerald-500" />
                  Ready to import {validation.journeys.length} journey{validation.journeys.length !== 1 ? 's' : ''} ({validation.totalRows} steps)
                </div>
              )}
            </>
          )}

          {/* Result */}
          {result && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-5 text-center">
              <CheckCircle size={28} className="mx-auto text-emerald-500 mb-2" />
              <p className="text-base font-semibold text-emerald-800">Import complete</p>
              <p className="text-sm text-emerald-600 mt-1">
                {result.imported} journey{result.imported !== 1 ? 's' : ''} imported successfully
              </p>
              {result.warnings?.length > 0 && (
                <p className="text-xs text-emerald-500 mt-1">{result.warnings.length} warning{result.warnings.length !== 1 ? 's' : ''}</p>
              )}
            </div>
          )}

          {importError && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
              {importError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between gap-3">
          <a
            href="data:text/plain;charset=utf-8,journey_title%2Cjourney_description%2Cjourney_type%2Cjourney_status%2Cjourney_tags%2Cstep_number%2Cstep_title%2Cmentor_intro%2Cscripture%2Ctranslation%2Cmemory_verse%2Cteaching%2Creflection_question%2Cprayer%2Ctodays_response%2Cask_emmaus_prompt%2Csermon_reference%2Ccompletion_text%2Cestimated_time_minutes%0AMy%20Journey%2CA%20short%20description%2Ccore%2CDraft%2Cprayer%7Cfaith%2C1%2CDay%20One%20Title%2CMentor%20intro%20text%2CJohn%201%3A14%2CNIV%2C%2CTeaching%20content%20goes%20here%2CReflection%20question%3F%2CPrayer%20text%2CToday%27s%20response%2C%2C%2C%2C5"
            download="journey-import-template.csv"
            className="text-xs text-[#7C3AED] hover:underline"
          >
            Download template
          </a>
          <div className="flex items-center gap-2">
            <button
              onClick={result ? onClose : () => { setCsvText(''); setFileName(''); setValidation(null); setResult(null); setImportError(''); }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              {result ? 'Close' : 'Cancel'}
            </button>
            {!result && (
              <button
                onClick={handleImport}
                disabled={!canImport || importing}
                className="px-4 py-2 text-sm font-medium bg-[#7C3AED] text-white rounded-lg hover:bg-[#6D28D9] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {importing ? 'Importing…' : `Import ${validation?.journeys.length ? validation.journeys.length + ' journey' + (validation.journeys.length !== 1 ? 's' : '') : ''}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
