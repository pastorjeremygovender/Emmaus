/**
 * ShareImageField — admin share image control.
 *
 * Provides two modes toggled by tab buttons:
 *   "Upload Image"       — existing manual upload flow (unchanged)
 *   "Generate with Emmaus" — AI generator (ShareImageGenerator)
 *
 * Both modes ultimately populate the same `shareImageUrl` via `onChange`.
 * The member-facing Take This With You card requires no changes.
 *
 * Usage:
 *   <ShareImageField value={shareImageUrl} onChange={setShareImageUrl} />
 */

import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2, Upload, X, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/lib/api';
import { ShareImageGenerator } from '@/components/ShareImageGenerator';

type Mode = 'upload' | 'generate';

interface Props {
  /** Current object-storage path ("/objects/…") or null when not set. */
  value: string | null | undefined;
  /** Called with the new objectPath after a successful upload/generation, or null to remove. */
  onChange: (path: string | null) => void;
}

export function ShareImageField({ value, onChange }: Props) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('upload');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const imageUrl = value ? getApiUrl('/api/storage' + value) : null;

  // ── Manual upload helpers ──────────────────────────────────────────────────

  async function handleFile(file: File) {
    if (!user) return;
    setError('');
    setUploading(true);
    setProgress(0);

    try {
      const metaRes = await fetch(getApiUrl('/api/storage/uploads/request-url'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
          'x-user-role': user.role,
        },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!metaRes.ok) {
        const body = await metaRes.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? 'Failed to get upload URL');
      }
      const { uploadURL, objectPath } = await metaRes.json() as {
        uploadURL: string;
        objectPath: string;
      };

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadURL, true);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        });
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload failed: ${xhr.status}`));
        xhr.onerror = () => reject(new Error('Upload failed — network error'));
        xhr.send(file);
      });

      onChange(objectPath);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  // ── When a generated image is accepted ────────────────────────────────────
  function handleGenerated(path: string | null) {
    onChange(path);
    setMode('upload'); // return to upload view so the saved image shows
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">

      {/* Hidden file input — always present */}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleInputChange}
      />

      {/* If an image is already saved, show it with Replace / Generate / Remove */}
      {imageUrl && mode === 'upload' ? (
        <div>
          <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50 aspect-square">
            <img
              src={imageUrl}
              alt="Share image"
              className="w-full h-full object-cover block"
            />
          </div>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {progress > 0 ? `${progress}%` : 'Uploading…'}
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  Replace
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setMode('generate')}
              disabled={uploading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generate new
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={uploading}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium text-red-600 hover:bg-red-50 border border-red-200 transition-colors disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              Remove
            </button>
          </div>
        </div>
      ) : mode === 'generate' ? (
        /* ── AI generation mode ─────────────────────────────────────────────── */
        <ShareImageGenerator
          onChange={handleGenerated}
          onCancel={() => setMode('upload')}
        />
      ) : (
        /* ── Upload mode (no existing image) ────────────────────────────────── */
        <>
          {/* Mode toggle tabs */}
          <div className="flex rounded-xl overflow-hidden border border-gray-200 text-[13px] font-medium">
            <button
              type="button"
              onClick={() => setMode('upload')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${
                mode === 'upload'
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Image
            </button>
            <button
              type="button"
              onClick={() => setMode('generate')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${
                mode === 'generate'
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generate with Emmaus
            </button>
          </div>

          {/* Upload drop zone */}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-[13px]">{progress > 0 ? `${progress}%` : 'Uploading…'}</span>
              </>
            ) : (
              <>
                <ImagePlus className="w-5 h-5" />
                <span className="text-[13px]">Add Share Image</span>
              </>
            )}
          </button>
        </>
      )}

      {error && <p className="text-[12px] text-red-500">{error}</p>}

      {mode === 'upload' && !imageUrl && (
        <p className="text-[11px] text-gray-400">
          Optional — portrait (4:5) works best. PNG, JPG or WEBP. Or use{' '}
          <button
            type="button"
            onClick={() => setMode('generate')}
            className="underline text-teal-600 hover:text-teal-700"
          >
            Generate with Emmaus
          </button>{' '}
          to create one with AI.
        </p>
      )}
    </div>
  );
}
