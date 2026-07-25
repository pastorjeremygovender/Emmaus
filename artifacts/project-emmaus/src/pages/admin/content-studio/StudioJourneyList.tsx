import React, { useState, useMemo, useCallback } from 'react';
import { Plus, Search, BookOpen, Pencil, Layers, Filter, X } from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import type { Journey } from '@/lib/journeys-api';
import { StatusBadge, AdminBtn } from '../shared';
import NewJourneyModal from './NewJourneyModal';

interface Props {
  collectionId?: string;
  onEdit: (id: string) => void;
  onLegacyEdit: (id: string) => void;
}

const STATUS_TABS = ['All', 'Draft', 'Pastoral Review', 'Approved', 'Published', 'Archived'];
const TYPE_OPTIONS = ['All Types', 'core', 'companion', 'series', 'course'];

export default function StudioJourneyList({ collectionId, onEdit, onLegacyEdit }: Props) {
  const { journeys, refreshJourneys } = useJourney();
  const [query, setQuery] = useState('');
  const [statusTab, setStatusTab] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [showNew, setShowNew] = useState(false);

  const filtered = useMemo(() => {
    let list = journeys as Journey[];
    if (collectionId) {
      list = list.filter(j => (j as any).collectionId === collectionId);
    }
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
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search journeys…"
              className="w-full pl-9 pr-9 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 text-gray-700"
          >
            {TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>
          <AdminBtn variant="primary" onClick={() => setShowNew(true)}>
            <Plus size={14} /> New Journey
          </AdminBtn>
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 overflow-x-auto pb-0.5 -mb-0.5">
          {STATUS_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setStatusTab(tab)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium whitespace-nowrap transition-colors ${
                statusTab === tab
                  ? 'bg-teal-600 text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <BookOpen size={36} className="text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-600">No journeys found</p>
            {query && (
              <p className="text-xs text-gray-400 mt-1">Try a different search term.</p>
            )}
            <button
              onClick={() => setShowNew(true)}
              className="mt-4 px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors"
            >
              Create Journey
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 bg-white">
            {filtered.map(j => (
              <div key={j.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50/60 group">
                <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
                  <BookOpen size={16} className="text-teal-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">{j.title}</span>
                    <span className="text-xs text-gray-400 capitalize">{j.journeyType}</span>
                  </div>
                  <div className="text-xs text-gray-400 truncate mt-0.5">
                    {j.durationDays} days
                    {j.tags?.length ? ` · ${j.tags.slice(0, 3).join(', ')}` : ''}
                    {j.updatedAt ? ` · ${new Date(j.updatedAt).toLocaleDateString()}` : ''}
                  </div>
                </div>
                <StatusBadge status={j.status} />
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onEdit(j.id)}
                    title="Open in Block Editor"
                    className="p-2 rounded-lg hover:bg-teal-50 text-gray-500 hover:text-teal-700 transition-colors"
                  >
                    <Layers size={15} />
                  </button>
                  <button
                    onClick={() => onLegacyEdit(j.id)}
                    title="Open in Classic Editor"
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    <Pencil size={15} />
                  </button>
                </div>
              </div>
            ))}
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
