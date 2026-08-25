import { ExternalLink, Headphones, Mic2, Play } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { SermonRecommendation } from '@/lib/emmaus-client';
import { useLocation } from 'wouter';

function dateLabel(value: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function SermonRecommendationCard({ sermon }: { sermon: SermonRecommendation }) {
  const [, setLocation] = useLocation();

  function open(path: string) {
    if (path.startsWith('/') && !path.includes('\n') && !path.includes('\r')) {
      setLocation(path);
    }
  }

  return (
    <Card className="border-amber-200/60 dark:border-amber-800/40 bg-amber-50/40 dark:bg-amber-950/15">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
          <Mic2 size={14} aria-hidden="true" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Sermon</span>
        </div>
        <div>
          <button onClick={() => open(sermon.openPath)} className="text-left text-[15px] font-semibold leading-snug hover:underline">
            {sermon.title}
          </button>
          <p className="text-[12px] text-muted-foreground mt-1">
            {sermon.speaker}{sermon.sermonDate ? ` · ${dateLabel(sermon.sermonDate)}` : ''}
          </p>
        </div>
        <p className="text-[13px] text-muted-foreground leading-snug line-clamp-3">{sermon.excerpt}</p>
        <p className="text-[12px] text-muted-foreground/80">{sermon.reason}</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => open(sermon.openPath)} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-amber-700">
            <ExternalLink size={13} /> Open Sermon
          </button>
          <a href={sermon.watchUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/70 px-3 py-2 text-[12px] font-semibold text-amber-800 dark:text-amber-300">
            <Play size={13} /> {sermon.watchTimestampSeconds != null ? `Watch · ${Math.floor(sermon.watchTimestampSeconds / 60)}:${String(Math.floor(sermon.watchTimestampSeconds % 60)).padStart(2, '0')}` : 'Watch'}
          </a>
          {sermon.listenAvailable && sermon.listenPath && (
            <button onClick={() => open(sermon.listenPath!)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] font-semibold text-foreground">
              <Headphones size={13} /> Listen
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}