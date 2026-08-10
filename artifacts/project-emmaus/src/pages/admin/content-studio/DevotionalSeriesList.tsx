/**
 * DevotionalSeriesList — Daily Devotionals list screen.
 *
 * Actions: Create | Edit | Archive | Permanent delete
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Plus, BookHeart, MoreHorizontal, Archive, Trash2, Loader2, ArrowLeft, X } from 'lucide-react';
import {
  listAllSeries,
  createSeries,
  archiveSeries,
  permanentDeleteSeries,
  type DevotionalSeries,
} from '@/lib/devotionals-api';
import { StatusBadge, Field } from '../shared';
import { useAuth } from '@/contexts/AuthContext';
import ContentStudioListItem from './ContentStudioListItem';
import ContentStudioListPage, { actionBtnCls, menuBtnCls, newBtnCls } from './ContentStudioListPage';

const STATUS_TABS = ['All', 'Draft', 'Published', 'Archived'] as const;

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

  const [series, setSeries]         = useState<DevotionalSeries[]>([]);
  const [loading, setLoading]       = useState(true);
  const [statusTab, setStatusTab]   = useState<string>('All');
  const [showNew, setShowNew]       = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DevotionalSeries | null>(null);

  // New series form
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType]   = useState('general');
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState('');

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  useEffect(() => { load(); }, [load]);

  const filtered = series.filter(s => statusTab === 'All' || s.status === statusTab);

  const handleCreate = async () => {
    if (!newTitle.trim()) { setFormError('Title is required.'); return; }
    setSaving(true); setFormError('');
    try {
      const created = await createSeries({ title: newTitle.trim(), seriesType: newType }, auth);
      setShowNew(false);
      setNewTitle('');
      setSaving(false);
      load();
      onEdit(created.id);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "We couldn't create this series. Please try again.");
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

  return (
    <>
      <ContentStudioListPage
        title="Daily Devotionals"
        description="Short daily devotional series for members."
        newButton={
          <button onClick={() => setShowNew(true)} className={newBtnCls}>
            <Plus size={14} /> New Series
          </button>
        }
        filters={{ tabs: STATUS_TABS, active: statusTab, onChange: setStatusTab }}
        loading={loading}
        loadingText="Loading devotionals…"
        isEmpty={!loading && filtered.length === 0}
        emptyState={
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center mb-4">
              <BookHeart size={22} className="text-teal-300" />
            </div>
            <p className="text-sm font-medium text-gray-700">
              {statusTab === 'All' ? 'No devotional series yet.' : `No ${statusTab} series.`}
            </p>
            {statusTab === 'All' && (
              <>
                <p className="text-xs text-gray-400 mt-1">Create your first series to get started.</p>
                <button
                  onClick={() => setShowNew(true)}
                  className="mt-5 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors"
                >
                  Create a Series
                </button>
              </>
            )}
          </div>
        }
      >
        {filtered.map(s => (
          <ContentStudioListItem
            key={s.id}
            iconBg="bg-teal-50"
            iconContent={<BookHeart size={16} className="text-teal-600" />}
            title={s.title}
            meta={TYPE_LABELS[s.seriesType] ?? s.seriesType}
            status={<StatusBadge status={s.status} />}
            onClick={() => onEdit(s.id)}
            actions={
              <>
                <button onClick={() => onEdit(s.id)} className={actionBtnCls}>
                  Edit
                </button>
                <div className="relative">
                  <button
                    onClick={() => setOpenMenuId(openMenuId === s.id ? null : s.id)}
                    className={menuBtnCls}
                  >
                    <MoreHorizontal size={15} />
                  </button>
                  {openMenuId === s.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                      <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-44">
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
                    </>
                  )}
                </div>
              </>
            }
          />
        ))}
      </ContentStudioListPage>

      {/* ── New series modal — new creation-wizard standard ──────────────── */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[calc(100dvh-2rem)]">

            {/* Header — ← Cancel | title | ✕ */}
            <div className="flex-shrink-0 flex items-center px-5 pt-5 pb-4 border-b border-gray-100">
              <button
                onClick={() => { setShowNew(false); setNewTitle(''); setFormError(''); }}
                aria-label="Cancel"
                className="flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-900 transition-colors w-20 flex-shrink-0"
              >
                <ArrowLeft size={14} />
                Cancel
              </button>
              <h2 className="flex-1 text-[15px] font-semibold text-gray-900 text-center">
                New Devotional Series
              </h2>
              <div className="w-20 flex-shrink-0 flex justify-end">
                <button
                  onClick={() => { setShowNew(false); setNewTitle(''); setFormError(''); }}
                  aria-label="Close"
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Step progress — single pill (1-step wizard) */}
            <div className="flex-shrink-0 flex items-center gap-1.5 px-5 pt-3.5 pb-1">
              <div className="h-[3px] rounded-full flex-1 bg-teal-500" />
            </div>

            {/* Scrollable content */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    autoFocus
                    type="text"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !saving && newTitle.trim()) handleCreate();
                    }}
                    placeholder="e.g. Psalms Daily Devotional"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">
                    Series Type
                  </label>
                  <select
                    value={newType}
                    onChange={e => setNewType(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
                  >
                    {Object.entries(TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                {formError && (
                  <p className="text-[13px] text-red-600 font-medium">{formError}</p>
                )}
              </div>
            </div>

            {/* Footer — single full-width CTA */}
            <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100">
              <button
                onClick={handleCreate}
                disabled={saving || !newTitle.trim()}
                className="w-full h-12 rounded-2xl text-[15px] font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed bg-teal-600 hover:bg-teal-700 text-white"
              >
                {saving
                  ? <><Loader2 size={15} className="animate-spin" /><span>Creating…</span></>
                  : <span>Create Series</span>
                }
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Permanent delete confirm ──────────────────────────────────────── */}
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
    </>
  );
}
