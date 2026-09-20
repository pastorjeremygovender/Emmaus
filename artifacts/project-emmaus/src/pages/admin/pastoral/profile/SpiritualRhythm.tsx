/**
 * SpiritualRhythm — GitHub-style contribution heatmap.
 * Shows 26 weeks of daily activity. Purpose: reveal consistency, not numbers.
 */
import React from 'react';
import { Loader2 } from 'lucide-react';
import type { RhythmDay } from '@/lib/pastoral-api';

interface Props {
  days: RhythmDay[];
  loading?: boolean;
}

const LEVEL_CLASS: Record<0 | 1 | 2 | 3, string> = {
  0: 'bg-gray-100',
  1: 'bg-teal-100',
  2: 'bg-teal-300',
  3: 'bg-teal-600',
};

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

export default function SpiritualRhythm({ days, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 justify-center text-gray-400">
        <Loader2 size={13} className="animate-spin" />
        <span className="text-[12px]">Loading rhythm…</span>
      </div>
    );
  }

  if (days.length === 0) {
    return <p className="text-[12px] text-gray-400 py-4 text-center">No activity data yet.</p>;
  }

  // Build weeks array (each week = 7 days, Mon→Sun)
  // days is already 182 days in chronological order
  const weeks: RhythmDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  // Find month labels: show label when month changes across week boundaries
  const monthLabels: (string | null)[] = weeks.map((week, wi) => {
    if (wi === 0) {
      const d = new Date(week[0].date + 'T12:00:00');
      return MONTH_ABBR[d.getMonth()];
    }
    const prevFirstDay = new Date(weeks[wi - 1][0].date + 'T12:00:00');
    const thisFirstDay = new Date(week[0].date + 'T12:00:00');
    if (thisFirstDay.getMonth() !== prevFirstDay.getMonth()) {
      return MONTH_ABBR[thisFirstDay.getMonth()];
    }
    return null;
  });

  const totalActiveDays = days.filter(d => d.level > 0).length;
  const currentStreak = (() => {
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].level > 0) streak++;
      else break;
    }
    return streak;
  })();

  return (
    <div>
      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="flex gap-0.5 min-w-0">
          {/* Day labels column */}
          <div className="flex flex-col gap-0.5 mr-1 pt-5">
            {DAY_LABELS.map((label, i) => (
              <div key={i} className="h-3 text-[8px] text-gray-300 leading-3 pr-1 text-right w-5">
                {label}
              </div>
            ))}
          </div>

          {/* Weeks columns */}
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {/* Month label */}
              <div className="h-4 text-[8px] text-gray-400 leading-4 truncate">
                {monthLabels[wi] ?? ''}
              </div>
              {/* Day cells */}
              {week.map((day) => (
                <div
                  key={day.date}
                  title={day.date + (day.level > 0 ? ' — activity recorded' : '')}
                  className={`w-3 h-3 rounded-sm transition-colors ${LEVEL_CLASS[day.level]}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend + stats */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400">Less</span>
          {([0, 1, 2, 3] as const).map(l => (
            <div key={l} className={`w-3 h-3 rounded-sm ${LEVEL_CLASS[l]}`} />
          ))}
          <span className="text-[10px] text-gray-400">More</span>
        </div>
        <div className="flex gap-3 text-[10px] text-gray-400">
          {totalActiveDays > 0 && (
            <span><span className="font-semibold text-gray-700">{totalActiveDays}</span> active days</span>
          )}
          {currentStreak > 1 && (
            <span><span className="font-semibold text-teal-600">{currentStreak}</span> day streak</span>
          )}
        </div>
      </div>
    </div>
  );
}
