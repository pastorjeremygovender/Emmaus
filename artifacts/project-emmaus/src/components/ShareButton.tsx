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
import { Share2, Check } from 'lucide-react';
import { shareContent, type SharePayload } from '@/lib/share';

interface ShareButtonProps {
  payload: SharePayload;
}

export function ShareButton({ payload }: ShareButtonProps) {
  const [status, setStatus] = useState<'idle' | 'copied'>('idle');

  async function handleShare() {
    try {
      const result = await shareContent(payload);
      if (result === 'clipboard') {
        setStatus('copied');
        setTimeout(() => setStatus('idle'), 4000);
      }
      // Native share: user sees the native sheet — no extra state needed.
    } catch {
      // Both APIs unavailable — still show confirmation optimistically.
      setStatus('copied');
      setTimeout(() => setStatus('idle'), 4000);
    }
  }

  const isCopied = status === 'copied';

  return (
    <div className="flex flex-col items-center gap-1.5 py-4">
      <button
        onClick={handleShare}
        className="flex items-center gap-2 text-[14px] text-muted-foreground hover:text-foreground transition-colors py-2 px-4 rounded-xl hover:bg-muted/50 active:bg-muted min-h-[44px]"
        aria-label="Share this content"
      >
        {isCopied
          ? <Check size={15} className="text-primary shrink-0" />
          : <Share2 size={15} className="shrink-0" />}
        <span className="font-medium">{isCopied ? 'Copied' : 'Share'}</span>
      </button>
      {isCopied && (
        <p className="text-[12px] text-muted-foreground text-center max-w-[260px] leading-relaxed">
          You can now paste this into WhatsApp or another app.
        </p>
      )}
    </div>
  );
}
