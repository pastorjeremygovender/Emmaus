/**
 * ShareImageField — admin share image control.
 *
 * Provides two modes toggled by tab buttons:
 *   "Upload Image"         — existing manual upload flow (unchanged)
 *   "Generate with Emmaus" — AI generator (ShareImageGenerator)
 *
 * Auto-generation:
 *   When `autoGenerate` is true and `value` is empty and `stepContent` has
 *   sufficient text, the field silently kicks off AI generation on mount.
 *   The AI picks the best phrase from the content, generates the image, and
 *   presents it as a preview the admin can approve, regenerate, or dismiss.
 *   On approval the image is composited (attribution footer) + uploaded, then
 *   `onChange` is called — identical to manual generation.
 *
 * Both modes ultimately populate the same `shareImageUrl` via `onChange`.
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ImagePlus, Loader2, Upload, X, Sparkles, CheckCircle, RefreshCw, Ban } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/lib/api';
import { ShareImageGenerator, compositeAttributionBlob } from '@/components/ShareImageGenerator';

type Mode = 'upload' | 'generate';

type AutoPhase =
  | { phase: 'idle' }
  | { phase: 'generating' }
  | { phase: 'preview'; imageBase64: string; phrase: string }
  | { phase: 'saving' ; imageBase64: string; phrase: string }
  | { phase: 'dismissed' };

interface Props {
  /** Current object-storage path ("/objects/…") or null when not set. */
  value: string | null | undefined;
  /** Called with the new objectPath after a successful upload/generation, or null to remove. */
  onChange: (path: string | null) => void;
  /**
   * When true and `value` is empty, automatically generate a share image from
   * `stepContent` on mount. The admin reviews/approves the result before it
   * is saved.
   */
  autoGenerate?: boolean;
  /**
   * Concatenated step/entry content used to pick the best phrase and generate
   * the image. Required when `autoGenerate` is true.
   */
  stepContent?: string;
}

