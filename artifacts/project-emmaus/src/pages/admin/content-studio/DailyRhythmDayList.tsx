/**
 * DailyRhythmDayList — shows all authored days for a Daily Rhythm track.
 * Accessed via "Edit Days" on a track row in DailyRhythmStudio.
 */
import React, { useMemo } from 'react';
import { ArrowLeft, Plus, Clock, CheckCircle2, FileText } from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import type { Journey, Step } from '@/lib/journeys-api';

interface Props {
  journeyId: string;
  onBack: () => void;
  onEditDay: (day: number) => void;
  onNewDay: () => void;
}

function statusColor(status?: string) {
  if (status === 'Published') return 'text-teal-700 bg-teal-50';
  return 'text-amber-700 bg-amber-50';
}

export default function DailyRhythmDayList({ journeyId, onBack, onEditDay, onNewDay }: Props) {
  const { getJourney, steps } = useJourney();
  const journey = getJourney(journeyId) as Journey | undefined;

  const days = useMemo(() => {
    return [...(steps as Step[]).filter(s => s.journeyId === journeyId)]
      .sort((a, b) => a.day - b.day);
  }, [steps, journeyId]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 bg-white border-b border-gray-100 flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-[14px] font-semibold text-gray-900 truncate">
            {journey?.title ?? 'Daily Rhythm Track'}
          </h2>
          <p className="text-[12px] text-gray-500">{days.length} day{days.length !== 1 ? 's' : ''} authored</p>
        </div>
        <button
          onClick={onNewDay}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors flex-shrink-0"
        >
          <Plus size={14} /> New Day
        </button>
      </div>

      {/* Day list */}
      <div className="flex-1 overflow-y-auto bg-white">
        {days.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center mb-4">
              <FileText size={22} className="text-teal-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">No days yet.</p>
            <p className="text-xs text-gray-400 mt-1">Click "New Day" to write Day 1.</p>
            <button
              onClick={onNewDay}
              className="mt-5 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors"
            >
              Write Day 1
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {days.map(step => (
              <button
                key={step.day}
                onClick={() => onEditDay(step.day)}
                className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50/70 transition-colors text-left group"
              >
                {/* Day number badge */}
                <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                  <span className="text-[13px] font-semibold text-teal-700">{step.day}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {step.title || <span className="text-gray-400 italic">Untitled</span>}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {step.scripture && (
                      <span className="text-xs text-gray-400 truncate">{step.scripture}</span>
                    )}
                    {step.estimatedReadingTime && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock size={10} /> {step.estimatedReadingTime} min
                      </span>
                    )}
                  </div>
                </div>

                {/* Status */}
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${statusColor((step as any).status)}`}>
                  {(step as any).status === 'Published' ? 'Published' : 'Draft'}
                </span>

                <CheckCircle2 size={14} className="text-gray-300 group-hover:text-teal-400 transition-colors flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
