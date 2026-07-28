import React, { useState } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Pencil, ExternalLink, BookOpen, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
import { StatusBadge, AdminBtn, AdminTable, Th, Td, PageHeader } from './shared';
import { deleteServerSermon, patchServerSermon } from '@/lib/sermon-generator-api';
import type { Sermon } from '@/lib/admin-demo-data';

type Props = {
  onEdit: (id: string) => void;
  onNew: () => void;
  /** Opens the companion for a sermon. Receives (sermonId, companionId). */
  onOpenCompanion: (sermonId: string, companionId: string) => void;
};

const TRANSCRIPT_LABELS = { none: 'None', pending: 'Pending', complete: 'Complete' };

/** A companionJourneyId is a new-style UUID if it matches the UUID pattern. */
function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export default function SermonsList({ onEdit, onNew, onOpenCompanion }: Props) {
  const { sermons, removeSermon, updateSermon } = useAdmin();
  const { journeys } = useJourney();
  const { user } = useAuth();

  const [deleteTarget, setDeleteTarget] = useState<Sermon | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Publish / Unpublish
  const [publishing, setPublishing] = useState<Record<string, boolean>>({});
  const [unpublishTarget, setUnpublishTarget] = useState<Sermon | null>(null);

  const auth = user ? { userId: user.id, userRole: user.role } : null;

  const handleDeleteClick = (sermon: Sermon) => {
    setDeleteTarget(sermon);
    setDeleteError('');
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !auth) return;
    setDeleting(true);
    setDeleteError('');
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

  const handlePublish = async (sermon: Sermon, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!auth) return;
    setPublishing(prev => ({ ...prev, [sermon.id]: true }));
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const now = new Date().toISOString();
      // Minimal payload — avoids 413 from large transcripts (same as editor)
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
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const now = new Date().toISOString();
      // Minimal payload — avoids 413 from large transcripts (same as editor)
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

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <PageHeader
        title="Sermon Companions"
        subtitle={`${sermons.length} sermon${sermons.length !== 1 ? 's' : ''}`}
        action={
          <AdminBtn onClick={onNew} variant="primary">
            <Plus size={15} /> New Sermon Companion
          </AdminBtn>
        }
      />

      {successMessage && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 flex items-center gap-2">
          <CheckCircle2 size={14} className="flex-shrink-0" /> {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <AdminTable>
        <thead>
          <tr>
            <Th>Title</Th>
            <Th>Speaker</Th>
            <Th>Scripture</Th>
            <Th>Transcript</Th>
            <Th>Companion</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sermons.map(s => {
            // Legacy companions use a journey ID; new companions are UUIDs.
            const hasCompanion = !!s.companionJourneyId;
            const companionIsNew = hasCompanion && isUUID(s.companionJourneyId!);
            const legacyCompanion = !companionIsNew && s.companionJourneyId
              ? journeys.find(j => j.id === s.companionJourneyId)
              : null;

            return (
              <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                <Td>
                  <div className="font-medium text-gray-900">{s.title}</div>
                  <div className="text-xs text-gray-400">{s.sermonDate}</div>
                </Td>
                <Td>{s.speaker}</Td>
                <Td>{s.scriptureReference}</Td>
                <Td>
                  <span className="text-xs text-gray-500">
                    {TRANSCRIPT_LABELS[s.transcriptStatus] ?? s.transcriptStatus}
                  </span>
                </Td>
                <Td>
                  {companionIsNew ? (
                    <button
                      onClick={() => onOpenCompanion(s.id, s.companionJourneyId!)}
                      className="text-xs text-teal-700 hover:underline flex items-center gap-1"
                    >
                      <BookOpen size={11} /> View Companion
                    </button>
                  ) : legacyCompanion ? (
                    <button
                      onClick={() => onOpenCompanion(s.id, legacyCompanion.id)}
                      className="text-xs text-teal-700 hover:underline flex items-center gap-1"
                    >
                      <BookOpen size={11} /> {legacyCompanion.title}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </Td>
                <Td><StatusBadge status={s.status} /></Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <AdminBtn size="sm" variant="ghost" onClick={() => onEdit(s.id)}>
                      <Pencil size={13} /> Edit
                    </AdminBtn>
                    {/* Quick Publish / Quick Unpublish */}
                    {s.status !== 'published' ? (
                      <button
                        onClick={e => handlePublish(s, e)}
                        disabled={!!publishing[s.id]}
                        className="inline-flex items-center gap-1 px-2 py-1.5 text-[13px] text-teal-700 hover:text-teal-900 hover:bg-teal-50 rounded-lg transition-colors font-medium disabled:opacity-50"
                      >
                        {publishing[s.id]
                          ? <Loader2 size={13} className="animate-spin" />
                          : <CheckCircle2 size={13} />}
                        {publishing[s.id] ? 'Publishing…' : 'Quick Publish'}
                      </button>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); setUnpublishTarget(s); }}
                        disabled={!!publishing[s.id]}
                        className="inline-flex items-center gap-1 px-2 py-1.5 text-[13px] text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors font-medium disabled:opacity-50"
                      >
                        {publishing[s.id] ? <Loader2 size={13} className="animate-spin" /> : null}
                        {publishing[s.id] ? 'Unpublishing…' : 'Quick Unpublish'}
                      </button>
                    )}
                    {s.youtubeUrl && (
                      <a
                        href={s.youtubeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1.5 text-[13px] text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <ExternalLink size={13} />
                      </a>
                    )}
                    <button
                      onClick={() => handleDeleteClick(s)}
                      className="inline-flex items-center gap-1 px-2 py-1.5 text-[13px] text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </Td>
              </tr>
            );
          })}
          {sermons.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                No Sermon Companions yet. Click "New Sermon Companion" to generate your first draft.
              </td>
            </tr>
          )}
        </tbody>
      </AdminTable>

      {/* Unpublish confirmation dialog */}
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

      {/* Delete confirmation dialog */}
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
            {deleteError && (
              <p className="text-sm text-red-600 mb-3">{deleteError}</p>
            )}
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
                {deleting ? <><Loader2 size={13} className="animate-spin" /> Deleting…</> : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
