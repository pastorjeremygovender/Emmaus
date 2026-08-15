/**
 * ShareImageField — admin upload/preview/replace/remove for share images.
 *
 * Flow:
 *   1. POST /storage/uploads/request-url  →  { uploadURL, objectPath }
 *   2. PUT file to presigned uploadURL via XHR (progress tracked)
 *   3. onChange(objectPath) persists the path in the parent editor
 *
 * Pass onChange(null) to remove an existing image.
 *
 * Usage:
 *   <ShareImageField value={shareImageUrl} onChange={setShareImageUrl} />
 */

import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2, Upload, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/lib/api';

interface Props {
  /** Current object-storage path ("/objects/…") or null when not set. */
  value: string | null | undefined;
  /** Called with the new objectPath after a successful upload, or null to remove. */
  onChange: (path: string | null) => void;
}

export function ShareImageField({ value, onChange }: Props) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const imageUrl = value ? getApiUrl('/storage' + value) : null;

  async function handleFile(file: File) {
    if (!user) return;
    setError('');
    setUploading(true);
    setProgress(0);

    try {
      // 1. Request presigned upload URL (admin-only route)
      const metaRes = await fetch(getApiUrl('/storage/uploads/request-url'), {
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
        const body = await metaRes.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to get upload URL');
      }
      const { uploadURL, objectPath } = (await metaRes.json()) as { uploadURL: string; objectPath: string };

      // 2. PUT file directly to storage (browser → GCS — server is not in the data path)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadURL, true);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        });
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
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
    // Reset so the same file can be re-selected if needed
    e.target.value = '';
  }

  return (
    <div className="space-y-2">
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleInputChange}
      />

      {imageUrl ? (
        /* ─── Existing image ─────────────────────────────────────────────── */
        <div>
          <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
            <img
              src={imageUrl}
              alt="Share image preview"
              className="w-full object-contain block"
              style={{ maxHeight: 280 }}
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
              onClick={() => onChange(null)}
              disabled={uploading}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium text-red-600 hover:bg-red-50 border border-red-200 transition-colors disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              Remove
            </button>
          </div>
        </div>
      ) : (
        /* ─── Empty state ─────────────────────────────────────────────────── */
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
      )}

      {error && <p className="text-[12px] text-red-500">{error}</p>}
      <p className="text-[11px] text-gray-400">
        Optional — portrait (4:5) works best. PNG, JPG or WEBP.
      </p>
    </div>
  );
}
