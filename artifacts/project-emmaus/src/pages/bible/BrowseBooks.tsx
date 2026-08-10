import { useLocation } from 'wouter';
import { useEffect } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { BIBLE_BOOKS } from '@/lib/bible-data';
import { useBible } from '@/contexts/BibleContext';
import { BottomNav } from '@/components/BottomNav';

const OT_BOOKS = BIBLE_BOOKS.filter(b => b.testament === 'OT');
const NT_BOOKS = BIBLE_BOOKS.filter(b => b.testament === 'NT');

export default function BrowseBooks() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const [, setLocation] = useLocation();
  const { isChapterComplete } = useBible();

  function progressForBook(bookId: string, totalChapters: number): number {
    let done = 0;
    for (let i = 1; i <= totalChapters; i++) {
      if (isChapterComplete(bookId, i)) done++;
    }
    return done;
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[520px] mx-auto">
          <button
            onClick={() => { if (window.history.length > 1) window.history.back(); else setLocation('/bible'); }}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft size={22} />
          </button>
          <h1 className="flex-1 text-center text-[17px] font-semibold text-foreground">Browse Books</h1>
          <div className="min-w-[44px]" />
        </div>
      </header>

      <main className="px-5 pt-6 max-w-[520px] mx-auto space-y-8 pb-8">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Old Testament</h2>
            <span className="text-[11px] text-muted-foreground">{OT_BOOKS.length} books</span>
          </div>
          <div className="divide-y divide-border/60 rounded-xl border border-border overflow-hidden">
            {OT_BOOKS.map(book => (
              <BookRow
                key={book.id}
                book={book}
                progress={progressForBook(book.id, book.chapters)}
                onTap={() => setLocation(`/bible/books/${book.id}`)}
              />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">New Testament</h2>
            <span className="text-[11px] text-muted-foreground">{NT_BOOKS.length} books</span>
          </div>
          <div className="divide-y divide-border/60 rounded-xl border border-border overflow-hidden">
            {NT_BOOKS.map(book => (
              <BookRow
                key={book.id}
                book={book}
                progress={progressForBook(book.id, book.chapters)}
                onTap={() => setLocation(`/bible/books/${book.id}`)}
              />
            ))}
          </div>
        </section>
      </main>
      <BottomNav />
    </div>
  );
}

function BookRow({
  book,
  progress,
  onTap,
}: {
  book: typeof BIBLE_BOOKS[0];
  progress: number;
  onTap: () => void;
}) {
  const pct = Math.round((progress / book.chapters) * 100);

  return (
    <div
      onClick={onTap}
      className="flex items-center gap-3 px-4 py-3 bg-card cursor-pointer hover:bg-muted/40 active:bg-muted/60 transition-colors"
    >
      <div className="w-10 text-right shrink-0">
        <span className="text-[12px] font-semibold text-muted-foreground">{book.shortName}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-medium text-foreground leading-tight">{book.name}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {book.chapters} {book.chapters === 1 ? 'chapter' : 'chapters'}
          {book.genre ? ` · ${book.genre}` : ''}
        </div>
        {progress > 0 && (
          <div className="mt-1.5 h-1 w-full max-w-[120px] bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div className="shrink-0">
        {progress === book.chapters ? (
          <CheckCircle2 size={17} className="text-primary" />
        ) : progress > 0 ? (
          <span className="text-[11px] font-medium text-primary">{pct}%</span>
        ) : null}
      </div>
    </div>
  );
}
