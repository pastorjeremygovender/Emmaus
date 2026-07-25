import { useState } from 'react';
import { useParams, useLocation, useSearch } from 'wouter';
import { Check, ArrowRight, PenLine, ChevronLeft, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { motion } from 'framer-motion';
import { getBibleBook, getNextBook } from '@/lib/bible-data';
import { useBible } from '@/contexts/BibleContext';
import { useChapter } from '@/hooks/useChapter';
import { getChapterStudyPrompts } from '@/data/chapter-study-prompts';

export default function ChapterCompletion() {
  const { bookId, chapter: chapterStr } = useParams<{ bookId: string; chapter: string }>();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const chapterNum = parseInt(chapterStr || '1', 10);
  const queryParams = new URLSearchParams(search);
  const journeyId = queryParams.get('journey');

  const resolvedBookId = bookId || 'luke';
  const book = getBibleBook(resolvedBookId);
  const { saveReflection, getReflection, savePrayer, getPrayer, markJourneyChapterComplete, translationId } = useBible();

  // Load chapter data async for heading + reading minutes
  const { chapter: chapterData } = useChapter(resolvedBookId, chapterNum, translationId);

  const [reflectOpen, setReflectOpen] = useState(false);
  const [prayOpen, setPrayOpen] = useState(false);
  const [deeperOpen, setDeeperOpen] = useState(false);
  const [reflectionText, setReflectionText] = useState(getReflection(resolvedBookId, chapterNum)?.text ?? '');
  const [prayerText, setPrayerText] = useState(getPrayer(resolvedBookId, chapterNum)?.text ?? '');
  const [reflectionSaved, setReflectionSaved] = useState(false);
  const [prayerSaved, setPrayerSaved] = useState(false);

  const isLastChapterOfBook = !book ? false : chapterNum >= book.chapters;
  const nextChapterNum = isLastChapterOfBook ? null : chapterNum + 1;
  const nextBook = isLastChapterOfBook ? getNextBook(resolvedBookId) : null;
  const isLastBookAndChapter = isLastChapterOfBook && !nextBook; // Revelation 22
  const studyPrompts = getChapterStudyPrompts(resolvedBookId, chapterNum);

  const heading = chapterData?.heading ?? `Chapter ${chapterNum}`;
  const readingMinutes = chapterData?.readingMinutes ?? 5;

  function handleFinishForToday() {
    setLocation('/walk');
  }

  function handleNextChapter() {
    if (!book) return;
    if (journeyId) {
      markJourneyChapterComplete(journeyId, chapterNum);
      if (nextChapterNum) {
        setLocation(`/bible/read/${book.id}/${nextChapterNum}?journey=${journeyId}`);
      } else {
        setLocation(`/bible/journey/${journeyId}`);
      }
    } else {
      if (nextChapterNum) {
        setLocation(`/bible/read/${book.id}/${nextChapterNum}`);
      }
    }
  }

  function handleNextBook() {
    if (!nextBook) return;
    setLocation(`/bible/read/${nextBook.id}/1`);
  }

  function handleSaveReflection() {
    if (!reflectionText.trim()) return;
    saveReflection(resolvedBookId, chapterNum, reflectionText.trim());
    setReflectionSaved(true);
  }

  function handleSavePrayer() {
    savePrayer(resolvedBookId, chapterNum, prayerText.trim());
    setPrayerSaved(true);
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-8">
      {/* Back button */}
      <div className="px-5 pt-6 max-w-[520px] mx-auto">
        <button
          onClick={() => setLocation(`/bible/read/${resolvedBookId}/${chapterNum}${journeyId ? `?journey=${journeyId}` : ''}`)}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={16} />
          Back to {book?.name ?? 'Book'} {chapterNum}
        </button>
      </div>

      <main className="px-5 pt-8 max-w-[520px] mx-auto space-y-8">

        {/* Completion header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center space-y-3"
        >
          <div className="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto">
            <Check size={26} strokeWidth={2.5} />
          </div>
          <div className="space-y-1">
            <p className="text-[13px] font-semibold text-primary uppercase tracking-widest">
              {book?.name ?? 'Luke'} {chapterNum} · {readingMinutes} min
            </p>
            <h1 className="text-[24px] font-serif font-semibold">{heading}</h1>
          </div>
          <p className="text-[15px] text-muted-foreground leading-relaxed max-w-[280px] mx-auto">
            Well done. Take a moment to reflect before you move on.
          </p>
        </motion.div>

        {/* Option cards */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="grid grid-cols-2 gap-3"
        >
          <OptionCard
            icon={<PenLine size={22} />}
            label="Reflect"
            description="What stood out to you?"
            done={reflectionSaved || !!getReflection(resolvedBookId, chapterNum)}
            onClick={() => setReflectOpen(true)}
          />
          <OptionCard
            icon={<span className="text-[22px]">🙏</span>}
            label="Pray"
            description="A prayer for this chapter"
            done={prayerSaved || !!getPrayer(resolvedBookId, chapterNum)}
            onClick={() => setPrayOpen(true)}
          />
          {studyPrompts.length > 0 && (
            <OptionCard
              icon={<BookOpen size={22} />}
              label="Go Deeper"
              description="Study questions"
              done={false}
              onClick={() => setDeeperOpen(true)}
              className="col-span-2"
              wide
            />
          )}
        </motion.div>

        {/* Navigation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="flex flex-col gap-2.5"
        >
          {/* Revelation 22 — completed the whole Bible */}
          {isLastBookAndChapter && (
            <div className="p-5 bg-primary/8 border border-primary/20 rounded-xl text-center space-y-2">
              <div className="text-[28px]">🎉</div>
              <p className="text-[17px] font-serif font-semibold text-foreground">You've completed the Bible</p>
              <p className="text-[14px] text-muted-foreground">From Genesis to Revelation — well done.</p>
            </div>
          )}

          {/* Next chapter */}
          {nextChapterNum && (
            <Button className="h-12 rounded-xl text-[16px]" onClick={handleNextChapter}>
              Continue to {book?.name ?? 'Luke'} {nextChapterNum}
              <ArrowRight size={17} className="ml-2" />
            </Button>
          )}

          {/* Last chapter of this book → next book */}
          {isLastChapterOfBook && nextBook && (
            <Button className="h-12 rounded-xl text-[16px]" onClick={handleNextBook}>
              Continue to {nextBook.name} 1
              <ArrowRight size={17} className="ml-2" />
            </Button>
          )}

          {/* Journey completion path */}
          {journeyId && isLastChapterOfBook && !nextBook && (
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => setLocation(`/bible/journey/${journeyId}`)}>
              Back to Journey
            </Button>
          )}

          <Button
            variant="ghost"
            className="h-11 text-muted-foreground"
            onClick={handleFinishForToday}
          >
            Finish for today
          </Button>
        </motion.div>

      </main>

      {/* ── Reflect Sheet ──────────────────────────────────────────────────── */}
      <Sheet open={reflectOpen} onOpenChange={setReflectOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90dvh] overflow-y-auto">
          <div className="space-y-4 pb-6">
            <SheetHeader>
              <SheetTitle className="text-left">Reflect</SheetTitle>
            </SheetHeader>
            <p className="text-[16px] font-medium text-foreground">
              What stood out to you in {book?.name ?? 'Luke'} {chapterNum}?
            </p>
            <Textarea
              value={reflectionText}
              onChange={e => setReflectionText(e.target.value)}
              placeholder="Write your private reflection here..."
              className="min-h-[140px] resize-none text-[16px] rounded-xl"
              autoFocus
            />
            <p className="text-[12px] text-muted-foreground">
              Your reflection is private and will never be shared without your permission.
            </p>
            <div className="flex gap-2">
              <Button onClick={handleSaveReflection} className="flex-1 rounded-xl" disabled={!reflectionText.trim()}>
                {reflectionSaved ? <><Check size={15} className="mr-1.5" /> Saved</> : 'Save reflection'}
              </Button>
              <Button variant="ghost" onClick={() => setReflectOpen(false)} className="rounded-xl">Skip</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Pray Sheet ────────────────────────────────────────────────────── */}
      <Sheet open={prayOpen} onOpenChange={setPrayOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90dvh] overflow-y-auto">
          <div className="space-y-4 pb-6">
            <SheetHeader>
              <SheetTitle className="text-left">Pray</SheetTitle>
            </SheetHeader>
            <p className="text-[14px] text-muted-foreground">Use your own words, or write freely:</p>
            <Textarea
              value={prayerText}
              onChange={e => setPrayerText(e.target.value)}
              placeholder="A prayer for this chapter..."
              className="min-h-[160px] resize-none text-[16px] font-serif italic rounded-xl"
            />
            <p className="text-[12px] text-muted-foreground">Saving keeps it in your personal prayer notes.</p>
            <div className="flex gap-2">
              <Button onClick={handleSavePrayer} className="flex-1 rounded-xl" disabled={!prayerText.trim()}>
                {prayerSaved ? <><Check size={15} className="mr-1.5" /> Saved</> : 'Save as personal prayer'}
              </Button>
              <Button variant="ghost" onClick={() => setPrayOpen(false)} className="rounded-xl">Finish</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Go Deeper Sheet ───────────────────────────────────────────────── */}
      <Sheet open={deeperOpen} onOpenChange={setDeeperOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90dvh] overflow-y-auto">
          <div className="space-y-5 pb-6">
            <SheetHeader>
              <SheetTitle className="text-left">Go Deeper</SheetTitle>
            </SheetHeader>
            <p className="text-[14px] text-muted-foreground leading-relaxed">
              Sit with one of these questions. There's no right answer — just an honest one.
            </p>
            <div className="space-y-3">
              {studyPrompts.map((prompt, i) => (
                <div key={prompt.id} className="p-4 bg-card rounded-2xl border border-border space-y-1">
                  <p className="text-[11px] font-semibold text-primary/70 uppercase tracking-widest">Question {i + 1}</p>
                  <p className="text-[16px] text-foreground leading-relaxed font-medium">{prompt.question}</p>
                </div>
              ))}
            </div>
            <Button className="w-full rounded-xl h-11" onClick={() => setDeeperOpen(false)}>Done</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function OptionCard({
  icon, label, description, done, onClick, className = '', wide = false,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  done: boolean;
  onClick: () => void;
  className?: string;
  wide?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex text-left transition-all active:scale-[0.97] rounded-2xl border',
        wide ? 'flex-row items-center gap-4 p-4' : 'flex-col items-start gap-2 p-4',
        done ? 'bg-primary/8 border-primary/25' : 'bg-card border-border hover:border-primary/20',
        className,
      ].join(' ')}
    >
      <div className={`${done ? 'text-primary' : 'text-muted-foreground'} shrink-0`}>{icon}</div>
      <div className={wide ? 'flex-1 min-w-0' : ''}>
        <div className="flex items-center gap-1.5">
          <span className="text-[15px] font-semibold text-foreground">{label}</span>
          {done && <Check size={13} className="text-primary" />}
        </div>
        <p className="text-[12px] text-muted-foreground leading-snug mt-0.5">{description}</p>
      </div>
      {wide && (
        <div className="shrink-0 text-[11px] font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full">
          {done ? 'Viewed' : 'Open'}
        </div>
      )}
    </button>
  );
}
