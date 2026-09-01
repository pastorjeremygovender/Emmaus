/**
 * CurrentDiscipleship — "What is this person currently doing?"
 * Shows active Walks, Devotionals, Rooms, and Sermon Companions
 * with progress bars, last activity, and streak where available.
 */
import React from 'react';
import { BookOpen, Heart, Users, Mic, CheckCircle2, Loader2 } from 'lucide-react';
import type { DiscipleshipSummary } from '@/lib/pastoral-api';
import { allocateDiscipleship } from './discipleship-allocation';

interface Props {
  discipleship: DiscipleshipSummary | null;
  loading?: boolean;
}

function fmt(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso.includes('T') ? iso : iso + 'T12:00:00');
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}

function ProgressBar({ value, max, color = 'bg-teal-500' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SectionHeader({ icon: Icon, iconColor, label }: { icon: React.ElementType; iconColor: string; label: string }) {
  return (
    <div
      data-discipleship-section={label}
      className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/60"
    >
      <Icon size={11} className={iconColor} />
      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
    </div>
  );
}

export default function CurrentDiscipleship({ discipleship, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-gray-400">
        <Loader2 size={14} className="animate-spin" />
        <span className="text-[12px]">Loading discipleship data…</span>
      </div>
    );
  }

  if (!discipleship) {
    return <p className="text-[12px] text-gray-400 py-4 text-center">Could not load discipleship data.</p>;
  }

  if (!discipleship.available) {
    return (
      <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl px-4 py-6 text-center">
        <p className="text-[12px] text-gray-400">No Emmaus account linked — discipleship activity not available.</p>
      </div>
    );
  }

  const allocation = allocateDiscipleship(discipleship);
  const hasAnything =
    allocation.dailyRhythm.length > 0 ||
    allocation.dailyDevotionals.length > 0 ||
    allocation.sermonCompanions.length > 0 ||
    allocation.walksInProgress.length > 0 ||
    allocation.journeysInProgress.length > 0 ||
    allocation.groups.length > 0 ||
    allocation.completedWalks.length > 0 ||
    allocation.completedJourneys.length > 0;

  if (!hasAnything) {
    return (
      <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl px-4 py-6 text-center">
        <p className="text-[12px] text-gray-400">No active discipleship activity recorded.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">

      {/* Daily Rhythm — sourced from the Daily Rhythm journey type. */}
      {allocation.dailyRhythm.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <SectionHeader icon={Heart} iconColor="text-rose-500" label="Daily Rhythm" />
          <div className="divide-y divide-gray-100">
            {allocation.dailyRhythm.map(j => (
              <div key={j.journeyId} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{j.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Day {j.currentDay}{j.totalDays > 0 ? ` of ${j.totalDays}` : ''}
                      {j.updatedAt && <> · last active {fmt(j.updatedAt)}</>}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700">
                    Active
                  </span>
                </div>
                {j.totalDays > 0 && (
                  <ProgressBar value={Math.min(j.currentDay, j.totalDays)} max={j.totalDays} color="bg-rose-400" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily Devotionals — sourced from devotional progress records. */}
      {allocation.dailyDevotionals.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <SectionHeader icon={BookOpen} iconColor="text-blue-600" label="Daily Devotionals" />
          <div className="divide-y divide-gray-100">
            {allocation.dailyDevotionals.map(d => (
              <div key={d.seriesId} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{d.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Day {d.currentDay}
                      {d.updatedAt && <> · last {fmt(d.updatedAt)}</>}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                    Active
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Walks */}
      {allocation.walksInProgress.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <SectionHeader icon={BookOpen} iconColor="text-teal-600" label="Walks in Progress" />
          <div className="divide-y divide-gray-100">
            {allocation.walksInProgress.map(j => (
              <div key={j.journeyId} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{j.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {j.totalDays > 0 && j.currentDay > j.totalDays
                      ? 'Walk Complete'
                      : <>Day {j.currentDay}{j.totalDays > 0 ? ` of ${j.totalDays}` : ''}</>}
                      {j.updatedAt && <> · last active {fmt(j.updatedAt)}</>}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-50 text-teal-700">
                    Active
                  </span>
                </div>
                {j.totalDays > 0 && (
                  <ProgressBar value={Math.min(j.currentDay, j.totalDays)} max={j.totalDays} color="bg-teal-500" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Journeys */}
      {allocation.journeysInProgress.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <SectionHeader icon={BookOpen} iconColor="text-indigo-600" label="Journeys in Progress" />
          <div className="divide-y divide-gray-100">
            {allocation.journeysInProgress.map(j => (
              <div key={j.journeyId} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{j.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Step {j.currentDay}{j.totalDays > 0 ? ` of ${j.totalDays}` : ''}
                      {j.updatedAt && <> · last active {fmt(j.updatedAt)}</>}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
                    Active
                  </span>
                </div>
                {j.totalDays > 0 && (
                  <ProgressBar value={Math.min(j.currentDay, j.totalDays)} max={j.totalDays} color="bg-indigo-500" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed walks (compact) */}
      {allocation.completedWalks.length > 0 && allocation.walksInProgress.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <SectionHeader icon={CheckCircle2} iconColor="text-green-600" label="Completed Walks" />
          <div className="divide-y divide-gray-100">
            {allocation.completedWalks.slice(0, 3).map(j => (
              <div key={j.journeyId} className="flex items-center gap-3 px-4 py-3">
                <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                <p className="text-[13px] text-gray-700 flex-1 truncate">{j.title}</p>
                {j.updatedAt && (
                  <span className="text-[10px] text-gray-400 shrink-0">{fmt(j.updatedAt)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed journeys retain the prior profile visibility without
          reclassifying them as Walks. */}
      {allocation.completedJourneys.length > 0 && allocation.journeysInProgress.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <SectionHeader icon={CheckCircle2} iconColor="text-green-600" label="Completed Journeys" />
          <div className="divide-y divide-gray-100">
            {allocation.completedJourneys.slice(0, 3).map(j => (
              <div key={j.journeyId} className="flex items-center gap-3 px-4 py-3">
                <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                <p className="text-[13px] text-gray-700 flex-1 truncate">{j.title}</p>
                {j.updatedAt && (
                  <span className="text-[10px] text-gray-400 shrink-0">{fmt(j.updatedAt)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sermon Companions */}
      {allocation.sermonCompanions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <SectionHeader icon={Mic} iconColor="text-amber-600" label="Sermon Companions" />
          <div className="divide-y divide-gray-100">
            {allocation.sermonCompanions.map(sc => (
              <div key={sc.companionId} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{sc.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {sc.completedCount}{sc.totalDays > 0 ? ` of ${sc.totalDays}` : ''} days
                      {sc.updatedAt && <> · {fmt(sc.updatedAt)}</>}
                    </p>
                  </div>
                </div>
                {sc.totalDays > 0 && (
                  <ProgressBar value={sc.completedCount} max={sc.totalDays} color="bg-amber-400" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Groups — sourced only from joined room/group records. */}
      {allocation.groups.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <SectionHeader icon={Users} iconColor="text-purple-600" label="Groups" />
          <div className="divide-y divide-gray-100">
            {allocation.groups.map(r => (
              <div key={r.roomId} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-gray-900 truncate">{r.roomName}</p>
                  {r.joinedAt && (
                    <p className="text-[11px] text-gray-400 mt-0.5">Joined {fmt(r.joinedAt)}</p>
                  )}
                </div>
                <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                  r.role === 'admin' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {r.role === 'admin' ? 'Leader' : 'Member'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
