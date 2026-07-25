import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { listCollections } from '@/lib/collections-api';
import type { Collection } from '@/lib/collections-api';
import { Field } from '../shared';

interface Props {
  onClose: () => void;
  onCreated: (journeyId: string) => void;
}

const TYPE_OPTIONS = ['core', 'companion', 'series', 'course'];

export default function NewJourneyModal({ onClose, onCreated }: Props) {
  const { user } = useAuth();
  const { addJourney } = useJourney();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    journeyType: 'core',
    collectionId: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listCollections().then(setCollections).catch(() => {});
  }, []);

  const patch = (k: keyof typeof form, v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleCreate = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const created = await addJourney({
        id: '',
        title: form.title.trim(),
        description: form.description,
        journeyType: form.journeyType,
        status: 'Draft',
        durationDays: 0,
        churchWide: false,
        overloadExempt: false,
        updatedAt: new Date().toISOString(),
        ...(form.collectionId ? { collectionId: form.collectionId } : {}),
      });
      onCreated(created.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create journey');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">New Journey</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Field label="Title *">
            <input
              type="text"
              value={form.title}
              onChange={e => patch('title', e.target.value)}
              placeholder="e.g. 15 Minutes with Jesus"
              autoFocus
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={form.description}
              onChange={e => patch('description', e.target.value)}
              placeholder="Brief description for this journey…"
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select
                value={form.journeyType}
                onChange={e => patch('journeyType', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
              >
                {TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
            {collections.length > 0 && (
              <Field label="Collection">
                <select
                  value={form.collectionId}
                  onChange={e => patch('collectionId', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
                >
                  <option value="">None</option>
                  {collections.map(c => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !form.title.trim()}
            className="px-5 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Creating…' : 'Create Journey'}
          </button>
        </div>
      </div>
    </div>
  );
}
