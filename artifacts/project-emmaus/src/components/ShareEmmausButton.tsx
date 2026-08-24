import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { shareContent } from '@/lib/share';

/**
 * App-level invitation share for the main member screens.
 * Unlike ShareButton, this always points to Emmaus itself rather than
 * sharing the page or content currently being viewed.
 */
export function ShareEmmausButton() {
  const [status, setStatus] = useState<'idle' | 'copied'>('idle');

  async function handleShare() {
    try {
      const appUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
      const result = await shareContent({
        title: 'Emmaus',
        reflection: 'Walk with Jesus each day in Emmaus.',
        deepLink: appUrl,
      });
      if (result === 'clipboard') {
        setStatus('copied');
        window.setTimeout(() => setStatus('idle'), 4000);
      }
    } catch {
      setStatus('copied');
      window.setTimeout(() => setStatus('idle'), 4000);
    }
  }

  const isCopied = status === 'copied';

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleShare}
        className="flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium text-primary transition-colors hover:bg-primary/5 active:bg-primary/10"
        aria-label="Share Emmaus"
      >
        {isCopied ? <Check size={15} aria-hidden="true" /> : <Share2 size={15} aria-hidden="true" />}
        <span>{isCopied ? 'Link copied' : 'Share Emmaus'}</span>
      </button>
      {isCopied && (
        <p className="pr-1 text-right text-[11px] leading-tight text-muted-foreground">
          Paste it into WhatsApp or another app.
        </p>
      )}
    </div>
  );
}