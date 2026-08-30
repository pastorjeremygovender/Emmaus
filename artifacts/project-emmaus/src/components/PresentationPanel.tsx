/**
 * PresentationPanel.tsx — Shows an active media presentation to all Group members.
 *
 * Leaders see page navigation (PDF) + Stop Presenting.
 * Members see the presented item + current page indicator.
 */

import { useState } from 'react';
import {
  ChevronLeft, ChevronRight, X, Presentation,
  FileText, Film, Mic, Link as LinkIcon, ExternalLink,
} from 'lucide-react';
import type { PresentationState } from '@/lib/rooms-types';
import { getMediaUrl } from '@/lib/rooms-api-media';
import { apiChangePresentationPage, apiStopPresentation } from '@/lib/rooms-api-media';

interface PresentationPanelProps {
  presentation: PresentationState;
  isLeader: boolean;
  userId: string;
  roomId: string;
  onStop?: (sessionId: string, presentationId: string) => void;
  onPresentationChange?: (presentation: PresentationState) => void;
  /** Close this viewer locally without stopping the group presentation. */
  onClose?: () => void;
}

export function PresentationPanel({
  presentation,
  isLeader,
  userId,
  roomId,
  onStop,
  onPresentationChange,
  onClose,
}: PresentationPanelProps) {
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const presentationId = presentation.id;
  const sessionId = presentation.sessionId;

  const requireActiveIds = (): { sessionId: string; presentationId: string } | null => {
    if (!sessionId || !presentationId) {
      setActionError('This presentation is stale or the meeting has ended. Reopen it from the current meeting.');
      return null;
    }
    return { sessionId, presentationId };
  };

  const mediaUrl = presentation.objectPath
    ? getMediaUrl(presentation.objectPath)
    : (presentation as unknown as { url?: string }).url ?? '';

  const handlePrevPage = async () => {
    if (busy || presentation.currentPage <= 1) return;
    const ids = requireActiveIds();
    if (!ids) return;
    setBusy(true);
    try {
      const next = await apiChangePresentationPage(userId, roomId, ids.sessionId, ids.presentationId, presentation.currentPage - 1);
      onPresentationChange?.(next);
      setActionError('');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The presentation changed before the page was updated.');
    } finally {
      setBusy(false);
    }
  };

  const isLastPage = presentation.pageCount != null && presentation.currentPage >= presentation.pageCount;

  const handleNextPage = async () => {
    if (busy || isLastPage) return;
    const ids = requireActiveIds();
    if (!ids) return;
    setBusy(true);
    try {
      const next = await apiChangePresentationPage(userId, roomId, ids.sessionId, ids.presentationId, presentation.currentPage + 1);
      onPresentationChange?.(next);
      setActionError('');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The presentation changed before the page was updated.');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    if (busy) return;
    const ids = requireActiveIds();
    if (!ids) return;
    setBusy(true);
    try {
      const result = await apiStopPresentation(userId, roomId, ids.sessionId, ids.presentationId);
      onStop?.(result.sessionId, ids.presentationId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The meeting ended before the presentation could be stopped.');
    } finally {
      setBusy(false);
    }
  };

  const openExternalLink = () => {
    const url = (presentation as unknown as { url?: string }).url;
    if (!url) return;
    if (window.confirm('This link opens an external website. Continue?')) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-primary/20 bg-primary/10">
        <Presentation size={16} className="text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-primary truncate">Presenting</p>
          <p className="text-[12px] text-primary/70 truncate">{presentation.filename}</p>
        </div>
        <p className="text-[11px] text-primary/70 shrink-0">
          by {presentation.presentedByName}
        </p>
         <button
           type="button"
           onClick={onClose}
           className="w-9 h-9 rounded-lg flex items-center justify-center text-primary/70 hover:bg-primary/10 hover:text-primary"
           aria-label="Close presentation viewer"
         >
           <X size={17} />
         </button>
      </div>

      {/* Content area */}
      <div className="p-4">
        {presentation.mediaType === 'image' && mediaUrl && (
          <img
            src={mediaUrl}
            alt={presentation.filename}
            className="w-full rounded-xl object-contain max-h-[320px] bg-muted"
          />
        )}

        {(presentation.mediaType === 'pdf' || presentation.mediaType === 'document') && mediaUrl && (
          <div className="space-y-3">
            <div className="w-full rounded-xl border border-border bg-muted flex items-center justify-center" style={{ height: 280 }}>
              <iframe
                src={`${mediaUrl}#page=${presentation.currentPage}`}
                title={presentation.filename}
                className="w-full h-full rounded-xl"
              />
            </div>
            <p className="text-center text-[13px] text-muted-foreground">
              Page {presentation.currentPage}{presentation.pageCount ? ` of ${presentation.pageCount}` : ''}
            </p>
          </div>
        )}

        {presentation.mediaType === 'video' && mediaUrl && (
          <div className="space-y-2">
            <video
              src={mediaUrl}
              controls
              playsInline
              className="w-full rounded-xl bg-black max-h-[280px]"
            />
            <p className="text-[12px] text-muted-foreground text-center">
              Each member can play/pause independently
            </p>
          </div>
        )}

        {presentation.mediaType === 'voice' && mediaUrl && (
          <audio src={mediaUrl} controls className="w-full" />
        )}

        {presentation.mediaType === 'link' && (
          <button
            type="button"
            onClick={openExternalLink}
            className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-muted/50 transition-all"
          >
            <LinkIcon size={20} className="text-primary shrink-0" />
            <span className="flex-1 text-[14px] font-medium text-foreground truncate">
              {presentation.filename}
            </span>
            <ExternalLink size={14} className="text-muted-foreground shrink-0" />
          </button>
        )}
      </div>

      {/* Controls */}
      {actionError && <p role="alert" className="px-4 pb-2 text-[12px] text-destructive">{actionError}</p>}
      <div className="px-4 pb-4 flex items-center gap-2">
        {isLeader && presentation.mediaType === 'pdf' && (
          <>
            <button
              onClick={handlePrevPage}
              disabled={busy || presentation.currentPage <= 1}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-border text-[13px] font-medium text-foreground hover:bg-muted/50 disabled:opacity-40 transition-all"
            >
              <ChevronLeft size={16} /> Previous
            </button>
            <button
              onClick={handleNextPage}
              disabled={busy || isLastPage}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-border text-[13px] font-medium text-foreground hover:bg-muted/50 disabled:opacity-40 transition-all"
            >
              Next <ChevronRight size={16} />
            </button>
          </>
        )}

        {isLeader && (
          <button
            onClick={handleStop}
            disabled={busy}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-destructive/50 text-destructive text-[13px] font-medium hover:bg-destructive/10 disabled:opacity-40 transition-all"
          >
            <X size={14} /> Stop
          </button>
        )}

        {!isLeader && (
          <p className="text-[12px] text-muted-foreground text-center w-full py-1">
            Your leader is presenting this to the group
          </p>
        )}
      </div>
    </div>
  );
}
