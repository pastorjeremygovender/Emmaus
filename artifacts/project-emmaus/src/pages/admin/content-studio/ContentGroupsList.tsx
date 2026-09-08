/**
 * ContentGroupsList — Content Studio Groupings workspace list screen.
 *
 * Lists all content groups, supports All/Draft/Published/Archived filter tabs.
 * Entry point to create or edit a group.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Layers2, MoreHorizontal, Archive, Trash2, Pencil } from 'lucide-react';
import { listContentGroups, deleteContentGroup, updateContentGroup } from '@/lib/content-groups-api';
import type { ContentGroup } from '@/lib/content-groups-api';
import { useAuth } from '@/contexts/AuthContext';
import { StatusBadge, ConfirmDialog } from '../shared';
import ContentStudioListItem from './ContentStudioListItem';
import ContentStudioListPage, { actionBtnCls, menuBtnCls, newBtnCls } from './ContentStudioListPage';

const STATUS_TABS = ['All', 'Draft', 'Published', 'Archived'] as const;

interface Props {
  onNew: () => void;
  onEdit: (groupId: string) => void;
}

export default function ContentGroupsList({ onNew, onEdit }: Props) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'superAdmin';

  const [groups, setGroups]         = useState<ContentGroup[]>([]);
  const [loading, setLoading]       = useState(true);
  const [statusTab, setStatusTab]   = useState<string>('All');
  const [openMenu, setOpenMenu]     = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContentGroup | null>(null);
  const [deleting, setDeleting]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGroups(await listContentGroups());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleArchive = async (g: ContentGroup) => {
    setOpenMenu(null);
    try {
      await updateContentGroup(g.id, { status: 'Archived' });
      await load();
    } catch { /* surface nothing — backend will 404 gracefully */ }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteContentGroup(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const filtered = groups.filter(
    g => statusTab === 'All' || g.status === statusTab,
  ).sort((a, b) => a.displayOrder - b.displayOrder || a.title.localeCompare(b.title));

  return (
    <>
      <ContentStudioListPage
        title="Groupings"
        description="Curated collections mixing Walks, Daily Rhythm, and Devotional Series for members."
        newButton={
          <button onClick={onNew} className={newBtnCls}>
            <Plus size={14} /> New Group
          </button>
        }
        filters={{ tabs: STATUS_TABS, active: statusTab, onChange: setStatusTab }}
        loading={loading}
        loadingText="Loading groups…"
        isEmpty={!loading && filtered.length === 0}
        emptyState={
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
              <Layers2 size={22} className="text-violet-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">
              {statusTab === 'All' ? 'No content groups yet.' : `No ${statusTab} groups.`}
            </p>
            {statusTab === 'All' && (
              <>
                <p className="text-xs text-gray-400 mt-1">
                  Create a group to mix Walks, Daily Rhythm, and Devotional Series for members.
                </p>
                <button
                  onClick={onNew}
                  className="mt-5 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors"
                >
                  Create a Group
                </button>
              </>
            )}
          </div>
        }
      >
        {filtered.map(g => {
          const isMenuOpen = openMenu === g.id;
          const itemLabel = `${g.itemCount} item${g.itemCount !== 1 ? 's' : ''}`;
          const meta = [itemLabel, g.description].filter(Boolean).join(' · ');

          return (
            <ContentStudioListItem
              key={g.id}
              iconBg="bg-violet-50"
              iconContent={<Layers2 size={16} className="text-violet-600" />}
              title={g.title}
              meta={meta || undefined}
              status={<StatusBadge status={g.status} />}
              onClick={() => onEdit(g.id)}
              actions={
                <>
                  <button onClick={() => onEdit(g.id)} className={`${actionBtnCls} flex items-center gap-1`}>
                    <Pencil size={11} /> Edit
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setOpenMenu(isMenuOpen ? null : g.id)}
                      className={menuBtnCls}
                      aria-haspopup="true"
                      aria-expanded={isMenuOpen}
                    >
                      <MoreHorizontal size={15} />
                    </button>
                    {isMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                        <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-48">
                          <button
                            onClick={() => handleArchive(g)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50"
                          >
                            <Archive size={13} className="text-gray-400" /> Archive Group
                          </button>
                          {isSuperAdmin && (
                            <>
                              <hr className="my-1 border-gray-100" />
                              <button
                                onClick={() => { setOpenMenu(null); setDeleteTarget(g); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50"
                              >
                                <Trash2 size={13} /> Delete Permanently
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </>
              }
            />
          );
        })}
      </ContentStudioListPage>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Group?"
          message={`"${deleteTarget.title}" will be permanently deleted. The content items inside (walks, series, etc.) will NOT be deleted.`}
          confirmLabel={deleting ? 'Deleting…' : 'Delete Group'}
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
