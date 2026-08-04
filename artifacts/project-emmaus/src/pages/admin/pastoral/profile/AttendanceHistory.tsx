/**
 * AttendanceHistory — collapsed by default, shows last 30 attendance records.
 * Supports the Discipleship Profile but does not dominate it.
 */
import React, { useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import type { AttendanceHistoryItem } from '@/lib/pastoral-api';

interface Props {
  history: AttendanceHistoryItem[];
  loading?: boolean;
}

const STATUS_PILL: Record<string, string> = {
  present:      'bg-green-100 text-green-700',
  visitor:      'bg-blue-100 text-blue-700',
  apology:      'bg-yellow-100 text-yellow-700',
  absent:       'bg-red-100 text-red-600',
  not_expected: 'bg-gray-100 text-gray-400',
};

const STATUS_LABEL: Record<string, string> = {
  present: 'Present', visitor: 'Visitor', apology: 'Apology',
  absent: 'Absent', not_expected: 'Not Expected',
};

export default function AttendanceHistory({ history, loading }: Props) {
  const [expanded, setExpanded] = useState(false);

  const attended  = history.filter(h => h.status === 'present' || h.status === 'visitor').length;
  const total     = history.filter(h => h.status !== 'not_expected').length;
  const visible   = expanded ? history : history.slice(0, 5);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <CalendarDays size={13} className="text-blue-500" />
          <span className="text-[13px] font-semibold text-gray-700">Attendance History</span>
          {total > 0 && (
            <span className="text-[11px] text-gray-400">
              {attended} of {total} sessions
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {/* Expandable body */}
      {expanded && (
        <div className="border-t border-gray-100">
          {loading ? (
            <div className="flex items-center gap-2 py-6 justify-center text-gray-400">
              <Loader2 size={13} className="animate-spin" />
              <span className="text-[12px]">Loading history…</span>
            </div>
          ) : history.length === 0 ? (
            <p className="text-center text-[12px] text-gray-400 py-6">No attendance records.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {visible.map((h, i) => {
                const d = new Date(h.sessionDate + 'T12:00:00');
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <div className="text-center bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5 w-12 shrink-0">
                      <p className="text-[9px] font-semibold text-gray-400 uppercase">
                        {d.toLocaleString('en', { month: 'short' })}
                      </p>
                      <p className="text-[16px] font-bold text-gray-800 leading-none">{d.getDate()}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-900">{h.meetingTypeName}</p>
                      <p className="text-[11px] text-gray-400">
                        {d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_PILL[h.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {STATUS_LABEL[h.status] ?? h.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {history.length > 5 && (
            <div className="border-t border-gray-100 px-4 py-2 text-center">
              <button
                onClick={() => setExpanded(v => !v)}
                className="text-[12px] text-gray-400 hover:text-gray-700 transition-colors"
              >
                {expanded ? 'Showing all records' : `Show all ${history.length} records`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
