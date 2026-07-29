/**
 * CollectionDetailView — Journey list within a specific Collection.
 *
 * Shows collection header (title, description, stats) and all journeys
 * belonging to that collection. Tapping a journey opens JourneyDetailView.
 *
 * Journeys are fetched directly from /api/collections/:id/journeys so the
 * list is always accurate regardless of JourneyContext load timing.
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Plus, BookOpen, Pencil, Layers, Clock,
  Tag, Loader2, FolderOpen, CheckCircle2, FileText,
} from 'lucide-react';
import { getCollection, listCollectionJourneys } from '@/lib/collections-api';
import type { Collection, CollectionJourney } from '@/lib/collections-api';
import { StatusBadge, AdminBtn } from '../shared';

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  collectionId: string;
  onBack: () => void;
  onNewJourney: (collectionId: string) => void;
  onOpenJourney: (journeyId: string, journeyTitle: string, collectionTitle: string) => void;
  onEditCollection: (collectionId: string) => void;
}

// ─── Type configs ─────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  core:       { color: 'text-teal-600',   bg: 'bg-teal-50',   label: 'Core'      },
  companion:  { color: 'text-rose-500',   bg: 'bg-rose-50',   label: 'Companion' },
  series:     { color: 'text-purple-600', bg: 'bg-purple-50', label: 'Series'    },
  course:     { color: 'text-amber-600',  bg: 'bg-amber-50',  label: 'Course'    },
};

function difficultyColor(d?: string) {
  if (d === 'Beginner') return 'text-green-600 bg-green-50';
  if (d === 'Intermediate') return 'text-amber-600 bg-amber-50';
  if (d === 'Advanced') return 'text-red-600 bg-red-50';
  return 'text-gray-500 bg-gray-100';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CollectionDetailView({
  collectionId,
  onBack,
  onNewJourney,
  onOpenJourney,
  onEditCollection,
}: Props) {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [journeys, setJourneys] = useState<CollectionJourney[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch collection metadata and journeys in parallel for speed
      const [c, jList] = await Promise.all([
        getCollection(collectionId),
        listCollectionJourneys(collectionId),
      ]);
      setCollection(c);
      setJourneys(jList.filter(j => j.journeyType !== 'daily-rhythm'));
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => { load(); }, [load]);

  const publishedCount = useMemo(
    () => journeys.filter(j => j.status === 'Published').length,
    [journeys],
  );
  const draftCount = useMemo(
    () => journeys.filter(j => j.status !== 'Published').length,
    [journeys],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 size={20} className="animate-spin text-teal-600" />
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center px-6">
        <p className="text-sm text-gray-500">Collection not found.</p>
        <button onClick={onBack} className="mt-3 text-sm text-teal-600 hover:underline">← Back to Collections</button>
      </div>
    );
  }

  const STATUS_COLOR: Record<string, string> = {
    Draft:    'bg-gray-100 text-gray-600',
    Published:'bg-green-100 text-green-700',
    Archived: 'bg-red-50 text-red-600',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Collection header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-6 py-5">
        <div className="flex items-start justify-between gap-4 max-w-4xl">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <FolderOpen size={20} className="text-purple-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-gray-900">{collection.title}</h2>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[collection.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {collection.status}
                </span>
              </div>
              {collection.description && (
                <p className="text-sm text-gray-500 mt-0.5 max-w-lg">{collection.description}</p>
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

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => onEditCollection(collectionId)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <Pencil size={13} /> Edit
            </button>
            <AdminBtn variant="primary" onClick={() => onNewJourney(collectionId)}>
              <Plus size={14} /> New Journey
            </AdminBtn>
          </div>
        </div>
      </div>

      {/* Journey list */}
      <div className="flex-1 overflow-y-auto bg-white">
        {journeys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
              <BookOpen size={22} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-600">No journeys in this collection yet.</p>
            <p className="text-xs text-gray-400 mt-1">Add a journey to start building this pathway.</p>
            <button
              onClick={() => onNewJourney(collectionId)}
              className="mt-5 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors"
            >
              + New Journey
            </button>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-6 py-5 space-y-3">
            {journeys.map(j => {
              const typeCfg = TYPE_CONFIG[j.journeyType ?? 'core'] ?? TYPE_CONFIG.core;
              return (
                <button
                  key={j.id}
                  onClick={() => onOpenJourney(j.id, j.title, collection.title)}
                  className="w-full flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-5 py-4
                    hover:shadow-sm hover:border-teal-200 transition-all text-left group"
                >
                  {/* Type icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${typeCfg.bg}`}>
                    <Layers size={16} className={typeCfg.color} />
                  </div>

                  {/* Title + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-sm font-semibold text-gray-900 truncate">{j.title}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${typeCfg.bg} ${typeCfg.color}`}>
                        {typeCfg.label}
                      </span>
                      {j.difficulty && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${difficultyColor(j.difficulty)}`}>
                          {j.difficulty}
                        </span>
                      )}
                    </div>
                    {j.description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-lg">{j.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      {(j.durationDays ?? 0) > 0 && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock size={10} /> {j.durationDays} day{j.durationDays !== 1 ? 's' : ''}
                        </span>
                      )}
                      {j.estimatedDuration && (
                        <span className="text-xs text-gray-400">{j.estimatedDuration}</span>
                      )}
                      {j.tags && j.tags.length > 0 && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Tag size={10} /> {j.tags.slice(0, 2).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>

                  <StatusBadge status={j.status ?? 'Draft'} />

                  <span className="text-xs text-teal-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    Open →
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
