import React, { useEffect, useState, useCallback } from 'react';
import { Plus, FolderOpen, Pencil, BookOpen, Trash2, MoreVertical } from 'lucide-react';
import { listCollections, deleteCollection } from '@/lib/collections-api';
import type { Collection } from '@/lib/collections-api';
import { useAuth } from '@/contexts/AuthContext';
import { AdminBtn, ConfirmDialog } from '../shared';

interface Props {
  onNew: () => void;
  onEdit: (id: string) => void;
  onViewJourneys: (id: string) => void;
}

export default function CollectionsList({ onNew, onEdit, onViewJourneys }: Props) {
  const { user } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

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

  const STATUS_COLOR: Record<string, string> = {
    Draft: 'bg-gray-100 text-gray-600',
    Published: 'bg-green-100 text-green-700',
    Archived: 'bg-red-50 text-red-600',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        Loading collections…
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Collections</h2>
          <p className="text-sm text-gray-500 mt-0.5">Group related journeys into themed collections.</p>
        </div>
        <AdminBtn variant="primary" onClick={onNew}>
          <Plus size={14} /> New Collection
        </AdminBtn>
      </div>

      {collections.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 bg-white rounded-xl border border-dashed border-gray-300 text-center">
          <FolderOpen size={36} className="text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-600">No collections yet</p>
          <p className="text-xs text-gray-400 mt-1">Create your first collection to group journeys.</p>
          <button
            onClick={onNew}
            className="mt-4 px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors"
          >
            Create Collection
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <FolderOpen size={18} className="text-purple-600" />
                </div>
                <div className="relative ml-auto">
                  <button
                    onClick={() => setOpenMenu(openMenu === c.id ? null : c.id)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                  >
                    <MoreVertical size={14} />
                  </button>
                  {openMenu === c.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                      <div className="absolute right-0 top-8 z-20 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[140px]">
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50"
                          onClick={() => { setOpenMenu(null); onEdit(c.id); }}
                        >
                          <Pencil size={13} /> Edit
                        </button>
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50"
                          onClick={() => { setOpenMenu(null); onViewJourneys(c.id); }}
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
              </div>
              <div>
                <div className="font-semibold text-gray-900 text-[15px] leading-snug">{c.title}</div>
                {c.description && (
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{c.description}</p>
                )}
              </div>
              <div className="flex items-center justify-between mt-auto pt-1">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {c.status}
                </span>
                <span className="text-xs text-gray-400">{c.journeyCount} journey{c.journeyCount !== 1 ? 's' : ''}</span>
              </div>
            </div>
          ))}
        </div>
      )}

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
    </div>
  );
}
