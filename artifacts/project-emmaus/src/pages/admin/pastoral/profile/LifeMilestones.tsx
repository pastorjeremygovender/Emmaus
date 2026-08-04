/**
 * LifeMilestones — permanent discipleship milestones.
 * These remain permanently visible and never roll off into the timeline.
 * Pastors can add/remove milestones with dates and optional notes.
 */
import React, { useState } from 'react';
import { Star, Plus, Trash2, Loader2, ChevronDown } from 'lucide-react';
import type { MilestoneItem } from '@/lib/pastoral-api';

interface Props {
  milestones: MilestoneItem[];
  onAdd: (milestoneType: string, title: string, date: string, notes: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  loading?: boolean;
}

const COMMON_TYPES = [
  { value: 'accepted_christ',       label: 'Accepted Christ' },
  { value: 'baptised',              label: 'Baptised' },
  { value: 'joined_church',         label: 'Joined Church' },
  { value: 'completed_foundations', label: 'Completed Foundations' },
  { value: 'completed_made_free',   label: 'Completed Made Free' },
  { value: 'started_serving',       label: 'Started Serving' },
  { value: 'leadership_training',   label: 'Leadership Training' },
  { value: 'mission_trip',          label: 'Mission Trip' },
  { value: 'preached',              label: 'Preached' },
  { value: 'other',                 label: 'Other' },
];

const MILESTONE_ICON: Record<string, string> = {
  accepted_christ:       '✝️',
  baptised:              '💧',
  joined_church:         '🏛️',
  completed_foundations: '📘',
  completed_made_free:   '🔓',
  started_serving:       '🤲',
  leadership_training:   '🎓',
  mission_trip:          '✈️',
  preached:              '🎤',
  other:                 '⭐',
};

function fmt(dateStr: string | null | undefined) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function LifeMilestones({ milestones, onAdd, onDelete, loading }: Props) {
  const [showForm, setShowForm]     = useState(false);
  const [milestoneType, setType]    = useState('accepted_christ');
  const [customTitle, setCustom]    = useState('');
  const [milestoneDate, setDate]    = useState('');
  const [notes, setNotes]           = useState('');
  const [saving, setSaving]         = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const selectedType = COMMON_TYPES.find(t => t.value === milestoneType);
  const effectiveTitle = milestoneType === 'other' ? customTitle : (selectedType?.label ?? customTitle);

  const handleAdd = async () => {
    if (!effectiveTitle.trim()) return;
    setSaving(true);
    try {
      await onAdd(milestoneType, effectiveTitle.trim(), milestoneDate, notes);
      setShowForm(false);
      setCustom('');
      setDate('');
      setNotes('');
      setType('accepted_christ');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try { await onDelete(id); }
    finally { setDeletingId(null); }
  };

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 bg-white';

  return (
    <div className="space-y-2">
      {/* Milestone list */}
      {loading ? (
        <div className="flex items-center gap-2 py-4 justify-center text-gray-400">
          <Loader2 size={13} className="animate-spin" />
          <span className="text-[12px]">Loading milestones…</span>
        </div>
      ) : milestones.length === 0 ? (
        <p className="text-[12px] text-gray-400 py-2">No milestones recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {milestones.map(m => (
            <div
              key={m.id}
              className="flex items-start gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 group"
            >
              <span className="text-[18px] shrink-0 mt-0.5">
                {MILESTONE_ICON[m.milestoneType] ?? '⭐'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-gray-900">{m.title}</p>
                {m.milestoneDate && (
                  <p className="text-[11px] text-gray-400 mt-0.5">{fmt(m.milestoneDate)}</p>
                )}
                {m.notes && (
                  <p className="text-[11px] text-gray-500 mt-1 italic">{m.notes}</p>
                )}
              </div>
              <button
                onClick={() => handleDelete(m.id)}
                disabled={deletingId === m.id}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all disabled:opacity-40"
              >
                {deletingId === m.id
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Trash2 size={13} />}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showForm ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Milestone Type
            </label>
            <select
              value={milestoneType}
              onChange={e => setType(e.target.value)}
              className={inp}
            >
              {COMMON_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {milestoneType === 'other' && (
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Title
              </label>
              <input
                value={customTitle}
                onChange={e => setCustom(e.target.value)}
                placeholder="e.g. Led a Home Group"
                className={inp}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Date <span className="font-normal normal-case text-gray-400">(optional)</span>
              </label>
              <input
                type="date"
                value={milestoneDate}
                onChange={e => setDate(e.target.value)}
                className={inp}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Note <span className="font-normal normal-case text-gray-400">(optional)</span>
              </label>
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional note"
                className={inp}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded-lg text-[12px] text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving || !effectiveTitle.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-[12px] font-medium hover:bg-teal-700 disabled:opacity-40"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Star size={11} />}
              Save Milestone
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-[12px] text-teal-600 hover:text-teal-800 transition-colors"
        >
          <Plus size={12} /> Add milestone
        </button>
      )}
    </div>
  );
}
