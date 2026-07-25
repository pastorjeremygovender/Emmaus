import React, { useState, useMemo, useCallback } from 'react';
import {
  Plus, Search, BookOpen, Layers, Filter, X,
  Heart, GraduationCap, Clock, Tag,
} from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import type { Journey } from '@/lib/journeys-api';
import { StatusBadge } from '../shared';
import NewJourneyModal from './NewJourneyModal';

interface Props {
  collectionId?: string;
  autoOpenNew?: boolean;
  onEdit: (id: string) => void;
  onLegacyEdit: (id: string) => void;
}

const STATUS_TABS = ['All', 'Draft', 'Pastoral Review', 'Approved', 'Published', 'Archived'];
const TYPE_OPTIONS = ['All Types', 'core', 'companion', 'series', 'course'];

// Journey type config
const TYPE_CONFIG: Record<string, { Icon: React.ElementType; color: string; bg: string; label: string }> = {
  core:      { Icon: BookOpen,       color: 'text-teal-600',   bg: 'bg-teal-50',   label: 'Core'      },
  companion: { Icon: Heart,          color: 'text-rose-500',   bg: 'bg-rose-50',   label: 'Companion' },
  series:    { Icon: Layers,         color: 'text-purple-600', bg: 'bg-purple-50', label: 'Series'    },
  course:    { Icon: GraduationCap, color: 'text-amber-600',  bg: 'bg-amber-50',  label: 'Course'    },
};

function JourneyTypeCell({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.core;
  const { Icon, color, bg } = cfg;
  return (
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
      <Icon size={16} className={color} />
    </div>
  );
}

export default function StudioJourneyList({ collectionId, autoOpenNew, onEdit, onLegacyEdit }: Props) {
  const { journeys, refreshJourneys } = useJourney();
  const [query, setQuery] = useState('');
  const [statusTab, setStatusTab] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [showNew, setShowNew] = useState(!!autoOpenNew);

  const filtered = useMemo(() => {
    let list = journeys as Journey[];
    if (collectionId) list = list.filter(j => (j as any).collectionId === collectionId);
    if (statusTab !== 'All') list = list.filter(j => j.status === statusTab);
    if (typeFilter !== 'All Types') list = list.filter(j => j.journeyType === typeFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(j =>
        j.title.toLowerCase().includes(q) ||
        j.description?.toLowerCase().includes(q) ||
        j.tags?.some(t => t.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  }, [journeys, query, statusTab, typeFilter, collectionId]);

  const handleCreated = useCallback(async (id: string) => {
    setShowNew(false);
    await refreshJourneys?.();
    onEdit(id);
  }, [onEdit, refreshJourneys]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex-shrink-0 px-6 py-4 bg-white border-b border-gray-100 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search journeys…"
              className="w-full pl-9 pr-8 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-300 text-gray-700"
          >
            {TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors flex-shrink-0"
          >
            <Plus size={14} /> New Journey
          </button>
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 overflow-x-auto pb-0.5 -mb-0.5 scrollbar-none">
          {STATUS_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setStatusTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition-colors ${
                statusTab === tab
                  ? 'bg-teal-600 text-white'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Journey list */}
      <div className="flex-1 overflow-y-auto bg-white">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
              <BookOpen size={22} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-600">
              {query ? 'No journeys match that search.' : 'No journeys here yet.'}
            </p>
            {!query && (
              <button
                onClick={() => setShowNew(true)}
                className="mt-5 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors"
              >
                Create First Journey
              </button>
            )}
            {query && (
              <button onClick={() => setQuery('')} className="mt-3 text-xs text-teal-600 hover:text-teal-800">
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(j => {
              const cfg = TYPE_CONFIG[j.journeyType] ?? TYPE_CONFIG.core;
              return (
                <div
                  key={j.id}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/60 group transition-colors"
                >
                  {/* Type icon */}
                  <JourneyTypeCell type={j.journeyType} />

                  {/* Title + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold text-gray-900 truncate">{j.title}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {j.durationDays > 0 && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock size={10} /> {j.durationDays} days
                        </span>
                      )}
                      {j.tags && j.tags.length > 0 && (
                        <span className="text-xs text-gray-400 flex items-center gap-1 truncate">
                          <Tag size={10} /> {j.tags.slice(0, 2).join(', ')}
                        </span>
                      )}
                      {j.updatedAt && (
                        <span className="text-xs text-gray-400">
                          {new Date(j.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  <StatusBadge status={j.status} />

                  {/* Actions — appear on hover */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => onEdit(j.id)}
                      title="Open in Block Editor"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 text-xs font-medium hover:bg-teal-100 transition-colors"
                    >
                      <Layers size={12} /> Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showNew && (
        <NewJourneyModal
          onClose={() => setShowNew(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
