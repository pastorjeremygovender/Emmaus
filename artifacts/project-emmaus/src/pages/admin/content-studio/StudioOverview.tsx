import React, { useEffect, useState, useMemo } from 'react';
import {
  BookOpen, FolderOpen, Plus, Clock, ArrowRight,
  FileEdit, Layers, Heart, GraduationCap, Sun, BookHeart,
  Video,
} from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { listCollections } from '@/lib/collections-api';
import type { Collection } from '@/lib/collections-api';
import { listAllSeries } from '@/lib/devotionals-api';
import type { DevotionalSeries } from '@/lib/devotionals-api';
import { getArchiveStatus } from '@/lib/youtube-archive-api';
import { StatusBadge } from '../shared';
import type { Journey } from '@/lib/journeys-api';

interface Props {
  onNavigateCollections: () => void;
  onNavigateJourneys: () => void;
  onNavigateDevotionals: () => void;
  onOpenJourney: (id: string) => void;
  onOpenDevotional: (id: string) => void;
  onNewJourney: () => void;
}

// ─── Relative time helper ─────────────────────────────────────────────────────

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Content type icon ────────────────────────────────────────────────────────

function JourneyTypeIcon({ type }: { type: string }) {
  const map: Record<string, { Icon: React.ElementType; color: string; bg: string }> = {
    core:          { Icon: BookOpen,     color: 'text-teal-600',   bg: 'bg-teal-50'   },
    'daily-rhythm':{ Icon: Sun,          color: 'text-orange-500', bg: 'bg-orange-50' },
    companion:     { Icon: Heart,        color: 'text-rose-500',   bg: 'bg-rose-50'   },
    series:        { Icon: Layers,       color: 'text-purple-600', bg: 'bg-purple-50' },
    course:        { Icon: GraduationCap,color: 'text-amber-600',  bg: 'bg-amber-50'  },
  };
  const { Icon, color, bg } = map[type] ?? map.core;
  return (
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
      <Icon size={16} className={color} />
    </div>
  );
}

function DevotionalIcon() {
  return (
    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-pink-50">
      <BookHeart size={16} className="text-pink-600" />
    </div>
  );
}

// ─── Unified recently-updated feed item ───────────────────────────────────────

type FeedItem =
  | { kind: 'journey'; data: Journey }
  | { kind: 'devotional'; data: DevotionalSeries };

