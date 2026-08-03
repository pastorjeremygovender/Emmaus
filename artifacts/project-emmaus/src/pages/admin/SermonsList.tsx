/**
 * SermonsList — Canonical Sermons list screen.
 *
 * Data source: canonical PostgreSQL sermons table via /api/sermons/admin.
 * Status values: "Draft" | "Review" | "Published" (title-case).
 *
 * Actions: Edit | Quick Publish/Unpublish | Delete
 */
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Plus, Mic2, BookOpen, Trash2, Loader2, CheckCircle2, ExternalLink, MoreHorizontal,
  ArrowLeft, X, RefreshCw, Upload, FileAudio, AlertCircle, Star,
} from 'lucide-react';
import {
  type CanonicalSermon,
  listAdminSermons,
  publishAdminSermon,
  unpublishAdminSermon,
  deleteAdminSermon,
  createAdminSermon,
  requestAudioUploadUrl,
  setCurrentWeekSermon,
  processSermon,
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
  const [settingCurrentWeek, setSettingCurrentWeek] = useState<Record<string, boolean>>({});

  // New sermon creation modal — metadata
  const [showNewModal, setShowNewModal]     = useState(false);
  const [newTitle, setNewTitle]             = useState('');
  const [newSpeaker, setNewSpeaker]         = useState('');
  const [newDate, setNewDate]               = useState(() => new Date().toISOString().split('T')[0]);
  const [newScripture, setNewScripture]     = useState('');
  const [newSeries, setNewSeries]           = useState('');
  const [newYoutubeUrl, setNewYoutubeUrl]   = useState('');
  const [newNotes, setNewNotes]             = useState('');
  const [newCreating, setNewCreating]       = useState(false);
  const [newError, setNewError]             = useState('');
  const [newCreateStep, setNewCreateStep]   = useState<'form' | 'uploading'>('form');
  const [newUploadProgress, setNewUploadProgress] = useState(0);

  // Audio file for new sermon
  const [newAudioFile, setNewAudioFile]     = useState<File | null>(null);
  const [newAudioError, setNewAudioError]   = useState('');
  const newAudioInputRef                    = useRef<HTMLInputElement>(null);

  const ACCEPTED_AUDIO = '.mp3,.m4a,.wav,.mp4,.mpeg,.webm';
  const ACCEPTED_MIMES = ['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/wav','video/mp4','audio/webm'];
  const MAX_AUDIO_MB   = 250;

  function fmtBytes(b: number) {
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  }

  function handleNewAudioSelect(f: File) {
    setNewAudioError('');
    if (!ACCEPTED_MIMES.some(m => f.type === m) && !/\.(mp3|m4a|wav|mp4|mpeg|webm)$/i.test(f.name)) {
      setNewAudioError('This file format is not supported. Use MP3, M4A, WAV, MP4, MPEG or WEBM.');
      return;
    }
    if (f.size > MAX_AUDIO_MB * 1024 * 1024) {
      setNewAudioError(`The file exceeds the ${MAX_AUDIO_MB} MB maximum (${fmtBytes(f.size)}).`);
      return;
    }
    setNewAudioFile(f);
  }

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

  const handleOpenNewModal = () => {
    setShowNewModal(true); setNewTitle(''); setNewSpeaker('Pastor Jeremy Govender'); setNewScripture('');
    setNewSeries(''); setNewYoutubeUrl(''); setNewNotes(''); setNewError('');
    setNewAudioFile(null); setNewAudioError(''); setNewCreateStep('form');
    setNewUploadProgress(0);
    setNewDate(new Date().toISOString().split('T')[0]);
  };
  const handleCloseNewModal = () => {
    if (newCreating) return;
    setShowNewModal(false);
  };

  const handleCreateSermon = async () => {
    if (newCreating) return;
    setNewCreating(true);
    setNewError('');
    try {
      // Step 1: Create the record with all metadata
      const created = await createAdminSermon({
        title:              newTitle.trim()      || 'New Sermon',
        speaker:            newSpeaker.trim()    || '',
        sermonDate:         newDate              || new Date().toISOString().split('T')[0],
        scriptureReference: newScripture.trim()  || '',
        series:             newSeries.trim()     || '',
        youtubeUrl:         newYoutubeUrl.trim() || '',
        notes:              newNotes.trim()      || '',
        status:             'Draft',
      });

      // Step 2: Upload audio if selected
      if (newAudioFile) {
        setNewCreateStep('uploading');
        try {
          const { uploadURL } = await requestAudioUploadUrl(created.id, {
            name:        newAudioFile.name,
            size:        newAudioFile.size,
            contentType: newAudioFile.type || 'audio/mpeg',
          });
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', uploadURL);
            xhr.setRequestHeader('Content-Type', newAudioFile.type || 'audio/mpeg');
            xhr.upload.addEventListener('progress', e => {
              if (e.lengthComputable) setNewUploadProgress(Math.round(e.loaded / e.total * 100));
            });
            xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
            xhr.onerror = () => reject(new Error('Network error during upload'));
            xhr.send(newAudioFile);
          });
        } catch (uploadErr) {
          // Non-fatal: sermon was created, just no audio — editor can upload later
          console.warn('Audio upload failed (non-fatal):', uploadErr);
        }
      }

      setSermons(prev => [created, ...prev]);
      setShowNewModal(false);
      onEdit(editId(created));
    } catch (err) {
      setNewError(err instanceof Error ? err.message : 'Failed to create sermon');
      setNewCreateStep('form');
    } finally {
      setNewCreating(false);
      setNewUploadProgress(0);
    }
  };

  // ── Process Sermon — create + upload + trigger AI pipeline ───────────────────
  // Primary "new sermon" action when audio is available. Creates the record,
  // uploads the audio, triggers the background pipeline, then opens the editor
  // which shows the SermonProcessingView progress screen.

  const handleCreateAndProcess = async () => {
    if (newCreating) return;
    if (!newAudioFile) {
      setNewError('Please upload sermon audio to use Process Sermon.');
      return;
    }
    setNewCreating(true);
    setNewError('');
    try {
      const created = await createAdminSermon({
        title:              newTitle.trim()      || 'New Sermon',
        speaker:            newSpeaker.trim()    || 'Pastor Jeremy Govender',
        sermonDate:         newDate              || new Date().toISOString().split('T')[0],
        scriptureReference: newScripture.trim()  || '',
        series:             newSeries.trim()     || '',
        youtubeUrl:         newYoutubeUrl.trim() || '',
        notes:              newNotes.trim()      || '',
        status:             'Draft',
      });

      setNewCreateStep('uploading');
      try {
        const { uploadURL } = await requestAudioUploadUrl(created.id, {
          name:        newAudioFile.name,
          size:        newAudioFile.size,
          contentType: newAudioFile.type || 'audio/mpeg',
        });
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', uploadURL);
          xhr.setRequestHeader('Content-Type', newAudioFile.type || 'audio/mpeg');
          xhr.upload.addEventListener('progress', e => {
            if (e.lengthComputable) setNewUploadProgress(Math.round(e.loaded / e.total * 100));
          });
          xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
          xhr.onerror = () => reject(new Error('Network error during upload'));
          xhr.send(newAudioFile);
        });
      } catch (uploadErr) {
        setNewError('Audio upload failed. Please try again.');
        setNewCreateStep('form');
        return;
      }

      // Trigger background pipeline — returns 202 with updated processingStage
      const pending = await processSermon(created.id);
      // Merge the returned processingStage into the in-memory record so
      // SermonEditor initialises with the correct stage ('preparing') rather
      // than the stale 'idle' from the original createAdminSermon response.
      const withStage: typeof created = {
        ...created,
        processingStage: pending?.processingStage ?? 'preparing',
      };

      setSermons(prev => [withStage, ...prev]);
      setShowNewModal(false);
      onEdit(editId(created));
    } catch (err) {
      setNewError(err instanceof Error ? err.message : 'Failed to create sermon');
      setNewCreateStep('form');
    } finally {
      setNewCreating(false);
      setNewUploadProgress(0);
    }
  };

  // ── Set current week ──────────────────────────────────────────────────────────

  const handleSetCurrentWeek = async (sermon: CanonicalSermon & { companionId?: string | null }) => {
    const companionId = sermon.companionId;
    if (!companionId) return;
    setSettingCurrentWeek(prev => ({ ...prev, [sermon.id]: true }));
    setOpenMenuId(null);
    setErrorMessage(''); setSuccessMessage('');
    try {
      await setCurrentWeekSermon(companionId);
      // Update list in-place: clear old current-week, set new one
      setSermons(prev => prev.map(s => ({
        ...s,
        isCurrentWeek: s.id === sermon.id ? true : false,
      })));
      setSuccessMessage('Set as This Week\'s Sermon.');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch {
      setErrorMessage("We couldn't set this as This Week's Sermon. Please try again.");
      setTimeout(() => setErrorMessage(''), 5000);
    } finally {
      setSettingCurrentWeek(prev => { const copy = { ...prev }; delete copy[sermon.id]; return copy; });
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
          const isPublished          = s.status === 'Published';
          const isPublishingThis     = !!publishing[s.id];
          const isMenuOpen           = openMenuId === s.id;
          const companionId          = (s as CanonicalSermon & { companionId?: string | null }).companionId;
          const isCurrentWeek        = !!(s as CanonicalSermon & { isCurrentWeek?: boolean }).isCurrentWeek;
          const isSettingCurrentWeek = !!settingCurrentWeek[s.id];

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
              status={
                <div className="flex items-center gap-1.5">
                  {isCurrentWeek && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-amber-100 text-amber-700 border border-amber-200">
                      <Star size={8} className="fill-amber-500 text-amber-500" />
                      THIS WEEK
                    </span>
                  )}
                  <StatusBadge status={isPublished ? 'published' : s.status.toLowerCase()} />
                </div>
              }
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
                        <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-48">
                          {/* Set as This Week — Published sermons with a companion that aren't already current */}
                          {isPublished && companionId && !isCurrentWeek && (
                            <button
                              onClick={() => handleSetCurrentWeek(s as CanonicalSermon & { companionId?: string | null })}
                              disabled={isSettingCurrentWeek}
                              className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                            >
                              {isSettingCurrentWeek
                                ? <Loader2 size={13} className="animate-spin" />
                                : <Star size={13} />}
                              Set as This Week
                            </button>
                          )}
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
                disabled={newCreating}
                aria-label="Cancel"
                className="flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-900 transition-colors w-20 flex-shrink-0 disabled:opacity-40"
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
                  disabled={newCreating}
                  aria-label="Close"
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Upload progress bar */}
            {newCreateStep === 'uploading' && (
              <div className="flex-shrink-0 px-5 pt-3 pb-1 space-y-1">
                <div className="flex justify-between text-[11px] text-gray-500">
                  <span>Uploading audio…</span>
                  <span>{newUploadProgress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-teal-500 transition-all"
                    style={{ width: `${newUploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
              <div className="space-y-4">

                {/* Title */}
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
                    placeholder="e.g. The God Who Sees"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
                  />
                </div>

                {/* Speaker + Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-700 mb-1">Speaker</label>
                    <input
                      type="text"
                      value={newSpeaker}
                      onChange={e => setNewSpeaker(e.target.value)}
                      placeholder="Pastor name"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-700 mb-1">Date</label>
                    <input
                      type="date"
                      value={newDate}
                      onChange={e => setNewDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Scripture + Series */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-700 mb-1">Main Scripture</label>
                    <input
                      type="text"
                      value={newScripture}
                      onChange={e => setNewScripture(e.target.value)}
                      placeholder="e.g. John 3:1-21"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-700 mb-1">
                      Series
                      <span className="ml-1 text-[10px] font-normal text-gray-400">optional</span>
                    </label>
                    <input
                      type="text"
                      value={newSeries}
                      onChange={e => setNewSeries(e.target.value)}
                      placeholder="Series name"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Audio Upload */}
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
                    Upload Sermon Audio
                    <span className="ml-1 text-[10px] font-normal text-gray-400">optional</span>
                  </label>
                  <input
                    ref={newAudioInputRef}
                    type="file"
                    accept={ACCEPTED_AUDIO}
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) handleNewAudioSelect(f);
                      e.target.value = '';
                    }}
                  />
                  {newAudioFile ? (
                    <div className="flex items-center gap-2.5 p-3 rounded-xl border border-teal-200 bg-teal-50">
                      <FileAudio size={16} className="text-teal-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-gray-800 truncate">{newAudioFile.name}</p>
                        <p className="text-[11px] text-gray-500">{fmtBytes(newAudioFile.size)}</p>
                      </div>
                      <button
                        onClick={() => setNewAudioFile(null)}
                        className="p-1 rounded hover:bg-teal-100 text-gray-400 hover:text-gray-700"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => newAudioInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-gray-200 hover:border-teal-300 hover:bg-gray-50 rounded-xl p-4 text-center transition-colors"
                    >
                      <Upload size={16} className="mx-auto mb-1.5 text-gray-400" />
                      <p className="text-[12px] font-medium text-gray-600">Click to select audio</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">MP3, M4A, WAV, MP4, MPEG, WEBM · Max 250 MB</p>
                    </button>
                  )}
                  {newAudioError && (
                    <p className="mt-1.5 text-[11px] text-red-600 flex items-center gap-1">
                      <AlertCircle size={11} /> {newAudioError}
                    </p>
                  )}
                </div>

                {/* YouTube URL */}
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1">
                    YouTube URL
                    <span className="ml-1 text-[10px] font-normal text-gray-400">optional</span>
                  </label>
                  <input
                    type="url"
                    value={newYoutubeUrl}
                    onChange={e => setNewYoutubeUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=…"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1">
                    Notes
                    <span className="ml-1 text-[10px] font-normal text-gray-400">optional</span>
                  </label>
                  <textarea
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                    rows={2}
                    placeholder="Admin notes about this sermon…"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent resize-none"
                  />
                </div>

                {newError && (
                  <p className="text-[12px] text-red-600 flex items-center gap-1.5">
                    <AlertCircle size={12} /> {newError}
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 space-y-2">
              {/* Primary — Process Sermon (requires audio) */}
              <button
                onClick={handleCreateAndProcess}
                disabled={newCreating || !!newAudioError || !newAudioFile}
                title={!newAudioFile ? 'Upload sermon audio to enable this' : undefined}
                className="w-full h-12 rounded-2xl text-[15px] font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed bg-teal-600 hover:bg-teal-700 text-white"
              >
                {newCreating && newCreateStep === 'uploading'
                  ? <><Loader2 size={15} className="animate-spin" /><span>Uploading audio…</span></>
                  : newCreating
                  ? <><Loader2 size={15} className="animate-spin" /><span>Starting pipeline…</span></>
                  : <span>Process Sermon</span>
                }
              </button>
              {!newAudioFile && (
                <p className="text-center text-[11px] text-gray-400 -mt-1">
                  Upload audio above to enable Process Sermon
                </p>
              )}
              {/* Secondary — Save as Draft (no audio required, no AI processing) */}
              <button
                onClick={handleCreateSermon}
                disabled={newCreating || !!newAudioError}
                className="w-full h-10 rounded-xl text-[13px] text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                {newCreating && newCreateStep === 'uploading' ? 'Uploading…' : 'Save as Draft →'}
              </button>
              <button
                onClick={() => { if (!newCreating) { handleCloseNewModal(); onNew(); } }}
                disabled={newCreating}
                className="w-full h-8 rounded-xl text-[12px] text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
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
