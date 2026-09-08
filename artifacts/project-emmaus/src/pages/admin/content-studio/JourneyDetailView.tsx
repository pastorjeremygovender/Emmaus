/**
 * JourneyDetailView — Day list within a specific Journey.
 *
 * Shows journey header (title, metadata, status) and all days (steps).
 * "+ Add Day" opens the day editor for a new step.
 * Clicking an existing day opens the day editor for that step.
 */
import React, { useMemo } from 'react';
import {
  Plus, Clock, CheckCircle2, FileText, Loader2,
  Layers, BookOpen, Pencil, Tag,
} from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import type { Journey, Step } from '@/lib/journeys-api';
import { StatusBadge, AdminBtn } from '../shared';
import { getStepLabel } from '@/lib/step-label';

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  journeyId: string;
  onBack: () => void;
  onEditJourney: (journeyId: string) => void;
  onAddDay: (journeyId: string) => void;
  onEditDay: (journeyId: string, day: number) => void;
  onDayDuplicated?: (day: number) => void;
  onDayDeleted?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status?: string) {
  if (status === 'Published' || status === 'published') return 'text-teal-700 bg-teal-50';
  return 'text-amber-700 bg-amber-50';
}

function statusLabel(status?: string) {
  return (status === 'Published' || status === 'published') ? 'Published' : 'Draft';
}

const DIFFICULTY_COLOR: Record<string, string> = {
  Beginner:     'text-green-600 bg-green-50',
  Intermediate: 'text-amber-600 bg-amber-50',
  Advanced:     'text-red-600 bg-red-50',
};

const TYPE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  core:       { color: 'text-teal-600',   bg: 'bg-teal-50',   label: 'Core'      },
  companion:  { color: 'text-rose-500',   bg: 'bg-rose-50',   label: 'Companion' },
  series:     { color: 'text-purple-600', bg: 'bg-purple-50', label: 'Series'    },
  course:     { color: 'text-amber-600',  bg: 'bg-amber-50',  label: 'Course'    },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function JourneyDetailView({
  journeyId,
  onBack,
  onEditJourney,
  onAddDay,
  onEditDay,
}: Props) {
  const { journeys, steps, loading } = useJourney();

  const journey = useMemo(
    () => (journeys as Journey[]).find(j => j.id === journeyId) ?? null,
    [journeys, journeyId],
  );

  const days = useMemo(
    () =>
      [...(steps as Step[]).filter(s => s.journeyId === journeyId)]
        .sort((a, b) => a.day - b.day),
    [steps, journeyId],
  );

  const publishedDays = days.filter(d => d.status === 'Published' || (d as any).status === 'published').length;

  const typeCfg = TYPE_CONFIG[(journey?.journeyType ?? 'core')] ?? TYPE_CONFIG.core;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 size={20} className="animate-spin text-teal-600" />
      </div>
    );
  }

  if (!journey) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center px-6">
        <p className="text-sm text-gray-500">Journey not found.</p>
        <button onClick={onBack} className="mt-3 text-sm text-teal-600 hover:underline">← Back</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Journey header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-6 py-5">
        <div className="flex items-start justify-between gap-4 max-w-4xl">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${typeCfg.bg}`}>
              <BookOpen size={20} className={typeCfg.color} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-gray-900">{journey.title}</h2>
                <StatusBadge status={journey.status} />
                {journey.journeyType && (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${typeCfg.bg} ${typeCfg.color}`}>
                    {typeCfg.label}
                  </span>
                )}
              </div>
              {journey.description && (
                <p className="text-sm text-gray-500 mt-0.5 max-w-lg">{journey.description}</p>
              )}
              {/* Metadata row */}
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <CheckCircle2 size={12} className="text-green-500" />
                  {publishedDays} of {days.length} day{days.length !== 1 ? 's' : ''} published
                </span>
                {journey.difficulty && (
                  <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${DIFFICULTY_COLOR[journey.difficulty] ?? 'text-gray-500 bg-gray-100'}`}>
                    {journey.difficulty}
                  </span>
                )}
                {journey.estimatedDuration && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock size={10} /> {journey.estimatedDuration}
                  </span>
                )}
                {journey.tags && journey.tags.length > 0 && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Tag size={10} /> {journey.tags.slice(0, 2).join(', ')}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => onEditJourney(journeyId)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <Pencil size={13} /> Edit Journey
            </button>
            <AdminBtn variant="primary" onClick={() => onAddDay(journeyId)}>
              <Plus size={14} /> Add Day
            </AdminBtn>
          </div>
        </div>
      </div>

      {/* Day list */}
      <div className="flex-1 overflow-y-auto bg-white">
        {days.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center mb-4">
              <FileText size={22} className="text-teal-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">No days have been written yet.</p>
            <p className="text-xs text-gray-400 mt-1">Click "Add Day" to write the first day of this journey.</p>
            <button
              onClick={() => onAddDay(journeyId)}
              className="mt-5 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors"
            >
              + Add {getStepLabel({ day: 1 }, journey)}
            </button>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-6 py-5">
            <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
              {days.map(step => (
                <button
                  key={step.day}
                  onClick={() => onEditDay(journeyId, step.day)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50/70 transition-colors text-left group bg-white"
                >
                  {/* Day badge */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${typeCfg.bg}`}>
                    <span className={`text-[13px] font-semibold ${typeCfg.color}`}>{step.day}</span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {step.title
                        ? step.title
                        : <span className="text-gray-400 italic">{getStepLabel(step, journey)} — untitled</span>}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
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
                    {statusLabel((step as any).status)}
                  </span>

                  <Layers size={14} className="text-gray-300 group-hover:text-teal-400 transition-colors flex-shrink-0" />
                </button>
              ))}
            </div>

            {/* Add another day row */}
            <button
              onClick={() => onAddDay(journeyId)}
              className="mt-3 w-full flex items-center justify-center gap-2 py-3 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50/30 transition-colors"
            >
              <Plus size={14} /> Add {getStepLabel({ day: days.length + 1 }, journey)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
