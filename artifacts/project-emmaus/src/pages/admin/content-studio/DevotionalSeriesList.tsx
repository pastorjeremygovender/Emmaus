/**
 * DevotionalSeriesList — Daily Devotionals list screen.
 *
 * Actions: Create | Edit | Archive | Permanent delete
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Plus, BookHeart, MoreHorizontal, Archive, Trash2 } from 'lucide-react';
import {
  listAllSeries,
  archiveSeries,
  permanentDeleteSeries,
  type DevotionalSeries,
} from '@/lib/devotionals-api';
import { StatusBadge } from '../shared';
import { useAuth } from '@/contexts/AuthContext';
import ContentStudioListItem from './ContentStudioListItem';
import ContentStudioListPage, { actionBtnCls, menuBtnCls, newBtnCls } from './ContentStudioListPage';
import NewSeriesModal from './NewSeriesModal';
import GroupMembershipBadge from './GroupMembershipBadge';

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
  const [showNewModal, setShowNewModal] = useState(false);
  const [openMenuId, setOpenMenuId]     = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DevotionalSeries | null>(null);

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
          <button onClick={() => setShowNewModal(true)} className={newBtnCls}>
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
                  onClick={() => setShowNewModal(true)}
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
            status={
              <span className="flex items-center gap-1.5 flex-wrap">
                <StatusBadge status={s.status} />
                <GroupMembershipBadge targetType="daily-devotional" targetId={s.id} compact />
              </span>
            }
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

      {/* ── New series modal ─────────────────────────────────────────────── */}
      {showNewModal && (
        <NewSeriesModal
          onClose={() => setShowNewModal(false)}
          onCreated={(id) => {
            setShowNewModal(false);
            load();
            onEdit(id);
          }}
        />
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
