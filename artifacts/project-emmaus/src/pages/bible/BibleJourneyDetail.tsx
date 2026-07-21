import { useParams, useLocation } from 'wouter';
import { ArrowLeft, CheckCircle2, BookOpen, ChevronRight, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { getBibleJourney, getJohnChapter } from '@/lib/bible-data';
import { useBible } from '@/contexts/BibleContext';
import { BottomNav } from '@/components/BottomNav';

const JOHN_HEADINGS: Record<number, string> = {
  1: 'The Word Became Flesh', 2: 'Water into Wine', 3: 'Jesus and Nicodemus',
  4: 'The Woman at the Well', 5: 'Healing at the Pool', 6: 'Bread of Life',
  7: 'Jesus at the Festival', 8: 'Light of the World', 9: 'The Man Born Blind',
  10: 'The Good Shepherd', 11: 'The Raising of Lazarus', 12: 'The Triumphal Entry',
  13: 'Jesus Washes Feet', 14: 'Jesus Comforts His Disciples', 15: 'The Vine and the Branches',
  16: 'The Holy Spirit', 17: 'Jesus Prays', 18: 'The Arrest and Trial',
  19: 'The Crucifixion', 20: 'The Resurrection', 21: 'Jesus by the Sea',
};

const JOHN_MINUTES: Record<number, number> = {
  1: 7, 2: 4, 3: 5, 4: 7, 5: 6, 6: 9, 7: 7, 8: 8,
  9: 6, 10: 6, 11: 7, 12: 7, 13: 5, 14: 4, 15: 4,
  16: 5, 17: 4, 18: 5, 19: 6, 20: 4, 21: 4,
};

export default function BibleJourneyDetail() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const [, setLocation] = useLocation();
  const journey = getBibleJourney(journeyId || 'walk-through-john');

  const {
    startBibleJourney,
    getJourneyProgress,
    markJourneyChapterComplete,
    isChapterComplete,
  } = useBible();

  const progress = getJourneyProgress(journeyId || 'walk-through-john');

  if (!journey) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-8 bg-background">
        <div className="text-center space-y-4">
          <p className="text-[17px] text-muted-foreground">Journey not found.</p>
          <Button variant="outline" onClick={() => setLocation('/bible')}>Back to Bible</Button>
        </div>
      </div>
    );
  }

  if (!journey.available) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-8 bg-background">
        <div className="text-center space-y-4 max-w-[300px]">
          <h2 className="text-[22px] font-serif font-semibold">{journey.title}</h2>
          <p className="text-[15px] text-muted-foreground">{journey.description}</p>
          <p className="text-[14px] text-primary font-medium">Coming soon</p>
          <Button variant="outline" onClick={() => setLocation('/bible')}>Back to Bible</Button>
        </div>
      </div>
    );
  }

  function handleStart() {
    startBibleJourney(journey!.id);
    setLocation(`/bible/read/${journey!.bookId}/1?journey=${journey!.id}`);
  }

  function handleContinue() {
    const ch = progress?.currentChapter ?? 1;
    setLocation(`/bible/read/${journey!.bookId}/${ch}?journey=${journey!.id}`);
  }

  const completedCount = progress?.completedChapters.length ?? 0;
  const pct = Math.round((completedCount / journey.chapterCount) * 100);
  const totalMinutes = Object.values(JOHN_MINUTES).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[520px] mx-auto">
          <button
            onClick={() => setLocation('/bible')}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ArrowLeft size={22} />
          </button>
          <h1 className="flex-1 text-center text-[17px] font-semibold text-foreground">
            Bible Journey
          </h1>
          <div className="min-w-[44px]" />
        </div>
      </header>

      <main className="px-5 pt-6 max-w-[520px] mx-auto space-y-7">

        {/* Journey hero */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <div className="space-y-1">
            <div className="text-[11px] font-semibold text-primary uppercase tracking-widest">
              Bible Journey · {journey.coverLabel}
            </div>
            <h2 className="text-[28px] font-serif font-semibold leading-tight">{journey.title}</h2>
            <p className="text-[15px] text-muted-foreground leading-relaxed">{journey.description}</p>
          </div>

          <div className="flex items-center gap-4 text-[13px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <BookOpen size={14} />
              {journey.chapterCount} chapters
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={14} />
              ~{totalMinutes} min total
            </span>
          </div>

          {/* Progress */}
          {progress && (
            <div className="space-y-1.5">
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[12px] text-muted-foreground">
                {completedCount} of {journey.chapterCount} chapters completed
                {completedCount > 0 && ` · ${pct}%`}
              </p>
            </div>
          )}

          {/* CTA */}
          {!progress ? (
            <Button className="w-full h-12 rounded-xl text-[16px]" onClick={handleStart}>
              <BookOpen size={17} className="mr-2" />
              Start Walk Through John
            </Button>
          ) : completedCount === journey.chapterCount ? (
            <div className="flex items-center gap-2.5 p-4 bg-primary/8 border border-primary/20 rounded-xl">
              <CheckCircle2 size={20} className="text-primary shrink-0" />
              <p className="text-[15px] font-medium text-primary">You have completed Walk Through John.</p>
            </div>
          ) : (
            <Button className="w-full h-12 rounded-xl text-[16px]" onClick={handleContinue}>
              <BookOpen size={17} className="mr-2" />
              Continue — John {progress.currentChapter}
            </Button>
          )}
        </motion.section>

        {/* Chapter list */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Chapters
          </h2>
          <div className="divide-y divide-border/60 rounded-xl border border-border overflow-hidden">
            {Array.from({ length: journey.chapterCount }, (_, i) => i + 1).map(ch => {
              const completedViaJourney = progress?.completedChapters.includes(ch);
              const completedStandalone = isChapterComplete(journey.bookId, ch);
              const done = completedViaJourney || completedStandalone;
              const isCurrent = progress?.currentChapter === ch && !done;
              const isLocked = progress ? ch > (progress.currentChapter) : ch > 1;
              const heading = JOHN_HEADINGS[ch] ?? `Chapter ${ch}`;
              const mins = JOHN_MINUTES[ch] ?? 5;

              return (
                <div
                  key={ch}
                  onClick={() => {
                    if (!progress) { startBibleJourney(journey.id); }
                    setLocation(`/bible/read/${journey.bookId}/${ch}?journey=${journey.id}`);
                  }}
                  className={[
                    'flex items-center gap-3 px-4 py-3.5 bg-card transition-colors cursor-pointer',
                    !isLocked || done ? 'hover:bg-muted/40 active:bg-muted/60' : 'opacity-50',
                  ].join(' ')}
                >
                  {/* Status indicator */}
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                    {done ? (
                      <CheckCircle2 size={20} className="text-primary" />
                    ) : isCurrent ? (
                      <div className="w-8 h-8 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
                        <span className="text-[12px] font-bold text-primary">{ch}</span>
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-[12px] font-semibold text-muted-foreground">{ch}</span>
                      </div>
                    )}
                  </div>

                  {/* Chapter info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium text-foreground leading-tight">{heading}</div>
                    <div className="text-[12px] text-muted-foreground mt-0.5">{mins} min</div>
                  </div>

                  {isCurrent && !done && (
                    <span className="shrink-0 text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      Next
                    </span>
                  )}
                  {!isCurrent && !done && !isLocked && (
                    <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                  )}
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
