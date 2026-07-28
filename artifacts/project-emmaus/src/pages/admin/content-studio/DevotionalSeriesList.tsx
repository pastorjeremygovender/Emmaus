/**
 * DevotionalSeriesList — admin list of Daily Devotional series.
 *
 * Actions: Create | Edit | Archive | Permanent delete
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Plus, BookHeart, MoreHorizontal, Archive, Trash2, Loader2, Tag } from 'lucide-react';
import {
  listAllSeries,
  createSeries,
  archiveSeries,
  permanentDeleteSeries,
  type DevotionalSeries,
} from '@/lib/devotionals-api';
import { StatusBadge, Field } from '../shared';
import { useAuth } from '@/contexts/AuthContext';

const STATUS_TABS = ['All', 'Draft', 'Published', 'Archived'];

const TYPE_LABELS: Record<string, string> = {
  general: 'General',
  psalms: 'Psalms',
  proverbs: 'Proverbs',
  seasonal: 'Seasonal',
  'church-specific': 'Church Series',
};

interface Props {
  onEdit: (seriesId: string) => void;
}

export default function DevotionalSeriesList({ onEdit }: Props) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'superAdmin';

  const [series, setSeries] = useState<DevotionalSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState('All');
  const [showNew, setShowNew] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DevotionalSeries | null>(null);

  // New series form
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('general');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const auth = user ? { userId: user.id, userRole: user.role } : undefined;

  const load = useCallback(async () => {
    try {
      const data = await listAllSeries(auth);
      setSeries(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  // auth object is derived from user; user is the stable dependency
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  useEffect(() => { load(); }, [load]);

  const filtered = series.filter(s => statusTab === 'All' || s.status === statusTab);

  const handleCreate = async () => {
    if (!newTitle.trim()) { setError('Title is required.'); return; }
    setSaving(true); setError('');
    try {
      const created = await createSeries({ title: newTitle.trim(), seriesType: newType }, auth);
      setShowNew(false);
      setNewTitle('');
      setSaving(false);
      load();
      onEdit(created.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "We couldn't create this devotional series. Please try again.");
      setSaving(false);
    }
  };

  const handleArchive = async (s: DevotionalSeries) => {
    setOpenMenuId(null);
    await archiveSeries(s.id, auth);
    load();
  };

  const handlePermanentDelete = async () => {
    if (!deleteTarget) return;
    await permanentDeleteSeries(deleteTarget.id, auth);
    setDeleteTarget(null);
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading devotionals…
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Daily Devotionals</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Short daily devotional series for members.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <Plus size={14} /> New Series
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-100 pb-0">
        {STATUS_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setStatusTab(tab)}
            className={`px-3.5 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px ${
              statusTab === tab
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center">
          <BookHeart size={28} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            {statusTab === 'All' ? 'No devotional series yet.' : `No ${statusTab} series.`}
          </p>
          {statusTab === 'All' && (
            <button
              onClick={() => setShowNew(true)}
              className="mt-3 text-sm text-teal-600 hover:text-teal-700 font-medium"
            >
              Create your first series
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => (
            <div
              key={s.id}
              className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-gray-300 transition-colors"
            >
              {/* Icon */}
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-teal-50">
                <BookHeart size={16} className="text-teal-600" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0" role="button" onClick={() => onEdit(s.id)} tabIndex={0}>
                <p className="text-[14px] font-medium text-gray-900 truncate">{s.title}</p>
                <p className="text-[12px] text-gray-400 mt-0.5">
                  {TYPE_LABELS[s.seriesType] ?? s.seriesType}
                </p>
              </div>

              {/* Status */}
              <StatusBadge status={s.status} />

              {/* Edit */}
              <button
                onClick={() => onEdit(s.id)}
                className="text-[12px] text-teal-600 hover:text-teal-800 font-medium px-2 py-1 rounded-lg hover:bg-teal-50 transition-colors"
              >
                Edit
              </button>

              {/* Action menu */}
              <div className="relative">
                <button
                  onClick={() => setOpenMenuId(openMenuId === s.id ? null : s.id)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                >
                  <MoreHorizontal size={15} />
                </button>
                {openMenuId === s.id && (
                  <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-40">
                    <button
                      onClick={() => handleArchive(s)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-gray-600 hover:bg-gray-50"
                    >
                      <Archive size={13} /> Archive
                    </button>
                    {isSuperAdmin && (
                      <button
                        onClick={() => { setOpenMenuId(null); setDeleteTarget(s); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={13} /> Delete permanently
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New series modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">New Devotional Series</h3>
            <div className="space-y-3">
              <Field label="Title *">
                <input
                  autoFocus
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  placeholder="e.g. Psalms Daily Devotional"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
                />
              </Field>
              <Field label="Series Type">
                <select
                  value={newType}
                  onChange={e => setNewType(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
                >
                  {Object.entries(TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </Field>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => { setShowNew(false); setNewTitle(''); setError(''); }}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="flex-1 px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
              >
                {saving ? 'Creating…' : 'Create Series'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Permanently delete?</h3>
            <p className="text-sm text-gray-500 mb-4">
              "<strong>{deleteTarget.title}</strong>" and all its entries will be deleted forever.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handlePermanentDelete}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
