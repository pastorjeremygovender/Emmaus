import { useLocation } from 'wouter';
import { useBible } from '@/contexts/BibleContext';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Clock, ChevronRight, Bookmark, Heart, BookMarked } from 'lucide-react';
import { BIBLE_JOURNEYS, WEEKLY_MEMORY_VERSE, TODAYS_READING } from '@/lib/bible-data';

export default function Bible() {
  const [, setLocation] = useLocation();
  const { readingHistory, favourites, getJourneyProgress } = useBible();

  const walkThroughJohn = BIBLE_JOURNEYS[0];
  const journeyProg = getJourneyProgress('walk-through-john');

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <main className="px-5 pt-12 max-w-[520px] mx-auto space-y-9">

        {/* Header */}
        <header className="space-y-1">
          <h1 className="text-[30px] font-serif font-medium tracking-tight">Bible</h1>
          <p className="text-[13px] text-muted-foreground">
            King James Version · Public Domain
          </p>
        </header>

        {/* Continue Reading */}
        {readingHistory ? (
          <section className="space-y-3">
            <SectionLabel>Continue Reading</SectionLabel>
            <Card
              className="bg-card border-border cursor-pointer active:scale-[0.98] transition-transform"
              onClick={() => setLocation(`/bible/read/john/${readingHistory.chapter}`)}
            >
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center shrink-0">
                  <BookOpen size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-primary uppercase tracking-widest mb-0.5">
                    {readingHistory.bookName} {readingHistory.chapter}
                  </div>
                  <div className="text-[16px] font-medium text-foreground truncate">
                    {readingHistory.chapterHeading}
                  </div>
                </div>
                <Button size="sm" className="shrink-0 rounded-xl h-9 px-4">
                  Continue
                </Button>
              </CardContent>
            </Card>
          </section>
        ) : (
          <section className="space-y-3">
            <SectionLabel>Begin Reading</SectionLabel>
            <Card
              className="bg-card border-border cursor-pointer"
              onClick={() => setLocation('/bible/read/john/1')}
            >
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center shrink-0">
                  <BookOpen size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-primary uppercase tracking-widest mb-0.5">
                    Start here
                  </div>
                  <div className="text-[16px] font-medium text-foreground">
                    John 1 — The Word Became Flesh
                  </div>
                </div>
                <ChevronRight size={18} className="text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          </section>
        )}

        {/* Today's Reading */}
        <section className="space-y-3">
          <SectionLabel>Today's Reading</SectionLabel>
          <Card
            className="bg-card border-border cursor-pointer active:scale-[0.98] transition-transform"
            onClick={() => setLocation(`/bible/read/${TODAYS_READING.bookId}/${TODAYS_READING.chapter}`)}
          >
            <CardContent className="p-5 space-y-3">
              <div>
                <div className="text-[11px] font-semibold text-primary uppercase tracking-widest mb-1">
                  John {TODAYS_READING.chapter}
                </div>
                <div className="text-[17px] font-medium text-foreground">
                  {TODAYS_READING.heading}
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 text-[13px] text-muted-foreground">
                  <Clock size={13} />
                  <span>Approx. {TODAYS_READING.readingMinutes} minutes</span>
                </div>
              </div>
              <Button variant="outline" className="w-full rounded-xl h-10" size="sm">
                Read
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* Bible Journeys */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Bible Journeys</SectionLabel>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-5 px-5 scrollbar-none">
            {BIBLE_JOURNEYS.map(journey => (
              <div
                key={journey.id}
                onClick={() => journey.available && setLocation(`/bible/journey/${journey.id}`)}
                className={[
                  'shrink-0 w-[200px] rounded-2xl border p-4 space-y-2 transition-all',
                  journey.available
                    ? 'bg-card border-border cursor-pointer active:scale-[0.97]'
                    : 'bg-muted/30 border-border/50 opacity-60',
                ].join(' ')}
              >
                <div className="text-[10px] font-semibold text-primary uppercase tracking-widest">
                  {journey.coverLabel ?? journey.subtitle}
                </div>
                <div className="text-[15px] font-serif font-semibold leading-tight text-foreground">
                  {journey.title}
                </div>
                <div className="text-[12px] text-muted-foreground leading-snug">
                  {journey.available ? journey.subtitle : 'Coming soon'}
                </div>
                {journey.available && journeyProg && journey.id === 'walk-through-john' && (
                  <div className="pt-1">
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${(journeyProg.completedChapters.length / 21) * 100}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {journeyProg.completedChapters.length} of 21 chapters
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Browse Books */}
        <section className="space-y-3">
          <SectionLabel>Browse Books</SectionLabel>
          <div
            className="p-4 rounded-xl border border-border bg-card flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform"
            onClick={() => setLocation('/bible/books')}
          >
            <div className="flex items-center gap-3">
              <BookMarked size={17} className="text-primary" />
              <div>
                <div className="text-[15px] font-medium text-foreground">Old Testament · New Testament</div>
                <div className="text-[12px] text-muted-foreground">66 books · John available now</div>
              </div>
            </div>
            <ChevronRight size={17} className="text-muted-foreground" />
          </div>
        </section>

        {/* Saved Verses / Bookmarks */}
        <section className="space-y-3">
          <SectionLabel>Saved Verses</SectionLabel>
          {favourites.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-10 border border-dashed border-border rounded-2xl text-center space-y-3">
              <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center text-muted-foreground">
                <Heart size={18} />
              </div>
              <p className="text-[14px] text-muted-foreground leading-relaxed">
                Tap a verse while reading to save it here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {favourites.slice(0, 3).map(fav => (
                <div
                  key={fav.id}
                  className="p-4 rounded-xl border border-border bg-card space-y-1.5 cursor-pointer"
                  onClick={() => setLocation(`/bible/read/${fav.bookId}/${fav.chapter}`)}
                >
                  <div className="text-[11px] font-semibold text-primary uppercase tracking-widest">
                    {fav.bookName} {fav.chapter}:{fav.verse}
                  </div>
                  <p className="text-[14px] font-serif leading-relaxed text-foreground italic line-clamp-2">
                    "{fav.verseText}"
                  </p>
                </div>
              ))}
              {favourites.length > 3 && (
                <button className="text-[13px] text-primary font-medium py-1 w-full text-center hover:underline">
                  View all {favourites.length} saved verses
                </button>
              )}
            </div>
          )}
        </section>

        {/* Memory Verse */}
        <section className="space-y-3 pb-4">
          <SectionLabel>Memory Verse</SectionLabel>
          <div className="p-5 rounded-2xl bg-primary/5 border border-primary/15 space-y-3">
            <div className="text-[11px] font-semibold text-primary uppercase tracking-widest">
              {WEEKLY_MEMORY_VERSE.weekOf}
            </div>
            <p className="font-serif text-[17px] leading-[1.65] text-foreground italic">
              "{WEEKLY_MEMORY_VERSE.text}"
            </p>
            <div className="text-[13px] font-semibold text-primary">
              — {WEEKLY_MEMORY_VERSE.reference}
            </div>
          </div>
        </section>

      </main>
      <BottomNav />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
      {children}
    </h2>
  );
}
