/**
 * SermonsList — Canonical Sermons list screen.
 *
 * Data source: canonical PostgreSQL sermons table via /api/sermons/admin.
 * Status values: "Draft" | "Review" | "Published" (title-case).
 *
 * Actions: Edit | Quick Publish/Unpublish | Delete
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Plus, Mic2, BookOpen, Trash2, Loader2, CheckCircle2, ExternalLink, MoreHorizontal,
  ArrowLeft, X, RefreshCw,
} from 'lucide-react';
import {
  type CanonicalSermon,
  listAdminSermons,
  publishAdminSermon,
  unpublishAdminSermon,
  deleteAdminSermon,
  createAdminSermon,
} from '@/lib/canonical-sermon-api';
import { StatusBadge } from './shared';
import ContentStudioListItem from './content-studio/ContentStudioListItem';
import ContentStudioListPage, { actionBtnCls, menuBtnCls, newBtnCls } from './content-studio/ContentStudioListPage';


type Props = {
  onEdit: (id: string) => void;
  onNew: () => void;
  onOpenCompanion: (sermonId: string, companionId: string) => void;
};

const STATUS_TABS = ['All', 'Draft', 'Review', 'Published'] as const;

const TRANSCRIPT_LABELS: Record<string, string> = {
  none: 'No transcript',
  pending: 'Transcript pending',
  complete: 'Transcript complete',
};

function formatDate(raw: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Map a canonical sermon's edit ID: prefer legacyJsonId so SermonEditor still works */
function editId(s: CanonicalSermon): string {
  return s.legacyJsonId ?? s.id;
}

