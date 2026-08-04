/**
 * AttendanceRhythm — monthly attendance bar chart.
 * Filled squares (■) = attended, outline squares (□) = missed.
 * Designed to read at a glance: trend over time is immediately visible.
 */
import React from 'react';
import { Loader2 } from 'lucide-react';
import type { MonthlyAttendance } from '@/lib/pastoral-api';

interface Props {
  months: MonthlyAttendance[];
  loading?: boolean;
}

export default function AttendanceRhythm({ months, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 justify-center text-gray-400">
        <Loader2 size={13} className="animate-spin" />
        <span className="text-[12px]">Loading pattern…</span>
      </div>
    );
  }

  if (months.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-[12px] text-gray-400">No attendance recorded in the last 12 months.</p>
      </div>
    );
  }

  // Find max to scale bars relatively
  const maxMarked = Math.max(...months.map(m => m.totalMarked), 1);

  return (
    <div className="space-y-2">
      {months.map((m) => {
        const attended = m.attended;
        const absent   = m.absent;
        const other    = m.totalMarked - attended - absent; // apologies etc.
        const total    = m.totalMarked;
        const pct      = total > 0 ? Math.round((attended / total) * 100) : 0;

        // Render up to 8 squares per row; scale to fit
        const squares = Math.min(total, 8);
        const attendedSquares = Math.round((attended / Math.max(total, 1)) * squares);
        const absentSquares   = squares - attendedSquares;

        return (
          <div key={m.yearMonth} className="flex items-center gap-3">
            {/* Month label */}
            <span className="text-[11px] text-gray-500 w-14 shrink-0 text-right font-medium">
              {m.month.split(' ')[0]}
            </span>

            {/* Squares bar */}
            <div className="flex items-center gap-0.5">
              {Array.from({ length: attendedSquares }).map((_, i) => (
                <div key={`a${i}`} className="w-4 h-4 rounded-sm bg-teal-500" title="Attended" />
              ))}
              {Array.from({ length: absentSquares }).map((_, i) => (
                <div
                  key={`m${i}`}
                  className="w-4 h-4 rounded-sm border border-gray-300 bg-white"
                  title="Missed"
                />
              ))}
            </div>

            {/* Stats */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-700 font-medium">
                {attended}/{total}
              </span>
              {pct > 0 && (
                <span className={`text-[10px] font-semibold px-1 rounded ${
                  pct >= 75 ? 'text-teal-600' :
                  pct >= 50 ? 'text-amber-600' :
                  'text-rose-500'
                }`}>
                  {pct}%
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* Summary footer */}
      {months.length >= 3 && (() => {
        const total    = months.reduce((s, m) => s + m.totalMarked, 0);
        const attended = months.reduce((s, m) => s + m.attended, 0);
        const overall  = total > 0 ? Math.round((attended / total) * 100) : 0;
        return (
          <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
            <span className="text-[11px] text-gray-400">Overall attendance rate</span>
            <span className={`text-[12px] font-semibold ${
              overall >= 75 ? 'text-teal-600' : overall >= 50 ? 'text-amber-600' : 'text-rose-500'
            }`}>
              {overall}%
            </span>
          </div>
        );
      })()}
    </div>
  );
}
