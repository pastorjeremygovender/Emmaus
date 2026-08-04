/**
 * PastoralPeople.tsx — Combined People list (Emmaus users + pastoral persons).
 *
 * Checkpoint 1: Shows name, type, latest attendance, linked status.
 * Filters: All / Emmaus Users / Attendance-only / Visitors / Unlinked.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  Search, Users, Loader2, AlertCircle, ChevronRight, X,
  UserCheck, UserX, Clock,
} from 'lucide-react';
import * as api from '@/lib/pastoral-api';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  onSelectPerson: (person: api.UnifiedPerson) => void;
}

type Filter = 'all' | 'emmaus' | 'attendance_only' | 'visitor' | 'unlinked';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all',             label: 'All' },
  { id: 'emmaus',          label: 'Emmaus Users' },
  { id: 'attendance_only', label: 'Attendance-only' },
  { id: 'visitor',         label: 'Visitors' },
  { id: 'unlinked',        label: 'Unlinked' },
];

const STATUS_PILL: Record<api.AttendanceStatus, string> = {
  present:      'bg-green-100 text-green-700',
  visitor:      'bg-blue-100 text-blue-700',
  apology:      'bg-yellow-100 text-yellow-700',
  absent:       'bg-red-100 text-red-600',
  not_expected: 'bg-gray-100 text-gray-500',
};

const STATUS_LABEL: Record<api.AttendanceStatus, string> = {
  present: 'Present', visitor: 'Visitor', apology: 'Apology',
  absent: 'Absent', not_expected: 'Not Expected',
};

export default function PastoralPeople({ onSelectPerson }: Props) {
  const { user } = useAuth();
  const auth: api.AuthHeaders = { userId: user?.id ?? '', userRole: user?.role ?? 'admin' };

  const [people, setPeople]     = useState<api.UnifiedPerson[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState<Filter>('all');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setPeople(await api.listPeople(auth)); }
    catch { setError('Could not load people.'); }
    finally { setLoading(false); }
  }, [auth.userId]);

  useEffect(() => { load(); }, [load]);

  const q = search.toLowerCase().trim();

  const filtered = people.filter(p => {
    if (q && !p.fullName.toLowerCase().includes(q) && !(p.email?.toLowerCase().includes(q) ?? false)) return false;
    if (filter === 'emmaus')          return p.subType === 'emmaus_user';
    if (filter === 'attendance_only') return p.subType === 'attendance_only';
    if (filter === 'visitor')         return p.subType === 'visitor';
    if (filter === 'unlinked')        return p.personType === 'pastoral_person' && !p.isLinked;
    return true;
  });

  const subTypeBadge: Record<string, string> = {
    emmaus_user:      'bg-teal-50 text-teal-700',
    attendance_only:  'bg-gray-100 text-gray-600',
    visitor:          'bg-blue-50 text-blue-700',
  };
  const subTypeLabel: Record<string, string> = {
    emmaus_user:     'Emmaus',
    attendance_only: 'Attender',
    visitor:         'Visitor',
  };

  const counts: Record<Filter, number> = {
    all:             people.length,
    emmaus:          people.filter(p => p.subType === 'emmaus_user').length,
    attendance_only: people.filter(p => p.subType === 'attendance_only').length,
    visitor:         people.filter(p => p.subType === 'visitor').length,
    unlinked:        people.filter(p => p.personType === 'pastoral_person' && !p.isLinked).length,
  };

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Filter bar */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-4 pt-3 pb-0">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-px">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 whitespace-nowrap transition-colors -mb-px ${
                filter === f.id
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}>
              {f.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                filter === f.id ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {counts[f.id]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="shrink-0 px-4 py-3 bg-white border-b border-gray-100">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-8 pr-8 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={18} className="animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <p className="flex items-center gap-2 text-[13px] text-red-600 p-6">
            <AlertCircle size={14} /> {error}
          </p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Users size={28} className="mx-auto mb-3 opacity-30" />
            <p className="text-[14px]">{search ? 'No matches found.' : 'No people in this category.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(p => (
              <button
                key={p.id}
                onClick={() => onSelectPerson(p)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/60 transition-colors">

                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-[13px] font-semibold text-gray-500">
                  {p.fullName.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-medium text-gray-900 truncate">{p.fullName}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${subTypeBadge[p.subType]}`}>
                      {subTypeLabel[p.subType]}
                    </span>
                    {p.personType === 'pastoral_person' && p.isLinked && (
                      <span title="Linked to Emmaus account">
                        <UserCheck size={12} className="text-teal-500" />
                      </span>
                    )}
                    {p.personType === 'pastoral_person' && !p.isLinked && (
                      <span title="No Emmaus account linked">
                        <UserX size={12} className="text-gray-300" />
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400 flex-wrap">
                    {p.email && <span className="truncate">{p.email}</span>}
                    {p.lastAttendanceDate && (
                      <span className="flex items-center gap-1">
                        <Clock size={9} />
                        {new Date(p.lastAttendanceDate + 'T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                        {p.lastAttendanceStatus && (
                          <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${STATUS_PILL[p.lastAttendanceStatus as api.AttendanceStatus] ?? ''}`}>
                            {STATUS_LABEL[p.lastAttendanceStatus as api.AttendanceStatus] ?? p.lastAttendanceStatus}
                          </span>
                        )}
                      </span>
                    )}
                    {!p.lastAttendanceDate && (
                      <span className="text-gray-300">No attendance recorded</span>
                    )}
                  </div>
                </div>

                <ChevronRight size={14} className="text-gray-300 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
