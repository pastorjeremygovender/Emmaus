/**
 * SermonsList — Sermon Companions list screen.
 *
 * Replaces the previous horizontal-scrolling AdminTable with the shared
 * ContentStudioListItem row design. Each row shows:
 *   icon · title · speaker + date + scripture + transcript + companion · status · actions
 *
 * Actions: Edit | Quick Publish/Unpublish | Delete
 */
import React, { useState, useMemo } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  Plus, Mic2, BookOpen, Trash2, Loader2, CheckCircle2, ExternalLink, MoreHorizontal,
} from 'lucide-react';
import { deleteServerSermon, patchServerSermon } from '@/lib/sermon-generator-api';
import type { Sermon } from '@/lib/admin-demo-data';
import { StatusBadge } from './shared';
import ContentStudioListItem from './content-studio/ContentStudioListItem';
import ContentStudioListPage, { actionBtnCls, menuBtnCls, newBtnCls } from './content-studio/ContentStudioListPage';

type Props = {
  onEdit: (id: string) => void;
  onNew: () => void;
  onOpenCompanion: (sermonId: string, companionId: string) => void;
};

const STATUS_TABS = ['All', 'Draft', 'Published'] as const;

const TRANSCRIPT_LABELS: Record<string, string> = {
  none: 'No transcript',
  pending: 'Transcript pending',
  complete: 'Transcript complete',
};

function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function formatDate(raw: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function SermonsList({ onEdit, onNew, onOpenCompanion }: Props) {
  const { sermons, removeSermon, updateSermon } = useAdmin();
  const { journeys } = useJourney();
  const { user } = useAuth();

  const [statusTab, setStatusTab]       = useState<string>('All');
  const [deleteTarget, setDeleteTarget] = useState<Sermon | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [deleteError, setDeleteError]   = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage]     = useState('');
  const [publishing, setPublishing]     = useState<Record<string, boolean>>({});
  const [unpublishTarget, setUnpublishTarget] = useState<Sermon | null>(null);
  const [openMenuId, setOpenMenuId]     = useState<string | null>(null);

  const auth = user ? { userId: user.id, userRole: user.role } : null;

  // ── Status filter ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (statusTab === 'All') return sermons;
    return sermons.filter(s => s.status === statusTab.toLowerCase());
  }, [sermons, statusTab]);

  // ── Publish / Unpublish ───────────────────────────────────────────────────

  const handlePublish = async (sermon: Sermon, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!auth) return;
    setPublishing(prev => ({ ...prev, [sermon.id]: true }));
    setErrorMessage(''); setSuccessMessage('');
    try {
      const now = new Date().toISOString();
      await patchServerSermon(sermon.id, { status: 'published', updatedAt: now }, auth);
      updateSermon({ ...sermon, status: 'published', updatedAt: now });
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
    if (!unpublishTarget || !auth) return;
    setPublishing(prev => ({ ...prev, [unpublishTarget.id]: true }));
    setErrorMessage(''); setSuccessMessage('');
    try {
      const now = new Date().toISOString();
      await patchServerSermon(unpublishTarget.id, { status: 'draft', updatedAt: now }, auth);
      updateSermon({ ...unpublishTarget, status: 'draft', updatedAt: now });
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

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !auth) return;
    setDeleting(true); setDeleteError('');
    try {
      await deleteServerSermon(deleteTarget.id, auth);
      removeSermon(deleteTarget.id);
      setDeleteTarget(null);
      setSuccessMessage('Sermon deleted successfully.');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch {
      setDeleteError('Failed to delete. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <ContentStudioListPage
        title="Sermon Companions"
        description="Turn Sunday's sermon into discipleship for the week."
        newButton={
          <button onClick={onNew} className={newBtnCls}>
            <Plus size={14} /> New Sermon Companion
          </button>
        }
        filters={{ tabs: STATUS_TABS, active: statusTab, onChange: setStatusTab }}
        isEmpty={filtered.length === 0}
        emptyState={
          <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center">
            <Mic2 size={28} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              {statusTab === 'All'
                ? 'No Sermon Companions yet. Click "New Sermon Companion" to generate your first draft.'
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
          const hasCompanion     = !!s.companionJourneyId;
          const companionIsNew   = hasCompanion && isUUID(s.companionJourneyId!);
          const legacyCompanion  = !companionIsNew && s.companionJourneyId
            ? journeys.find(j => j.id === s.companionJourneyId)
            : null;
          const isPublished      = s.status === 'published';
          const isPublishingThis = !!publishing[s.id];
          const isMenuOpen       = openMenuId === s.id;

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
                    {(companionIsNew || legacyCompanion) && (
                      <>
                        <span className="text-gray-300">·</span>
                        <button
                          onClick={() => onOpenCompanion(s.id, s.companionJourneyId!)}
                          className="text-teal-600 hover:text-teal-800 hover:underline flex items-center gap-0.5"
                        >
                          <BookOpen size={10} />
                          {legacyCompanion ? legacyCompanion.title : 'View Companion'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              }
              status={<StatusBadge status={s.status} />}
              actions={
                <>
                  {/* Edit */}
                  <button onClick={() => onEdit(s.id)} className={actionBtnCls}>
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

      {/* ── Unpublish confirmation ──────────────────────────────────────────── */}
      {unpublishTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Unpublish this content?</h3>
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

      {/* ── Delete confirmation ────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete Sermon?</h3>
            <p className="text-sm text-gray-500 mb-3">
              You are about to permanently delete this sermon.
              {deleteTarget.companionJourneyId && (
                <> The linked sermon companion draft will also be deleted.</>
              )}
              {' '}This action cannot be undone.
            </p>
            {deleteTarget.status === 'published' && (
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
    </>
  );
}