export function ShareImageField({ value, onChange, autoGenerate, stepContent }: Props) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('upload');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  // ── Auto-generate state machine ───────────────────────────────────────────
  const [autoPhase, setAutoPhase] = useState<AutoPhase>({ phase: 'idle' });
  const [autoError, setAutoError] = useState('');
  const [customPhrase, setCustomPhrase] = useState('');
  const autoTriggeredRef = useRef(false); // only fire once per mount

  // `overridePhrase` — when set, skips extraction and uses this text directly.
  const triggerAutoGenerate = useCallback(async (content: string, overridePhrase?: string) => {
    if (!user) return;
    setAutoError('');
    setAutoPhase({ phase: 'generating' });

    try {
      const res = await fetch(getApiUrl('/api/share-images/auto-generate'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
          'x-user-role': user.role,
        },
        body: JSON.stringify({
          content,
          ...(overridePhrase ? { phrase: overridePhrase } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Auto-generation failed (${res.status})`);
      }

      const { phrase, imageBase64 } = await res.json() as { phrase: string; imageBase64: string };
      setAutoPhase({ phase: 'preview', imageBase64, phrase });
      setCustomPhrase(phrase); // pre-fill the editable input with whatever phrase was used
    } catch (e) {
      setAutoError(e instanceof Error ? e.message : 'Auto-generation failed');
      setAutoPhase({ phase: 'dismissed' }); // fall back to manual UI
    }
  }, [user]);

  useEffect(() => {
    if (
      !autoGenerate ||
      !stepContent ||
      stepContent.trim().length < 40 ||
      value ||                           // already has an image
      autoTriggeredRef.current          // already triggered once
    ) return;
    autoTriggeredRef.current = true;
    triggerAutoGenerate(stepContent.trim());
  }, [autoGenerate, stepContent, value, triggerAutoGenerate]);

  // ── Accept auto-generated image ────────────────────────────────────────────
  async function handleAcceptAutoImage() {
    if (autoPhase.phase !== 'preview') return;
    if (!user) return;
    const { imageBase64, phrase } = autoPhase;

    setAutoPhase({ phase: 'saving', imageBase64, phrase });
    try {
      // Composite attribution footer (same as manual generation)
      const blob = await compositeAttributionBlob(imageBase64, 'emmaus');

      // Request presigned upload URL
      const metaRes = await fetch(getApiUrl('/api/storage/uploads/request-url'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
          'x-user-role': user.role,
        },
        body: JSON.stringify({ name: 'emmaus-share.png', size: blob.size, contentType: 'image/png' }),
      });
      if (!metaRes.ok) {
        const b = await metaRes.json().catch(() => ({})) as { error?: string };
        throw new Error(b.error ?? 'Failed to get upload URL');
      }
      const { uploadURL, objectPath } = await metaRes.json() as { uploadURL: string; objectPath: string };

      // PUT to presigned URL
      const putRes = await fetch(uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: blob,
      });
      if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status}`);

      onChange(objectPath);
      setAutoPhase({ phase: 'dismissed' }); // preview cleared — value now set
    } catch (e) {
      setAutoError(e instanceof Error ? e.message : 'Save failed');
      setAutoPhase({ phase: 'preview', imageBase64, phrase }); // restore preview
    }
  }

  async function handleRegenerateAuto() {
    if (!stepContent) return;
    autoTriggeredRef.current = true; // keep guard set — this is an explicit retry
    // Use the admin's custom phrase if they've typed one; otherwise let AI pick.
    const override = customPhrase.trim() || undefined;
    triggerAutoGenerate(stepContent.trim(), override);
  }

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

  // ── When a manually generated image is accepted ────────────────────────────
  function handleGenerated(path: string | null) {
    onChange(path);
    setMode('upload'); // return to upload view so the saved image shows
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const imageUrl = value ? getApiUrl('/api/storage' + value) : null;

  // ── Auto-generate preview panel ───────────────────────────────────────────
  // Shown instead of the normal upload/generate UI while auto-gen is in progress
  // or has produced a result to review. Hidden once dismissed or after value is set.
  const showAutoPanel =
    !value &&
    (autoPhase.phase === 'generating' ||
      autoPhase.phase === 'preview' ||
      autoPhase.phase === 'saving');

  if (showAutoPanel) {
    const isGenerating = autoPhase.phase === 'generating';
    const isSaving     = autoPhase.phase === 'saving';
    const previewB64   = autoPhase.phase === 'preview' || autoPhase.phase === 'saving'
      ? autoPhase.imageBase64 : null;

    return (
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-teal-600 shrink-0" />
          <span className="text-[13px] font-medium text-gray-700">
            {isGenerating ? 'Generating share image…' : 'Share image ready to review'}
          </span>
        </div>

        {/* Image / spinner */}
        <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50 aspect-square flex items-center justify-center">
          {previewB64 ? (
            <img
              src={`data:image/png;base64,${previewB64}`}
              alt="Auto-generated share image"
              className="w-full h-full object-cover block"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
              <span className="text-[12px]">Picking the best phrase and generating…</span>
            </div>
          )}
        </div>

        {/* Editable phrase — shown once preview is ready */}
        {!isGenerating && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
              Text on image
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={customPhrase}
                onChange={(e) => setCustomPhrase(e.target.value)}
                placeholder="Type a phrase to use instead…"
                disabled={isSaving}
                className="flex-1 text-[13px] px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleRegenerateAuto}
                disabled={isSaving || isGenerating}
                className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-[12px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 shrink-0"
                title={customPhrase.trim() ? 'Regenerate using your text' : 'Regenerate with a new AI phrase'}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {customPhrase.trim() ? 'Use this text' : 'Try again'}
              </button>
            </div>
            <p className="text-[11px] text-gray-400">
              Edit the text above and click "Use this text" to regenerate with your own words.
            </p>
          </div>
        )}

        {/* Primary actions */}
        <div className="grid grid-cols-3 gap-2">
          {/* Use this image */}
          <button
            type="button"
            onClick={handleAcceptAutoImage}
            disabled={isSaving || isGenerating || !previewB64}
            className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg text-[12px] font-medium bg-teal-600 text-white hover:bg-teal-700 transition-colors disabled:opacity-40"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            {isSaving ? 'Saving…' : 'Use this image'}
          </button>

          {/* Upload your own */}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isSaving}
            className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg text-[12px] font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            <Upload className="w-4 h-4" />
            Upload image
          </button>

          {/* No image */}
          <button
            type="button"
            onClick={() => { setAutoPhase({ phase: 'dismissed' }); setAutoError(''); }}
            disabled={isSaving}
            className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg text-[12px] font-medium border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-40"
          >
            <Ban className="w-4 h-4" />
            No image
          </button>
        </div>

        {autoError && <p className="text-[12px] text-red-500">{autoError}</p>}
      </div>
    );
  }

  // ── Standard render ───────────────────────────────────────────────────────

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
          {/* Mode toggle tabs — we're in the 'upload' branch here, so Upload is always active */}
          <div className="flex rounded-xl overflow-hidden border border-gray-200 text-[13px] font-medium">
            <button
              type="button"
              onClick={() => setMode('upload')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors bg-gray-100 text-gray-900"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Image
            </button>
            <button
              type="button"
              onClick={() => setMode('generate')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors text-gray-500 hover:bg-gray-50"
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
