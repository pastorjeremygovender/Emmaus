/**
 * AttachmentPicker.tsx — Bottom sheet for adding media to a Group Discussion message.
 *
 * Options: Image, Document/PDF, Video, Voice Note, Link
 * Handles: file selection → upload → returns pending MediaAttachment to parent.
 */

import { useRef, useState } from 'react';
import {
  Image, FileText, Film, Mic, Link as LinkIcon, X, Loader2,
} from 'lucide-react';
import type { MediaAttachment, MediaAttachmentType } from '@/lib/rooms-types';
import {
  apiRequestRoomUploadUrl,
  uploadFileToStorage,
} from '@/lib/rooms-api-media';

interface AttachmentPickerProps {
  userId: string;
  roomId: string;
  onAttachment: (attachment: MediaAttachment) => void;
  onClose: () => void;
}

type PickerState = 'menu' | 'link-input' | 'uploading';

interface OptionDef {
  type: MediaAttachmentType;
  icon: React.ReactNode;
  label: string;
  accept: string;
}

const OPTIONS: OptionDef[] = [
  { type: 'image',    icon: <Image size={20} />,    label: 'Photo / Image',      accept: 'image/jpeg,image/png,image/gif,image/webp' },
  { type: 'pdf',      icon: <FileText size={20} />, label: 'Document / Slides',  accept: 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain' },
  { type: 'video',    icon: <Film size={20} />,     label: 'Video',              accept: 'video/mp4,video/quicktime,video/webm,video/x-msvideo' },
  { type: 'voice',    icon: <Mic size={20} />,      label: 'Voice Note',         accept: 'audio/mpeg,audio/mp4,audio/webm,audio/ogg,audio/wav,audio/aac,audio/x-m4a' },
];

export function AttachmentPicker({ userId, roomId, onAttachment, onClose }: AttachmentPickerProps) {
  const [state, setState] = useState<PickerState>('menu');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingTypeRef = useRef<MediaAttachmentType>('document');

  const handleFileOption = (opt: OptionDef) => {
    pendingTypeRef.current = opt.type;
    if (fileInputRef.current) {
      fileInputRef.current.accept = opt.accept;
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setError('');
    setState('uploading');
    setUploadProgress(0);

    try {
      const { uploadUrl, objectPath, attachmentType } = await apiRequestRoomUploadUrl(
        userId, roomId, file.name, file.type, file.size,
      );
      await uploadFileToStorage(uploadUrl, file, setUploadProgress);

      // Derive attachment type — prefer what the server says
      const type = attachmentType as MediaAttachmentType;
      const attachment: MediaAttachment = {
        type,
        filename: file.name,
        objectPath,
        mimeType: file.type,
        size: file.size,
      };
      onAttachment(attachment);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setState('menu');
    }
  };

  const handleLinkSubmit = () => {
    if (!linkUrl.trim()) return;
    let url = linkUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    const attachment: MediaAttachment = {
      type: 'link',
      filename: linkTitle.trim() || url,
      objectPath: '',
      mimeType: 'text/uri-list',
      size: 0,
      url,
    };
    onAttachment(attachment);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-[480px] bg-background rounded-t-3xl border-t border-border pb-safe-or-6 pb-6">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        <div className="flex items-center justify-between px-5 pb-4">
          <h2 className="text-[17px] font-bold text-foreground">Add Attachment</h2>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X size={20} />
          </button>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />

        {state === 'uploading' && (
          <div className="px-5 py-10 flex flex-col items-center gap-4">
            <Loader2 size={28} className="animate-spin text-primary" />
            <p className="text-[15px] font-medium text-foreground">Uploading… {uploadProgress}%</p>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {state === 'link-input' && (
          <div className="px-5 space-y-4 pb-2">
            <div>
              <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-widest block mb-2">URL</label>
              <input
                type="url"
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-[15px] text-foreground outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-widest block mb-2">Title (optional)</label>
              <input
                type="text"
                value={linkTitle}
                onChange={e => setLinkTitle(e.target.value)}
                placeholder="Link title"
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-[15px] text-foreground outline-none focus:border-primary"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setState('menu')}
                className="flex-1 py-3 rounded-xl border border-border text-[15px] font-medium text-muted-foreground"
              >
                Back
              </button>
              <button
                onClick={handleLinkSubmit}
                disabled={!linkUrl.trim()}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-[15px] font-semibold disabled:opacity-40"
              >
                Add Link
              </button>
            </div>
          </div>
        )}

        {state === 'menu' && (
          <div className="px-5 space-y-2 pb-2">
            {error && (
              <p className="text-[13px] text-destructive py-2">{error}</p>
            )}
            {OPTIONS.map(opt => (
              <button
                key={opt.type}
                onClick={() => handleFileOption(opt)}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl border border-border bg-card hover:bg-muted/50 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  {opt.icon}
                </div>
                <span className="text-[15px] font-semibold text-foreground">{opt.label}</span>
              </button>
            ))}
            <button
              onClick={() => setState('link-input')}
              className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl border border-border bg-card hover:bg-muted/50 transition-all text-left"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <LinkIcon size={20} />
              </div>
              <span className="text-[15px] font-semibold text-foreground">Link</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
