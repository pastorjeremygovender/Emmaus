/**
 * Dashboard.tsx — Pastor's Morning Briefing
 *
 * Action-first dashboard answering: "What does the pastor need to know today?"
 *
 * Sections (load independently — a slow query never blocks the rest):
 *   S1  Greeting          — time-based salutation, pastor name, date
 *   S2  Today's Overview  — 4 live summary cards
 *   S3  Priority Today    — top 5 open discipleship signals with actions
 *   S4  Celebrations      — positive milestones and walk completions
 *   S5  Ministry Snapshot — KPI cards from analytics
 *   S6  Trends            — 3 Recharts charts from getDashEngagement
 *   S7  Upcoming          — workflow calendar + recent activity
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Loader2, AlertCircle, Sun, Sunset, Moon, Sunrise,
  Users, BookOpen, Heart, TrendingUp, Trophy,
  Star, Zap, Flag, AlertTriangle, CheckCheck, Activity,
  Flame, CalendarDays, ChevronRight, UserCircle,
  Plus, X, RefreshCw, PartyPopper, Clock, ListChecks,
} from 'lucide-react';
import * as pastoralApi from '@/lib/pastoral-api';
import * as analyticsApi from '@/lib/analytics-api';
import * as workflowsApi from '@/lib/workflows-api';
import { useAuth } from '@/contexts/AuthContext';
import { PASTOR_DISPLAY_NAME } from '@/lib/pastor-name';
import type { AdminNav } from '../Admin';

// ─── Types ────────────────────────────────────────────────────────────────────

type PAuth = pastoralApi.AuthHeaders;    // { userId, userRole }
type AAuth = analyticsApi.AuthHeaders;   // { userId, userRole }
type WAuth = workflowsApi.AuthHeaders;   // { "x-user-id", "x-user-role" }

type Props = { onNavigate: (nav: AdminNav) => void };

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

function fmtShort(iso: string): string {
  try {
    const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  } catch { return iso; }
}

function relDate(iso: string): string {
  try {
    const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
    const diff = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7)  return `${diff}d ago`;
    return fmtShort(iso);
  } catch { return iso; }
}

function initials(name: string): string {
  return (name ?? '?').split(' ').filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon, title, iconColor = 'text-teal-600', count, action,
}: {
  icon: React.ElementType; title: string; iconColor?: string;
  count?: number; action?: React.ReactNode;
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

// ─── S1: Greeting ─────────────────────────────────────────────────────────────

function useGreeting() {
  const [greeting, setGreeting] = useState('');
  const [GreetIcon, setGreetIcon] = useState<React.ElementType>(() => Sun);
  const [dateStr, setDateStr] = useState('');

  useEffect(() => {
    function update() {
      const now = new Date();
      const h = now.getHours();
      if (h < 5)       { setGreeting('Good Evening');   setGreetIcon(() => Moon); }
      else if (h < 12) { setGreeting('Good Morning');   setGreetIcon(() => Sunrise); }
      else if (h < 17) { setGreeting('Good Afternoon'); setGreetIcon(() => Sun); }
      else if (h < 20) { setGreeting('Good Evening');   setGreetIcon(() => Sunset); }
      else             { setGreeting('Good Evening');   setGreetIcon(() => Moon); }
      setDateStr(now.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    }
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, []);

  return { greeting, GreetIcon, dateStr };
}

function GreetingSection() {
  const { greeting, GreetIcon, dateStr } = useGreeting();
  return (
    <section className="mb-8">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center flex-shrink-0">
          <GreetIcon size={22} className="text-teal-600" />
        </div>
        <div>
          <h1 className="text-[22px] font-semibold text-gray-900 leading-tight">
            {greeting}, {PASTOR_DISPLAY_NAME}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{dateStr}</p>
        </div>
      </div>
    </section>
  );
}

// ─── S2: Today's Overview ─────────────────────────────────────────────────────

function OverviewCard({
  label, value, sub, icon: Icon, iconColor, urgent = false, onClick,
}: {
  label: string; value: string | number; sub: string;
  icon: React.ElementType; iconColor: string; urgent?: boolean; onClick?: () => void;
}) {
  const cls = `text-left w-full rounded-xl border p-4 space-y-2 transition-shadow ${
    urgent ? 'border-rose-300 bg-rose-50 hover:shadow-md' : 'bg-white border-gray-200 hover:shadow-sm'
  } focus:outline-none focus:ring-2 focus:ring-teal-300`;

  const inner = (
    <>
      <Icon size={15} className={iconColor} />
      <div className={`text-[26px] font-bold leading-none ${urgent ? 'text-rose-700' : 'text-gray-900'}`}>
        {value}
      </div>
      <div className="text-[12px] font-semibold text-gray-700 leading-tight">{label}</div>
      <div className="text-[11px] text-gray-400 leading-snug">{sub}</div>
    </>
  );

  return onClick
    ? <button className={cls} onClick={onClick}>{inner}</button>
    : <div className={cls}>{inner}</div>;
}

function OverviewSection({
  pAuth, wAuth, onNavigate,
}: { pAuth: PAuth; wAuth: WAuth; onNavigate: (n: AdminNav) => void }) {
  const fetchStats   = useCallback(() => pastoralApi.getDashTodayStats(pAuth), [pAuth.userId]);
  const fetchPastor  = useCallback(() => workflowsApi.getPastorView(wAuth), [wAuth['x-user-id']]);

  const { data: stats,  loading: sL, error: sE } = useAutoFetch(fetchStats);
  const { data: pastor, loading: pL, error: pE } = useAutoFetch(fetchPastor);

  const loading = sL || pL;
  const error   = sE || pE;

  if (loading) return (
    <section className="mb-8">
      <SectionHeader icon={Activity} title="Today's Overview" />
      <WidgetLoading />
    </section>
  );

  if (error) return (
    <section className="mb-8">
      <SectionHeader icon={Activity} title="Today's Overview" />
      <WidgetError msg={error} />
    </section>
  );

  const signalCount  = stats?.followUpSignalCount ?? 0;
  const overdueCount = pastor?.stats.totalOverdue ?? 0;
  const growing      = (stats?.activeWalks ?? 0) + (stats?.activeDevotionals ?? 0);
  const todayAtt     = stats?.attendance;
  const engagementVal = todayAtt && todayAtt.sessionCount > 0
    ? `${todayAtt.present}/${todayAtt.expected}`
    : '—';
  const engagementSub = todayAtt && todayAtt.sessionCount > 0
    ? `Present / expected today`
    : 'No session recorded today';

  const cards = [
    {
      label: 'Needing Attention', value: signalCount,
      sub: 'Open care signals', icon: AlertTriangle, iconColor: 'text-amber-500',
      urgent: signalCount > 0,
      onClick: () => onNavigate({ section: 'people', peopleTab: 'signals' }),
    },
    {
      label: 'Follow-ups Overdue', value: overdueCount,
      sub: 'Ministry tasks past due', icon: Flag, iconColor: 'text-rose-500',
      urgent: overdueCount > 0,
      onClick: () => onNavigate({ section: 'workflows' }),
    },
    {
      label: 'Growing Consistently', value: growing,
      sub: 'Active walks + devotionals', icon: TrendingUp, iconColor: 'text-teal-600',
      onClick: () => onNavigate({ section: 'people', peopleTab: 'members' }),
    },
    {
      label: 'Church Engagement', value: engagementVal,
      sub: engagementSub, icon: CalendarDays, iconColor: 'text-blue-500',
      onClick: () => onNavigate({ section: 'people', peopleTab: 'attendance' }),
    },
  ];

  return (
    <section className="mb-8">
      <SectionHeader icon={Activity} title="Today's Overview" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(({ label, value, sub, icon, iconColor, urgent, onClick }) => (
          <OverviewCard key={label} label={label} value={value} sub={sub}
            icon={icon} iconColor={iconColor} urgent={urgent} onClick={onClick} />
        ))}
      </div>
    </section>
  );
}

// ─── S3: Priority Today ───────────────────────────────────────────────────────

const SIG_CAT_RING: Record<pastoralApi.SignalCategory, string> = {
  celebration: 'ring-green-300 bg-green-50',
  growth:      'ring-teal-300 bg-teal-50',
  attention:   'ring-amber-300 bg-amber-50',
  follow_up:   'ring-orange-300 bg-orange-50',
  significant: 'ring-rose-300 bg-rose-50',
};

const SIG_AVATAR: Record<pastoralApi.SignalCategory, string> = {
  celebration: 'bg-green-100 text-green-800',
  growth:      'bg-teal-100 text-teal-800',
  attention:   'bg-amber-100 text-amber-800',
  follow_up:   'bg-orange-100 text-orange-800',
  significant: 'bg-rose-100 text-rose-800',
};

const PRIORITY_SORT: Record<pastoralApi.SignalCategory, number> = {
  significant: 0, follow_up: 1, attention: 2, growth: 3, celebration: 4,
};

interface CreateTaskForm {
  signalId: string;
  title: string;
  personId: string;
  personType: pastoralApi.PersonType;
}

function PriorityTodaySection({
  pAuth, wAuth, onNavigate,
}: { pAuth: PAuth; wAuth: WAuth; onNavigate: (n: AdminNav) => void }) {
  const fetch = useCallback(
    () => pastoralApi.listDiscipleshipSignals(pAuth, {
      status: ['new', 'acknowledged', 'following_up'],
      limit: 10,
    }),
    [pAuth.userId],
  );
  const { data, loading, error, refresh } = useAutoFetch(fetch);

  const [busy,          setBusy]          = useState<string | null>(null);
  const [taskForm,      setTaskForm]      = useState<CreateTaskForm | null>(null);
  const [taskNote,      setTaskNote]      = useState('');
  const [taskBusy,      setTaskBusy]      = useState(false);
  const [dismissed,     setDismissed]     = useState<Set<string>>(new Set());
  const [engineRunning, setEngineRunning] = useState(false);
  const [engineConfirm, setEngineConfirm] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRunEngine = async () => {
    setEngineRunning(true);
    try {
      await pastoralApi.runSignalsEngine(pAuth);
      await refresh();
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      setEngineConfirm(true);
      confirmTimer.current = setTimeout(() => setEngineConfirm(false), 3000);
    } catch { /* no-op */ }
    finally { setEngineRunning(false); }
  };

  const sorted = [...(data ?? [])]
    .sort((a, b) => (PRIORITY_SORT[a.category] ?? 5) - (PRIORITY_SORT[b.category] ?? 5))
    .filter(s => !dismissed.has(s.id))
    .slice(0, 5);

  const handleMarkReviewed = async (id: string) => {
    setBusy(id);
    try {
      await pastoralApi.updateSignalStatus(pAuth, id, 'acknowledged');
      setDismissed(prev => new Set([...prev, id]));
      refresh();
    } catch { /* no-op */ }
    finally { setBusy(null); }
  };

  const handleOpenCreateTask = (s: pastoralApi.DiscipleshipSignal) => {
    setTaskForm({
      signalId: s.id,
      title: s.title,
      personId: s.personId,
      personType: s.personType,
    });
    setTaskNote('');
  };

  const handleCreateTask = async () => {
    if (!taskForm) return;
    setTaskBusy(true);
    try {
      await workflowsApi.createTask(wAuth, {
        title: taskForm.title,
        personId: taskForm.personId,
        personType: taskForm.personType,
        source: 'care_signal',
        priority: 'high',
        reason: taskNote || taskForm.title,
        signalId: taskForm.signalId,
      });
      setTaskForm(null);
      setDismissed(prev => new Set([...prev, taskForm.signalId]));
    } catch { /* no-op */ }
    finally { setTaskBusy(false); }
  };

  return (
    <section className="mb-8">
      <SectionHeader
        icon={Zap} title="Priority Today" iconColor="text-rose-500"
        count={sorted.length}
        action={
          <button onClick={refresh} className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
            <RefreshCw size={10} /> Refresh
          </button>
        }
      />

      {engineConfirm && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-teal-50 border border-teal-200 text-[12px] text-teal-700 font-medium">
          <CheckCheck size={13} className="text-teal-600 shrink-0" /> Signals updated
        </div>
      )}

      {loading ? <WidgetLoading /> : error ? <WidgetError msg={error} /> :
       sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-8 text-center">
          <Zap size={20} className="mx-auto mb-2 text-gray-200" />
          <p className="text-[13px] font-medium text-gray-700">No open signals</p>
          <p className="text-[12px] text-gray-400 mt-1 mb-4">
            Run the signals engine to detect care needs.
          </p>
          <button
            disabled={engineRunning}
            onClick={handleRunEngine}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 text-white text-[12px] font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {engineRunning
              ? <><Loader2 size={13} className="animate-spin" /> Running…</>
              : <><Zap size={13} /> Run signals engine</>
            }
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(s => (
            <div
              key={s.id}
              className={`rounded-xl border ring-1 p-4 ${SIG_CAT_RING[s.category]}`}
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[12px] font-bold ${SIG_AVATAR[s.category]}`}>
                  {initials(s.personName ?? s.personId)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[14px] font-semibold text-gray-900 leading-tight">
                        {s.personName ?? 'Unknown person'}
                      </p>
                      <p className="text-[11px] font-medium text-gray-500 mt-0.5">{s.title}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0 mt-0.5">{relDate(s.detectedAt)}</span>
                  </div>
                  <p className="text-[12px] text-gray-700 mt-1.5 leading-relaxed">{s.explanation}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-black/5">
                <button
                  onClick={() => onNavigate({
                    section: 'people',
                    personDeepLink: {
                      personId: s.personId,
                      personType: s.personType,
                      personName: s.personName,
                    },
                  })}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-[11px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <UserCircle size={11} /> Open Profile
                </button>
                <button
                  onClick={() => handleOpenCreateTask(s)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-600 text-white text-[11px] font-medium hover:bg-teal-700 transition-colors"
                >
                  <Plus size={11} /> Create Task
                </button>
                <button
                  disabled={busy === s.id}
                  onClick={() => handleMarkReviewed(s.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-[11px] font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40 ml-auto"
                >
                  {busy === s.id
                    ? <Loader2 size={10} className="animate-spin" />
                    : <CheckCheck size={11} />}
                  Mark Reviewed
                </button>
              </div>

              {/* Inline create-task form */}
              {taskForm?.signalId === s.id && (
                <div className="mt-3 pt-3 border-t border-black/5 space-y-2">
                  <p className="text-[11px] font-semibold text-gray-600">Creating task for {s.personName}</p>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-teal-300"
                    placeholder="Task title…"
                    value={taskForm.title}
                    onChange={e => setTaskForm({ ...taskForm, title: e.target.value })}
                  />
                  <textarea
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none"
                    placeholder="Brief reason or note (optional)…"
                    value={taskNote}
                    onChange={e => setTaskNote(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={taskBusy || !taskForm.title.trim()}
                      onClick={handleCreateTask}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-[11px] font-medium hover:bg-teal-700 disabled:opacity-40"
                    >
                      {taskBusy ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                      Create
                    </button>
                    <button
                      onClick={() => setTaskForm(null)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-[11px] text-gray-600 hover:bg-gray-50"
                    >
                      <X size={10} /> Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── S4: Celebrations ─────────────────────────────────────────────────────────

const MILESTONE_META: Record<string, { emoji: string; label: string }> = {
  walks_completed:  { emoji: '📖', label: 'Completed a Walk' },
  baptised:         { emoji: '💧', label: 'Baptised' },
  accepted_christ:  { emoji: '✝️', label: 'Accepted Christ' },
  significant:      { emoji: '⭐', label: 'Significant milestone' },
};

const BELIEVER_TAGS = [
  { key: 'hasBaptism',  pass: '✓ Baptised',    fail: '⚠ Needs baptism',    passColor: 'text-green-600', failColor: 'text-amber-600' },
  { key: 'hasRoom',     pass: '✓ In a Room',   fail: '⚠ Needs a Room',     passColor: 'text-green-600', failColor: 'text-amber-600' },
];

function CelebrationsSection({ pAuth }: { pAuth: PAuth }) {
  const fetchMovement    = useCallback(() => pastoralApi.getDashMovement(pAuth), [pAuth.userId]);
  const fetchNewBelievers= useCallback(() => pastoralApi.getDashNewBelievers(pAuth), [pAuth.userId]);

  const { data: movement, loading: mL, error: mE } = useAutoFetch(fetchMovement);
  const { data: believers,loading: bL, error: bE } = useAutoFetch(fetchNewBelievers);

  const loading = mL || bL;
  const error   = mE || bE;

  // Milestone chips from movement cards (positive categories)
  const milestoneIds = new Set(['baptised', 'accepted_christ', 'walks_completed', 'significant']);
  const chips = (movement ?? []).filter(m => milestoneIds.has(m.id) && m.count > 0);

  const hasCelebrations = chips.length > 0 || (believers?.length ?? 0) > 0;

  return (
    <section className="mb-8">
      <SectionHeader icon={PartyPopper} title="Celebrations" iconColor="text-yellow-500" />

      {loading ? <WidgetLoading /> : error ? <WidgetError msg={error} /> :
       !hasCelebrations ? (
        <div className="bg-white rounded-xl border border-gray-200 py-8 text-center">
          <PartyPopper size={20} className="mx-auto mb-2 text-gray-200" />
          <p className="text-[12px] text-gray-400">
            No new celebrations yet — check back after your next gathering.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Milestone count chips */}
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {chips.map(m => {
                const meta = MILESTONE_META[m.id] ?? { emoji: '🏆', label: m.label };
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 bg-white border border-yellow-200 rounded-full px-4 py-2"
                  >
                    <span className="text-[16px]">{meta.emoji}</span>
                    <span className="text-[13px] font-semibold text-gray-900">{m.count}</span>
                    <span className="text-[12px] text-gray-600">{meta.label}</span>
                    {m.sublabel && (
                      <span className="text-[10px] text-gray-400">{m.sublabel}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* New believers list */}
          {(believers?.length ?? 0) > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-yellow-50">
                <p className="text-[11px] font-semibold text-yellow-800 uppercase tracking-wide">
                  Recent Walk Completions
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {believers!.map(b => (
                  <div key={b.userId} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center shrink-0 text-[11px] font-bold text-yellow-800">
                      {initials(b.personName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-gray-900">{b.personName}</p>
                      <p className="text-[11px] text-gray-500">
                        Completed "{b.journeyTitle}" · {relDate(b.completedAt)}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-0.5">
                        {BELIEVER_TAGS.map(tag => {
                          const has = b[tag.key as keyof typeof b] as boolean;
                          return (
                            <span
                              key={tag.key}
                              className={`text-[10px] font-medium ${has ? tag.passColor : tag.failColor}`}
                            >
                              {has ? tag.pass : tag.fail}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── S5: Ministry Snapshot ────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, iconColor,
}: { label: string; value: string | number; sub?: string; icon: React.ElementType; iconColor: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
      <Icon size={14} className={iconColor} />
      <div className="text-[26px] font-bold text-gray-900">{value}</div>
      <div className="text-[12px] font-semibold text-gray-700 leading-tight">{label}</div>
      {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
    </div>
  );
}

function MinistrySnapshotSection({ aAuth }: { aAuth: AAuth }) {
  const fetch = useCallback(() => analyticsApi.getHealthKpis(aAuth), [aAuth.userId]);
  const { data, loading, error } = useAutoFetch(fetch);

  return (
    <section className="mb-8">
      <SectionHeader icon={ListChecks} title="Ministry Snapshot" iconColor="text-indigo-600" />
      {loading ? <WidgetLoading /> : error ? <WidgetError msg={error} /> : !data ? null : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Total Members"    value={data.totalMembers}      icon={Users}      iconColor="text-blue-500" />
          <KpiCard label="Active This Week" value={data.activeThisWeek}    icon={Flame}      iconColor="text-orange-500" />
          <KpiCard label="Attendance"       value={`${data.attendancePct}%`} sub="of expected" icon={CalendarDays} iconColor="text-teal-600" />
          <KpiCard label="Walk Completions" value={`${data.walkCompletionPct}%`} sub="overall rate" icon={BookOpen} iconColor="text-indigo-600" />
          <KpiCard label="New Believers"    value={data.newBelievers}      icon={Star}       iconColor="text-yellow-500" sub="Accepted Christ" />
          <KpiCard label="Baptisms"         value={data.baptisms}          icon={Trophy}     iconColor="text-green-600" />
        </div>
      )}
    </section>
  );
}

// ─── S6: Trends ───────────────────────────────────────────────────────────────

function TrendsSection({ pAuth }: { pAuth: PAuth }) {
  const fetch = useCallback(() => pastoralApi.getDashEngagement(pAuth), [pAuth.userId]);
  const { data, loading, error } = useAutoFetch(fetch);

  if (loading) return (
    <section className="mb-8">
      <SectionHeader icon={TrendingUp} title="Trends" iconColor="text-purple-600" />
      <WidgetLoading />
    </section>
  );

  if (error) return (
    <section className="mb-8">
      <SectionHeader icon={TrendingUp} title="Trends" iconColor="text-purple-600" />
      <WidgetError msg={error} />
    </section>
  );

  const noData = !data ||
    (data.attendanceLast12.length === 0 &&
     data.devotionalLast30.length === 0 &&
     data.walkStartsLast90.length === 0);

  // Merge walk starts + completions by week
  const walkMap: Record<string, { date: string; starts: number; completions: number }> = {};
  data?.walkStartsLast90.forEach(p => {
    walkMap[p.date] = walkMap[p.date] ?? { date: p.date, starts: 0, completions: 0 };
    walkMap[p.date].starts = p.count;
  });
  data?.walkCompletionsLast90.forEach(p => {
    walkMap[p.date] = walkMap[p.date] ?? { date: p.date, starts: 0, completions: 0 };
    walkMap[p.date].completions = p.count;
  });
  const walkMerged = Object.values(walkMap).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section className="mb-8">
      <SectionHeader icon={TrendingUp} title="Trends" iconColor="text-purple-600" />
      {noData ? (
        <div className="bg-white rounded-xl border border-gray-200 py-8 text-center">
          <p className="text-[12px] text-gray-400">
            No trend data yet. Record attendance and start journeys to see charts here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Attendance trend */}
          {data!.attendanceLast12.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Attendance — Last {data!.attendanceLast12.length} Sessions
              </p>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={data!.attendanceLast12} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mbAttGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#0d9488" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={fmtShort} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                    formatter={(v: number, n: string) => [v, n === 'present' ? 'Present' : 'Expected']}
                    labelFormatter={fmtShort}
                  />
                  <Area type="monotone" dataKey="expected" stroke="#e5e7eb" fill="none" strokeDasharray="4 2" dot={false} />
                  <Area type="monotone" dataKey="present"  stroke="#0d9488" fill="url(#mbAttGrad)" strokeWidth={2} dot={{ r: 3, fill: '#0d9488' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Daily Rhythm */}
            {data!.devotionalLast30.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Daily Rhythm — Last 30 Days
                </p>
                <ResponsiveContainer width="100%" height={110}>
                  <BarChart data={data!.devotionalLast30} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={fmtShort} interval={6} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} labelFormatter={fmtShort} />
                    <Bar dataKey="count" fill="#f97316" radius={[3,3,0,0]} name="Active members" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Walk activity */}
            {walkMerged.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Walk Activity — Last 12 Weeks
                </p>
                <ResponsiveContainer width="100%" height={110}>
                  <BarChart data={walkMerged} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={fmtShort} interval={2} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} labelFormatter={fmtShort} />
                    <Bar dataKey="starts"      fill="#6366f1" radius={[3,3,0,0]} name="Started" />
                    <Bar dataKey="completions" fill="#22c55e" radius={[3,3,0,0]} name="Completed" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── S7: Upcoming ─────────────────────────────────────────────────────────────

const PRIORITY_DOT: Record<workflowsApi.TaskPriority, string> = {
  urgent: 'bg-rose-500',
  high:   'bg-orange-500',
  normal: 'bg-blue-400',
  low:    'bg-gray-300',
};

const ACTIVITY_EMOJI: Record<string, string> = {
  walk_progress: '🚶',
  room_join:     '🏠',
  milestone:     '🏆',
  attendance:    '✅',
};

function UpcomingSection({
  pAuth, wAuth, onNavigate,
}: { pAuth: PAuth; wAuth: WAuth; onNavigate: (n: AdminNav) => void }) {
  // Calendar: next 7 days
  const today   = new Date().toISOString().slice(0, 10);
  const weekOut = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  const fetchCal      = useCallback(() => workflowsApi.getCalendarEvents(wAuth, today, weekOut), [wAuth['x-user-id']]);
  const fetchActivity = useCallback(() => pastoralApi.getDashActivity(pAuth), [pAuth.userId]);

  const { data: events,   loading: eL, error: eE } = useAutoFetch(fetchCal);
  const { data: activity, loading: aL, error: aE } = useAutoFetch(fetchActivity);

  return (
    <section className="mb-8">
      <SectionHeader icon={Clock} title="Upcoming & Recent Activity" iconColor="text-gray-500" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Calendar events */}
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Tasks Due This Week
          </p>
          {eL ? <WidgetLoading /> : eE ? <WidgetError msg={eE} /> :
           !events?.length ? (
            <div className="bg-white rounded-xl border border-gray-200 py-6 text-center">
              <p className="text-[12px] text-gray-400">No tasks due in the next 7 days.</p>
              <button
                onClick={() => onNavigate({ section: 'workflows' })}
                className="mt-2 text-[12px] text-teal-600 hover:underline"
              >
                View all tasks →
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="divide-y divide-gray-100">
                {events.map(ev => (
                  <div key={ev.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[ev.priority]}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-900 truncate">{ev.title}</p>
                      {ev.assignedTo && (
                        <p className="text-[11px] text-gray-400">{ev.assignedTo}</p>
                      )}
                    </div>
                    <span className="text-[11px] text-gray-400 shrink-0">{fmtShort(ev.date)}</span>
                    <button
                      onClick={() => onNavigate({ section: 'workflows' })}
                      className="text-gray-300 hover:text-teal-600 transition-colors"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Recent Activity
          </p>
          {aL ? <WidgetLoading /> : aE ? <WidgetError msg={aE} /> :
           !activity?.length ? (
            <div className="bg-white rounded-xl border border-gray-200 py-6 text-center">
              <p className="text-[12px] text-gray-400">No recent activity recorded.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="divide-y divide-gray-100">
                {activity.slice(0, 8).map(item => (
                  <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="text-[15px] shrink-0 mt-0.5">
                      {ACTIVITY_EMOJI[item.type] ?? '📌'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-gray-900 truncate">{item.personName}</p>
                      <p className="text-[11px] text-gray-500 truncate">{item.detail}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0">{relDate(item.eventAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function AdminDashboard({ onNavigate }: Props) {
  const { user } = useAuth();

  // Build typed auth headers for each API family
  const pAuth = useRef<PAuth>({ userId: user?.id ?? '', userRole: user?.role ?? 'admin' });
  const aAuth = useRef<AAuth>({ userId: user?.id ?? '', userRole: user?.role ?? 'admin' });
  const wAuth = useRef<WAuth>({ 'x-user-id': user?.id ?? '', 'x-user-role': user?.role ?? 'admin' });

  // Keep refs in sync if user changes without re-mounting
  pAuth.current = { userId: user?.id ?? '', userRole: user?.role ?? 'admin' };
  aAuth.current = { userId: user?.id ?? '', userRole: user?.role ?? 'admin' };
  wAuth.current = { 'x-user-id': user?.id ?? '', 'x-user-role': user?.role ?? 'admin' };

  return (
    <div className="p-5 lg:p-8 max-w-5xl pb-16">
      {/* S1: Greeting */}
      <GreetingSection />

      {/* S2: Today's Overview */}
      <OverviewSection  pAuth={pAuth.current} wAuth={wAuth.current} onNavigate={onNavigate} />

      {/* S3: Priority Today */}
      <PriorityTodaySection pAuth={pAuth.current} wAuth={wAuth.current} onNavigate={onNavigate} />

      {/* S4: Celebrations */}
      <CelebrationsSection pAuth={pAuth.current} />

      {/* S5: Ministry Snapshot */}
      <MinistrySnapshotSection aAuth={aAuth.current} />

      {/* S6: Trends */}
      <TrendsSection pAuth={pAuth.current} />

      {/* S7: Upcoming + Recent Activity */}
      <UpcomingSection pAuth={pAuth.current} wAuth={wAuth.current} onNavigate={onNavigate} />
    </div>
  );
}
