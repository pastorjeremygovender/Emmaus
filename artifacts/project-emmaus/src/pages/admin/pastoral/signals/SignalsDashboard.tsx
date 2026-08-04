/**
 * SignalsDashboard.tsx — Care Signals Engine dashboard (Checkpoint 4).
 *
 * Five sections matching the spec:
 *   🟢 Today's Celebrations
 *   🔵 People Growing
 *   🟡 Needs Attention
 *   🟠 Follow-up Required
 *   ✅ Recently Resolved (collapsed by default)
 *
 * Each signal card shows: category colour, person, title, explanation,
 * evidence, detected date, status, assigned leader, and quick actions.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Zap, RefreshCw, Loader2, AlertCircle, ChevronDown, ChevronRight,
  User, CheckCheck, Clock, Flag, X, StickyNote, UserCog,
  Trophy, TrendingUp, AlertTriangle, PhoneCall, Star,
} from 'lucide-react';
import * as api from '@/lib/pastoral-api';
import { useAuth } from '@/contexts/AuthContext';

// ─── Types & constants ────────────────────────────────────────────────────────

const CAT_META: Record<api.SignalCategory, {
  label: string; dot: string; bg: string; border: string; Icon: React.ElementType;
}> = {
  celebration: { label: 'Celebration', dot: 'bg-green-500',  bg: 'bg-green-50',  border: 'border-green-200',  Icon: Trophy },
  growth:      { label: 'Growth',      dot: 'bg-teal-500',   bg: 'bg-teal-50',   border: 'border-teal-200',   Icon: TrendingUp },
  attention:   { label: 'Attention',   dot: 'bg-amber-500',  bg: 'bg-amber-50',  border: 'border-amber-200',  Icon: AlertTriangle },
  follow_up:   { label: 'Follow-up',   dot: 'bg-orange-500', bg: 'bg-orange-50', border: 'border-orange-200', Icon: PhoneCall },
  significant: { label: 'Significant', dot: 'bg-rose-500',   bg: 'bg-rose-50',   border: 'border-rose-200',   Icon: Star },
};

const STATUS_LABEL: Record<api.SignalStatus, string> = {
  new:          'New',
  acknowledged: 'Acknowledged',
  following_up: 'Following Up',
  resolved:     'Resolved',
  dismissed:    'Dismissed',
};

const STATUS_PILL: Record<api.SignalStatus, string> = {
  new:          'bg-blue-100 text-blue-700',
  acknowledged: 'bg-gray-100 text-gray-600',
  following_up: 'bg-indigo-100 text-indigo-700',
  resolved:     'bg-green-100 text-green-700',
  dismissed:    'bg-gray-100 text-gray-400',
};

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86_400_000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7)  return `${diffDays}d ago`;
    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  } catch { return iso; }
}

function fmtLastRun(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins  = Math.floor(diffMs / 60_000);
    const hours = Math.floor(diffMs / 3_600_000);
    const days  = Math.floor(diffMs / 86_400_000);
    if (mins  <  1)  return 'just now';
    if (mins  < 60)  return `${mins}m ago`;
    if (hours < 24)  return `${hours}h ago`;
    return `${days}d ago`;
  } catch { return iso; }
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

// ─── Signal card ──────────────────────────────────────────────────────────────

interface CardProps {
  signal: api.DiscipleshipSignal;
  onStatusChange: (id: string, status: api.SignalStatus) => void;
  onNoteChange: (id: string, note: string) => void;
  onAssign: (id: string, to: string | null) => void;
  onOpenProfile: (personId: string, personType: api.PersonType) => void;
  busy: boolean;
}

function SignalCard({ signal, onStatusChange, onNoteChange, onAssign, onOpenProfile, busy }: CardProps) {
  const meta = CAT_META[signal.category];
  const [showEvidence, setShowEvidence] = useState(false);
  const [showNote,     setShowNote]     = useState(false);
  const [showAssign,   setShowAssign]   = useState(false);
  const [noteText,     setNoteText]     = useState(signal.pastoralNote ?? '');
  const [assignText,   setAssignText]   = useState(signal.assignedTo ?? '');

  const evidenceEntries = Object.entries(signal.evidence ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && v !== ''
  );

  return (
    <div className={`rounded-xl border ${meta.border} bg-white overflow-hidden transition-shadow hover:shadow-sm`}>
      {/* Main row */}
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Person avatar */}
        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-[12px] font-semibold text-gray-600">
          {initials(signal.personName ?? signal.personId)}
        </div>

        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
            <span className="text-[13px] font-semibold text-gray-900 truncate">
              {signal.personName ?? signal.personId}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_PILL[signal.status]}`}>
              {STATUS_LABEL[signal.status]}
            </span>
            {signal.assignedTo && (
              <span className="flex items-center gap-1 text-[10px] text-indigo-600">
                <User size={9} /> {signal.assignedTo}
              </span>
            )}
          </div>
          <p className="text-[13px] font-medium text-gray-800">{signal.title}</p>
          <p className="text-[12px] text-gray-500 leading-relaxed">{signal.explanation}</p>

          <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
            <Clock size={10} />
            <span>Detected {fmtDate(signal.detectedAt)}</span>
            {evidenceEntries.length > 0 && (
              <button
                onClick={() => setShowEvidence((v) => !v)}
                className="flex items-center gap-1 text-teal-600 hover:text-teal-700"
              >
                {showEvidence ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                Evidence
              </button>
            )}
          </div>

          {showEvidence && evidenceEntries.length > 0 && (
            <div className={`mt-2 rounded-lg border ${meta.border} ${meta.bg} px-3 py-2 space-y-1`}>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Evidence</p>
              {evidenceEntries.map(([k, v]) => (
                <div key={k} className="flex gap-2 text-[11px]">
                  <span className="text-gray-400 w-28 shrink-0 capitalize">{k.replace(/_/g, ' ')}</span>
                  <span className="text-gray-700 font-medium">
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Pastoral note */}
          {signal.pastoralNote && !showNote && (
            <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-gray-500 bg-gray-50 rounded-lg px-2.5 py-1.5">
              <StickyNote size={10} className="shrink-0 mt-0.5 text-gray-400" />
              <span className="italic">{signal.pastoralNote}</span>
            </div>
          )}

          {showNote && (
            <div className="mt-2 space-y-1.5">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a pastoral note…"
                rows={2}
                className="w-full text-[12px] border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { onNoteChange(signal.id, noteText); setShowNote(false); }}
                  className="px-3 py-1 rounded-lg bg-teal-600 text-white text-[11px] font-medium hover:bg-teal-700"
                >Save</button>
                <button
                  onClick={() => { setNoteText(signal.pastoralNote ?? ''); setShowNote(false); }}
                  className="px-3 py-1 rounded-lg bg-gray-100 text-gray-600 text-[11px] hover:bg-gray-200"
                >Cancel</button>
              </div>
            </div>
          )}

          {showAssign && (
            <div className="mt-2 flex gap-2">
              <input
                value={assignText}
                onChange={(e) => setAssignText(e.target.value)}
                placeholder="Leader name or email"
                className="flex-1 text-[12px] border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
              />
              <button
                onClick={() => { onAssign(signal.id, assignText || null); setShowAssign(false); }}
                className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-[11px] font-medium hover:bg-teal-700"
              >Assign</button>
              <button
                onClick={() => setShowAssign(false)}
                className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-[11px] hover:bg-gray-200"
              >×</button>
            </div>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className={`flex items-center gap-1 px-4 py-2 border-t ${meta.border} ${meta.bg} flex-wrap`}>
        <button
          onClick={() => onOpenProfile(signal.personId, signal.personType)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-teal-700 hover:bg-teal-100"
        >
          <User size={11} /> Open Profile
        </button>

        {signal.status === 'new' && (
          <button
            disabled={busy}
            onClick={() => onStatusChange(signal.id, 'acknowledged')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-40"
          >
            <CheckCheck size={11} /> Acknowledge
          </button>
        )}
        {signal.status === 'acknowledged' && (
          <button
            disabled={busy}
            onClick={() => onStatusChange(signal.id, 'following_up')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-indigo-600 hover:bg-indigo-100 disabled:opacity-40"
          >
            <Flag size={11} /> Following Up
          </button>
        )}
        {!['resolved', 'dismissed'].includes(signal.status) && (
          <button
            disabled={busy}
            onClick={() => onStatusChange(signal.id, 'resolved')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-green-600 hover:bg-green-100 disabled:opacity-40"
          >
            <CheckCheck size={11} /> Resolve
          </button>
        )}
        {signal.status !== 'dismissed' && (
          <button
            disabled={busy}
            onClick={() => onStatusChange(signal.id, 'dismissed')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-gray-400 hover:bg-gray-200 disabled:opacity-40"
          >
            <X size={11} /> Dismiss
          </button>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => { setShowNote((v) => !v); setShowAssign(false); }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] text-gray-500 hover:bg-gray-200"
          >
            <StickyNote size={11} /> Note
          </button>
          <button
            onClick={() => { setShowAssign((v) => !v); setShowNote(false); }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] text-gray-500 hover:bg-gray-200"
          >
            <UserCog size={11} /> Assign
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard section ────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  signals: api.DiscipleshipSignal[];
  defaultCollapsed?: boolean;
  onStatusChange: (id: string, status: api.SignalStatus) => void;
  onNoteChange: (id: string, note: string) => void;
  onAssign: (id: string, to: string | null) => void;
  onOpenProfile: (personId: string, personType: api.PersonType) => void;
  busyId: string | null;
}

function DashSection({
  title, icon: Icon, iconColor, signals, defaultCollapsed = false,
  onStatusChange, onNoteChange, onAssign, onOpenProfile, busyId,
}: SectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (signals.length === 0 && collapsed) return null;

  return (
    <div className="space-y-2">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-2 group"
      >
        <Icon size={13} className={iconColor} />
        <span className="text-[12px] font-semibold text-gray-700 uppercase tracking-wide flex-1 text-left">{title}</span>
        <span className="text-[11px] text-gray-400">{signals.length}</span>
        {collapsed
          ? <ChevronRight size={13} className="text-gray-400" />
          : <ChevronDown  size={13} className="text-gray-400" />}
      </button>
      {!collapsed && (
        signals.length === 0 ? (
          <p className="text-[12px] text-gray-400 pl-5">Nothing here right now.</p>
        ) : (
          <div className="space-y-2 pl-1">
            {signals.map((s) => (
              <SignalCard
                key={s.id}
                signal={s}
                onStatusChange={onStatusChange}
                onNoteChange={onNoteChange}
                onAssign={onAssign}
                onOpenProfile={onOpenProfile}
                busy={busyId === s.id}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

interface Props {
  onOpenProfile: (person: api.UnifiedPerson) => void;
}

export default function SignalsDashboard({ onOpenProfile }: Props) {
  const { user } = useAuth();
  const auth: api.AuthHeaders = { userId: user?.id ?? '', userRole: user?.role ?? 'admin' };

  const [signals,   setSignals]   = useState<api.DiscipleshipSignal[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [running,   setRunning]   = useState(false);
  const [runMsg,    setRunMsg]    = useState('');
  const [busyId,    setBusyId]    = useState<string | null>(null);
  const [lastRun,   setLastRun]   = useState<api.EngineRunRecord | null>(null);

  const loadEngineStatus = useCallback(async () => {
    try {
      const { lastRun: lr } = await api.getEngineStatus(auth);
      setLastRun(lr);
    } catch { /* non-fatal */ }
  }, [auth.userId]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await api.listDiscipleshipSignals(auth, { limit: 300 });
      setSignals(data);
    } catch { setError('Could not load signals.'); }
    finally { setLoading(false); }
  }, [auth.userId]);

  useEffect(() => { load(); loadEngineStatus(); }, [load, loadEngineStatus]);

  const handleRun = async () => {
    setRunning(true); setRunMsg('');
    try {
      const r = await api.runSignalsEngine(auth);
      setRunMsg(`Done — ${r.created} new, ${r.updated} updated, ${r.resolved} resolved.`);
      await Promise.all([load(), loadEngineStatus()]);
    } catch (err: unknown) {
      setRunMsg(err instanceof Error ? err.message : 'Engine failed.');
    } finally {
      setRunning(false);
      setTimeout(() => setRunMsg(''), 6000);
    }
  };

  const handleStatusChange = async (id: string, status: api.SignalStatus) => {
    setBusyId(id);
    try {
      await api.updateSignalStatus(auth, id, status);
      setSignals((prev) =>
        prev.map((s) => s.id === id ? { ...s, status } : s)
      );
    } catch { /* leave as-is */ }
    finally { setBusyId(null); }
  };

  const handleNoteChange = async (id: string, note: string) => {
    try {
      await api.updateSignalNote(auth, id, note);
      setSignals((prev) =>
        prev.map((s) => s.id === id ? { ...s, pastoralNote: note || null } : s)
      );
    } catch { /* leave as-is */ }
  };

  const handleAssign = async (id: string, to: string | null) => {
    try {
      await api.assignSignal(auth, id, to);
      setSignals((prev) =>
        prev.map((s) => s.id === id ? { ...s, assignedTo: to } : s)
      );
    } catch { /* leave as-is */ }
  };

  const handleOpenProfile = async (personId: string, personType: api.PersonType) => {
    // We need a UnifiedPerson — fetch from the list of people
    try {
      const people = await api.listPeople(auth);
      const p = people.find((x) => x.id === personId && x.personType === personType);
      if (p) onOpenProfile(p);
    } catch { /* ignore */ }
  };

  // ── Split into sections ───────────────────────────────────────────────────

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const sections = useMemo(() => {
    const open = (s: api.DiscipleshipSignal) =>
      !['resolved', 'dismissed'].includes(s.status);

    const todayCelebrations = signals.filter(
      (s) => s.category === 'celebration' &&
             s.detectedAt.slice(0, 10) === todayStr &&
             open(s)
    );
    const allCelebrations = signals.filter(
      (s) => s.category === 'celebration' && open(s) &&
             s.detectedAt.slice(0, 10) !== todayStr
    );
    const growing      = signals.filter((s) => s.category === 'growth'      && open(s));
    const attention    = signals.filter((s) => s.category === 'attention'   && open(s));
    const followUp     = signals.filter((s) => s.category === 'follow_up'   && open(s));
    const significant  = signals.filter((s) => s.category === 'significant' && open(s));
    const resolved     = signals.filter((s) => s.status === 'resolved');

    return { todayCelebrations, allCelebrations, growing, attention, followUp, significant, resolved };
  }, [signals, todayStr]);

  const openCount = signals.filter(
    (s) => !['resolved', 'dismissed'].includes(s.status)
  ).length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-teal-600" />
          <h2 className="text-[15px] font-semibold text-gray-900">Care Signals</h2>
          {!loading && openCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 text-[11px] font-semibold">
              {openCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {runMsg
            ? <span className="text-[12px] text-gray-500">{runMsg}</span>
            : lastRun && (
              <span className="text-[11px] text-gray-400">
                Last updated: {fmtLastRun(lastRun.ranAt)}
                {lastRun.triggeredBy === 'scheduler' ? ' (auto)' : ''}
              </span>
            )
          }
          <button
            onClick={handleRun}
            disabled={running || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {running ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {running ? 'Running…' : 'Run engine'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-rose-600 text-[13px] py-10 justify-center">
            <AlertCircle size={16} /> {error}
          </div>
        ) : signals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center mb-4">
              <Zap size={22} className="text-teal-400" />
            </div>
            <p className="text-[14px] font-medium text-gray-700 mb-1">No signals yet</p>
            <p className="text-[12px] text-gray-400 max-w-xs">
              Click "Run engine" to scan all members and generate discipleship signals.
            </p>
          </div>
        ) : (
          <div className="max-w-2xl space-y-6">

            {sections.todayCelebrations.length > 0 && (
              <DashSection
                title="Today's Celebrations"
                icon={Trophy} iconColor="text-green-500"
                signals={sections.todayCelebrations}
                onStatusChange={handleStatusChange}
                onNoteChange={handleNoteChange}
                onAssign={handleAssign}
                onOpenProfile={handleOpenProfile}
                busyId={busyId}
              />
            )}

            {sections.allCelebrations.length > 0 && (
              <DashSection
                title="Celebrations"
                icon={Trophy} iconColor="text-green-500"
                signals={sections.allCelebrations}
                onStatusChange={handleStatusChange}
                onNoteChange={handleNoteChange}
                onAssign={handleAssign}
                onOpenProfile={handleOpenProfile}
                busyId={busyId}
              />
            )}

            <DashSection
              title="Significant"
              icon={Star} iconColor="text-rose-500"
              signals={sections.significant}
              onStatusChange={handleStatusChange}
              onNoteChange={handleNoteChange}
              onAssign={handleAssign}
              onOpenProfile={handleOpenProfile}
              busyId={busyId}
            />

            <DashSection
              title="Follow-up Required"
              icon={PhoneCall} iconColor="text-orange-500"
              signals={sections.followUp}
              onStatusChange={handleStatusChange}
              onNoteChange={handleNoteChange}
              onAssign={handleAssign}
              onOpenProfile={handleOpenProfile}
              busyId={busyId}
            />

            <DashSection
              title="Needs Attention"
              icon={AlertTriangle} iconColor="text-amber-500"
              signals={sections.attention}
              onStatusChange={handleStatusChange}
              onNoteChange={handleNoteChange}
              onAssign={handleAssign}
              onOpenProfile={handleOpenProfile}
              busyId={busyId}
            />

            <DashSection
              title="People Growing"
              icon={TrendingUp} iconColor="text-teal-500"
              signals={sections.growing}
              onStatusChange={handleStatusChange}
              onNoteChange={handleNoteChange}
              onAssign={handleAssign}
              onOpenProfile={handleOpenProfile}
              busyId={busyId}
            />

            <DashSection
              title="Recently Resolved"
              icon={CheckCheck} iconColor="text-gray-400"
              signals={sections.resolved}
              defaultCollapsed
              onStatusChange={handleStatusChange}
              onNoteChange={handleNoteChange}
              onAssign={handleAssign}
              onOpenProfile={handleOpenProfile}
              busyId={busyId}
            />

          </div>
        )}
      </div>
    </div>
  );
}
