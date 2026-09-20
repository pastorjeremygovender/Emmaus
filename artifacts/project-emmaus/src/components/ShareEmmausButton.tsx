import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { shareContent } from '@/lib/share';
import { EMMAUS_APP_URL } from '@/lib/canonical-app';

/**
 * App-level invitation share for the main member screens.
 * Unlike ShareButton, this always points to Emmaus itself rather than
 * sharing the page or content currently being viewed.
 */
export function ShareEmmausButton({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<'idle' | 'copied'>('idle');

  async function handleShare() {
    try {
      const result = await shareContent({
        title: 'Emmaus',
        reflection: 'Walk with Jesus each day in Emmaus. Open Emmaus on the web or install the app.',
        deepLink: EMMAUS_APP_URL,
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

  return (
    <button
      type="button"
      onClick={handleShare}
      className={`flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/5 active:bg-primary/10 ${
        compact ? 'min-h-[40px] min-w-[40px]' : 'min-h-[44px] min-w-[44px]'
      }`}
      aria-label={status === 'copied' ? 'Emmaus link copied' : 'Share Emmaus'}
      title={status === 'copied' ? 'Link copied' : 'Share Emmaus'}
    >
      <Share2 size={compact ? 17 : 19} aria-hidden="true" />
    </button>
  );
}