export default function StudioOverview({
  onNavigateCollections,
  onNavigateJourneys,
  onNavigateDevotionals,
  onOpenJourney,
  onOpenDevotional,
  onNewJourney,
}: Props) {
  const { user } = useAuth();
  const { journeys } = useJourney();
  const auth = user ? { userId: user.id, userRole: user.role } : undefined;

  const [collections, setCollections] = useState<Collection[]>([]);
  const [devotionals, setDevotionals] = useState<DevotionalSeries[]>([]);
  const [approvedSermons, setApprovedSermons] = useState(0);

  useEffect(() => {
    listCollections().then(setCollections).catch(() => {});
    listAllSeries(auth).then(setDevotionals).catch(() => {});
    getArchiveStatus().then(s => setApprovedSermons(s.stats?.approvedSermons ?? 0)).catch(() => {});
  // auth values are the stable deps here
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  // ── Aggregated statistics ─────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total =
      journeys.length +
      devotionals.length +
      approvedSermons;

    const published =
      journeys.filter(j => j.status === 'Published').length +
      devotionals.filter(d => d.status === 'Published').length +
      approvedSermons;

    const drafts =
      journeys.filter(j => j.status === 'Draft').length +
      devotionals.filter(d => d.status === 'Draft').length;

    return { total, published, drafts };
  }, [journeys, devotionals, approvedSermons]);

  // ── Recently updated (journeys + devotionals, newest first) ──────────────

  const recentFeed = useMemo((): FeedItem[] => {
    const journeyItems: FeedItem[] = (journeys as Journey[]).map(j => ({ kind: 'journey', data: j }));
    const devotionalItems: FeedItem[] = devotionals.map(d => ({ kind: 'devotional', data: d }));
    return [...journeyItems, ...devotionalItems]
      .sort((a, b) => {
        const aDate = a.kind === 'journey' ? (a.data.updatedAt ?? '') : a.data.updatedAt;
        const bDate = b.kind === 'journey' ? (b.data.updatedAt ?? '') : b.data.updatedAt;
        return bDate.localeCompare(aDate);
      })
      .slice(0, 7);
  }, [journeys, devotionals]);

  // ── Draft journeys for "Continue Editing" ────────────────────────────────

  const recentDrafts = useMemo(() =>
    [...journeys as Journey[]]
      .filter(j => j.status === 'Draft' || j.status === 'Pastoral Review')
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
      .slice(0, 3),
    [journeys]
  );

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
          <div className="text-base font-semibold text-white">New Walk</div>
          <div className="text-sm text-teal-200 mt-0.5">Start from scratch and begin writing</div>
        </div>
        <ArrowRight size={18} className="text-white/60 group-hover:translate-x-1 transition-transform" />
      </button>

      {/* Quick stats — aggregated across all content types */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',       value: stats.total,     color: 'bg-gray-50 text-gray-800'       },
          { label: 'Published',   value: stats.published, color: 'bg-emerald-50 text-emerald-800' },
          { label: 'Drafts',      value: stats.drafts,    color: 'bg-amber-50 text-amber-800'     },
          { label: 'Journeys',    value: collections.length, color: 'bg-purple-50 text-purple-800' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-4 ${s.color}`}>
            <div className="text-2xl font-bold tabular-nums">{s.value}</div>
            <div className="text-xs mt-0.5 opacity-70 font-medium">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Continue editing (recent journey drafts) */}
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

      {/* Navigation quick cards — Journeys · Daily Devotionals · Collections */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={onNavigateJourneys}
          className="group flex items-center gap-4 p-5 bg-white rounded-2xl border border-gray-100 hover:border-teal-200 hover:shadow-sm transition-all text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
            <BookOpen size={18} className="text-teal-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 text-sm">Walks</div>
            <div className="text-xs text-gray-500 mt-0.5">Browse and edit all walks</div>
          </div>
          <ArrowRight size={14} className="text-gray-300 group-hover:text-teal-500 transition-colors" />
        </button>

        <button
          onClick={onNavigateDevotionals}
          className="group flex items-center gap-4 p-5 bg-white rounded-2xl border border-gray-100 hover:border-pink-200 hover:shadow-sm transition-all text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-pink-50 flex items-center justify-center flex-shrink-0">
            <BookHeart size={18} className="text-pink-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 text-sm">Daily Devotionals</div>
            <div className="text-xs text-gray-500 mt-0.5">Manage devotional series</div>
          </div>
          <ArrowRight size={14} className="text-gray-300 group-hover:text-pink-500 transition-colors" />
        </button>

        <button
          onClick={onNavigateCollections}
          className="group flex items-center gap-4 p-5 bg-white rounded-2xl border border-gray-100 hover:border-purple-200 hover:shadow-sm transition-all text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
            <FolderOpen size={18} className="text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 text-sm">Journeys</div>
            <div className="text-xs text-gray-500 mt-0.5">Manage Journey pathways</div>
          </div>
          <ArrowRight size={14} className="text-gray-300 group-hover:text-purple-500 transition-colors" />
        </button>
      </div>

      {/* Recently Updated — journeys + devotionals merged, newest first */}
      {recentFeed.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Clock size={14} className="text-gray-400" />
              Recently Updated
            </h2>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden shadow-sm">
            {recentFeed.map(item => {
              if (item.kind === 'journey') {
                const j = item.data;
                const typeLabel =
                  j.journeyType === 'daily-rhythm' ? 'Daily Rhythm' :
                  j.journeyType === 'companion'    ? 'Companion' :
                  j.journeyType === 'series'       ? 'Series' :
                  j.journeyType === 'course'       ? 'Course' : 'Walk';
                return (
                  <button
                    key={`journey-${j.id}`}
                    onClick={() => onOpenJourney(j.id)}
                    className="w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    <JourneyTypeIcon type={j.journeyType} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{j.title}</div>
                      <div className="text-xs text-gray-400 mt-0.5 truncate">
                        {typeLabel}
                        {j.updatedAt ? ` · Updated ${relativeTime(j.updatedAt)}` : ''}
                      </div>
                    </div>
                    <StatusBadge status={j.status} />
                  </button>
                );
              }

              // devotional
              const d = item.data;
              return (
                <button
                  key={`devotional-${d.id}`}
                  onClick={() => onOpenDevotional(d.id)}
                  className="w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <DevotionalIcon />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{d.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5 truncate">
                      Daily Devotional
                      {d.updatedAt ? ` · Updated ${relativeTime(d.updatedAt)}` : ''}
                    </div>
                  </div>
                  <StatusBadge status={d.status} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
