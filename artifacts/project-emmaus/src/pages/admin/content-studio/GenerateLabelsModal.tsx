/**
 * GenerateLabelsModal — bulk-generate display labels for a date-based reading plan.
 *
 * Used by both DailyRhythmStudio (journey steps) and DevotionalSeriesEditor (devotional entries).
 * The caller provides an `onApply` callback that sends the request; this component handles
 * the date picker, format selector, preview, and overwrite checkbox.
 */

import React, { useState, useMemo } from 'react';
import { Calendar, Loader2, Check, X } from 'lucide-react';

// ─── Date-label formatter (mirrors the server-side helper) ────────────────────

const MONTHS_LONG = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDateLabel(date: Date, fmt: string): string {
  const d = date.getUTCDate();
  const m = date.getUTCMonth();
  const y = date.getUTCFullYear();
  return fmt
    .replace('MMMM', MONTHS_LONG[m])
    .replace('MMM',  MONTHS_SHORT[m])
    .replace('YYYY', String(y))
    .replace('DD',   String(d).padStart(2, '0'))
    .replace('MM',   String(m + 1).padStart(2, '0'))
    .replace('D',    String(d))
    .replace('M',    String(m + 1));
}

// ─── Format options ───────────────────────────────────────────────────────────

const FORMAT_OPTIONS = [
  { value: 'D MMMM',    label: 'D Month  (1 January)' },
  { value: 'MMMM D',    label: 'Month D  (January 1)' },
  { value: 'D MMM',     label: 'D Mon    (1 Jan)' },
  { value: 'MMM D',     label: 'Mon D    (Jan 1)' },
  { value: 'D MMM YYYY',label: 'D Mon YYYY (1 Jan 2026)' },
  { value: 'DD/MM',     label: 'DD/MM   (01/01)' },
  { value: 'D/M',       label: 'D/M     (1/1)' },
] as const;

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /** Total number of steps / entries (used for preview of the last label). */
  itemCount: number;
  /** Called when the admin confirms. Returns the number of items updated. */
  onApply: (opts: {
    startDate: string;
    format: string;
    overwriteExisting: boolean;
  }) => Promise<number>;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GenerateLabelsModal({ itemCount, onApply, onClose }: Props) {
  const today = new Date();
  const todayIso = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;

  const [startDate,          setStartDate]          = useState(todayIso);
  const [format,             setFormat]             = useState<string>('D MMMM');
  const [overwriteExisting,  setOverwriteExisting]  = useState(false);
  const [applying,           setApplying]           = useState(false);
  const [done,               setDone]               = useState<number | null>(null);
  const [error,              setError]              = useState<string | null>(null);

  // ── Live preview ─────────────────────────────────────────────────────────────

  const preview = useMemo(() => {
    if (!startDate || itemCount === 0) return null;
    const start = new Date(startDate + 'T00:00:00Z');
    if (isNaN(start.getTime())) return null;

    const first = formatDateLabel(start, format);

    const lastDate = new Date(start);
    lastDate.setUTCDate(lastDate.getUTCDate() + itemCount - 1);
    const last = formatDateLabel(lastDate, format);

    return { first, last };
  }, [startDate, format, itemCount]);

  // ── Apply ─────────────────────────────────────────────────────────────────────

  const handleApply = async () => {
    if (!startDate) return;
    setApplying(true);
    setError(null);
    try {
      const updated = await onApply({ startDate, format, overwriteExisting });
      setDone(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setApplying(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
              <Calendar size={17} className="text-teal-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-gray-900 leading-tight">
                Generate Display Labels
              </h2>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {itemCount} step{itemCount !== 1 ? 's' : ''} will receive labels
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg flex-shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        {/* Start date */}
        <div className="space-y-1.5">
          <label className="block text-[12px] font-medium text-gray-700">
            Start date
            <span className="ml-1 font-normal text-gray-400">(assigned to step 1)</span>
          </label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
          />
        </div>

        {/* Format */}
        <div className="space-y-1.5">
          <label className="block text-[12px] font-medium text-gray-700">Format</label>
          <select
            value={format}
            onChange={e => setFormat(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
          >
            {FORMAT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Preview */}
        {preview && (
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 space-y-1">
            <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Preview</p>
            <div className="flex items-center justify-between gap-2">
              <div className="text-center">
                <p className="text-[10px] text-gray-400">Step 1</p>
                <p className="text-sm font-semibold text-teal-700 mt-0.5">{preview.first}</p>
              </div>
              {itemCount > 1 && (
                <>
                  <div className="flex-1 border-t border-dashed border-gray-300" />
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400">Step {itemCount}</p>
                    <p className="text-sm font-semibold text-teal-700 mt-0.5">{preview.last}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Overwrite checkbox */}
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={overwriteExisting}
            onChange={e => setOverwriteExisting(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          <div>
            <span className="text-[13px] text-gray-700 font-medium">Overwrite existing labels</span>
            <p className="text-[11px] text-gray-400 mt-0.5">
              When unchecked, steps that already have a custom label are left unchanged.
            </p>
          </div>
        </label>

        {/* Error */}
        {error && (
          <p className="text-[12px] text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
        )}

        {/* Done confirmation */}
        {done !== null && (
          <div className="flex items-center gap-2 text-[13px] text-teal-700 bg-teal-50 rounded-xl px-3 py-2.5">
            <Check size={14} className="flex-shrink-0" />
            {done} label{done !== 1 ? 's' : ''} applied successfully.
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {done !== null ? 'Close' : 'Cancel'}
          </button>
          {done === null && (
            <button
              onClick={handleApply}
              disabled={applying || !startDate || itemCount === 0}
              className="flex-1 px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors"
            >
              {applying
                ? <><Loader2 size={13} className="animate-spin" /> Applying…</>
                : 'Apply Labels'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
