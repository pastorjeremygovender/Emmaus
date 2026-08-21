/**
 * DevotionalSeriesDetailView — Series metadata header + scrollable entry list.
 *
 * Used inside the right-side drawer panel in ContentStudio so admins can
 * see and open entries without navigating away from the list.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  BookHeart, CheckCircle2, FileText, Loader2, Pencil, Plus, ChevronRight,
} from 'lucide-react';
import {
  getSeriesWithEntries,
  saveEntry,
  type SeriesWithEntries,
  type DevotionalEntry,
} from '@/lib/devotionals-api';
import { StatusBadge, AdminBtn } from '../shared';
import { ReorderButtons } from './ContentStudioListPage';
import { useAuth } from '@/contexts/AuthContext';

const TYPE_LABELS: Record<string, string> = {
  general:         'General',
  psalms:          'Psalms',
  proverbs:        'Proverbs',
  seasonal:        'Seasonal',
  'church-specific': 'Church Series',
};

const STATUS_COLOR: Record<string, string> = {
  Draft:     'bg-gray-100 text-gray-600',
  Published: 'bg-green-100 text-green-700',
  Archived:  'bg-red-50 text-red-600',
};

interface Props {
  seriesId: string;
  onBack: () => void;
  onEditSeries: (seriesId: string) => void;
  onNewEntry: (seriesId: string) => void;
  onEditEntry: (seriesId: string, day: number) => void;
}

export default function DevotionalSeriesDetailView({
  seriesId,
  onBack,
  onEditSeries,
  onNewEntry,
  onEditEntry,
}: Props) {
  const { user } = useAuth();
  const auth = user ? { userId: user.id, userRole: user.role } : undefined;

  const [data, setData] = useState<SeriesWithEntries | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getSeriesWithEntries(seriesId, auth);
      setData(d);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesId, user?.id, user?.role]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 size={20} className="animate-spin text-teal-600" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center px-6">
        <p className="text-sm text-gray-500">Series not found.</p>
        <button onClick={onBack} className="mt-3 text-sm text-teal-600 hover:underline">← Back</button>
      </div>
    );
  }

  const publishedCount = data.entries.filter((e: DevotionalEntry) => e.status === 'Published').length;
  const draftCount = data.entries.filter((e: DevotionalEntry) => e.status !== 'Published').length;
  const typeLabel = TYPE_LABELS[data.seriesType] ?? data.seriesType;

  const moveEntry = async (index: number, direction: -1 | 1) => {
    const target = data.entries[index];
    const other = data.entries[index + direction];
    if (!target || !other) return;
    await Promise.all([
      saveEntry(seriesId, target.dayNumber, { displayOrder: other.displayOrder ?? index + direction }, auth),
      saveEntry(seriesId, other.dayNumber, { displayOrder: target.displayOrder ?? index }, auth),
    ]);
    await load();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Series header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4 sm:px-6 py-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <BookHeart size={20} className="text-teal-600" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-gray-900 truncate">{data.title}</h2>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLOR[data.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {data.status}
                </span>
              </div>
              {typeLabel && (
                <p className="text-xs text-teal-600 font-medium mt-0.5">{typeLabel}</p>
              )}
              {data.description && (
                <p className="text-sm text-gray-500 mt-0.5 max-w-lg">{data.description}</p>
              )}
              {/* Stats row */}
              <div className="flex items-center gap-4 mt-2">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <CheckCircle2 size={12} className="text-green-500" />
                  {publishedCount} published
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <FileText size={12} className="text-gray-400" />
                  {draftCount} draft
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto flex-shrink-0">
            <button
              onClick={() => onEditSeries(seriesId)}
              className="flex-1 sm:flex-none min-h-10 justify-center flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <Pencil size={13} /> Edit
            </button>
            <AdminBtn variant="primary" onClick={() => onNewEntry(seriesId)}>
              <Plus size={14} /> New Entry
            </AdminBtn>
          </div>
        </div>
      </div>

      {/* Entry list */}
      <div className="flex-1 overflow-y-auto bg-white">
        {data.entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
              <BookHeart size={22} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-600">No entries in this series yet.</p>
            <p className="text-xs text-gray-400 mt-1">Add an entry to start building this devotional.</p>
            <button
              onClick={() => onNewEntry(seriesId)}
              className="mt-5 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors"
            >
              + New Entry
            </button>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 space-y-2">
            {data.entries.map((entry: DevotionalEntry, index: number) => (
              <div
                key={entry.id}
                onClick={() => onEditEntry(seriesId, entry.dayNumber)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onEditEntry(seriesId, entry.dayNumber);
                  }
                }}
                role="button"
                tabIndex={0}
                  className="w-full flex items-center gap-3 sm:gap-4 bg-white border border-gray-200 rounded-xl px-4 sm:px-5 py-4
                  hover:shadow-sm hover:border-teal-200 transition-all text-left group"
              >
                {/* Day number badge */}
                <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0 text-[13px] font-bold text-teal-700">
                  {entry.dayNumber}
                </div>

                {/* Title + scripture */}
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-gray-900 truncate block">
                    {entry.title || `Day ${entry.dayNumber}`}
                  </span>
                  {entry.scriptureReference && (
                    <span className="text-xs text-gray-400 truncate block mt-0.5">{entry.scriptureReference}</span>
                  )}
                </div>

                <StatusBadge status={entry.status} />

                <ReorderButtons
                  canMoveUp={index > 0}
                  canMoveDown={index < data.entries.length - 1}
                  onMoveUp={() => void moveEntry(index, -1)}
                  onMoveDown={() => void moveEntry(index, 1)}
                  label={entry.title || `Day ${entry.dayNumber}`}
                />
                <ChevronRight size={14} className="text-teal-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
