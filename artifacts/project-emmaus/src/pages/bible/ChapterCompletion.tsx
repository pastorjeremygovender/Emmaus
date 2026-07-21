import { useState } from 'react';
import { useParams, useLocation, useSearch } from 'wouter';
import { Check, BookOpen, ArrowRight, PenLine, HandIcon as Pray, Search, HelpCircle, ChevronLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { motion } from 'framer-motion';
import { getJohnChapter, getBibleBook } from '@/lib/bible-data';
import { useBible } from '@/contexts/BibleContext';
import type { AskEmmausQA, GoDeeperItem } from '@/lib/bible-data';

// ─── Main component ───────────────────────────────────────────────────────────

export default function ChapterCompletion() {
  const { bookId, chapter: chapterStr } = useParams<{ bookId: string; chapter: string }>();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const chapterNum = parseInt(chapterStr || '1', 10);
  const queryParams = new URLSearchParams(search);
  const journeyId = queryParams.get('journey');

  const book = getBibleBook(bookId || 'john');
  const chapterData = bookId === 'john' ? getJohnChapter(chapterNum) : null;

  const { saveReflection, getReflection, savePrayer, getPrayer, markJourneyChapterComplete } = useBible();

  const [reflectOpen, setReflectOpen] = useState(false);
  const [prayOpen, setPrayOpen] = useState(false);
  const [deeperOpen, setDeeperOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [selectedQA, setSelectedQA] = useState<AskEmmausQA | null>(null);

  const [reflectionText, setReflectionText] = useState(getReflection(bookId || 'john', chapterNum)?.text ?? '');
  const [prayerText, setPrayerText] = useState(getPrayer(bookId || 'john', chapterNum)?.text ?? chapterData?.prayerPrompt ?? '');
  const [reflectionSaved, setReflectionSaved] = useState(false);
  const [prayerSaved, setPrayerSaved] = useState(false);

  const nextChapter = book && chapterNum < book.chapters ? chapterNum + 1 : null;

  function handleFinish() {
    setLocation('/bible');
  }

  function handleNextChapter() {
    if (!book) return;
    if (journeyId) {
      markJourneyChapterComplete(journeyId, chapterNum);
      if (nextChapter) {
        setLocation(`/bible/read/${book.id}/${nextChapter}?journey=${journeyId}`);
      } else {
        setLocation(`/bible/journey/${journeyId}`);
      }
    } else {
      if (nextChapter) {
        setLocation(`/bible/read/${book.id}/${nextChapter}`);
      } else {
        setLocation(`/bible/books/${book.id}`);
      }
    }
  }

  function handleSaveReflection() {
    if (!reflectionText.trim()) return;
    saveReflection(bookId || 'john', chapterNum, reflectionText.trim());
    setReflectionSaved(true);
  }

  function handleSavePrayer() {
    savePrayer(bookId || 'john', chapterNum, prayerText.trim());
    setPrayerSaved(true);
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-8">
      {/* Back button */}
      <div className="px-5 pt-6 max-w-[520px] mx-auto">
        <button
          onClick={() => setLocation(`/bible/read/${bookId}/${chapterNum}${journeyId ? `?journey=${journeyId}` : ''}`)}
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
          className="text-center space-y-2"
        >
          <div className="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto">
            <Check size={26} strokeWidth={2.5} />
          </div>
          <div className="space-y-1">
            <p className="text-[13px] font-semibold text-primary uppercase tracking-widest">
              {book?.name ?? 'John'} {chapterNum} · {chapterData?.readingMinutes ?? 5} min
            </p>
            <h1 className="text-[24px] font-serif font-semibold">
              {chapterData?.heading ?? `Chapter ${chapterNum}`}
            </h1>
          </div>
          <p className="text-[15px] text-muted-foreground">What would you like to do next?</p>
        </motion.div>

        {/* Four option cards */}
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
            done={reflectionSaved || !!getReflection(bookId || 'john', chapterNum)}
            onClick={() => setReflectOpen(true)}
          />
          <OptionCard
            icon={<span className="text-[22px]">🙏</span>}
            label="Pray"
            description="A prayer for this chapter"
            done={prayerSaved || !!getPrayer(bookId || 'john', chapterNum)}
            onClick={() => setPrayOpen(true)}
          />
          <OptionCard
            icon={<Search size={22} />}
            label="Go Deeper"
            description="Cross-references and more"
            done={false}
            onClick={() => setDeeperOpen(true)}
          />
          <OptionCard
            icon={<HelpCircle size={22} />}
            label="Ask Emmaus"
            description="Questions about this chapter"
            done={false}
            onClick={() => { setSelectedQA(null); setAskOpen(true); }}
          />
        </motion.div>

        {/* Secondary actions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="flex flex-col gap-2.5"
        >
          {nextChapter && (
            <Button
              className="h-12 rounded-xl text-[16px]"
              onClick={handleNextChapter}
            >
              Continue to {book?.name ?? 'John'} {nextChapter}
              <ArrowRight size={17} className="ml-2" />
            </Button>
          )}
          <Button variant="ghost" className="h-11 text-muted-foreground" onClick={handleFinish}>
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
              What stood out to you in {book?.name ?? 'John'} {chapterNum}?
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
              <Button variant="ghost" onClick={() => setReflectOpen(false)} className="rounded-xl">
                Skip
              </Button>
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
            <p className="text-[14px] text-muted-foreground">
              You could pray:
            </p>
            <Textarea
              value={prayerText}
              onChange={e => setPrayerText(e.target.value)}
              placeholder="A prayer for this chapter..."
              className="min-h-[160px] resize-none text-[16px] font-serif italic rounded-xl"
            />
            <p className="text-[12px] text-muted-foreground">
              Edit this prayer to make it your own. Saving it keeps it in your personal prayer notes.
            </p>
            <div className="flex gap-2">
              <Button onClick={handleSavePrayer} className="flex-1 rounded-xl" disabled={!prayerText.trim()}>
                {prayerSaved ? <><Check size={15} className="mr-1.5" /> Saved</> : 'Save as personal prayer'}
              </Button>
              <Button variant="ghost" onClick={() => setPrayOpen(false)} className="rounded-xl">
                Finish
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Go Deeper Sheet ───────────────────────────────────────────────── */}
      <Sheet open={deeperOpen} onOpenChange={setDeeperOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90dvh] overflow-y-auto">
          <div className="space-y-4 pb-6">
            <SheetHeader>
              <SheetTitle className="text-left">Go Deeper</SheetTitle>
            </SheetHeader>
            {(chapterData?.goDeeper ?? []).length === 0 ? (
              <p className="py-10 text-center text-[15px] text-muted-foreground">
                Go Deeper content for this chapter is coming soon.
              </p>
            ) : (
              <div className="space-y-3">
                {(chapterData?.goDeeper ?? []).map((item, i) => (
                  <GoDeeperCard key={i} item={item} />
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Ask Emmaus Sheet ──────────────────────────────────────────────── */}
      <Sheet open={askOpen} onOpenChange={open => { setAskOpen(open); if (!open) setSelectedQA(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90dvh] overflow-y-auto">
          <div className="space-y-4 pb-6">
            <SheetHeader>
              <SheetTitle className="text-left">Ask Emmaus</SheetTitle>
            </SheetHeader>

            {!selectedQA ? (
              <>
                <p className="text-[14px] text-muted-foreground">
                  Select a question about {book?.name ?? 'John'} {chapterNum}:
                </p>
                <div className="space-y-2">
                  {(chapterData?.askEmmaus ?? []).length === 0 ? (
                    <p className="py-8 text-center text-[15px] text-muted-foreground">
                      Ask Emmaus questions for this chapter are coming soon.
                    </p>
                  ) : (
                    (chapterData?.askEmmaus ?? []).map((qa, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedQA(qa)}
                        className="w-full text-left p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors"
                      >
                        <p className="text-[15px] text-foreground">{qa.prompt}</p>
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={() => setSelectedQA(null)}
                  className="flex items-center gap-1.5 text-[13px] text-primary font-medium"
                >
                  <ChevronLeft size={15} /> All questions
                </button>
                <div className="p-4 bg-primary/5 border border-primary/15 rounded-xl">
                  <p className="text-[15px] font-medium text-foreground">{selectedQA.prompt}</p>
                </div>
                <div className="space-y-4">
                  <AnswerSection label="Explanation" text={selectedQA.answer.explanation} />
                  <AnswerSection label="Historical context" text={selectedQA.answer.historicalContext} />
                  <AnswerSection label="Practical application" text={selectedQA.answer.practicalApplication} />
                  {selectedQA.answer.churchInsight && (
                    <AnswerSection label="Church insight" text={selectedQA.answer.churchInsight} accent />
                  )}
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function OptionCard({
  icon, label, description, done, onClick,
}: {
  icon: React.ReactNode; label: string; description: string; done: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex flex-col items-start gap-2 p-4 rounded-2xl border text-left transition-all active:scale-[0.97]',
        done ? 'bg-primary/8 border-primary/25' : 'bg-card border-border hover:border-primary/20',
      ].join(' ')}
    >
      <div className={`${done ? 'text-primary' : 'text-muted-foreground'}`}>{icon}</div>
      <div>
        <div className="flex items-center gap-1.5">
          <span className="text-[15px] font-semibold text-foreground">{label}</span>
          {done && <Check size={13} className="text-primary" />}
        </div>
        <p className="text-[12px] text-muted-foreground leading-snug mt-0.5">{description}</p>
      </div>
    </button>
  );
}

function GoDeeperCard({ item }: { item: GoDeeperItem }) {
  const typeLabel: Record<string, string> = {
    'cross-reference': 'Cross Reference',
    'journey': 'Bible Journey',
    'emmaus-journey': 'Emmaus Journey',
    'devotional': 'Devotional',
    'sermon': 'Sermon',
    'resource': 'Resource',
  };

  return (
    <div className={`p-4 rounded-xl border bg-card space-y-1.5 ${item.isDevelopmentCard ? 'opacity-70' : 'border-border'}`}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-primary uppercase tracking-widest">
          {typeLabel[item.type] ?? item.type}
        </span>
        {item.isDevelopmentCard && (
          <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            Coming soon
          </span>
        )}
      </div>
      <div className="text-[15px] font-semibold text-foreground">{item.title}</div>
      <p className="text-[13px] text-muted-foreground leading-relaxed">{item.description}</p>
      {item.reference && (
        <p className="text-[12px] font-semibold text-primary">{item.reference}</p>
      )}
    </div>
  );
}

function AnswerSection({ label, text, accent }: { label: string; text: string; accent?: boolean }) {
  return (
    <div className="space-y-1.5">
      <p className={`text-[11px] font-semibold uppercase tracking-widest ${accent ? 'text-primary' : 'text-muted-foreground'}`}>
        {label}
      </p>
      <p className="text-[15px] leading-[1.7] text-foreground">{text}</p>
    </div>
  );
}
