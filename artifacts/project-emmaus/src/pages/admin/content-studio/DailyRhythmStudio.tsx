/**
 * Daily Rhythm Studio — admin management for Daily Rhythm content.
 *
 * Daily Rhythm journeys (journeyType === 'daily-rhythm') are shown here.
 * They are excluded from the normal Journeys tab.
 *
 * Admins can: create tracks, edit days, review, publish, archive, duplicate, export.
 * The StudioJourneyEditor handles per-day editing (same editor, different context).
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Sun,
  Plus,
  BookOpen,
  Clock,
  MoreHorizontal,
  Archive,
  Copy,
  Download,
  Search,
  X,
  Layers,
  Trash2,
} from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import type { Journey } from '@/lib/journeys-api';
import { StatusBadge } from '../shared';
import NewDailyRhythmModal from './NewDailyRhythmModal';
import DeleteDailyRhythmDialog from './DeleteDailyRhythmDialog';

interface Props {
  onEdit: (journeyId: string) => void;
  onNewDay: (journeyId: string) => void;
}

const STATUS_TABS = ['All', 'Draft', 'Pastoral Review', 'Approved', 'Published', 'Archived'];

export default function DailyRhythmStudio({ onEdit, onNewDay }: Props) {
  const { journeys, refreshJourneys, updateJourney, duplicateJourney, permanentDeleteJourney } = useJourney();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'superAdmin';

  const [query, setQuery] = useState('');
  const [statusTab, setStatusTab] = useState('All');
  const [showNew, setShowNew] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [banner, setBanner] = useState('');

  // Permanent delete state
  const [deleteTarget, setDeleteTarget] = useState<Journey | null>(null);

  // Only daily-rhythm journeys appear here
  const tracks = useMemo(() => {
    let list = (journeys as Journey[]).filter(j => j.journeyType === 'daily-rhythm');
    if (statusTab !== 'All') list = list.filter(j => j.status === statusTab);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(j =>
        j.title.toLowerCase().includes(q) ||
        j.description?.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  }, [journeys, query, statusTab]);

  const handleArchive = async (j: Journey) => {
    setOpenMenuId(null);
    await updateJourney({ ...j, status: 'Archived' } as any);
  };

  const handleDuplicate = async (j: Journey) => {
    setOpenMenuId(null);
    const copy = await duplicateJourney(j.id);
    await refreshJourneys?.();
    onEdit(copy.id);
  };

  const handleExport = (j: Journey) => {
    setOpenMenuId(null);
    const blob = new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${j.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await permanentDeleteJourney(deleteTarget.id);
    setBanner(`"${deleteTarget.title}" was permanently deleted.`);
    setDeleteTarget(null);
    await refreshJourneys?.();
    setTimeout(() => setBanner(''), 4000);
  };

  const handleCreated = useCallback(async (id: string) => {
    setShowNew(false);
    await refreshJourneys?.();
    onEdit(id);
  }, [onEdit, refreshJourneys]);

  // Identify the active (Published) daily rhythm
  const activeTrack = (journeys as Journey[]).find(
    j => j.journeyType === 'daily-rhythm' && j.status === 'Published'
  );

  return (
    <div className="flex flex-col h-full">

      {/* Header banner */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4 bg-gradient-to-br from-teal-50 to-white border-b border-gray-100">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Sun size={18} className="text-teal-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-semibold text-gray-900">Daily Rhythm</h2>
            <p className="text-[13px] text-gray-500 mt-0.5 leading-snug">
              The permanent heartbeat of Emmaus. Members begin every day here —
              it never ends, never resets, never says "complete."
            </p>
          </div>
          {activeTrack && (
            <div className="flex-shrink-0 hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 border border-teal-200 rounded-xl text-[12px] font-medium text-teal-700">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
              Active: {activeTrack.durationDays} day{activeTrack.durationDays !== 1 ? 's' : ''} published
            </div>
          )}
        </div>

        {/* Content model chips */}
        <div className="flex flex-wrap gap-2 mt-4">
          {['Foundation Days (1–7)', 'Recurring Rhythm', 'Seasonal', 'Church-Specific'].map(label => (
            <span
              key={label}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-[11px] font-medium text-gray-600"
            >
              <Layers size={10} className="text-gray-400" />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex-shrink-0 px-6 py-3 bg-white border-b border-gray-100 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search Daily Rhythm tracks…"
              className="w-full pl-9 pr-8 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={13} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors flex-shrink-0"
          >
            <Plus size={14} /> New Track
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
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

      {/* Banner */}
      {banner && (
        <div className="flex-shrink-0 mx-6 mt-3 px-4 py-3 bg-green-50 border border-green-100 rounded-xl text-sm text-green-700 font-medium">
          ✓ {banner}
        </div>
      )}

      {/* Track list */}
      <div className="flex-1 overflow-y-auto bg-white">
        {tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center mb-4">
              <Sun size={22} className="text-teal-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">
              {query ? 'No tracks match that search.' : 'No Daily Rhythm tracks yet.'}
            </p>
            <p className="text-xs text-gray-400 mt-1 max-w-[280px]">
              {!query && 'Create your first track — "10 Minutes with Jesus" is the foundation.'}
            </p>
            {!query && (
              <button
                onClick={() => setShowNew(true)}
                className="mt-5 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors"
              >
                Create First Track
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {tracks.map(j => {
              const isActive = j.status === 'Published';
              const isMenuOpen = openMenuId === j.id;

              return (
                <div
                  key={j.id}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/60 group transition-colors"
                >
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-teal-50' : 'bg-gray-50'}`}>
                    <Sun size={16} className={isActive ? 'text-teal-600' : 'text-gray-400'} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold text-gray-900 truncate">{j.title}</span>
                      {isActive && (
                        <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700 flex-shrink-0">
                          <div className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                          Active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {j.durationDays > 0 && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock size={10} /> {j.durationDays} day{j.durationDays !== 1 ? 's' : ''} authored
                        </span>
                      )}
                      {j.description && (
                        <span className="text-xs text-gray-400 truncate max-w-[240px]">
                          {j.description}
                        </span>
                      )}
                    </div>
                  </div>

                  <StatusBadge status={j.status} />

                  {/* Action buttons */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => onNewDay(j.id)}
                      className="px-3 py-1.5 text-[12px] font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg"
                    >
                      + New Day
                    </button>
                    <button
                      onClick={() => onEdit(j.id)}
                      className="px-3 py-1.5 text-[12px] font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg"
                    >
                      Edit Days
                    </button>
                  </div>

                  {/* Action menu */}
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={() => setOpenMenuId(isMenuOpen ? null : j.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
                      aria-label="More actions"
                    >
                      <MoreHorizontal size={15} />
                    </button>
                    {isMenuOpen && (
                      <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20">
                        <button
                          onClick={() => handleDuplicate(j)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50"
                        >
                          <Copy size={13} className="text-gray-400" /> Duplicate
                        </button>
                        <button
                          onClick={() => handleExport(j)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50"
                        >
                          <Download size={13} className="text-gray-400" /> Export
                        </button>
                        {j.status !== 'Archived' && (
                          <button
                            onClick={() => handleArchive(j)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50 border-t border-gray-50 mt-0.5"
                          >
                            <Archive size={13} className="text-gray-400" /> Archive
                          </button>
                        )}
                        {isSuperAdmin && (
                          <>
                            <div className="my-1 border-t border-gray-100" />
                            <button
                              onClick={() => { setOpenMenuId(null); setDeleteTarget(j); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={13} /> Delete Permanently
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Track Modal */}
      {showNew && (
        <NewDailyRhythmModal
          onClose={() => setShowNew(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Permanent delete confirmation */}
      {deleteTarget && (
        <DeleteDailyRhythmDialog
          trackTitle={deleteTarget.title}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
