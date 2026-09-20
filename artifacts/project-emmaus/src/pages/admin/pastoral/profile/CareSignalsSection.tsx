/**
 * CareSignalsSection.tsx — Discipleship signals for a single person (Checkpoint 4).
 *
 * Placed directly below HeroSummaryCard on the Discipleship Profile.
 * Shows signals with filter tabs (All / Open / Significant / Celebrations / Resolved).
 * Includes a "Run engine for this person" button.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  Zap, Loader2, ChevronDown, ChevronRight, RefreshCw,
  CheckCheck, Flag, X, StickyNote, Clock, Star, Trophy,
  TrendingUp, AlertTriangle, PhoneCall,
} from 'lucide-react';
import * as api from '@/lib/pastoral-api';

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'open' | 'significant' | 'celebration' | 'resolved';

const TABS: { id: FilterTab; label: string }[] = [
  { id: 'all',          label: 'All' },
  { id: 'open',         label: 'Open' },
  { id: 'significant',  label: 'Significant' },
  { id: 'celebration',  label: 'Celebrations' },
  { id: 'resolved',     label: 'Resolved' },
];

const CAT_ICON: Record<api.SignalCategory, React.ElementType> = {
  celebration: Trophy,
  growth:      TrendingUp,
  attention:   AlertTriangle,
  follow_up:   PhoneCall,
  significant: Star,
};

const CAT_COLOR: Record<api.SignalCategory, string> = {
  celebration: 'text-green-500',
  growth:      'text-teal-500',
  attention:   'text-amber-500',
  follow_up:   'text-orange-500',
  significant: 'text-rose-500',
};

const CAT_DOT: Record<api.SignalCategory, string> = {
  celebration: 'bg-green-500',
  growth:      'bg-teal-500',
  attention:   'bg-amber-500',
  follow_up:   'bg-orange-500',
  significant: 'bg-rose-500',
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
    const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7)  return `${diffDays}d ago`;
    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  } catch { return iso; }
}

// ─── Mini signal card ─────────────────────────────────────────────────────────

interface MiniCardProps {
  signal: api.DiscipleshipSignal;
  onStatusChange: (id: string, status: api.SignalStatus) => void;
  onNoteChange: (id: string, note: string) => void;
  busy: boolean;
}

function MiniCard({ signal, onStatusChange, onNoteChange, busy }: MiniCardProps) {
  const CatIcon = CAT_ICON[signal.category];
  const [showEvidence, setShowEvidence] = useState(false);
  const [showNote,     setShowNote]     = useState(false);
  const [noteText,     setNoteText]     = useState(signal.pastoralNote ?? '');
  const evidenceEntries = Object.entries(signal.evidence ?? {}).filter(([, v]) => v != null && v !== '');

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="mt-0.5 shrink-0">
          <CatIcon size={13} className={CAT_COLOR[signal.category]} />
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CAT_DOT[signal.category]}`} />
            <span className="text-[12px] font-semibold text-gray-800">{signal.title}</span>
            <span className={`px-1.5 py-px rounded text-[9px] font-semibold ${STATUS_PILL[signal.status]}`}>
              {STATUS_LABEL[signal.status]}
            </span>
          </div>
          <p className="text-[11px] text-gray-500">{signal.explanation}</p>
          <div className="flex items-center gap-2 text-[10px] text-gray-400">
            <Clock size={9} />
            <span>Detected {fmtDate(signal.detectedAt)}</span>
            {evidenceEntries.length > 0 && (
              <button
                onClick={() => setShowEvidence((v) => !v)}
                className="flex items-center gap-0.5 text-teal-600"
              >
                {showEvidence ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                Evidence
              </button>
            )}
          </div>

          {showEvidence && evidenceEntries.length > 0 && (
            <div className="mt-1.5 rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-1.5 space-y-1">
              {evidenceEntries.map(([k, v]) => (
                <div key={k} className="flex gap-2 text-[10px]">
                  <span className="text-gray-400 w-24 shrink-0 capitalize">{k.replace(/_/g, ' ')}</span>
                  <span className="text-gray-700 font-medium">
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {signal.pastoralNote && !showNote && (
            <div className="text-[10px] text-gray-400 italic">
              <StickyNote size={9} className="inline mr-1" />
              {signal.pastoralNote}
            </div>
          )}

          {showNote && (
            <div className="mt-1.5 space-y-1">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={2}
                placeholder="Pastoral note…"
                className="w-full text-[11px] border border-gray-200 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={() => { onNoteChange(signal.id, noteText); setShowNote(false); }}
                  className="px-2.5 py-1 rounded-lg bg-teal-600 text-white text-[10px] font-medium hover:bg-teal-700"
                >Save</button>
                <button
                  onClick={() => { setNoteText(signal.pastoralNote ?? ''); setShowNote(false); }}
                  className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 text-[10px] hover:bg-gray-200"
                >Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mini action bar */}
      {!['resolved', 'dismissed'].includes(signal.status) && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-t border-gray-100 bg-gray-50/60 flex-wrap">
          {signal.status === 'new' && (
            <button
              disabled={busy}
              onClick={() => onStatusChange(signal.id, 'acknowledged')}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-gray-600 hover:bg-gray-200 disabled:opacity-40"
            >
              <CheckCheck size={9} /> Acknowledge
            </button>
          )}
          {signal.status === 'acknowledged' && (
            <button
              disabled={busy}
              onClick={() => onStatusChange(signal.id, 'following_up')}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-indigo-600 hover:bg-indigo-100 disabled:opacity-40"
            >
              <Flag size={9} /> Following Up
            </button>
          )}
          <button
            disabled={busy}
            onClick={() => onStatusChange(signal.id, 'resolved')}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-green-600 hover:bg-green-100 disabled:opacity-40"
          >
            <CheckCheck size={9} /> Resolve
          </button>
          <button
            disabled={busy}
            onClick={() => onStatusChange(signal.id, 'dismissed')}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-gray-400 hover:bg-gray-200 disabled:opacity-40"
          >
            <X size={9} /> Dismiss
          </button>
          <button
            onClick={() => setShowNote((v) => !v)}
            className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-gray-400 hover:bg-gray-200"
          >
            <StickyNote size={9} /> Note
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

interface Props {
  personId: string;
  personType: api.PersonType;
  auth: api.AuthHeaders;
}

export default function CareSignalsSection({ personId, personType, auth }: Props) {
  const [signals,  setSignals]  = useState<api.DiscipleshipSignal[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [running,  setRunning]  = useState(false);
  const [runMsg,   setRunMsg]   = useState('');
  const [busyId,   setBusyId]   = useState<string | null>(null);
  const [tab,      setTab]      = useState<FilterTab>('open');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listDiscipleshipSignals(auth, {
        personId, personType, limit: 100,
      });
      setSignals(data);
    } catch { /* show empty */ }
    finally { setLoading(false); }
  }, [personId, personType, auth.userId]);

  useEffect(() => { load(); }, [load]);

  const handleRun = async () => {
    setRunning(true); setRunMsg('');
    try {
      const r = await api.runSignalsEngine(auth, { personId, personType });
      setRunMsg(`${r.created} new, ${r.updated} updated`);
      await load();
    } catch { setRunMsg('Engine failed'); }
    finally {
      setRunning(false);
      setTimeout(() => setRunMsg(''), 4000);
    }
  };

  const handleStatusChange = async (id: string, status: api.SignalStatus) => {
    setBusyId(id);
    try {
      await api.updateSignalStatus(auth, id, status);
      setSignals((prev) => prev.map((s) => s.id === id ? { ...s, status } : s));
    } catch { /* leave as-is */ }
    finally { setBusyId(null); }
  };

  const handleNoteChange = async (id: string, note: string) => {
    try {
      await api.updateSignalNote(auth, id, note);
      setSignals((prev) => prev.map((s) => s.id === id ? { ...s, pastoralNote: note || null } : s));
    } catch { /* leave as-is */ }
  };

  const filtered = signals.filter((s) => {
    if (tab === 'all')         return true;
    if (tab === 'open')        return !['resolved', 'dismissed'].includes(s.status);
    if (tab === 'significant') return s.category === 'significant';
    if (tab === 'celebration') return s.category === 'celebration';
    if (tab === 'resolved')    return s.status === 'resolved';
    return true;
  });

  const openCount = signals.filter((s) => !['resolved', 'dismissed'].includes(s.status)).length;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
        <div className="flex items-center gap-2">
          <Zap size={12} className="text-teal-600" />
          <span className="text-[12px] font-semibold text-gray-700">Discipleship Signals</span>
          {openCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-semibold">
              {openCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {runMsg && <span className="text-[11px] text-gray-400">{runMsg}</span>}
          <button
            onClick={handleRun}
            disabled={running || loading}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-gray-500 hover:bg-gray-100 disabled:opacity-40"
          >
            {running ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            Run engine
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-0.5 px-4 pt-2 pb-0 border-b border-gray-100 overflow-x-auto scrollbar-none">
        {TABS.map(({ id, label }) => {
          const count = id === 'open'        ? openCount
                      : id === 'significant' ? signals.filter((s) => s.category === 'significant').length
                      : id === 'celebration' ? signals.filter((s) => s.category === 'celebration').length
                      : id === 'resolved'    ? signals.filter((s) => s.status === 'resolved').length
                      : signals.length;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border-b-2 whitespace-nowrap transition-colors -mb-px ${
                tab === id
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`px-1.5 py-px rounded-full text-[9px] font-semibold ${
                  tab === id ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-500'
                }`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="p-3">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={16} className="animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-6">
            <Zap size={18} className="mx-auto mb-2 text-gray-200" />
            <p className="text-[12px] text-gray-400">
              {tab === 'open' ? 'No open signals.' : 'No signals in this filter.'}
            </p>
            {signals.length === 0 && (
              <p className="text-[11px] text-gray-400 mt-1">
                Click "Run engine" to detect signals for this person.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => (
              <MiniCard
                key={s.id}
                signal={s}
                onStatusChange={handleStatusChange}
                onNoteChange={handleNoteChange}
                busy={busyId === s.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
