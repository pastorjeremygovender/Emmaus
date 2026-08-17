/**
 * ShareImageCard — member-facing share image display.
 *
 * Renders a square image with Save + Share actions.
 * Tapping the image opens a full-screen lightbox.
 * Returns null when shareImageUrl is falsy — zero layout change for content without an image.
 */

import React, { useState } from 'react';
import { Download, Share2, X } from 'lucide-react';
import { getApiUrl } from '@/lib/api';

interface ShareImageCardProps {
  /** Object-storage path, e.g. "/objects/uploads/<uuid>". Falsy → renders nothing. */
  shareImageUrl?: string | null;
}

export function ShareImageCard({ shareImageUrl }: ShareImageCardProps) {
  const [imgError, setImgError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!shareImageUrl) return null;

  const imageUrl = getApiUrl('/api/storage' + shareImageUrl);

  if (imgError) return null;

  async function handleSave() {
    try {
      const res = await fetch(imageUrl, { credentials: 'include' });
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      const ext = blob.type === 'image/png' ? '.png' : blob.type === 'image/webp' ? '.webp' : '.jpg';
      a.download = `emmaus-share${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(imageUrl, '_blank');
    }
  }

  async function handleShare() {
    try {
      const res = await fetch(imageUrl, { credentials: 'include' });
      const blob = await res.blob();
      const ext = blob.type === 'image/png' ? '.png' : blob.type === 'image/webp' ? '.webp' : '.jpg';
      const file = new File([blob], `emmaus-share${ext}`, { type: blob.type || 'image/jpeg' });
      if (
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch {
      // fall through
    }
    await handleSave();
  }

  return (
    <>
      <section className="mb-8">
        {/* Image — tap to open lightbox */}
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="w-full rounded-2xl overflow-hidden bg-muted aspect-square block cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="View full size"
        >
          <img
            src={imageUrl}
            alt=""
            className="w-full h-full object-cover block"
            loading="eager"
            onError={() => setImgError(true)}
          />
        </button>

        {/* Actions */}
        <div className="flex gap-3 mt-3">
          <button
            onClick={handleSave}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-medium border border-border text-foreground hover:bg-muted/60 active:scale-[0.97] transition-all"
          >
            <Download className="w-4 h-4" />
            Save Image
          </button>
          <button
            onClick={handleShare}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97] transition-all"
          >
            <Share2 className="w-4 h-4" />
            Share Image
          </button>
        </div>
      </section>

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxOpen(false)}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Full image — constrained to viewport, never overflows */}
          <img
            src={imageUrl}
            alt=""
            className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