export default function SermonsList({ onEdit, onNew, onOpenCompanion }: Props) {
  const { user } = useAuth();

  const [sermons, setSermons]                 = useState<CanonicalSermon[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [loadError, setLoadError]             = useState('');
  const [statusTab, setStatusTab]             = useState<string>('All');
  const [deleteTarget, setDeleteTarget]       = useState<CanonicalSermon | null>(null);
  const [deleting, setDeleting]               = useState(false);
  const [deleteError, setDeleteError]         = useState('');
  const [successMessage, setSuccessMessage]   = useState('');
  const [errorMessage, setErrorMessage]       = useState('');
  const [publishing, setPublishing]           = useState<Record<string, boolean>>({});
  const [unpublishTarget, setUnpublishTarget] = useState<CanonicalSermon | null>(null);
  const [openMenuId, setOpenMenuId]           = useState<string | null>(null);

  // New sermon creation modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle]         = useState('');
  const [newCreating, setNewCreating]   = useState(false);
  const [newError, setNewError]         = useState('');

  // ── Load sermons ────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await listAdminSermons();
      setSermons(data);
    } catch {
      setLoadError('Failed to load sermons. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Status filter ────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (statusTab === 'All') return sermons;
    return sermons.filter(s => s.status === statusTab);
  }, [sermons, statusTab]);

  // ── New canonical sermon ──────────────────────────────────────────────────────

  const handleOpenNewModal = () => { setShowNewModal(true); setNewTitle(''); setNewError(''); };
  const handleCloseNewModal = () => { setShowNewModal(false); setNewTitle(''); setNewError(''); };

  const handleCreateSermon = async () => {
    setNewCreating(true);
    setNewError('');
    try {
      const created = await createAdminSermon({
        title: newTitle.trim() || 'New Sermon',
        status: 'Draft',
        sermonDate: new Date().toISOString().split('T')[0],
      });
      setSermons(prev => [created, ...prev]);
      handleCloseNewModal();
      onEdit(editId(created));
    } catch (err) {
      setNewError(err instanceof Error ? err.message : 'Failed to create sermon');
    } finally {
      setNewCreating(false);
    }
  };

  // ── Publish / Unpublish ──────────────────────────────────────────────────────

  const handlePublish = async (sermon: CanonicalSermon, e: React.MouseEvent) => {
    e.stopPropagation();
    setPublishing(prev => ({ ...prev, [sermon.id]: true }));
    setErrorMessage(''); setSuccessMessage('');
    try {
      const updated = await publishAdminSermon(sermon.id);
      setSermons(prev => prev.map(s => s.id === sermon.id ? { ...s, ...updated } : s));
      setSuccessMessage('Published successfully.');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch {
      setErrorMessage("We couldn't publish this sermon. Please try again.");
      setTimeout(() => setErrorMessage(''), 5000);
    } finally {
      setPublishing(prev => ({ ...prev, [sermon.id]: false }));
    }
  };

  const handleConfirmUnpublish = async () => {
    if (!unpublishTarget) return;
    setPublishing(prev => ({ ...prev, [unpublishTarget.id]: true }));
    setErrorMessage(''); setSuccessMessage('');
    try {
      const updated = await unpublishAdminSermon(unpublishTarget.id);
      setSermons(prev => prev.map(s => s.id === unpublishTarget.id ? { ...s, ...updated } : s));
      setUnpublishTarget(null);
      setSuccessMessage('Unpublished successfully.');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch {
      setUnpublishTarget(null);
      setErrorMessage("We couldn't unpublish this sermon. Please try again.");
      setTimeout(() => setErrorMessage(''), 5000);
    } finally {
      setPublishing(prev => {
        const copy = { ...prev };
        if (unpublishTarget) delete copy[unpublishTarget.id];
        return copy;
      });
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────────

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true); setDeleteError('');
    try {
      await deleteAdminSermon(deleteTarget.id);
      setSermons(prev => prev.filter(s => s.id !== deleteTarget.id));
      setDeleteTarget(null);
      setSuccessMessage('Sermon deleted successfully.');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch {
      setDeleteError("We couldn't delete this sermon. Nothing was removed. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400">
        <Loader2 size={18} className="animate-spin mr-2" />
        Loading sermons…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-500">
        <p className="text-sm">{loadError}</p>
        <button onClick={load} className="flex items-center gap-1.5 text-sm text-teal-600 hover:underline">
          <RefreshCw size={13} /> Try again
        </button>
      </div>
    );
  }

  return (
    <>
      <ContentStudioListPage
        title="Sermons"
        description="Manage sermons and their companion discipleship content."
        newButton={
          <button onClick={handleOpenNewModal} className={newBtnCls}>
            <Plus size={14} /> New Sermon
          </button>
        }
        filters={{ tabs: STATUS_TABS, active: statusTab, onChange: setStatusTab }}
        isEmpty={filtered.length === 0}
        emptyState={
          <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center">
            <Mic2 size={28} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              {statusTab === 'All'
                ? 'No sermons yet. Click "New Sermon" to add your first one, or use the URL-based generator.'
                : `No ${statusTab} sermons.`}
            </p>
          </div>
        }
      >
        {/* Inline flash messages */}
        {(successMessage || errorMessage) && (
          <div className={`-mt-1 mb-1 px-4 py-3 rounded-xl text-sm flex items-center gap-2 ${
            successMessage
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {successMessage && <CheckCircle2 size={14} className="flex-shrink-0" />}
            {successMessage || errorMessage}
          </div>
        )}

        {filtered.map(s => {
          const isPublished      = s.status === 'Published';
          const isPublishingThis = !!publishing[s.id];
          const isMenuOpen       = openMenuId === s.id;
          const companionId      = (s as CanonicalSermon & { companionId?: string | null }).companionId;

          return (
            <ContentStudioListItem
              key={s.id}
              iconBg="bg-indigo-50"
              iconContent={<Mic2 size={16} className="text-indigo-600" />}
              title={s.title}
              meta={
                <div>
                  {/* Line 1: speaker · date */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {s.speaker && <span>{s.speaker}</span>}
                    {s.sermonDate && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span>{formatDate(s.sermonDate)}</span>
                      </>
                    )}
                  </div>
                  {/* Line 2: scripture · transcript · companion */}
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    {s.scriptureReference && <span>{s.scriptureReference}</span>}
                    <span className="text-gray-300">·</span>
                    <span>{TRANSCRIPT_LABELS[s.transcriptStatus] ?? s.transcriptStatus}</span>
                    {companionId && (
                      <>
                        <span className="text-gray-300">·</span>
                        <button
                          onClick={() => onOpenCompanion(editId(s), companionId)}
                          className="text-teal-600 hover:text-teal-800 hover:underline flex items-center gap-0.5"
                        >
                          <BookOpen size={10} />
                          View Companion
                        </button>
                      </>
                    )}
                  </div>
                </div>
              }
              status={<StatusBadge status={isPublished ? 'published' : s.status.toLowerCase()} />}
              actions={
                <>
                  {/* Edit */}
                  <button onClick={() => onEdit(editId(s))} className={actionBtnCls}>
                    Edit
                  </button>

                  {/* Quick Publish / Quick Unpublish */}
                  {!isPublished ? (
                    <button
                      onClick={e => handlePublish(s, e)}
                      disabled={isPublishingThis}
                      className="text-[12px] text-teal-700 hover:text-teal-900 hover:bg-teal-50 font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                      {isPublishingThis
                        ? <Loader2 size={11} className="animate-spin" />
                        : <CheckCircle2 size={11} />}
                      {isPublishingThis ? 'Publishing…' : 'Publish'}
                    </button>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); setUnpublishTarget(s); }}
                      disabled={isPublishingThis}
                      className="text-[12px] text-amber-600 hover:text-amber-700 hover:bg-amber-50 font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                      {isPublishingThis && <Loader2 size={11} className="animate-spin" />}
                      {isPublishingThis ? 'Unpublishing…' : 'Unpublish'}
                    </button>
                  )}

                  {/* More menu: YouTube link + Delete */}
                  <div className="relative">
                    <button
                      onClick={() => setOpenMenuId(isMenuOpen ? null : s.id)}
                      className={menuBtnCls}
                    >
                      <MoreHorizontal size={15} />
                    </button>
                    {isMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                        <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-44">
                          {s.youtubeUrl && (
                            <a
                              href={s.youtubeUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50"
                              onClick={() => setOpenMenuId(null)}
                            >
                              <ExternalLink size={13} /> Open on YouTube
                            </a>
                          )}
                          <button
                            onClick={() => { setOpenMenuId(null); setDeleteTarget(s); setDeleteError(''); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50"
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

      {/* ── Unpublish confirmation ────────────────────────────────────────────── */}
      {unpublishTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Unpublish this sermon?</h3>
            <p className="text-sm text-gray-500 mb-4">Members will no longer see it.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setUnpublishTarget(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmUnpublish}
                disabled={!!publishing[unpublishTarget.id]}
                className="flex-1 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {publishing[unpublishTarget.id]
                  ? <><Loader2 size={13} className="animate-spin" /> Unpublishing…</>
                  : 'Unpublish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ──────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete Sermon?</h3>
            <p className="text-sm text-gray-500 mb-3">
              You are about to permanently delete this sermon.
              {(deleteTarget as CanonicalSermon & { companionId?: string | null }).companionId && (
                <> The linked sermon companion will also be deleted.</>
              )}
              {' '}This action cannot be undone.
            </p>
            {deleteTarget.status === 'Published' && (
              <div className="mb-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                This sermon is currently visible to members. Deleting it will immediately remove it from Emmaus.
              </div>
            )}
            {deleteError && <p className="text-sm text-red-600 mb-3">{deleteError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteError(''); }}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {deleting
                  ? <><Loader2 size={13} className="animate-spin" /> Deleting…</>
                  : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Sermon modal ──────────────────────────────────────────────────── */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[calc(100dvh-2rem)]">

            {/* Header */}
            <div className="flex-shrink-0 flex items-center px-5 pt-5 pb-4 border-b border-gray-100">
              <button
                onClick={handleCloseNewModal}
                aria-label="Cancel"
                className="flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-900 transition-colors w-20 flex-shrink-0"
              >
                <ArrowLeft size={14} />
                Cancel
              </button>
              <h2 className="flex-1 text-[15px] font-semibold text-gray-900 text-center">
                New Sermon
              </h2>
              <div className="w-20 flex-shrink-0 flex justify-end">
                <button
                  onClick={handleCloseNewModal}
                  aria-label="Close"
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Step progress */}
            <div className="flex-shrink-0 flex items-center gap-1.5 px-5 pt-3.5 pb-1">
              <div className="h-[3px] rounded-full flex-1 bg-teal-500" />
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">
                    Sermon Title
                    <span className="ml-1.5 text-[11px] font-normal text-gray-400">optional</span>
                  </label>
                  <input
                    autoFocus
                    type="text"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !newCreating) handleCreateSermon();
                    }}
                    placeholder="e.g. The God Who Sees"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
                  />
                  <p className="mt-2 text-[12px] text-gray-500 leading-relaxed">
                    You can update the title inside the editor. Leave blank to start with a placeholder.
                  </p>
                </div>
                {newError && (
                  <p className="text-sm text-red-600">{newError}</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 space-y-2">
              <button
                onClick={handleCreateSermon}
                disabled={newCreating}
                className="w-full h-12 rounded-2xl text-[15px] font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed bg-teal-600 hover:bg-teal-700 text-white"
              >
                {newCreating
                  ? <><Loader2 size={15} className="animate-spin" /><span>Creating…</span></>
                  : <span>Create Sermon</span>
                }
              </button>
              <button
                onClick={() => { handleCloseNewModal(); onNew(); }}
                disabled={newCreating}
                className="w-full h-10 rounded-xl text-[13px] text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors"
              >
                Or generate from a YouTube URL →
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
