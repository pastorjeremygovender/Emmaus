/**
 * AttendanceHistory — reveals the records after the recent-attendance summary.
 * It intentionally uses a plain control rather than a second accordion.
 */
import React, { useState } from 'react';
import type { AttendanceHistoryItem } from '@/lib/pastoral-api';

interface Props {
  history: AttendanceHistoryItem[];
  loading?: boolean;
}

const STATUS_PILL: Record<string, string> = {
  present: 'bg-green-100 text-green-700',
  visitor: 'bg-blue-100 text-blue-700',
  apology: 'bg-yellow-100 text-yellow-700',
  absent: 'bg-red-100 text-red-600',
  not_expected: 'bg-gray-100 text-gray-400',
};

const STATUS_LABEL: Record<string, string> = {
  present: 'Present', visitor: 'Visitor', apology: 'Apology',
  absent: 'Absent', not_expected: 'Not Expected',
};

export default function AttendanceHistory({ history, loading }: Props) {
  const [showFullHistory, setShowFullHistory] = useState(false);

  if (loading || history.length <= 3) return null;

  if (!showFullHistory) {
    return (
      <button
        type="button"
        onClick={() => setShowFullHistory(true)}
        className="text-[12px] font-medium text-teal-700 hover:text-teal-900 transition-colors"
      >
        View full attendance history
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="divide-y divide-gray-100 border-t border-gray-100">
        {history.slice(3).map((h, i) => {
          const d = new Date(h.sessionDate + 'T12:00:00');
          return (
            <div key={`${h.sessionId}-${i}`} className="flex items-center gap-3 py-3">
              <div className="text-center bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5 w-12 shrink-0">
                <p className="text-[9px] font-semibold text-gray-400 uppercase">{d.toLocaleString('en', { month: 'short' })}</p>
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
      <button
        type="button"
        onClick={() => setShowFullHistory(false)}
        className="text-[12px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
      >
        Show recent attendance only
      </button>
    </div>
  );
}