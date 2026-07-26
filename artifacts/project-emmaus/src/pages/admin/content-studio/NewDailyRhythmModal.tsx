/**
 * NewDailyRhythmModal — creates a new Daily Rhythm track.
 *
 * Pre-sets journeyType to 'daily-rhythm'. Admins name the track and choose
 * a sub-type (Foundation, Recurring, Seasonal, Church-Specific).
 * On creation the caller receives the new journey ID and opens the editor.
 */

import { useState } from 'react';
import { X, Sun, Loader2 } from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';

interface Props {
  onClose: () => void;
  onCreated: (id: string) => void;
}

const TRACK_TYPES = [
  { value: 'foundation',    label: 'Foundation Days',    desc: 'Days 1–7 onboarding content' },
  { value: 'recurring',     label: 'Recurring Rhythm',   desc: 'Ongoing daily content, Day 8+' },
  { value: 'seasonal',      label: 'Seasonal',           desc: 'Advent, Lent, special series' },
  { value: 'church-specific', label: 'Church-Specific',  desc: 'Customised for your congregation' },
];

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60);
}

export default function NewDailyRhythmModal({ onClose, onCreated }: Props) {
  const { addJourney } = useJourney();

  const [title, setTitle]         = useState('');
  const [trackType, setTrackType] = useState('recurring');
  const [description, setDescription] = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const handleCreate = async () => {
    if (!title.trim()) { setError('Please enter a title.'); return; }
    setLoading(true);
    setError('');
    try {
      const id = slugify(title) || `daily-rhythm-${Date.now()}`;
      const journey = await addJourney({
        id,
        title: title.trim(),
        description: description.trim(),
        journeyType: 'daily-rhythm',
        category: 'Daily Rhythm',
        status: 'Draft',
        durationDays: 0,
        tags: ['daily-rhythm', trackType],
        estimatedDuration: '10 min/day',
      } as any);
      onCreated(journey.id);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create track. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center">
            <Sun size={16} className="text-teal-700" />
          </div>
          <div className="flex-1">
            <h2 className="text-[15px] font-semibold text-gray-900">New Daily Rhythm Track</h2>
            <p className="text-[12px] text-gray-500">Separate from Journeys — never completes.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-gray-700">Track Title</label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={e => { setTitle(e.target.value); setError(''); }}
              placeholder="e.g. 10 Minutes with Jesus"
              className="w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
            />
          </div>

          {/* Track type */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-gray-700">Track Type</label>
            <div className="grid grid-cols-2 gap-2">
              {TRACK_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setTrackType(t.value)}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    trackType === t.value
                      ? 'border-teal-400 bg-teal-50'
                      : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  <p className="text-[12px] font-semibold text-gray-800">{t.label}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-gray-700">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of this track's purpose…"
              rows={2}
              className="w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent resize-none"
            />
          </div>

          {error && (
            <p className="text-[13px] text-red-600">{error}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2.5 px-6 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading || !title.trim()}
            className="flex-1 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Create Track
          </button>
        </div>
      </div>
    </div>
  );
}
