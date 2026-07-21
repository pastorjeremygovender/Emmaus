import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useSearch } from 'wouter';
import { ArrowLeft, Heart, FileText, HelpCircle, Mic, ChevronRight, Highlighter, Bookmark, X, Check, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getJohnChapter, JOHN_SERMON_LINKS } from '@/lib/bible-data';
import { getBibleBook } from '@/lib/bible-data';
import { DEMO_JOHN_SERMON, DEMO_SERMON_RECORD } from '@/lib/admin-demo-data';
import { useBible, HighlightColor } from '@/contexts/BibleContext';
import type { Sermon } from '@/lib/admin-demo-data';
import type { AskEmmausQA } from '@/lib/bible-data';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSermon(id: string): Sermon | undefined {
  try {
    const stored = localStorage.getItem('emmaus_admin_sermons');
    const sermons: Sermon[] = stored
      ? JSON.parse(stored)
      : [DEMO_JOHN_SERMON, DEMO_SERMON_RECORD];
    return sermons.find(s => s.id === id);
  } catch {
    return id === 'sermon-john-3' ? DEMO_JOHN_SERMON : undefined;
  }
}

function timestampUrl(youtubeUrl: string, seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${youtubeUrl}&t=${seconds}`;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const HIGHLIGHT_CLASSES: Record<HighlightColor, string> = {
  amber: 'bg-amber-100/80 dark:bg-amber-900/30',
  blue:  'bg-blue-100/80 dark:bg-blue-900/30',
  green: 'bg-green-100/80 dark:bg-green-900/30',
};

const HIGHLIGHT_COLORS: Array<{ color: HighlightColor; label: string; swatch: string }> = [
  { color: 'amber', label: 'Amber',  swatch: 'bg-amber-300' },
  { color: 'blue',  label: 'Blue',   swatch: 'bg-blue-300' },
  { color: 'green', label: 'Green',  swatch: 'bg-green-300' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function ChapterReader() {
  const { bookId, chapter: chapterStr } = useParams<{ bookId: string; chapter: string }>();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const chapterNum = parseInt(chapterStr || '1', 10);
  const queryParams = new URLSearchParams(search);
  const journeyId = queryParams.get('journey');

  const {
    markChapterOpened, markChapterComplete, isChapterComplete,
    getHighlight, addHighlight, removeHighlight,
    isFavourite, addFavourite, removeFavourite,
    getNote, saveNote, getChapterNotes,
  } = useBible();

  const book = getBibleBook(bookId || 'john');
  const chapterData = bookId === 'john' ? getJohnChapter(chapterNum) : null;
  const sermonLinks = bookId === 'john' ? (JOHN_SERMON_LINKS[chapterNum] ?? []) : [];

  // Panel state
  const [verseSheet, setVerseSheet] = useState<{ verse: number; text: string } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [preachedOpen, setPreachedOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [selectedQA, setSelectedQA] = useState<AskEmmausQA | null>(null);

  const chapterNotes = getChapterNotes(bookId || 'john', chapterNum);

  // Mark chapter opened on mount
  useEffect(() => {
    if (!book || !chapterData) return;
    markChapterOpened({
      bookId: book.id,
      bookName: book.name,
      chapter: chapterNum,
      chapterHeading: chapterData.heading,
    });
    window.scrollTo(0, 0);
  }, [bookId, chapterNum]);

  // Pre-fill note text when verse sheet opens
  useEffect(() => {
    if (!verseSheet) {
      setNoteText('');
      setShowNoteInput(false);
      return;
    }
    const existing = getNote(bookId || 'john', chapterNum, verseSheet.verse);
    if (existing) setNoteText(existing.text);
    else setNoteText('');
  }, [verseSheet]);

  if (!book || !chapterData) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-8 bg-background">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Chapter not found.</p>
          <Button variant="outline" onClick={() => setLocation('/bible')}>Back to Bible</Button>
        </div>
      </div>
    );
  }

  const completed = isChapterComplete(book.id, chapterNum);
  const prevChapter = chapterNum > 1 ? chapterNum - 1 : null;
  const nextChapter = chapterNum < book.chapters ? chapterNum + 1 : null;

  function handleContinue() {
    markChapterComplete(book!.id, chapterNum);
    const completionPath = `/bible/read/${book!.id}/${chapterNum}/complete`;
    const qs = journeyId ? `?journey=${journeyId}` : '';
    setLocation(completionPath + qs);
  }

  function handleVerseAction(verse: number, text: string) {
    setVerseSheet({ verse, text });
  }

  function toggleFavourite(verse: number, text: string) {
    if (isFavourite(book!.id, chapterNum, verse)) {
      removeFavourite(book!.id, chapterNum, verse);
    } else {
      addFavourite({ bookId: book!.id, bookName: book!.name, chapter: chapterNum, verse, verseText: text });
    }
  }

  function setHighlight(verse: number, color: HighlightColor) {
    const existing = getHighlight(book!.id, chapterNum, verse);
    if (existing?.color === color) {
      removeHighlight(book!.id, chapterNum, verse);
    } else {
      addHighlight(book!.id, chapterNum, verse, color);
    }
  }

  function handleSaveNote() {
    if (!verseSheet || !noteText.trim()) return;
    saveNote(book!.id, chapterNum, verseSheet.verse, verseSheet.text, noteText.trim());
    setShowNoteInput(false);
  }

  const backPath = journeyId
    ? `/bible/journey/${journeyId}`
    : `/bible/books/${book.id}`;

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[600px] mx-auto">
          <button
            onClick={() => setLocation(backPath)}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 min-w-0 text-center px-2">
            <div className="text-[16px] font-semibold text-foreground">
              {book.name} {chapterNum}
            </div>
            <div className="text-[11px] text-muted-foreground">{chapterData.heading}</div>
          </div>
          <div className="shrink-0">
            <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              KJV
            </span>
          </div>
        </div>
      </header>

      {/* Journey intro */}
      {journeyId && chapterData.journeyIntro && (
        <div className="px-5 pt-6 pb-2 max-w-[600px] mx-auto">
          <div className="p-5 bg-primary/5 border border-primary/15 rounded-2xl">
            <div className="text-[11px] font-semibold text-primary uppercase tracking-widest mb-2">
              Walk Through John · Chapter {chapterNum}
            </div>
            <p className="text-[15px] leading-[1.7] text-foreground">{chapterData.journeyIntro}</p>
          </div>
        </div>
      )}

      {/* Scripture */}
      <main className="px-5 pt-8 pb-32 max-w-[600px] mx-auto">
        {chapterData.isPlaceholder ? (
          <div className="py-16 text-center space-y-4">
            <p className="text-[17px] text-muted-foreground">
              Full text for John {chapterNum} will be available when the complete Bible is connected.
            </p>
            <p className="text-[13px] text-muted-foreground">
              The architecture is ready for a licensed Bible provider.
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {chapterData.verses.map(v => {
              const hl = getHighlight(book.id, chapterNum, v.verse);
              const fav = isFavourite(book.id, chapterNum, v.verse);
              const note = getNote(book.id, chapterNum, v.verse);
              return (
                <span
                  key={v.verse}
                  onClick={() => handleVerseAction(v.verse, v.text)}
                  className={[
                    'inline cursor-pointer leading-[1.85] transition-colors rounded-sm',
                    hl ? HIGHLIGHT_CLASSES[hl.color] : 'hover:bg-muted/50',
                  ].join(' ')}
                >
                  <sup className="text-[10px] font-semibold text-primary/70 mr-0.5 select-none">
                    {v.verse}
                  </sup>
                  <span className="font-serif text-[19px] text-foreground">{v.text}</span>
                  {(fav || note) && (
                    <span className="inline-flex items-center gap-0.5 mx-1 align-middle">
                      {fav && <Heart size={10} className="text-primary fill-primary" />}
                      {note && <FileText size={10} className="text-muted-foreground" />}
                    </span>
                  )}
                  {' '}
                </span>
              );
            })}
          </div>
        )}

        {/* Preached Here notice (inline) */}
        {sermonLinks.length > 0 && (
          <button
            onClick={() => setPreachedOpen(true)}
            className="mt-10 w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-card text-left hover:border-primary/30 transition-colors"
          >
            <Mic size={17} className="text-primary shrink-0" />
            <div className="flex-1">
              <div className="text-[14px] font-semibold text-foreground">Preached Here</div>
              <div className="text-[12px] text-muted-foreground">
                {sermonLinks.length === 1
                  ? 'Pastor Jeremy has preached from this chapter'
                  : `${sermonLinks.length} sermons from this chapter`}
              </div>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
        )}
      </main>

      {/* Fixed bottom toolbar */}
      <div className="fixed bottom-0 left-0 right-0 z-10 bg-background/95 backdrop-blur-sm border-t border-border/50 safe-area-bottom">
        <div className="flex items-center justify-around h-16 max-w-[600px] mx-auto px-4">
          {/* Prev chapter */}
          {prevChapter ? (
            <button
              onClick={() => setLocation(`/bible/read/${book.id}/${prevChapter}${journeyId ? `?journey=${journeyId}` : ''}`)}
              className="flex flex-col items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors p-2 min-w-[44px]"
              aria-label="Previous chapter"
            >
              <ChevronLeft size={20} />
              <span className="text-[10px]">Prev</span>
            </button>
          ) : <div className="min-w-[44px]" />}

          {/* Notes */}
          <button
            onClick={() => setNotesOpen(true)}
            className="flex flex-col items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors p-2 min-w-[44px] relative"
            aria-label="Chapter notes"
          >
            <FileText size={20} />
            <span className="text-[10px]">Notes</span>
            {chapterNotes.length > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-primary text-[9px] text-primary-foreground rounded-full flex items-center justify-center font-bold">
                {chapterNotes.length}
              </span>
            )}
          </button>

          {/* Ask Emmaus */}
          <button
            onClick={() => { setSelectedQA(null); setAskOpen(true); }}
            className="flex flex-col items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors p-2 min-w-[44px]"
            aria-label="Ask Emmaus"
          >
            <HelpCircle size={20} />
            <span className="text-[10px]">Ask</span>
          </button>

          {/* Preached Here */}
          {sermonLinks.length > 0 && (
            <button
              onClick={() => setPreachedOpen(true)}
              className="flex flex-col items-center gap-0.5 text-primary hover:text-primary/80 transition-colors p-2 min-w-[44px]"
              aria-label="Preached Here"
            >
              <Mic size={20} />
              <span className="text-[10px]">Preached</span>
            </button>
          )}

          {/* Continue / Next */}
          <button
            onClick={handleContinue}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 h-10 rounded-xl text-[14px] font-medium hover:bg-primary/90 transition-colors min-w-[44px]"
            aria-label="Continue"
          >
            Continue
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* ── Verse Action Sheet ─────────────────────────────────────────────── */}
      <Sheet open={!!verseSheet} onOpenChange={open => !open && setVerseSheet(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] overflow-y-auto">
          {verseSheet && (
            <div className="space-y-5 pb-4">
              <SheetHeader>
                <SheetTitle className="text-left text-[13px] font-semibold text-primary uppercase tracking-widest">
                  {book.name} {chapterNum}:{verseSheet.verse}
                </SheetTitle>
              </SheetHeader>
              <p className="font-serif text-[17px] leading-[1.65] text-foreground italic">
                "{verseSheet.text}"
              </p>

              {/* Action grid */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* Favourite */}
                <button
                  onClick={() => toggleFavourite(verseSheet.verse, verseSheet.text)}
                  className={[
                    'flex items-center gap-2.5 p-3.5 rounded-xl border transition-colors',
                    isFavourite(book.id, chapterNum, verseSheet.verse)
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-card border-border text-foreground',
                  ].join(' ')}
                >
                  <Heart size={18} className={isFavourite(book.id, chapterNum, verseSheet.verse) ? 'fill-primary' : ''} />
                  <span className="text-[14px] font-medium">
                    {isFavourite(book.id, chapterNum, verseSheet.verse) ? 'Saved' : 'Save verse'}
                  </span>
                </button>

                {/* Note */}
                <button
                  onClick={() => setShowNoteInput(v => !v)}
                  className={[
                    'flex items-center gap-2.5 p-3.5 rounded-xl border transition-colors',
                    showNoteInput ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-card border-border text-foreground',
                  ].join(' ')}
                >
                  <FileText size={18} />
                  <span className="text-[14px] font-medium">Note</span>
                </button>
              </div>

              {/* Highlight */}
              <div className="space-y-2">
                <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-widest">
                  Highlight
                </p>
                <div className="flex gap-3">
                  {HIGHLIGHT_COLORS.map(({ color, label, swatch }) => {
                    const hl = getHighlight(book.id, chapterNum, verseSheet.verse);
                    const active = hl?.color === color;
                    return (
                      <button
                        key={color}
                        onClick={() => setHighlight(verseSheet.verse, color)}
                        className={[
                          'flex items-center gap-2 px-3 py-2 rounded-lg border transition-all',
                          active ? 'border-primary ring-1 ring-primary/30' : 'border-border',
                        ].join(' ')}
                        aria-label={`Highlight ${label}`}
                      >
                        <div className={`w-4 h-4 rounded-full ${swatch}`} />
                        <span className="text-[13px] font-medium text-foreground">{label}</span>
                        {active && <Check size={12} className="text-primary" />}
                      </button>
                    );
                  })}
                  {getHighlight(book.id, chapterNum, verseSheet.verse) && (
                    <button
                      onClick={() => removeHighlight(book.id, chapterNum, verseSheet.verse)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-muted-foreground"
                    >
                      <X size={13} />
                      <span className="text-[13px]">Clear</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Note input */}
              {showNoteInput && (
                <div className="space-y-2">
                  <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-widest">
                    Your note
                  </p>
                  <Textarea
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    placeholder="Write a private note about this verse..."
                    className="min-h-[90px] resize-none text-[15px] rounded-xl"
                    autoFocus
                  />
                  <Button onClick={handleSaveNote} size="sm" className="rounded-xl">
                    Save note
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Chapter Notes Sheet ────────────────────────────────────────────── */}
      <Sheet open={notesOpen} onOpenChange={setNotesOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] overflow-y-auto">
          <div className="space-y-4 pb-4">
            <SheetHeader>
              <SheetTitle className="text-left">Notes — {book.name} {chapterNum}</SheetTitle>
            </SheetHeader>
            {chapterNotes.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[15px] text-muted-foreground">
                  Tap any verse to add a note.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {chapterNotes.map(note => (
                  <div key={note.id} className="p-4 bg-card rounded-xl border border-border space-y-1.5">
                    <div className="text-[11px] font-semibold text-primary uppercase tracking-widest">
                      Verse {note.verse}
                    </div>
                    <p className="text-[13px] text-muted-foreground italic line-clamp-1">
                      "{note.verseText}"
                    </p>
                    <p className="text-[15px] text-foreground leading-relaxed">{note.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Ask Emmaus Sheet ───────────────────────────────────────────────── */}
      <Sheet open={askOpen} onOpenChange={open => { setAskOpen(open); if (!open) setSelectedQA(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90dvh] overflow-y-auto">
          <div className="space-y-4 pb-6">
            <SheetHeader>
              <SheetTitle className="text-left">Ask Emmaus</SheetTitle>
            </SheetHeader>

            {!selectedQA ? (
              <>
                <p className="text-[14px] text-muted-foreground">
                  Select a question about {book.name} {chapterNum}:
                </p>
                <div className="space-y-2">
                  {(chapterData.askEmmaus ?? []).length === 0 ? (
                    <p className="py-8 text-center text-[15px] text-muted-foreground">
                      Ask Emmaus questions for this chapter are coming soon.
                    </p>
                  ) : (
                    (chapterData.askEmmaus ?? []).map((qa, i) => (
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

                <p className="text-[11px] text-muted-foreground text-center pt-2">
                  Responses are seeded reflections, not AI-generated in this phase.
                </p>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Preached Here Sheet ────────────────────────────────────────────── */}
      <Sheet open={preachedOpen} onOpenChange={setPreachedOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] overflow-y-auto">
          <div className="space-y-4 pb-6">
            <SheetHeader>
              <SheetTitle className="text-left flex items-center gap-2">
                <Mic size={17} className="text-primary" />
                Preached Here
              </SheetTitle>
            </SheetHeader>
            <p className="text-[14px] text-muted-foreground">
              This passage has been preached from at your church.
            </p>
            <div className="space-y-3">
              {sermonLinks.map((link, i) => {
                const sermon = getSermon(link.sermonId);
                if (!sermon || sermon.status !== 'published') return null;
                return (
                  <div key={i} className="p-4 bg-card rounded-xl border border-border space-y-3">
                    <div>
                      <div className="text-[15px] font-semibold text-foreground">{sermon.title}</div>
                      <div className="text-[13px] text-muted-foreground mt-0.5">
                        {sermon.speaker} · {new Date(sermon.sermonDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                      {link.note && (
                        <div className="text-[13px] text-muted-foreground mt-1 italic">{link.note}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-muted-foreground">
                        Starts at {formatTimestamp(link.timestampSeconds)}
                      </span>
                    </div>
                    <a
                      href={timestampUrl(sermon.youtubeUrl, link.timestampSeconds)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 h-10 w-full bg-primary text-primary-foreground rounded-xl text-[14px] font-medium hover:bg-primary/90 transition-colors"
                    >
                      Watch Clip from {formatTimestamp(link.timestampSeconds)}
                    </a>
                  </div>
                );
              })}
              {sermonLinks.length === 0 && (
                <p className="py-8 text-center text-[15px] text-muted-foreground">
                  No sermons indexed for this chapter yet.
                </p>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
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
