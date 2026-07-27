/**
 * DailyRhythmStudio — simplified home for Daily Rhythm content.
 *
 * There is one Daily Rhythm: "10 Minutes with Jesus".
 * Opens directly to the day list. No track selection, no track types.
 */
import React, { useMemo } from 'react';
import { Sun, Plus, Clock, CheckCircle2, FileText, Loader2, AlertTriangle } from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import type { Journey, Step } from '@/lib/journeys-api';

interface Props {
  onNewDay: (journeyId: string) => void;
  onEditDay: (journeyId: string, day: number) => void;
}

function statusColor(status?: string) {
  if (status === 'Published') return 'text-teal-700 bg-teal-50';
  return 'text-amber-700 bg-amber-50';
}

export default function DailyRhythmStudio({ onNewDay, onEditDay }: Props) {
  const { journeys, steps, loading } = useJourney();

  // There is always one daily-rhythm journey — find it automatically.
  const journey = useMemo(
    () => (journeys as Journey[]).find(j => j.journeyType === 'daily-rhythm') ?? null,
    [journeys],
  );

  const days = useMemo(() => {
    if (!journey) return [];
    return [...(steps as Step[]).filter(s => s.journeyId === journey.id)]
      .sort((a, b) => a.day - b.day);
  }, [steps, journey]);

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 bg-white border-b border-gray-100 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0">
          <Sun size={18} className="text-teal-700" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold text-gray-900">10 Minutes with Jesus</h2>
          <p className="text-[12px] text-gray-500">
            {days.length} day{days.length !== 1 ? 's' : ''} authored
          </p>
        </div>
        <button
          onClick={() => journey && onNewDay(journey.id)}
          disabled={!journey}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors flex-shrink-0 disabled:opacity-40"
        >
          <Plus size={14} /> New Day
        </button>
      </div>

      {/* Day list */}
      <div className="flex-1 overflow-y-auto bg-white">
        {loading ? (
          /* Still fetching from the API */
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-gray-400">
            <Loader2 size={16} className="animate-spin" /> Loading Daily Rhythm…
          </div>
        ) : !journey ? (
          /* Fetch finished but journey not found — surface an actionable error */
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
              <AlertTriangle size={22} className="text-amber-500" />
            </div>
            <p className="text-sm font-medium text-gray-700">Couldn't load Daily Rhythm content.</p>
            <p className="text-xs text-gray-400 mt-1 max-w-[280px]">
              The "10 Minutes with Jesus" journey wasn't found. This may be a connection issue.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-5 px-5 py-2.5 border border-gray-200 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : days.length === 0 ? (
          /* Fetch finished, journey found, but no days authored yet */
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center mb-4">
              <FileText size={22} className="text-teal-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">
              No Daily Rhythm days have been created yet.
            </p>
            <p className="text-xs text-gray-400 mt-1">Click "New Day" to write Day 1.</p>
            <button
              onClick={() => onNewDay(journey.id)}
              className="mt-5 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors"
            >
              + New Day
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {days.map(step => (
              <button
                key={step.day}
                onClick={() => onEditDay(journey.id, step.day)}
                className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50/70 transition-colors text-left group"
              >
                {/* Day badge */}
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
                      <span className="text-xs text-gray-400 truncate max-w-[240px]">
                        {step.scripture}
                      </span>
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
