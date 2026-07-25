import React, { useEffect, useState } from 'react';
import { FolderOpen, BookOpen, Plus, Clock, ArrowRight } from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import { listCollections } from '@/lib/collections-api';
import type { Collection } from '@/lib/collections-api';
import { StatusBadge } from '../shared';

interface Props {
  onNavigateCollections: () => void;
  onNavigateJourneys: () => void;
  onOpenJourney: (id: string) => void;
}

export default function StudioOverview({ onNavigateCollections, onNavigateJourneys, onOpenJourney }: Props) {
  const { journeys } = useJourney();
  const [collections, setCollections] = useState<Collection[]>([]);

  useEffect(() => {
    listCollections().then(setCollections).catch(() => {});
  }, []);

  const recentJourneys = [...journeys]
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    .slice(0, 6);

  const draftCount = journeys.filter(j => j.status === 'Draft').length;
  const publishedCount = journeys.filter(j => j.status === 'Published').length;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Content Studio</h1>
        <p className="mt-1 text-sm text-gray-500">
          Build and manage journeys, collections, and discipleship content.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Journeys',  value: journeys.length,       color: 'bg-teal-50 text-teal-800' },
          { label: 'Published',       value: publishedCount,         color: 'bg-green-50 text-green-800' },
          { label: 'Drafts',          value: draftCount,             color: 'bg-amber-50 text-amber-800' },
          { label: 'Collections',     value: collections.length,     color: 'bg-purple-50 text-purple-800' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-4 ${s.color}`}>
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-[12px] mt-0.5 opacity-80">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={onNavigateJourneys}
          className="group flex items-center gap-4 p-5 bg-white rounded-xl border border-gray-200 hover:border-teal-300 hover:shadow-sm transition-all text-left"
        >
          <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
            <BookOpen size={20} className="text-teal-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 text-sm">Manage Journeys</div>
            <div className="text-xs text-gray-500 mt-0.5">Edit, create, and publish journeys</div>
          </div>
          <ArrowRight size={16} className="text-gray-400 group-hover:text-teal-600 transition-colors" />
        </button>

        <button
          onClick={onNavigateCollections}
          className="group flex items-center gap-4 p-5 bg-white rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-sm transition-all text-left"
        >
          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
            <FolderOpen size={20} className="text-purple-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 text-sm">Manage Collections</div>
            <div className="text-xs text-gray-500 mt-0.5">Group journeys into themed collections</div>
          </div>
          <ArrowRight size={16} className="text-gray-400 group-hover:text-purple-600 transition-colors" />
        </button>
      </div>

      {/* Recent journeys */}
      {recentJourneys.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Clock size={14} className="text-gray-400" />
              Recently Updated
            </h2>
            <button
              onClick={onNavigateJourneys}
              className="text-xs text-teal-600 hover:text-teal-800 font-medium"
            >
              View all
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {recentJourneys.map(j => (
              <button
                key={j.id}
                onClick={() => onOpenJourney(j.id)}
                className="w-full flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-sm">
                  📖
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{j.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5 truncate">
                    {j.durationDays} days · Updated {new Date(j.updatedAt ?? '').toLocaleDateString()}
                  </div>
                </div>
                <StatusBadge status={j.status} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
