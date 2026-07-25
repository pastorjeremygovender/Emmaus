import React, { useEffect, useState } from 'react';
import {
  BookOpen, FolderOpen, Plus, Clock, ArrowRight,
  FileEdit, Layers, Heart, GraduationCap,
} from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import { listCollections } from '@/lib/collections-api';
import type { Collection } from '@/lib/collections-api';
import { StatusBadge } from '../shared';
import type { Journey } from '@/lib/journeys-api';

interface Props {
  onNavigateCollections: () => void;
  onNavigateJourneys: () => void;
  onOpenJourney: (id: string) => void;
  onNewJourney: () => void;
}

// Journey type icon helper
function JourneyTypeIcon({ type }: { type: string }) {
  const map: Record<string, { Icon: React.ElementType; color: string; bg: string }> = {
    core:      { Icon: BookOpen,        color: 'text-teal-600',   bg: 'bg-teal-50'   },
    companion: { Icon: Heart,           color: 'text-rose-500',   bg: 'bg-rose-50'   },
    series:    { Icon: Layers,          color: 'text-purple-600', bg: 'bg-purple-50' },
    course:    { Icon: GraduationCap,  color: 'text-amber-600',  bg: 'bg-amber-50'  },
  };
  const entry = map[type] ?? map.core;
  const { Icon, color, bg } = entry;
  return (
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
      <Icon size={16} className={color} />
    </div>
  );
}

export default function StudioOverview({ onNavigateCollections, onNavigateJourneys, onOpenJourney, onNewJourney }: Props) {
  const { journeys } = useJourney();
  const [collections, setCollections] = useState<Collection[]>([]);

  useEffect(() => {
    listCollections().then(setCollections).catch(() => {});
  }, []);

  const recentDrafts = [...journeys as Journey[]]
    .filter(j => j.status === 'Draft' || j.status === 'Pastoral Review')
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    .slice(0, 3);

  const recentJourneys = [...journeys as Journey[]]
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    .slice(0, 5);

  const draftCount = journeys.filter(j => j.status === 'Draft').length;
  const publishedCount = journeys.filter(j => j.status === 'Published').length;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-10">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: '"Crimson Pro", Georgia, serif' }}>
          Content Studio
        </h1>
        <p className="mt-1.5 text-sm text-gray-500">
          Every great journey starts with one step. Write yours here.
        </p>
      </div>

      {/* Primary action */}
      <button
        onClick={onNewJourney}
        className="group w-full flex items-center gap-5 p-6 bg-teal-600 hover:bg-teal-700 rounded-2xl text-left transition-colors shadow-sm"
      >
        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
          <Plus size={22} className="text-white" />
        </div>
        <div className="flex-1">
          <div className="text-base font-semibold text-white">New Journey</div>
          <div className="text-sm text-teal-200 mt-0.5">Start from scratch and begin writing</div>
        </div>
        <ArrowRight size={18} className="text-white/60 group-hover:translate-x-1 transition-transform" />
      </button>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: journeys.length, color: 'bg-gray-50 text-gray-800' },
          { label: 'Published', value: publishedCount, color: 'bg-emerald-50 text-emerald-800' },
          { label: 'Drafts', value: draftCount, color: 'bg-amber-50 text-amber-800' },
          { label: 'Collections', value: collections.length, color: 'bg-purple-50 text-purple-800' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-4 ${s.color}`}>
            <div className="text-2xl font-bold tabular-nums">{s.value}</div>
            <div className="text-xs mt-0.5 opacity-70 font-medium">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Continue editing (recent drafts) */}
      {recentDrafts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <FileEdit size={14} className="text-gray-400" />
              Continue Editing
            </h2>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden shadow-sm">
            {recentDrafts.map(j => (
              <button
                key={j.id}
                onClick={() => onOpenJourney(j.id)}
                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
              >
                <JourneyTypeIcon type={j.journeyType} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{j.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {j.durationDays > 0 ? `${j.durationDays} days · ` : ''}
                    Edited {new Date(j.updatedAt ?? '').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <StatusBadge status={j.status} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Navigation actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={onNavigateJourneys}
          className="group flex items-center gap-4 p-5 bg-white rounded-2xl border border-gray-100 hover:border-teal-200 hover:shadow-sm transition-all text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
            <BookOpen size={18} className="text-teal-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 text-sm">Journeys</div>
            <div className="text-xs text-gray-500 mt-0.5">Browse and edit all journeys</div>
          </div>
          <ArrowRight size={14} className="text-gray-300 group-hover:text-teal-500 transition-colors" />
        </button>

        <button
          onClick={onNavigateCollections}
          className="group flex items-center gap-4 p-5 bg-white rounded-2xl border border-gray-100 hover:border-purple-200 hover:shadow-sm transition-all text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
            <FolderOpen size={18} className="text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 text-sm">Collections</div>
            <div className="text-xs text-gray-500 mt-0.5">Group journeys into series and themes</div>
          </div>
          <ArrowRight size={14} className="text-gray-300 group-hover:text-purple-500 transition-colors" />
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
              className="text-xs text-teal-600 hover:text-teal-800 font-medium transition-colors"
            >
              View all
            </button>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden shadow-sm">
            {recentJourneys.map(j => (
              <button
                key={j.id}
                onClick={() => onOpenJourney(j.id)}
                className="w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
              >
                <JourneyTypeIcon type={j.journeyType} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{j.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5 truncate">
                    {j.durationDays > 0 ? `${j.durationDays} days · ` : ''}
                    {j.tags?.slice(0, 2).join(', ')}
                    {j.updatedAt ? ` · ${new Date(j.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
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
