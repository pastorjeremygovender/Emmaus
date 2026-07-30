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
  ArrowLeft, X,
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

export default function SermonsList({ onEdit, onNew: _onNew, onOpenCompanion }: Props) {
  const { sermons, addSermon, removeSermon, updateSermon, settings, updateSettings } = useAdmin();
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

  // New companion creation modal state
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle]         = useState('');
  const [newCreating, setNewCreating]   = useState(false);

  const auth = user ? { userId: user.id, userRole: user.role } : null;

  const handleOpenNewModal = () => { setShowNewModal(true); setNewTitle(''); };

  const handleCloseNewModal = () => { setShowNewModal(false); setNewTitle(''); };

  const handleCreateCompanion = () => {
    setNewCreating(true);
    const id: string = `sermon-${Date.now()}`;
    const now = new Date().toISOString();
    const stub: Sermon = {
      id,
      title: newTitle.trim() || 'New Sermon Companion',
      speaker: '',
      sermonDate: now.split('T')[0],
      series: '',
      scriptureReference: '',
      youtubeUrl: '',
      summary: '',
      topics: [],
      keywords: [],
      transcript: '',
      transcriptStatus: 'none',
      aiIndexStatus: 'none',
      companionJourneyId: '',
      mainTheme: '',
      status: 'draft',
      pastorEdited: false,
      updatedAt: now,
    };
    addSermon(stub);
    setNewCreating(false);
    handleCloseNewModal();
    onEdit(id);
  };

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
      // Pass the companionJourneyId so the server can handle legacy companions
      // that have no admin-sermon JSON record (slug-based journeys table entries).
      await deleteServerSermon(
        deleteTarget.id,
        auth,
        { companionJourneyId: deleteTarget.companionJourneyId },
      );
      removeSermon(deleteTarget.id);
      // Clear the "This Week's Sermon" setting if it pointed to the deleted companion
      if (
        deleteTarget.companionJourneyId &&
        settings.currentWeeklySermonCompanionId === deleteTarget.companionJourneyId
      ) {
        updateSettings({ ...settings, currentWeeklySermonCompanionId: undefined });
      }
      setDeleteTarget(null);
      setSuccessMessage('Sermon Companion deleted successfully.');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch {
      setDeleteError('We couldn\'t delete this Sermon Companion. Nothing was removed. Please try again.');
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
          <button onClick={handleOpenNewModal} className={newBtnCls}>
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

      {/* ── New Sermon Companion creation wizard — new standard ─────────────── */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[calc(100dvh-2rem)]">

            {/* Header — ← Cancel | title | ✕ */}
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
                New Sermon Companion
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

            {/* Step progress — single pill (1-step wizard) */}
            <div className="flex-shrink-0 flex items-center gap-1.5 px-5 pt-3.5 pb-1">
              <div className="h-[3px] rounded-full flex-1 bg-teal-500" />
            </div>

            {/* Scrollable content */}
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
                      if (e.key === 'Enter' && !newCreating) handleCreateCompanion();
                    }}
                    placeholder="e.g. The God Who Sees"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
                  />
                  <p className="mt-2 text-[12px] text-gray-500 leading-relaxed">
                    You can update the title inside the editor. Leave blank to start with a placeholder.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer — single full-width CTA */}
            <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100">
              <button
                onClick={handleCreateCompanion}
                disabled={newCreating}
                className="w-full h-12 rounded-2xl text-[15px] font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed bg-teal-600 hover:bg-teal-700 text-white"
              >
                {newCreating
                  ? <><Loader2 size={15} className="animate-spin" /><span>Creating…</span></>
                  : <span>Create Companion</span>
                }
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
