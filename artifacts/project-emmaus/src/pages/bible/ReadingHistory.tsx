import { useLocation } from 'wouter';
import { ArrowLeft, BookOpen, Clock } from 'lucide-react';
import { useBible } from '@/contexts/BibleContext';
import { BottomNav } from '@/components/BottomNav';

function formatRelativeDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch { return ''; }
}

export default function ReadingHistory() {
  const [, setLocation] = useLocation();
  const { readingHistory } = useBible();

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[520px] mx-auto">
          <button
            onClick={() => setLocation('/bible')}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft size={22} />
          </button>
          <h1 className="flex-1 text-center text-[17px] font-semibold text-foreground">Reading History</h1>
          <div className="min-w-[44px]" />
        </div>
      </header>

      <main className="px-5 pt-6 max-w-[520px] mx-auto">
        {readingHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center">
              <Clock size={20} className="text-muted-foreground" />
            </div>
            <p className="text-[16px] font-medium text-foreground">No reading history yet</p>
            <p className="text-[14px] text-muted-foreground">Chapters you read will appear here.</p>
            <button
              onClick={() => setLocation('/bible/books')}
              className="text-[14px] text-primary font-medium"
            >
              Browse Books
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Recent Reading
            </p>
            <div className="divide-y divide-border/60 rounded-xl border border-border overflow-hidden">
              {readingHistory.map((entry, i) => (
                <div
                  key={`${entry.bookId}-${entry.chapter}-${entry.openedAt}`}
                  onClick={() => setLocation(`/bible/read/${entry.bookId}/${entry.chapter}`)}
                  className="flex items-center gap-3 px-4 py-3.5 bg-card hover:bg-muted/40 active:bg-muted/60 cursor-pointer transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    {i === 0 ? (
                      <BookOpen size={16} className="text-primary" />
                    ) : (
                      <span className="text-[12px] font-semibold text-muted-foreground">{i + 1}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-primary uppercase tracking-widest">
                      {entry.bookName} {entry.chapter}
                    </div>
                    <div className="text-[14px] font-medium text-foreground truncate">
                      {entry.chapterHeading}
                    </div>
                  </div>
                  <div className="shrink-0 text-[11px] text-muted-foreground">
                    {formatRelativeDate(entry.openedAt)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
