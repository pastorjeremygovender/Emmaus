/**
 * MediaMessageBubble.tsx — Renders a media attachment inline in Group Discussion.
 *
 * Supports: image, pdf, video, voice, document, link
 */

import { useState, useRef, useEffect } from 'react';
import {
  FileText, Film, Mic, Link as LinkIcon, Download,
  Play, Pause, ExternalLink, Presentation,
} from 'lucide-react';
import type { MediaAttachment } from '@/lib/rooms-types';
import { getMediaUrl } from '@/lib/rooms-api-media';

interface MediaMessageBubbleProps {
  attachment: MediaAttachment;
  isMe: boolean;
  /** Whether the current user can present (authorized leader or member-present enabled for own content). */
  canPresent?: boolean;
  onPresent?: () => void;
  isPresenting?: boolean;
  /** Show a real download action, used for visible prepared meeting media. */
  allowDownload?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Image ────────────────────────────────────────────────────────────────────

function DownloadAction({ url, filename, isMe }: { url: string; filename: string; isMe: boolean }) {
  return (
    <a
      href={url}
      download={filename}
      onClick={event => event.stopPropagation()}
      className={`inline-flex items-center gap-1.5 text-[12px] font-medium hover:underline ${
        isMe ? 'text-primary-foreground/80' : 'text-primary'
      }`}
      aria-label={`Download ${filename}`}
    >
      <Download size={12} /> Download
    </a>
  );
}

function PresentationAction({ isPresenting, onPresent }: { isPresenting?: boolean; onPresent?: () => void }) {
  if (isPresenting) return <p className="flex items-center gap-1.5 text-[12px] font-semibold text-primary"><Presentation size={12} />Presenting now</p>;
  if (!onPresent) return null;
  return <button onClick={onPresent} className="flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline"><Presentation size={12} /> Present to Group</button>;
}

function ImageBubble({ attachment, isMe, canPresent, onPresent, allowDownload, isPresenting }: MediaMessageBubbleProps) {
  const url = getMediaUrl(attachment.objectPath);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <div className="space-y-1.5">
      <button
        onClick={() => setOpen(true)}
        className="block rounded-xl overflow-hidden max-w-[240px] w-full"
      >
        <img
          src={url}
          alt={attachment.filename}
          className="w-full h-auto object-cover rounded-xl"
          loading="lazy"
        />
      </button>
      {attachment.caption && (
        <p className={`text-[13px] leading-snug ${isMe ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
          {attachment.caption}
        </p>
      )}
      {allowDownload && <DownloadAction url={url} filename={attachment.filename} isMe={isMe} />}
      {(isPresenting || canPresent) && <PresentationAction isPresenting={isPresenting} onPresent={canPresent ? onPresent : undefined} />}

      {/* Lightbox */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Viewing ${attachment.filename}`}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25"
            aria-label="Close image viewer"
          >
            <span className="sr-only">Close image viewer</span>
            <span aria-hidden="true">×</span>
          </button>
          <img
            src={url}
            alt={attachment.filename}
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
          {allowDownload && (
            <a
              href={url}
              download={attachment.filename}
              onClick={e => e.stopPropagation()}
              className="absolute bottom-5 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[13px] font-semibold text-black"
            >
              <Download size={15} /> Download
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Voice note ───────────────────────────────────────────────────────────────

function VoiceBubble({ attachment, isMe, canPresent, onPresent, allowDownload, isPresenting }: MediaMessageBubbleProps) {
  const url = getMediaUrl(attachment.objectPath);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(attachment.duration ?? 0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  return (
    <div className={`flex flex-col gap-1 min-w-[180px] ${isMe ? '' : ''}`}>
      <audio
        ref={audioRef}
        src={url}
        onEnded={() => { setPlaying(false); setProgress(0); }}
        onTimeUpdate={() => {
          const el = audioRef.current;
          if (!el || !el.duration) return;
          setProgress(el.currentTime / el.duration);
        }}
        onLoadedMetadata={() => {
          const el = audioRef.current;
          if (el && el.duration && isFinite(el.duration)) setDuration(el.duration);
        }}
        preload="metadata"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
            isMe ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/10 text-primary'
          }`}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <div className="flex-1">
          {/* Progress bar */}
          <div className={`h-1 rounded-full ${isMe ? 'bg-primary-foreground/20' : 'bg-muted'}`}>
            <div
              className={`h-full rounded-full transition-all ${isMe ? 'bg-primary-foreground/70' : 'bg-primary'}`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className={`text-[11px] ${isMe ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
              Voice note
            </span>
            {duration > 0 && (
              <span className={`text-[11px] ${isMe ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                {formatDuration(duration)}
              </span>
            )}
          </div>
        </div>
      </div>
      {allowDownload && <DownloadAction url={url} filename={attachment.filename} isMe={isMe} />}
      {(isPresenting || canPresent) && <PresentationAction isPresenting={isPresenting} onPresent={canPresent ? onPresent : undefined} />}
    </div>
  );
}

// ─── Video ────────────────────────────────────────────────────────────────────

function VideoBubble({ attachment, isMe, canPresent, onPresent, allowDownload, isPresenting }: MediaMessageBubbleProps) {
  const url = getMediaUrl(attachment.objectPath);
  return (
    <div className="space-y-1.5">
      <video
        src={url}
        controls
        playsInline
        className="w-full max-w-[280px] rounded-xl bg-black"
        preload="metadata"
      />
      {allowDownload && <DownloadAction url={url} filename={attachment.filename} isMe={isMe} />}
      {attachment.caption && (
        <p className={`text-[13px] leading-snug ${isMe ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
          {attachment.caption}
        </p>
      )}
      {(isPresenting || canPresent) && <PresentationAction isPresenting={isPresenting} onPresent={canPresent ? onPresent : undefined} />}
    </div>
  );
}

// ─── PDF / Document ───────────────────────────────────────────────────────────

function DocumentBubble({ attachment, isMe, canPresent, onPresent, allowDownload, isPresenting }: MediaMessageBubbleProps) {
  const url = attachment.type === 'link'
    ? (attachment.url ?? '#')
    : getMediaUrl(attachment.objectPath);

  const Icon = attachment.type === 'pdf' ? FileText
    : attachment.type === 'link' ? LinkIcon
    : FileText;

  return (
    <div className="space-y-1.5">
      <a
        href={url}
        target={allowDownload ? undefined : '_blank'}
        rel={allowDownload ? undefined : 'noopener noreferrer'}
        download={allowDownload && attachment.type !== 'link' ? attachment.filename : undefined}
        className={`flex items-center gap-3 p-3 rounded-xl border max-w-[260px] transition-opacity hover:opacity-80 ${
          isMe
            ? 'border-primary-foreground/20 bg-primary-foreground/10'
            : 'border-border bg-muted/50'
        }`}
      >
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
          isMe ? 'bg-primary-foreground/20' : 'bg-primary/10'
        }`}>
          <Icon size={17} className={isMe ? 'text-primary-foreground' : 'text-primary'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[13px] font-semibold truncate ${isMe ? 'text-primary-foreground' : 'text-foreground'}`}>
            {attachment.filename}
          </p>
          <div className={`text-[11px] mt-0.5 flex items-center gap-1 ${isMe ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
            {attachment.type === 'pdf' && attachment.pageCount
              ? `${attachment.pageCount} pages`
              : attachment.type === 'link'
              ? 'Link'
              : formatBytes(attachment.size)}
          {allowDownload && attachment.type !== 'link'
            ? <Download size={10} />
            : <ExternalLink size={10} />}
          </div>
        </div>
        {attachment.type !== 'link' && !allowDownload && (
          <Download size={14} className={isMe ? 'text-primary-foreground/60 shrink-0' : 'text-muted-foreground shrink-0'} />
        )}
      </a>
      {allowDownload && attachment.type !== 'link' && (
        <DownloadAction url={url} filename={attachment.filename} isMe={isMe} />
      )}
      {attachment.caption && (
        <p className={`text-[13px] leading-snug ${isMe ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
          {attachment.caption}
        </p>
      )}
      {(isPresenting || canPresent) && <PresentationAction isPresenting={isPresenting} onPresent={canPresent ? onPresent : undefined} />}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function MediaMessageBubble({
  attachment,
  isMe,
  canPresent,
  onPresent,
  allowDownload,
  isPresenting,
}: MediaMessageBubbleProps) {
  if (attachment.removed) {
    return (
      <div className="rounded-xl border border-border/70 bg-muted/40 px-3 py-2.5 max-w-[260px]">
        <p className="text-[13px] font-medium text-muted-foreground">Shared media removed</p>
        <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate">
          {attachment.filename}
        </p>
      </div>
    );
  }

  switch (attachment.type) {
    case 'image':
      return <ImageBubble attachment={attachment} isMe={isMe} canPresent={canPresent} onPresent={onPresent} allowDownload={allowDownload} isPresenting={isPresenting} />;
    case 'voice':
      return <VoiceBubble attachment={attachment} isMe={isMe} canPresent={canPresent} onPresent={onPresent} allowDownload={allowDownload} isPresenting={isPresenting} />;
    case 'video':
      return <VideoBubble attachment={attachment} isMe={isMe} canPresent={canPresent} onPresent={onPresent} allowDownload={allowDownload} isPresenting={isPresenting} />;
    case 'pdf':
    case 'document':
    case 'link':
    default:
      return <DocumentBubble attachment={attachment} isMe={isMe} canPresent={canPresent} onPresent={onPresent} allowDownload={allowDownload} isPresenting={isPresenting} />;
  }
}
