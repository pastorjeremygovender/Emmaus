/**
 * CareSection.tsx — Pastoral Care tab (Checkpoint 3).
 *
 * Shows open care signals grouped by person, with:
 *  • one-click dismiss per signal
 *  • "Generate signals" button to scan all completed eligible sessions
 *  • per-person grouping with attendance context
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Heart, RefreshCw, CheckCheck, AlertCircle, Loader2,
  Calendar, Users, ChevronDown, ChevronUp, CalendarPlus, X,
} from 'lucide-react';
import * as api from '@/lib/pastoral-api';
import { useAuth } from '@/contexts/AuthContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { return iso; }
}

// ─── Signal card ──────────────────────────────────────────────────────────────

interface SignalCardProps {
  signal: api.CareSignal;
  onDismiss: (id: string) => void;
  onScheduleVisit: (id: string, visitDate: string, reason: string) => Promise<void>;
  dismissing: boolean;
  scheduling: boolean;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function SignalCard({ signal, onDismiss, onScheduleVisit, dismissing, scheduling }: SignalCardProps) {
  const [showForm, setShowForm]   = useState(false);
  const [visitDate, setVisitDate] = useState('');
  const [reason, setReason]       = useState('');
  const [formError, setFormError] = useState('');
  const dateRef = useRef<HTMLInputElement>(null);
  const minDate = todayIso();

  const busy = dismissing || scheduling;

  const handleOpenForm = () => {
    setFormError('');
    setShowForm(true);
    setTimeout(() => dateRef.current?.focus(), 50);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!visitDate) return;
    setFormError('');
    try {
      await onScheduleVisit(signal.id, visitDate, reason);
      // parent removes this card from the list on success
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not schedule visit. Please try again.');
    }
  };

  return (
    <div className="rounded-lg bg-white border border-gray-100 hover:border-gray-200 transition-colors overflow-hidden">
      {/* Main row */}
      <div className="flex items-center justify-between gap-3 py-2.5 px-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="shrink-0 w-7 h-7 rounded-full bg-rose-50 flex items-center justify-center">
            <Calendar size={13} className="text-rose-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-gray-800 truncate">
              Missed {signal.meetingTypeName ?? 'session'}
            </p>
            <p className="text-[11px] text-gray-400">
              {signal.sessionDate ? fmtDate(signal.sessionDate) : '—'}
            </p>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-1.5">
          {/* Schedule visit */}
          <button
            onClick={handleOpenForm}
            disabled={busy || showForm}
            title="Schedule a follow-up visit"
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-indigo-600 border border-indigo-200 hover:bg-indigo-50 disabled:opacity-50 transition-colors"
          >
            <CalendarPlus size={11} />
            Schedule visit
          </button>

          {/* Dismiss */}
          <button
            onClick={() => onDismiss(signal.id)}
            disabled={busy}
            title="Dismiss signal"
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-gray-500 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {dismissing ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <CheckCheck size={11} />
            )}
            Dismiss
          </button>
        </div>
      </div>

      {/* Inline schedule-visit form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="border-t border-indigo-100 bg-indigo-50/60 px-3 py-2.5 flex flex-col gap-2"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-indigo-700">Schedule visit</p>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Cancel"
            >
              <X size={13} />
            </button>
          </div>

          <div className="flex gap-2">
            <input
              ref={dateRef}
              type="date"
              value={visitDate}
              min={minDate}
              onChange={(e) => setVisitDate(e.target.value)}
              required
              className="flex-none w-36 px-2 py-1 rounded-md border border-indigo-200 text-[11px] text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Brief reason (optional)"
              maxLength={200}
              className="flex-1 min-w-0 px-2 py-1 rounded-md border border-indigo-200 text-[11px] text-gray-800 bg-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>

          {formError && (
            <p className="text-[11px] text-rose-600">{formError}</p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!visitDate || scheduling}
              className="flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {scheduling ? <Loader2 size={11} className="animate-spin" /> : <CalendarPlus size={11} />}
              Confirm
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Person group ─────────────────────────────────────────────────────────────

interface PersonGroupProps {
  personName: string;
  signals: api.CareSignal[];
  onDismiss: (id: string) => void;
  onScheduleVisit: (id: string, visitDate: string, reason: string) => Promise<void>;
  dismissingId: string | null;
  schedulingId: string | null;
}

function PersonGroup({ personName, signals, onDismiss, onScheduleVisit, dismissingId, schedulingId }: PersonGroupProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-rose-100 flex items-center justify-center">
            <Users size={13} className="text-rose-500" />
          </div>
          <span className="text-[13px] font-semibold text-gray-800">{personName}</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-medium">
            {signals.length} {signals.length === 1 ? 'signal' : 'signals'}
          </span>
        </div>
        {expanded ? (
          <ChevronUp size={14} className="text-gray-400" />
        ) : (
          <ChevronDown size={14} className="text-gray-400" />
        )}
      </button>

      {/* Signals */}
      {expanded && (
        <div className="p-3 flex flex-col gap-2 bg-white">
          {signals.map((s) => (
            <SignalCard
              key={s.id}
              signal={s}
              onDismiss={onDismiss}
              onScheduleVisit={onScheduleVisit}
              dismissing={dismissingId === s.id}
              scheduling={schedulingId === s.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CareSection() {
  const { user } = useAuth();
  const auth: api.AuthHeaders = { userId: user?.id ?? '', userRole: user?.role ?? 'admin' };

  const [signals, setSignals]         = useState<api.CareSignal[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [generating, setGenerating]   = useState(false);
  const [genMsg, setGenMsg]           = useState('');
  const [dismissingId, setDismissing] = useState<string | null>(null);
  const [schedulingId, setScheduling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await api.listCareSignals(auth);
      setSignals(data);
    } catch {
      setError('Could not load care signals.');
    } finally {
      setLoading(false);
    }
  }, [auth.userId]);

  useEffect(() => { load(); }, [load]);

  const handleGenerate = async () => {
    setGenerating(true); setGenMsg('');
    try {
      const result = await api.generateCareSignals(auth);
      setGenMsg(
        result.created === 0
          ? 'No new signals — everyone accounted for.'
          : `${result.created} new signal${result.created === 1 ? '' : 's'} created.`
      );
      await load();
    } catch (err: unknown) {
      setGenMsg(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setGenerating(false);
      setTimeout(() => setGenMsg(''), 5000);
    }
  };

  const handleDismiss = async (id: string) => {
    setDismissing(id);
    try {
      await api.dismissCareSignal(auth, id);
      setSignals((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // leave signal in list on failure
    } finally {
      setDismissing(null);
    }
  };

  const handleScheduleVisit = async (id: string, visitDate: string, reason: string) => {
    setScheduling(id);
    try {
      await api.scheduleVisit(auth, id, visitDate, reason);
      setSignals((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setScheduling(null);
      throw err; // re-throw so SignalCard can surface the message in the form
    }
    setScheduling(null);
  };

  // Group signals by person
  const groups = React.useMemo(() => {
    const map = new Map<string, { personName: string; signals: api.CareSignal[] }>();
    for (const s of signals) {
      const key = `${s.personType}:${s.personId}`;
      const name = s.personName ?? s.personId;
      if (!map.has(key)) map.set(key, { personName: name, signals: [] });
      map.get(key)!.signals.push(s);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.personName.localeCompare(b.personName)
    );
  }, [signals]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header bar */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Heart size={16} className="text-rose-500" />
          <h2 className="text-[14px] font-semibold text-gray-900">Pastoral Care</h2>
          {!loading && signals.length > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[11px] font-semibold">
              {signals.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {genMsg && (
            <span className="text-[12px] text-gray-500">{genMsg}</span>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {generating ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            {generating ? 'Scanning…' : 'Generate signals'}
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
          <div className="flex items-center gap-2 text-rose-600 text-sm py-10 justify-center">
            <AlertCircle size={16} />
            {error}
          </div>
        ) : signals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center mb-4">
              <Heart size={22} className="text-rose-400" />
            </div>
            <p className="text-[14px] font-medium text-gray-700 mb-1">No open care signals</p>
            <p className="text-[12px] text-gray-400 max-w-xs">
              Click "Generate signals" to check all completed sessions for unrecorded absences.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 max-w-2xl">
            <p className="text-[12px] text-gray-400 mb-1">
              {groups.length} {groups.length === 1 ? 'person' : 'people'} with open signals
            </p>
            {groups.map(({ personName, signals: grpSignals }) => (
              <PersonGroup
                key={personName}
                personName={personName}
                signals={grpSignals}
                onDismiss={handleDismiss}
                onScheduleVisit={handleScheduleVisit}
                dismissingId={dismissingId}
                schedulingId={schedulingId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
