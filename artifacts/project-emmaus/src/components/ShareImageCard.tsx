/**
 * ShareImageCard — member-facing "Take this with you" share image display.
 *
 * Renders a portrait image with Save + Share actions.
 * Returns null when shareImageUrl is falsy — zero layout change for content without an image.
 *
 * Usage:
 *   <ShareImageCard shareImageUrl={step.shareImageUrl} />
 */

import React from 'react';
import { Download, Share2 } from 'lucide-react';
import { getApiUrl } from '@/lib/api';

interface ShareImageCardProps {
  /** Object-storage path, e.g. "/objects/uploads/<uuid>". Falsy → renders nothing. */
  shareImageUrl?: string | null;
}

export function ShareImageCard({ shareImageUrl }: ShareImageCardProps) {
  if (!shareImageUrl) return null;

  // The API server serves objects at /storage/objects/* — same pattern as rooms media.
  const imageUrl = getApiUrl('/storage' + shareImageUrl);

  async function handleSave() {
    try {
      const res = await fetch(imageUrl, { credentials: 'include' });
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      // Infer a file extension from MIME type; default to .jpg
      const ext = blob.type === 'image/png' ? '.png' : blob.type === 'image/webp' ? '.webp' : '.jpg';
      a.download = `emmaus-share${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Fallback: open in a new tab so the user can long-press / right-click to save
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
      // Fall through to save-as-download
    }
    await handleSave();
  }

  return (
    <section className="mb-8">
      <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Take this with you
      </p>

      {/* Image — square 1:1 canvas */}
      <div className="rounded-2xl overflow-hidden bg-muted aspect-square">
        <img
          src={imageUrl}
          alt=""
          className="w-full h-full object-cover block"
          loading="lazy"
        />
      </div>

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
          Share
        </button>
      </div>
    </section>
  );
}
