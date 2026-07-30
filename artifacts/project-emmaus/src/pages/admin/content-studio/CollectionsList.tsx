/**
 * CollectionsList — Journey Collections list screen.
 *
 * Replaces the previous 3-column card grid with the shared ContentStudioListItem
 * row design. Adds All/Draft/Published/Archived filter tabs.
 *
 * Actions: Edit | View Journeys (in More menu) | Delete
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Plus, FolderOpen, BookOpen, Trash2, MoreHorizontal, Pencil } from 'lucide-react';
import { listCollections, deleteCollection } from '@/lib/collections-api';
import type { Collection } from '@/lib/collections-api';
import { useAuth } from '@/contexts/AuthContext';
import { ConfirmDialog } from '../shared';
import ContentStudioListItem from './ContentStudioListItem';
import ContentStudioListPage, { actionBtnCls, menuBtnCls, newBtnCls } from './ContentStudioListPage';
import NewCollectionModal from './NewCollectionModal';

const STATUS_TABS = ['All', 'Draft', 'Published', 'Archived'] as const;

interface Props {
  onNew: () => void;
  onEdit: (id: string) => void;
  onViewJourneys: (id: string, title: string) => void;
}

export default function CollectionsList({ onNew: _onNew, onEdit, onViewJourneys }: Props) {
  const { user } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading]         = useState(true);
  const [statusTab, setStatusTab]     = useState<string>('All');
  const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null);
  const [openMenu, setOpenMenu]       = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCollections(await listCollections());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteCollection(deleteTarget.id, user?.id);
    setDeleteTarget(null);
    load();
  };

  const filtered = collections.filter(
    c => statusTab === 'All' || c.status === statusTab,
  );

  return (
    <>
      <ContentStudioListPage
        title="Journey Collections"
        description="Group related Journeys into clear pathways."
        newButton={
          <button onClick={() => setShowNewModal(true)} className={newBtnCls}>
            <Plus size={14} /> New Collection
          </button>
        }
        filters={{ tabs: STATUS_TABS, active: statusTab, onChange: setStatusTab }}
        loading={loading}
        loadingText="Loading collections…"
        isEmpty={!loading && filtered.length === 0}
        emptyState={
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center mb-4">
              <FolderOpen size={22} className="text-purple-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">
              {statusTab === 'All' ? 'No collections yet.' : `No ${statusTab} collections.`}
            </p>
            {statusTab === 'All' && (
              <>
                <p className="text-xs text-gray-400 mt-1">
                  Create your first collection to group related journeys.
                </p>
                <button
                  onClick={() => setShowNewModal(true)}
                  className="mt-5 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors"
                >
                  Create Collection
                </button>
              </>
            )}
          </div>
        }
      >
        {filtered.map(c => {
          const isMenuOpen = openMenu === c.id;
          const metaText = [
            `${c.journeyCount} journey${c.journeyCount !== 1 ? 's' : ''}`,
            c.description,
          ].filter(Boolean).join(' · ');

          return (
            <ContentStudioListItem
              key={c.id}
              iconBg="bg-purple-50"
              iconContent={<FolderOpen size={16} className="text-purple-600" />}
              title={c.title}
              meta={metaText || undefined}
              status={
                <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                  c.status === 'Published' ? 'bg-emerald-100 text-emerald-800'
                  : c.status === 'Archived' ? 'bg-gray-100 text-gray-400'
                  : 'bg-gray-100 text-gray-700'
                }`}>
                  {c.status}
                </span>
              }
              onClick={() => onEdit(c.id)}
              actions={
                <>
                  <button onClick={() => onEdit(c.id)} className={actionBtnCls}>
                    Edit
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setOpenMenu(isMenuOpen ? null : c.id)}
                      className={menuBtnCls}
                    >
                      <MoreHorizontal size={15} />
                    </button>
                    {isMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                        <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-44">
                          <button
                            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50"
                            onClick={() => { setOpenMenu(null); onViewJourneys(c.id, c.title); }}
                          >
                            <BookOpen size={13} /> View Journeys
                          </button>
                          <hr className="my-1 border-gray-100" />
                          <button
                            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50"
                            onClick={() => { setOpenMenu(null); setDeleteTarget(c); }}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
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
          title="Delete Collection"
          message={`Delete "${deleteTarget.title}"? Journeys inside will become uncollected — they won't be deleted.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {showNewModal && (
        <NewCollectionModal
          onClose={() => setShowNewModal(false)}
          onCreated={(id) => {
            setShowNewModal(false);
            load();
            onEdit(id);
          }}
        />
      )}
    </>
  );
}
