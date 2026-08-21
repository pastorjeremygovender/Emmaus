/**
 * ShareButton — reusable share action for all Emmaus content readers.
 *
 * Behaviour:
 *   1. Tries Web Share API (native sheet).
 *   2. Falls back to clipboard + shows a clear confirmation message.
 *
 * Placement: above the primary CTA (Continue / Finished) in the footer
 * area of each supported reader. Never fixed-position — cannot be
 * obscured by the Ask Emmaus FAB.
 */

import { useState } from 'react';
import { Share2, Check, Facebook, Instagram, Link2 } from 'lucide-react';
import { shareContent, buildShareText, type SharePayload } from '@/lib/share';
import { getApiUrl } from '@/lib/api';

interface ShareButtonProps {
  payload: SharePayload;
  /** Optional share image used by the Instagram action. */
  shareImageUrl?: string | null;
}

export function ShareButton({ payload, shareImageUrl }: ShareButtonProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'saved'>('idle');
  const [menuOpen, setMenuOpen] = useState(false);

  function showStatus(next: 'copied' | 'saved') {
    setStatus(next);
    window.setTimeout(() => setStatus('idle'), 4000);
  }

  async function handleNativeShare() {
    setMenuOpen(false);
    try {
      const result = await shareContent(payload);
      if (result === 'clipboard') showStatus('copied');
    } catch {
      showStatus('copied');
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildShareText(payload));
    } catch {
      const el = document.createElement('textarea');
      el.value = buildShareText(payload);
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setMenuOpen(false);
    showStatus('copied');
  }

  function handleFacebook() {
    const link = payload.deepLink || window.location.href;
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
      '_blank',
      'noopener,noreferrer,width=600,height=700',
    );
    setMenuOpen(false);
  }

  async function handleInstagram() {
    setMenuOpen(false);
    if (!shareImageUrl) {
      showStatus('saved');
      return;
    }

    const imageUrl = getApiUrl('/api/storage' + shareImageUrl);
    try {
      const res = await fetch(imageUrl, { credentials: 'include' });
      if (!res.ok) throw new Error('Unable to load share image');
      const blob = await res.blob();
      const ext = blob.type === 'image/png' ? '.png' : blob.type === 'image/webp' ? '.webp' : '.jpg';
      const file = new File([blob], `emmaus-share${ext}`, { type: blob.type || 'image/jpeg' });
      if (
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({ files: [file], title: payload.dayTitle ?? payload.title });
        return;
      }
      throw new Error('Image sharing is not supported on this device');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      const a = document.createElement('a');
      a.href = imageUrl;
      a.download = 'emmaus-share.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showStatus('saved');
    }
  }

  const statusLabel = status === 'copied' ? 'Copied' : status === 'saved' ? 'Image saved' : 'Share';

  return (
    <div className="flex flex-col items-center gap-1.5 py-4">
      <button
        onClick={() => setMenuOpen(open => !open)}
        className="flex items-center gap-2 text-[14px] text-muted-foreground hover:text-foreground transition-colors py-2 px-4 rounded-xl hover:bg-muted/50 active:bg-muted min-h-[44px]"
        aria-label="Share this content"
        aria-expanded={menuOpen}
      >
        {status !== 'idle'
          ? <Check size={15} className="text-primary shrink-0" />
          : <Share2 size={15} className="shrink-0" />}
        <span className="font-medium">{statusLabel}</span>
      </button>

      {menuOpen && (
        <div className="w-full max-w-[280px] rounded-2xl border border-border bg-background shadow-lg p-1.5" role="menu">
          <button onClick={handleNativeShare} role="menuitem" className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-[14px] hover:bg-muted/60">
            <Share2 size={16} className="shrink-0" />
            <span>Share from device</span>
          </button>
          <button onClick={handleCopy} role="menuitem" className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-[14px] hover:bg-muted/60">
            <Link2 size={16} className="shrink-0" />
            <span>Copy link</span>
          </button>
          <button onClick={handleFacebook} role="menuitem" className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-[14px] hover:bg-muted/60">
            <Facebook size={16} className="shrink-0" />
            <span>Share to Facebook</span>
          </button>
          {shareImageUrl && (
            <button onClick={handleInstagram} role="menuitem" className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-[14px] hover:bg-muted/60">
              <Instagram size={16} className="shrink-0" />
              <span>Share image to Instagram</span>
            </button>
          )}
        </div>
      )}

      {status !== 'idle' && (
        <p className="text-[12px] text-muted-foreground text-center max-w-[260px] leading-relaxed">
          {status === 'copied'
            ? 'You can now paste this into WhatsApp or another app.'
            : 'Image saved. Open Instagram to share it.'}
        </p>
      )}
    </div>
  );
}
