/**
 * PastoralAuditLog.tsx — Read-only audit trail for attendance corrections.
 *
 * Filters: person, session, date range.
 * Each entry shows: who changed it, when, from what status, to what status.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  Search, X, Loader2, AlertCircle, ShieldCheck,
  Calendar, ChevronDown, ChevronUp,
} from 'lucide-react';
import * as api from '@/lib/pastoral-api';
import { useAuth } from '@/contexts/AuthContext';

const ACTION_LABELS: Record<string, string> = {
  create:  'Recorded',
  correct: 'Corrected',
  delete:  'Deleted',
  link:    'Linked',
};

const ACTION_STYLE: Record<string, string> = {
  create:  'bg-green-50 text-green-700 border-green-200',
  correct: 'bg-amber-50 text-amber-700 border-amber-200',
  delete:  'bg-red-50 text-red-600 border-red-200',
  link:    'bg-blue-50 text-blue-700 border-blue-200',
};

const STATUS_LABELS: Record<string, string> = {
  present:      'Present',
  visitor:      'Visitor',
  apology:      'Apology',
  absent:       'Absent',
  not_expected: 'Not Expected',
};

const STATUS_STYLE: Record<string, string> = {
  present:      'bg-green-100 text-green-800',
  visitor:      'bg-blue-100 text-blue-700',
  apology:      'bg-yellow-100 text-yellow-800',
  absent:       'bg-red-100 text-red-700',
  not_expected: 'bg-gray-100 text-gray-500',
};

function StatusBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-gray-400 italic text-[11px]">none</span>;
  const label = STATUS_LABELS[value] ?? value;
  const style = STATUS_STYLE[value] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${style}`}>
      {label}
    </span>
  );
}

function extractStatus(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === 'object' && val !== null && 'status' in val) {
    return String((val as Record<string, unknown>).status);
  }
  return null;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-ZA', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function shortId(id: string) {
  // If it looks like an email, show it; otherwise abbreviate UUID
  if (id.includes('@')) return id;
  return id.length > 12 ? `…${id.slice(-8)}` : id;
}

export default function PastoralAuditLog() {
  const { user } = useAuth();
  const auth: api.AuthHeaders = { userId: user?.id ?? '', userRole: user?.role ?? 'admin' };

  const [entries, setEntries]     = useState<api.PastoralAuditEntry[]>([]);
  const [people, setPeople]       = useState<api.UnifiedPerson[]>([]);
  const [sessions, setSessions]   = useState<api.MeetingSession[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  // Filters
  const [personFilter, setPersonFilter]     = useState('');
  const [sessionFilter, setSessionFilter]   = useState('');
  const [dateFrom, setDateFrom]             = useState('');
  const [dateTo, setDateTo]                 = useState('');
  const [search, setSearch]                 = useState('');
  const [showFilters, setShowFilters]       = useState(true);

  // Load supporting data once
  useEffect(() => {
    Promise.all([
      api.listPeople(auth),
      api.listSessions(auth, { limit: 200 }),
    ]).then(([p, s]) => {
      setPeople(p);
      setSessions(s);
    }).catch(() => {/* non-fatal */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      // Date range: dateTo is exclusive end-of-day so add 1 day
      let dateToExclusive: string | undefined;
      if (dateTo) {
        const d = new Date(dateTo + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        dateToExclusive = d.toISOString().slice(0, 10);
      }
      const data = await api.getPastoralAuditLog(auth, {
        personId:  personFilter || undefined,
        sessionId: sessionFilter || undefined,
        dateFrom:  dateFrom    || undefined,
        dateTo:    dateToExclusive,
        entityType: 'attendance_record',
        limit: 200,
      });
      setEntries(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log.');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personFilter, sessionFilter, dateFrom, dateTo, auth.userId]);

  useEffect(() => { load(); }, [load]);

  // Build name lookup maps
  const personNameMap = new Map(people.map(p => [p.id, p.fullName]));
  const sessionMap    = new Map(sessions.map(s => [
    s.id,
    `${s.meetingTypeName ?? 'Meeting'} — ${new Date(s.sessionDate + 'T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}`,
  ]));

  // Client-side search on changedBy or personId
  const q = search.toLowerCase().trim();
  const filtered = entries.filter(e => {
    if (!q) return true;
    const changedByName = personNameMap.get(e.changedBy) ?? e.changedBy;
    const subjectName   = e.personId ? (personNameMap.get(e.personId) ?? e.personId) : '';
    return (
      changedByName.toLowerCase().includes(q) ||
      subjectName.toLowerCase().includes(q) ||
      e.action.includes(q)
    );
  });

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500';

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-4 py-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-teal-600" />
            <h2 className="text-[14px] font-semibold text-gray-900">Attendance Audit Log</h2>
            {!loading && (
              <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowFilters(f => !f)}
            className="flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-700 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100">
            <Calendar size={13} />
            Filters
            {showFilters ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Person filter */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Person</label>
              <select value={personFilter} onChange={e => setPersonFilter(e.target.value)} className={inp}>
                <option value="">All people</option>
                {people.map(p => (
                  <option key={p.id} value={p.id}>{p.fullName}</option>
                ))}
              </select>
            </div>

            {/* Session filter */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Session</label>
              <select value={sessionFilter} onChange={e => setSessionFilter(e.target.value)} className={inp}>
                <option value="">All sessions</option>
                {sessions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.meetingTypeName ?? 'Meeting'} — {new Date(s.sessionDate + 'T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </option>
                ))}
              </select>
            </div>

            {/* Date from */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Changed from</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inp} />
            </div>

            {/* Date to */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Changed to</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inp} />
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by person or recorder…"
            className="w-full pl-8 pr-8 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── List ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={18} className="animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <p className="flex items-center gap-2 text-[13px] text-red-600 p-6">
            <AlertCircle size={14} />{error}
          </p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <ShieldCheck size={28} className="mx-auto mb-3 opacity-30" />
            <p className="text-[14px]">No audit entries match the current filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(entry => {
              const prevStatus = extractStatus(entry.previousValue);
              const newStatus  = extractStatus(entry.newValue);
              const subjectName = entry.personId
                ? (personNameMap.get(entry.personId) ?? shortId(entry.personId))
                : null;
              const changedByName = personNameMap.get(entry.changedBy) ?? shortId(entry.changedBy);
              const sessionLabel  = entry.sessionId ? sessionMap.get(entry.sessionId) : null;
              const actionStyle   = ACTION_STYLE[entry.action]  ?? 'bg-gray-50 text-gray-600 border-gray-200';
              const actionLabel   = ACTION_LABELS[entry.action] ?? entry.action;

              return (
                <div key={entry.id} className="px-4 py-3 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-start gap-3">
                    {/* Action badge */}
                    <span className={`shrink-0 mt-0.5 inline-block px-2 py-0.5 rounded border text-[11px] font-semibold ${actionStyle}`}>
                      {actionLabel}
                    </span>

                    {/* Main content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Subject + status change */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {subjectName && (
                          <span className="text-[13px] font-medium text-gray-900">{subjectName}</span>
                        )}
                        {entry.action === 'correct' && prevStatus !== null && (
                          <>
                            <StatusBadge value={prevStatus} />
                            <span className="text-gray-400 text-[11px]">→</span>
                            <StatusBadge value={newStatus} />
                          </>
                        )}
                        {entry.action === 'create' && newStatus !== null && (
                          <>
                            <span className="text-gray-400 text-[11px]">marked</span>
                            <StatusBadge value={newStatus} />
                          </>
                        )}
                        {entry.action === 'delete' && prevStatus !== null && (
                          <>
                            <span className="text-gray-400 text-[11px]">removed</span>
                            <StatusBadge value={prevStatus} />
                          </>
                        )}
                      </div>

                      {/* Session label */}
                      {sessionLabel && (
                        <p className="text-[11px] text-gray-500">{sessionLabel}</p>
                      )}

                      {/* Reason */}
                      {entry.reason && (
                        <p className="text-[11px] text-gray-500 italic">"{entry.reason}"</p>
                      )}
                    </div>

                    {/* Right: who + when */}
                    <div className="shrink-0 text-right space-y-0.5">
                      <p className="text-[12px] font-medium text-gray-700">{changedByName}</p>
                      <p className="text-[10px] text-gray-400">{fmtDate(entry.changedAt)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
