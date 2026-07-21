import React from 'react';
import { useJourney } from '@/contexts/JourneyContext';
import { PlayCircle } from 'lucide-react';
import { AdminBtn, PageHeader } from './shared';

type Props = { journeyId: string; day: number; onBack: () => void };

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function Label({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`text-[11px] font-semibold uppercase tracking-widest mb-3 ${accent ? 'text-teal-700' : 'text-gray-400'}`}>
      {children}
    </div>
  );
}

export default function DayPreview({ journeyId, day, onBack }: Props) {
  const { getStep, getJourney } = useJourney();
  const step = getStep(journeyId, day);
  const journey = getJourney(journeyId);

  if (!step || !journey) {
    return (
      <div className="p-6 lg:p-8">
        <PageHeader title="Preview" onBack={onBack} />
        <p className="text-sm text-gray-400">Step not found.</p>
      </div>
    );
  }

  const hasSermon = !!step.sermonTimestampSeconds;

  return (
    <div className="p-6 lg:p-8 max-w-2xl">
      {/* Admin header */}
      <div className="flex items-center justify-between mb-6">
        <AdminBtn variant="secondary" onClick={onBack}>← Back to Editor</AdminBtn>
        <div className="text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-full uppercase tracking-wide">
          Preview — {journey.title} · Day {day}
        </div>
      </div>

      {/* Devotional preview */}
      <div className="bg-white rounded-2xl border border-gray-200 p-8 space-y-10">

        {/* Day label + title */}
        <div>
          <div className="text-[11px] font-semibold text-teal-700 uppercase tracking-widest">Day {day}</div>
          <h1 className="mt-2 text-[28px] font-serif font-semibold leading-tight text-gray-900">{step.title}</h1>
        </div>

        {/* Mentor intro */}
        <p className="text-[17px] text-gray-700 leading-[1.7] italic border-l-2 border-teal-200 pl-5">{step.mentorIntro}</p>

        {/* Scripture */}
        <div>
          <Label>The Word</Label>
          <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <p className="font-serif text-[18px] leading-[1.7] text-gray-900">{step.scripture}</p>
          </div>
        </div>

        {/* Devotional */}
        <div>
          <Label>Reflection</Label>
          <p className="text-[17px] leading-[1.7] text-gray-700">{step.devotional}</p>
        </div>

        {/* Sermon moment */}
        {hasSermon && (
          <div>
            <Label>Sermon Moment</Label>
            <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 space-y-3">
              <p className="text-[16px] text-gray-700 leading-[1.6]">
                {step.sermonContextualSentence || 'This moment in Sunday\'s sermon connects directly with today\'s reflection.'}
              </p>
              <a
                href={step.sermonLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-teal-700 font-medium text-[14px] hover:underline"
              >
                <PlayCircle size={16} />
                Watch from {formatTimestamp(step.sermonTimestampSeconds!)}
              </a>
            </div>
          </div>
        )}

        {/* Consider */}
        <div>
          <Label>Consider</Label>
          <p className="text-[17px] font-medium text-gray-900 leading-[1.6]">{step.reflectionQuestion}</p>
          <div className="mt-4 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-400 bg-gray-50">
            What stood out to you today? (Optional response field)
          </div>
        </div>

        {/* Prayer */}
        <div>
          <Label>Prayer</Label>
          <p className="text-[17px] font-serif italic leading-[1.7] text-gray-700">"{step.prayerPrompt}"</p>
        </div>

        {/* Action step */}
        <div>
          <Label accent>Today's Step</Label>
          <div className="bg-teal-50 border border-teal-100 rounded-xl p-5">
            <p className="text-[17px] font-medium text-gray-900 leading-[1.6]">{step.actionStep}</p>
          </div>
        </div>

        {/* Complete button preview */}
        <div className="pt-2">
          <div className="w-full py-3.5 rounded-2xl bg-teal-700/80 text-white text-center text-[16px] font-medium cursor-default select-none opacity-70">
            Complete Today (Preview)
          </div>
        </div>
      </div>
    </div>
  );
}
