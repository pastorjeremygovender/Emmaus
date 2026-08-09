/**
 * PastoralDashboard.tsx — Checkpoint 5: Pastoral Dashboard.
 *
 * 9 sections, each fetching independently so a slow query never blocks the rest.
 * Auto-refreshes every 30 seconds without a page reload.
 *
 * Sections:
 *   S1  Today          — live stat cards
 *   S2  Care Signals   — open attention/follow-up/significant signals
 *   S3  Movement       — discipleship activity this month
 *   S4  Engagement     — recharts line/bar charts
 *   S5  New Believers  — recent journey completions needing follow-up
 *   S6  Recent Activity— event timeline
 *   S7  Follow-up Queue— actionable signals table
 *   S8  Quick Actions  — navigation shortcuts
 *   S9  Search         — universal people search
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  RefreshCw, Loader2, AlertCircle, Users, BookOpen, Heart,
  DoorOpen, ClipboardList, PenSquare, Zap, TrendingUp,
  CalendarDays, Search, Trophy, Star, PhoneCall, AlertTriangle,
  CheckCheck, X, Clock, ChevronRight, UserCircle, Activity,
  Clapperboard, Flame, Flag, StickyNote,
} from 'lucide-react';
import * as api from '@/lib/pastoral-api';
import { useAuth } from '@/contexts/AuthContext';
import { useAdmin } from '@/contexts/AdminContext';
import PersonPage from '@/pages/admin/pastoral/PersonPage';
import type { AdminNav } from '@/pages/Admin';

// ─── Hook: independent fetch + 30s auto-refresh ───────────────────────────────

function useAutoFetch<T>(
  fetcher: () => Promise<T>,
  intervalMs = 30_000,
): { data: T | null; loading: boolean; error: string; refresh: () => void } {
  const [data,    setData]    = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const mounted = useRef(true);

  const run = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await fetcher();
      if (mounted.current) setData(result);
    } catch (e: unknown) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    mounted.current = true;
    run();
    const t = setInterval(run, intervalMs);
    return () => { mounted.current = false; clearInterval(t); };
  }, [run, intervalMs]);

  return { data, loading, error, refresh: run };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
    const diff = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7)  return `${diff}d ago`;
    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  } catch { return iso; }
}

function fmtShortDate(iso: string): string {
  try {
    const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  } catch { return iso; }
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

const ACTIVITY_ICON: Record<string, { emoji: string; color: string }> = {
  walk_progress: { emoji: '🚶', color: 'text-teal-600' },
  room_join:     { emoji: '🏠', color: 'text-indigo-600' },
  milestone:     { emoji: '🏆', color: 'text-yellow-600' },
  attendance:    { emoji: '✅', color: 'text-green-600' },
};

const SIG_CAT_DOT: Record<api.SignalCategory, string> = {
  celebration: 'bg-green-500',
  growth:      'bg-teal-500',
  attention:   'bg-amber-500',
  follow_up:   'bg-orange-500',
  significant: 'bg-rose-500',
};

const SIG_CAT_BG: Record<api.SignalCategory, string> = {
  celebration: 'bg-green-50 border-green-200',
  growth:      'bg-teal-50 border-teal-200',
  attention:   'bg-amber-50 border-amber-200',
  follow_up:   'bg-orange-50 border-orange-200',
  significant: 'bg-rose-50 border-rose-200',
};

const SIG_CAT_ICON: Record<api.SignalCategory, React.ElementType> = {
  celebration: Trophy,
  growth:      TrendingUp,
  attention:   AlertTriangle,
  follow_up:   PhoneCall,
  significant: Star,
};

// ─── Primitives ───────────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon, title, count, iconColor = 'text-teal-600', action,
}: {
  icon: React.ElementType; title: string; count?: number;
  iconColor?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={13} className={iconColor} />
      <h2 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider flex-1">
        {title}
      </h2>
      {count !== undefined && count > 0 && (
        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-semibold">
          {count}
        </span>
      )}
      {action}
    </div>
  );
}

function WidgetError({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-rose-500 py-4 px-3 bg-rose-50 rounded-xl border border-rose-100">
      <AlertCircle size={13} /> {msg}
    </div>
  );
}

function WidgetLoading() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 size={18} className="animate-spin text-gray-300" />
    </div>
  );
}

// ─── S1: Today Stats ──────────────────────────────────────────────────────────

function TodaySection({
  auth, onNavigate,
}: { auth: api.AuthHeaders; onNavigate: (nav: AdminNav) => void }) {
  const { prayerRequests } = useAdmin();
  const openPrayers = prayerRequests.filter(
    (p: { status: string }) => p.status === 'new' || p.status === 'acknowledged'
  ).length;

  const fetch = useCallback(() => api.getDashTodayStats(auth), [auth.userId]);
  const { data, loading, error } = useAutoFetch(fetch);

  const cards = data ? [
    {
      label: 'Church Attendance Today',
      value: data.attendance.sessionCount === 0 ? '—'
        : `${data.attendance.present} / ${data.attendance.expected}`,
      sub: data.attendance.sessionCount === 0 ? 'No session today' : 'Present / Expected',
      icon: CalendarDays, iconColor: 'text-teal-600',
      onClick: () => onNavigate({ section: 'people', peopleTab: 'attendance' }),
    },
    {
      label: 'Active Walks',
      value: data.activeWalks,
      sub: 'Currently in progress',
      icon: BookOpen, iconColor: 'text-indigo-600',
      onClick: () => onNavigate({ section: 'people', peopleTab: 'members' }),
    },
    {
      label: 'Daily Rhythm Today',
      value: data.devotionalActivityToday,
      sub: 'Members active today',
      icon: Flame, iconColor: 'text-orange-500',
      onClick: () => onNavigate({ section: 'people', peopleTab: 'members' }),
    },
    {
      label: 'Open Prayer Requests',
      value: openPrayers,
      sub: 'Awaiting response',
      icon: Heart, iconColor: 'text-rose-500',
      onClick: () => onNavigate({ section: 'people', peopleTab: 'prayer' }),
    },
    {
      label: 'New People This Week',
      value: data.newPeopleThisWeek.pastoralPersons + data.newPeopleThisWeek.emmausAccounts,
      sub: `${data.newPeopleThisWeek.pastoralPersons} visitors · ${data.newPeopleThisWeek.emmausAccounts} accounts`,
      icon: Users, iconColor: 'text-blue-600',
      onClick: () => onNavigate({ section: 'people', peopleTab: 'members' }),
    },
    {
      label: 'Needs Follow-up',
      value: data.followUpSignalCount,
      sub: 'Open signals',
      icon: Flag, iconColor: 'text-amber-600',
      urgent: data.followUpSignalCount > 0,
      onClick: () => onNavigate({ section: 'people', peopleTab: 'signals' }),
    },
  ] : [];

  return (
    <section className="mb-8">
      <SectionHeader icon={Activity} title="Today" iconColor="text-teal-600" />
      {loading ? <WidgetLoading /> : error ? <WidgetError msg={error} /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {cards.map(({ label, value, sub, icon: Icon, iconColor, onClick, urgent }) => (
            <button
              key={label}
              onClick={onClick}
              className={`text-left bg-white rounded-xl border p-4 space-y-2 hover:shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-teal-300 ${
                urgent ? 'border-rose-300 bg-rose-50' : 'border-gray-200'
              }`}
            >
              <Icon size={14} className={iconColor} />
              <div className={`text-[26px] font-semibold ${urgent ? 'text-rose-700' : 'text-gray-900'}`}>{value}</div>
              <div className="text-[11px] font-medium text-gray-700 leading-tight">{label}</div>
              {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── S2: Care Signals ─────────────────────────────────────────────────────────

function CareSignalsSection({
  auth, onViewProfile,
}: { auth: api.AuthHeaders; onViewProfile: (s: api.DiscipleshipSignal) => void }) {
  const fetch = useCallback(
    () => api.listDiscipleshipSignals(auth, {
      status: ['new', 'acknowledged', 'following_up'],
      limit: 12,
    }),
    [auth.userId],
  );
  const { data: signals, loading, error, refresh } = useAutoFetch(fetch);
  const [busy, setBusy] = useState<string | null>(null);

  const handleStatus = async (id: string, status: api.SignalStatus) => {
    setBusy(id);
    try {
      await api.updateSignalStatus(auth, id, status);
      refresh();
    } catch { /* no-op */ }
    finally { setBusy(null); }
  };

  const open = signals?.filter(s => !['resolved','dismissed'].includes(s.status)) ?? [];

  return (
    <section className="mb-8">
      <SectionHeader
        icon={Zap} title="Care Signals" iconColor="text-teal-600"
        count={open.length}
        action={
          <button onClick={refresh} className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
            <RefreshCw size={10} /> refresh
          </button>
        }
      />
      {loading ? <WidgetLoading /> : error ? <WidgetError msg={error} /> :
       open.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-xl border border-gray-200">
          <Zap size={20} className="mx-auto mb-2 text-gray-200" />
          <p className="text-[12px] text-gray-400">No open signals. Run the engine from People → Signals.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {open.map(s => {
            const CatIcon = SIG_CAT_ICON[s.category];
            return (
              <div key={s.id} className={`rounded-xl border p-4 flex flex-col gap-3 ${SIG_CAT_BG[s.category]}`}>
                <div className="flex items-start gap-2">
                  <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${SIG_CAT_DOT[s.category]}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <CatIcon size={11} className="text-gray-500 shrink-0" />
                      <span className="text-[11px] font-semibold text-gray-700">{s.title}</span>
                    </div>
                    <p className="text-[13px] font-medium text-gray-900 leading-snug">{s.personName ?? s.personId}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{s.explanation}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{fmtDate(s.detectedAt)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1 pt-2 border-t border-black/5">
                  <button
                    onClick={() => onViewProfile(s)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-teal-700 hover:bg-teal-100"
                  >
                    <UserCircle size={10} /> View Profile
                  </button>
                  {s.status === 'new' && (
                    <button
                      disabled={busy === s.id}
                      onClick={() => handleStatus(s.id, 'acknowledged')}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-gray-600 hover:bg-white/60 disabled:opacity-40"
                    >
                      <CheckCheck size={10} /> Acknowledge
                    </button>
                  )}
                  <button
                    disabled={busy === s.id}
                    onClick={() => handleStatus(s.id, 'following_up')}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-indigo-600 hover:bg-white/60 disabled:opacity-40"
                  >
                    <Flag size={10} /> Following Up
                  </button>
                  <button
                    disabled={busy === s.id}
                    onClick={() => handleStatus(s.id, 'dismissed')}
                    className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-[10px] text-gray-400 hover:bg-white/60 disabled:opacity-40"
                  >
                    <X size={10} /> Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── S3: Discipleship Movement ────────────────────────────────────────────────

function MovementSection({ auth }: { auth: api.AuthHeaders }) {
  const fetch = useCallback(() => api.getDashMovement(auth), [auth.userId]);
  const { data, loading, error } = useAutoFetch(fetch);
  const now = new Date();
  const monthName = now.toLocaleDateString('en-ZA', { month: 'long' });

  const ICON_MAP: Record<string, { icon: React.ElementType; color: string }> = {
    walks_started:    { icon: BookOpen,     color: 'text-teal-600' },
    walks_completed:  { icon: CheckCheck,   color: 'text-green-600' },
    rooms_joined:     { icon: DoorOpen,     color: 'text-indigo-600' },
    rhythm_started:   { icon: Flame,        color: 'text-orange-500' },
    rhythm_completed: { icon: Activity,     color: 'text-blue-600' },
    baptised:         { icon: Trophy,       color: 'text-yellow-600' },
    accepted_christ:  { icon: Star,         color: 'text-rose-600' },
    significant:      { icon: Zap,          color: 'text-purple-600' },
  };

  return (
    <section className="mb-8">
      <SectionHeader
        icon={TrendingUp} title={`Discipleship Movement — ${monthName}`}
        iconColor="text-blue-600"
      />
      {loading ? <WidgetLoading /> : error ? <WidgetError msg={error} /> : (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {(data ?? []).map(card => {
            const { icon: Icon, color } = ICON_MAP[card.id] ?? { icon: Activity, color: 'text-gray-500' };
            return (
              <div key={card.id} className="bg-white rounded-xl border border-gray-200 p-4 text-center space-y-2">
                <Icon size={14} className={`mx-auto ${color}`} />
                <div className="text-[28px] font-semibold text-gray-900">{card.count}</div>
                <div className="text-[10px] font-medium text-gray-500 leading-tight">{card.label}</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── S4: Engagement Charts ────────────────────────────────────────────────────

function EngagementSection({ auth }: { auth: api.AuthHeaders }) {
  const fetch = useCallback(() => api.getDashEngagement(auth), [auth.userId]);
  const { data, loading, error } = useAutoFetch(fetch);

  if (loading) return (
    <section className="mb-8">
      <SectionHeader icon={Activity} title="Engagement" iconColor="text-purple-600" />
      <WidgetLoading />
    </section>
  );

  if (error) return (
    <section className="mb-8">
      <SectionHeader icon={Activity} title="Engagement" iconColor="text-purple-600" />
      <WidgetError msg={error} />
    </section>
  );

  const noData = !data ||
    (data.attendanceLast12.length === 0 && data.devotionalLast30.length === 0 &&
     data.walkStartsLast90.length === 0);

  return (
    <section className="mb-8">
      <SectionHeader icon={Activity} title="Engagement" iconColor="text-purple-600" />
      {noData ? (
        <div className="bg-white rounded-xl border border-gray-200 py-8 text-center">
          <p className="text-[12px] text-gray-400">No engagement data yet. Record attendance and journeys to see charts here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Attendance */}
          {data!.attendanceLast12.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Attendance — Last {data!.attendanceLast12.length} Sessions
              </p>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={data!.attendanceLast12} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#0d9488" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={fmtShortDate} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                    formatter={(v: number, name: string) => [v, name === 'present' ? 'Present' : 'Expected']}
                    labelFormatter={fmtShortDate}
                  />
                  <Area type="monotone" dataKey="expected" stroke="#e5e7eb" fill="none" strokeDasharray="4 2" dot={false} />
                  <Area type="monotone" dataKey="present"  stroke="#0d9488" fill="url(#attGrad)" strokeWidth={2} dot={{ r: 3, fill: '#0d9488' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Daily rhythm */}
            {data!.devotionalLast30.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Daily Rhythm — Last 30 Days
                </p>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={data!.devotionalLast30} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={fmtShortDate} interval={6} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} labelFormatter={fmtShortDate} />
                    <Bar dataKey="count" fill="#0ea5e9" radius={[3,3,0,0]} name="Active users" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Walk activity */}
            {(data!.walkStartsLast90.length > 0 || data!.walkCompletionsLast90.length > 0) && (() => {
              // Merge starts and completions by week
              const weekMap: Record<string, { date: string; starts: number; completions: number }> = {};
              data!.walkStartsLast90.forEach(p => {
                weekMap[p.date] = weekMap[p.date] ?? { date: p.date, starts: 0, completions: 0 };
                weekMap[p.date].starts = p.count;
              });
              data!.walkCompletionsLast90.forEach(p => {
                weekMap[p.date] = weekMap[p.date] ?? { date: p.date, starts: 0, completions: 0 };
                weekMap[p.date].completions = p.count;
              });
              const merged = Object.values(weekMap).sort((a,b) => a.date.localeCompare(b.date));
              return (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Walk Activity — Last 12 Weeks
                  </p>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={merged} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={fmtShortDate} interval={2} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} labelFormatter={fmtShortDate} />
                      <Bar dataKey="starts"      fill="#6366f1" radius={[3,3,0,0]} name="Started" />
                      <Bar dataKey="completions" fill="#22c55e" radius={[3,3,0,0]} name="Completed" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── S5: New Believers ────────────────────────────────────────────────────────

function NewBelieversSection({
  auth, onViewProfileById,
}: {
  auth: api.AuthHeaders;
  onViewProfileById: (userId: string) => void;
}) {
  const fetch = useCallback(() => api.getDashNewBelievers(auth), [auth.userId]);
  const { data, loading, error } = useAutoFetch(fetch);

  return (
    <section className="mb-8">
      <SectionHeader icon={Star} title="New Believers" iconColor="text-yellow-600"
        count={data?.length} />
      {loading ? <WidgetLoading /> : error ? <WidgetError msg={error} /> :
       !data?.length ? (
        <div className="bg-white rounded-xl border border-gray-200 py-6 text-center">
          <p className="text-[12px] text-gray-400">No new believers recorded in the last 60 days.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {data.map(b => (
              <div key={b.userId} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-yellow-50 flex items-center justify-center shrink-0 text-[11px] font-semibold text-yellow-700">
                  {initials(b.personName)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-gray-900">{b.personName}</p>
                  <p className="text-[11px] text-gray-500">
                    Completed "{b.journeyTitle}" · {fmtDate(b.completedAt)}
                  </p>
                  <div className="flex gap-2 mt-1">
                    {b.hasBaptism ? (
                      <span className="text-[10px] text-green-600 font-medium">✓ Baptised</span>
                    ) : (
                      <span className="text-[10px] text-amber-600 font-medium">⚠ Needs baptism</span>
                    )}
                    {b.hasRoom ? (
                      <span className="text-[10px] text-green-600 font-medium">✓ In a Group</span>
                    ) : (
                      <span className="text-[10px] text-amber-600 font-medium">⚠ Needs a Group</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onViewProfileById(b.userId)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-teal-700 hover:bg-teal-50"
                >
                  <ChevronRight size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── S6: Recent Activity ──────────────────────────────────────────────────────

function ActivitySection({ auth }: { auth: api.AuthHeaders }) {
  const fetch = useCallback(() => api.getDashActivity(auth), [auth.userId]);
  const { data, loading, error } = useAutoFetch(fetch);
  const [expanded, setExpanded] = useState(false);

  const items = data ?? [];
  const visible = expanded ? items : items.slice(0, 8);

  return (
    <section className="mb-8">
      <SectionHeader icon={Clock} title="Recent Activity" iconColor="text-gray-500" />
      {loading ? <WidgetLoading /> : error ? <WidgetError msg={error} /> :
       items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-6 text-center">
          <p className="text-[12px] text-gray-400">No recent activity. Events will appear here as people engage.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {visible.map(item => {
              const meta = ACTIVITY_ICON[item.type] ?? { emoji: '📌', color: 'text-gray-500' };
              return (
                <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="text-[16px] shrink-0 mt-0.5">{meta.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900">{item.personName}</p>
                    <p className="text-[11px] text-gray-500">{item.detail}</p>
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0">{fmtDate(item.eventAt)}</span>
                </div>
              );
            })}
          </div>
          {items.length > 8 && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="w-full py-3 text-[12px] text-teal-600 font-medium hover:bg-teal-50 transition-colors border-t border-gray-100"
            >
              {expanded ? 'Show less' : `Show ${items.length - 8} more`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ─── S7: Follow-up Queue ──────────────────────────────────────────────────────

function FollowUpQueueSection({
  auth, onViewProfile,
}: { auth: api.AuthHeaders; onViewProfile: (s: api.DiscipleshipSignal) => void }) {
  const fetch = useCallback(
    () => api.listDiscipleshipSignals(auth, {
      status: ['new', 'acknowledged', 'following_up'],
      limit: 50,
    }),
    [auth.userId],
  );
  const { data: signals, loading, error, refresh } = useAutoFetch(fetch);
  const [busy, setBusy] = useState<string | null>(null);

  const queue = useMemo(
    () => (signals ?? []).filter(s => ['follow_up','attention','significant'].includes(s.category)),
    [signals],
  );

  const handleComplete = async (id: string) => {
    setBusy(id);
    try { await api.updateSignalStatus(auth, id, 'resolved'); refresh(); }
    catch { /* no-op */ }
    finally { setBusy(null); }
  };

  return (
    <section className="mb-8">
      <SectionHeader icon={ClipboardList} title="Follow-up Queue" iconColor="text-orange-600"
        count={queue.length} />
      {loading ? <WidgetLoading /> : error ? <WidgetError msg={error} /> :
       queue.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-6 text-center">
          <p className="text-[12px] text-gray-400">No pending follow-ups.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[2fr_2fr_1fr_1fr_auto] gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
            {['Person','Reason','Priority','Assigned To',''].map(h => (
              <span key={h} className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{h}</span>
            ))}
          </div>
          <div className="divide-y divide-gray-100">
            {queue.map(s => {
              const priority =
                s.category === 'significant' ? { label: 'High',   color: 'text-rose-600   bg-rose-50' } :
                s.category === 'follow_up'   ? { label: 'Medium', color: 'text-orange-600 bg-orange-50' } :
                                               { label: 'Low',    color: 'text-gray-500   bg-gray-100' };
              return (
                <div key={s.id} className="grid grid-cols-1 sm:grid-cols-[2fr_2fr_1fr_1fr_auto] gap-2 px-4 py-3 items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-semibold text-gray-600 shrink-0">
                      {initials(s.personName ?? s.personId)}
                    </div>
                    <span className="text-[12px] font-medium text-gray-900 truncate">{s.personName ?? s.personId}</span>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-700 truncate">{s.title}</p>
                    <p className="text-[10px] text-gray-400 truncate">{fmtDate(s.detectedAt)}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit ${priority.color}`}>
                    {priority.label}
                  </span>
                  <span className="text-[11px] text-gray-500 truncate">{s.assignedTo ?? '—'}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onViewProfile(s)}
                      className="px-2 py-1 rounded text-[10px] text-teal-700 hover:bg-teal-50 font-medium"
                    >Open</button>
                    <button
                      disabled={busy === s.id}
                      onClick={() => handleComplete(s.id)}
                      className="px-2 py-1 rounded text-[10px] text-green-700 hover:bg-green-50 font-medium disabled:opacity-40"
                    >Done</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── S8: Quick Actions ────────────────────────────────────────────────────────

function QuickActionsSection({ onNavigate }: { onNavigate: (nav: AdminNav) => void }) {
  const actions = [
    { label: 'Record Attendance',  icon: ClipboardList, color: 'bg-teal-50 text-teal-700',    nav: { section: 'people' as const, peopleTab: 'attendance' as const } },
    { label: 'View Care Signals',  icon: Zap,           color: 'bg-purple-50 text-purple-700', nav: { section: 'people' as const, peopleTab: 'signals' as const } },
    { label: 'New Journey',        icon: BookOpen,      color: 'bg-indigo-50 text-indigo-700', nav: { section: 'content-studio' as const } },
    { label: 'Process Sermon',     icon: Clapperboard,  color: 'bg-rose-50 text-rose-700',     nav: { section: 'content-studio' as const } },
    { label: 'Search Person',      icon: Users,         color: 'bg-blue-50 text-blue-700',     nav: { section: 'people' as const, peopleTab: 'members' as const } },
    { label: 'Prayer Requests',    icon: Heart,         color: 'bg-pink-50 text-pink-700',     nav: { section: 'people' as const, peopleTab: 'prayer' as const } },
  ];

  return (
    <section className="mb-8">
      <SectionHeader icon={Zap} title="Quick Actions" iconColor="text-gray-500" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {actions.map(({ label, icon: Icon, color, nav }) => (
          <button
            key={label}
            onClick={() => onNavigate(nav)}
            className="flex flex-col items-center gap-2 bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-teal-300"
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
              <Icon size={16} />
            </div>
            <span className="text-[11px] font-medium text-gray-700 text-center leading-tight">{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ─── S9: Search ───────────────────────────────────────────────────────────────

function SearchSection({
  auth, onViewProfileById,
}: { auth: api.AuthHeaders; onViewProfileById: (id: string, type: api.PersonType) => void }) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<api.UnifiedPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!query.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const all = await api.listPeople(auth);
        const q = query.toLowerCase();
        setResults(
          all.filter(p =>
            p.fullName.toLowerCase().includes(q) ||
            p.id.toLowerCase().includes(q) ||
            (p.email ?? '').toLowerCase().includes(q)
          ).slice(0, 8)
        );
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [query, auth.userId]);

  return (
    <section className="mb-8">
      <SectionHeader icon={Search} title="Search" iconColor="text-gray-500" />
      <div className="relative max-w-lg">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search people, walks, groups…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
        />
        {loading && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
      </div>
      {results.length > 0 && (
        <div className="mt-2 max-w-lg bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {results.map(p => (
            <button
              key={p.id + p.personType}
              onClick={() => { onViewProfileById(p.id, p.personType); setQuery(''); setResults([]); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left border-b border-gray-100 last:border-b-0"
            >
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-semibold text-gray-600 shrink-0">
                {initials(p.fullName)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-gray-900">{p.fullName}</p>
                <p className="text-[10px] text-gray-400 capitalize">{p.personType.replace('_', ' ')}</p>
              </div>
              <ChevronRight size={12} className="text-gray-300" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

interface Props { onNavigate: (nav: AdminNav) => void; }

export default function PastoralDashboard({ onNavigate }: Props) {
  const { user } = useAuth();
  const auth: api.AuthHeaders = { userId: user?.id ?? '', userRole: user?.role ?? 'admin' };

  // Profile overlay: signal source for looking up person
  const [profileSignal, setProfileSignal] = useState<api.DiscipleshipSignal | null>(null);
  const [profilePerson, setProfilePerson] = useState<api.UnifiedPerson | null>(null);
  const [peopleCache,   setPeopleCache]   = useState<api.UnifiedPerson[]>([]);

  // Pre-load people list once for quick lookups
  useEffect(() => {
    api.listPeople(auth).then(setPeopleCache).catch(() => {});
  }, [auth.userId]);

  const openProfileFromSignal = useCallback((signal: api.DiscipleshipSignal) => {
    const found = peopleCache.find(
      p => p.id === signal.personId && p.personType === signal.personType
    );
    if (found) { setProfilePerson(found); return; }
    // Fallback: construct minimal person
    setProfilePerson({
      id: signal.personId, sourceId: signal.personId,
      personType: signal.personType,
      subType: signal.personType === 'emmaus_user' ? 'emmaus_user' : 'visitor',
      fullName: signal.personName ?? signal.personId,
      email: null, phone: null, linkedUserId: null,
      isLinked: false,
      lastAttendanceDate: null, lastAttendanceStatus: null,
      churchId: 'icc',
    } as api.UnifiedPerson);
  }, [peopleCache]);

  const openProfileById = useCallback((id: string, type?: api.PersonType) => {
    const t = type ?? ('emmaus_user' as api.PersonType);
    const found = peopleCache.find(p => p.id === id && p.personType === t);
    if (found) { setProfilePerson(found); return; }
    const anyFound = peopleCache.find(p => p.id === id);
    if (anyFound) { setProfilePerson(anyFound); return; }
    setProfilePerson({
      id, sourceId: id,
      personType: t,
      subType: t === 'emmaus_user' ? 'emmaus_user' : 'visitor',
      fullName: id,
      email: null, phone: null, linkedUserId: null,
      isLinked: false,
      lastAttendanceDate: null, lastAttendanceStatus: null,
      churchId: 'icc',
    } as api.UnifiedPerson);
  }, [peopleCache]);

  // Show PersonPage overlay
  if (profilePerson) {
    return (
      <PersonPage
        person={profilePerson}
        onBack={() => { setProfilePerson(null); setProfileSignal(null); }}
      />
    );
  }

  const now = new Date();
  const lastRefresh = now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-semibold text-gray-900">Pastoral Dashboard</h1>
          <p className="text-[12px] text-gray-400 mt-0.5">
            How are our people doing spiritually? · Auto-refreshes every 30s · Last checked {lastRefresh}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          <RefreshCw size={11} className="animate-spin [animation-duration:4s] text-teal-400" />
          Live
        </div>
      </div>

      {/* S8 Quick Actions — at top for easy access */}
      <QuickActionsSection onNavigate={onNavigate} />

      {/* S1 Today Stats */}
      <TodaySection auth={auth} onNavigate={onNavigate} />

      {/* S2 Care Signals */}
      <CareSignalsSection auth={auth} onViewProfile={openProfileFromSignal} />

      {/* S7 Follow-up Queue */}
      <FollowUpQueueSection auth={auth} onViewProfile={openProfileFromSignal} />

      {/* S3 Discipleship Movement */}
      <MovementSection auth={auth} />

      {/* S4 Engagement Charts */}
      <EngagementSection auth={auth} />

      {/* S5 New Believers */}
      <NewBelieversSection auth={auth} onViewProfileById={openProfileById} />

      {/* S6 Recent Activity */}
      <ActivitySection auth={auth} />

      {/* S9 Search */}
      <SearchSection auth={auth} onViewProfileById={openProfileById} />
    </div>
  );
}
