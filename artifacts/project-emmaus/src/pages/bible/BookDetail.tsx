import { useParams, useLocation } from 'wouter';
import { ArrowLeft, CheckCircle2, BookOpen, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getBibleBook, getBibleJourney, BIBLE_JOURNEYS } from '@/lib/bible-data';
import { getChapter } from '@/lib/bible-provider';
import { LUKE_HEADINGS } from '@/data/kjv-luke';
import { JOHN_HEADINGS } from '@/data/kjv-john';
import { useBible } from '@/contexts/BibleContext';
import { BottomNav } from '@/components/BottomNav';

function getChapterHeading(bookId: string, ch: number): string {
  if (bookId === 'luke') return LUKE_HEADINGS[ch] ?? `Chapter ${ch}`;
  if (bookId === 'john') return JOHN_HEADINGS[ch] ?? `Chapter ${ch}`;
  const data = getChapter(bookId, ch);
  return data?.heading ?? `Chapter ${ch}`;
}

export default function BookDetail() {
  const { bookId } = useParams<{ bookId: string }>();
  const [, setLocation] = useLocation();
  const { isChapterComplete, readingHistory, getJourneyProgress } = useBible();

  const resolvedBookId = bookId || 'luke';
  const book = getBibleBook(resolvedBookId);
  const journey = BIBLE_JOURNEYS.find(j => j.bookId === resolvedBookId && j.available);
  const journeyProg = journey ? getJourneyProgress(journey.id) : null;

  if (!book || !book.available) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-8 bg-background">
        <div className="text-center space-y-4">
          <p className="text-[17px] text-muted-foreground">This book isn't available yet.</p>
          <Button variant="outline" onClick={() => setLocation('/bible/books')}>
            Browse Books
          </Button>
        </div>
      </div>
    );
  }

  const completedCount = Array.from({ length: book.chapters }, (_, i) => i + 1)
    .filter(ch => isChapterComplete(book.id, ch)).length;

  const nextChapter =
    readingHistory?.bookId === book.id
      ? readingHistory.chapter
      : journeyProg?.currentChapter ?? 1;

  function handleStart() {
    setLocation(`/bible/read/${book!.id}/1`);
  }

  function handleContinue() {
    setLocation(`/bible/read/${book!.id}/${nextChapter}`);
  }

  function handleStartJourney() {
    if (journey) setLocation(`/bible/journey/${journey.id}`);
  }

  const bookDisplayName = book.genre === 'Gospel' ? `Gospel of ${book.name}` : book.name;

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[520px] mx-auto">
          <button
            onClick={() => setLocation('/bible/books')}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 text-center">
            <div className="text-[17px] font-semibold text-foreground">{book.name}</div>
          </div>
          <div className="min-w-[44px]" />
        </div>
      </header>

      <main className="px-5 pt-6 max-w-[520px] mx-auto space-y-7">

        {/* Book header */}
        <section className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-[26px] font-serif font-semibold leading-tight">
                {bookDisplayName}
              </h1>
              <p className="text-[13px] text-muted-foreground mt-1">
                {book.chapters} chapters · {book.genre}
              </p>
            </div>
            {completedCount > 0 && (
              <div className="shrink-0 text-right">
                <div className="text-[22px] font-bold text-primary">{completedCount}</div>
                <div className="text-[10px] text-muted-foreground">of {book.chapters} done</div>
              </div>
            )}
          </div>

          {book.description && (
            <p className="text-[15px] leading-[1.65] text-muted-foreground">
              {book.description}
            </p>
          )}

          {/* Progress bar */}
          {completedCount > 0 && (
            <div className="space-y-1">
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${(completedCount / book.chapters) * 100}%` }}
                />
              </div>
              <p className="text-[12px] text-muted-foreground">{completedCount} of {book.chapters} chapters read</p>
            </div>
          )}
        </section>

        {/* Actions */}
        <section className="flex flex-col gap-2.5">
          {completedCount === 0 ? (
            <Button className="h-12 rounded-xl text-[16px]" onClick={handleStart}>
              <BookOpen size={17} className="mr-2" />
              Start Reading {book.name}
            </Button>
          ) : (
            <Button className="h-12 rounded-xl text-[16px]" onClick={handleContinue}>
              <BookOpen size={17} className="mr-2" />
              Continue — {book.name} {nextChapter}
            </Button>
          )}
          {journey && (
            <Button variant="outline" className="h-11 rounded-xl" onClick={handleStartJourney}>
              {journeyProg ? 'Continue Bible Journey' : 'Start Bible Journey'}
            </Button>
          )}
        </section>

        {/* Chapter list */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Chapters
          </h2>
          <div className="divide-y divide-border/60 rounded-xl border border-border overflow-hidden">
            {Array.from({ length: book.chapters }, (_, i) => i + 1).map(ch => {
              const done = isChapterComplete(book.id, ch);
              const heading = getChapterHeading(book.id, ch);
              const chapterData = getChapter(book.id, ch);
              const isPlaceholder = chapterData?.isPlaceholder ?? false;

              return (
                <div
                  key={ch}
                  onClick={() => setLocation(`/bible/read/${book.id}/${ch}`)}
                  className="flex items-center gap-3 px-4 py-3.5 bg-card hover:bg-muted/40 active:bg-muted/60 cursor-pointer transition-colors"
                >
                  {/* Chapter number / status */}
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    {done ? (
                      <CheckCircle2 size={16} className="text-primary" />
                    ) : (
                      <span className="text-[13px] font-semibold text-muted-foreground">{ch}</span>
                    )}
                  </div>

                  {/* Title */}
                  <div className="flex-1 min-w-0">
                    <div className={[
                      'text-[15px] font-medium leading-tight',
                      isPlaceholder ? 'text-muted-foreground' : 'text-foreground',
                    ].join(' ')}>
                      {heading}
                    </div>
                    {isPlaceholder && (
                      <div className="text-[11px] text-muted-foreground/70 mt-0.5">Coming soon</div>
                    )}
                  </div>

                  <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                </div>
              );
            })}
          </div>
        </section>

      </main>
      <BottomNav />
    </div>
  );
}
