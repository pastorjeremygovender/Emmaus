/**
 * DevotionalSeriesEditor — edit a single series and manage its entries.
 *
 * Left panel:  series metadata (title, type, status) + publish toggle
 * Centre:      entry list with Add Entry button
 * Navigate to DevotionalEntryEditor for per-entry editing.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, Plus, BookHeart, ChevronRight, Loader2, Check,
  Eye, EyeOff, Pencil, Trash2,
} from 'lucide-react';
import {
  getSeriesWithEntries,
  updateSeries,
  saveEntry,
  deleteEntry,
  type SeriesWithEntries,
  type DevotionalEntry,
} from '@/lib/devotionals-api';
import { StatusBadge, Field } from '../shared';

interface Props {
  seriesId: string;
  onBack: () => void;
  onEditEntry: (seriesId: string, day: number) => void;
}

const SERIES_TYPES = [
  { value: 'general', label: 'General' },
  { value: 'psalms', label: 'Psalms' },
  { value: 'proverbs', label: 'Proverbs' },
  { value: 'seasonal', label: 'Seasonal' },
  { value: 'church-specific', label: 'Church Series' },
];

export default function DevotionalSeriesEditor({ seriesId, onBack, onEditEntry }: Props) {
  const [data, setData] = useState<SeriesWithEntries | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  // Editable fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [seriesType, setSeriesType] = useState('general');
  const [status, setStatus] = useState('Draft');

  const load = useCallback(async () => {
    try {
      const d = await getSeriesWithEntries(seriesId);
      setData(d);
      setTitle(d.title);
      setDescription(d.description ?? '');
      setSeriesType(d.seriesType);
      setStatus(d.status);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [seriesId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSeries(seriesId, { title, description, seriesType, status });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      load();
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    const next = status === 'Published' ? 'Draft' : 'Published';
    setStatus(next);
    try {
      await updateSeries(seriesId, { status: next });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      load();
    } catch {
      setSaveStatus('error');
    }
  };

  const handleAddEntry = async () => {
    if (!data) return;
    const nextDay = (data.entries.length > 0
      ? Math.max(...data.entries.map(e => e.dayNumber))
      : 0) + 1;
    await saveEntry(seriesId, nextDay, { title: `Day ${nextDay}`, status: 'Draft' });
    onEditEntry(seriesId, nextDay);
  };

  const handleDeleteEntry = async () => {
    if (deleteTarget === null) return;
    await deleteEntry(seriesId, deleteTarget);
    setDeleteTarget(null);
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading series…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Series not found.
      </div>
    );
  }

  const publishedCount = data.entries.filter(e => e.status === 'Published').length;

  return (
    <div className="flex h-full min-h-0 bg-gray-50">

      {/* ── Settings panel ────────────────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        {/* Back */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={13} /> Back to Devotionals
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Series icon */}
          <div className="flex items-center gap-3 mb-1">
            <div className="w-11 h-11 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
              <BookHeart size={20} className="text-teal-600" />
            </div>
            <div>
              <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Series</p>
              <p className="text-sm font-semibold text-gray-900 leading-tight mt-0.5">{data.title}</p>
            </div>
          </div>

          <Field label="Title">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none"
            />
          </Field>

          <Field label="Series Type">
            <select
              value={seriesType}
              onChange={e => setSeriesType(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
            >
              {SERIES_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {saving ? <><Loader2 size={12} className="animate-spin" /> Saving…</> :
             saveStatus === 'saved' ? <><Check size={12} /> Saved</> :
             saveStatus === 'error' ? 'Error saving' : 'Save Changes'}
          </button>

          {/* Publish toggle */}
          <div className="pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-medium text-gray-800">
                  {status === 'Published' ? 'Published' : 'Draft'}
                </p>
                <p className="text-[11px] text-gray-400">
                  {publishedCount} of {data.entries.length} entries published
                </p>
              </div>
              <button
                onClick={handleToggleStatus}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  status === 'Published'
                    ? 'bg-teal-50 text-teal-700 hover:bg-teal-100'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {status === 'Published' ? <><EyeOff size={12} /> Unpublish</> : <><Eye size={12} /> Publish</>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Entries list ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900">
            Entries
            <span className="ml-2 text-sm font-normal text-gray-400">
              {data.entries.length} day{data.entries.length !== 1 ? 's' : ''}
            </span>
          </h3>
          <button
            onClick={handleAddEntry}
            className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700"
          >
            <Plus size={13} /> Add Day
          </button>
        </div>

        {data.entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center">
            <p className="text-sm text-gray-400">No entries yet. Add your first day.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.entries.map(entry => (
              <div
                key={entry.id}
                className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-gray-300 transition-colors cursor-pointer"
                onClick={() => onEditEntry(seriesId, entry.dayNumber)}
              >
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0 text-[12px] font-semibold text-gray-500 border border-gray-100">
                  {entry.dayNumber}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-gray-900 truncate">
                    {entry.title || <span className="text-gray-400">Untitled</span>}
                  </p>
                  {entry.scriptureReference && (
                    <p className="text-[12px] text-gray-400 mt-0.5">{entry.scriptureReference}</p>
                  )}
                </div>
                <StatusBadge status={entry.status} />
                <button
                  onClick={e => { e.stopPropagation(); onEditEntry(seriesId, entry.dayNumber); }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setDeleteTarget(entry.dayNumber); }}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 size={13} />
                </button>
                <ChevronRight size={14} className="text-gray-300" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirm */}
      {deleteTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete Day {deleteTarget}?</h3>
            <p className="text-sm text-gray-500 mb-4">This entry and its content will be permanently removed.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteEntry}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
