import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useSearch } from 'wouter';
import { ArrowLeft, Heart, FileText, Bookmark, ChevronRight, X, Check, ChevronLeft, MessageCircle, Send, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getChapter } from '@/lib/bible-provider';
import { getBibleBook } from '@/lib/bible-data';
import { useBible, HighlightColor } from '@/contexts/BibleContext';
import { getVerseSermonLinks } from '@/data/sermon-verse-links';

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Ask Emmaus types ─────────────────────────────────────────────────────────

type AiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

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
    isBookmarked, addBookmark, removeBookmark,
  } = useBible();

  const resolvedBookId = bookId || 'luke';
  const book = getBibleBook(resolvedBookId);
  const chapterData = getChapter(resolvedBookId, chapterNum);

  // Sheet state
  const [verseSheet, setVerseSheet] = useState<{ verse: number; text: string } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);

  // Ask Emmaus state
  const [askOpen, setAskOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiScrollRef = useRef<HTMLDivElement>(null);

  const chapterNotes = getChapterNotes(resolvedBookId, chapterNum);

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
    const existing = getNote(resolvedBookId, chapterNum, verseSheet.verse);
    if (existing) setNoteText(existing.text);
    else setNoteText('');
  }, [verseSheet]);

  // Scroll AI chat to bottom on new messages
  useEffect(() => {
    if (aiScrollRef.current) {
      aiScrollRef.current.scrollTop = aiScrollRef.current.scrollHeight;
    }
  }, [aiMessages, aiLoading]);

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

  const bookmarked = isBookmarked(book.id, chapterNum);
  const prevChapter = chapterNum > 1 ? chapterNum - 1 : null;
  const nextChapter = chapterNum < book.chapters ? chapterNum + 1 : null;

  function handleContinue() {
    markChapterComplete(book!.id, chapterNum);
    const base = journeyId
      ? `/bible/complete/${book!.id}/${chapterNum}?journey=${journeyId}`
      : `/bible/complete/${book!.id}/${chapterNum}`;
    setLocation(base);
  }

  function handleNextChapter() {
    setCompletionOpen(false);
    if (journeyId) {
      if (nextChapter) {
        setLocation(`/bible/read/${book!.id}/${nextChapter}?journey=${journeyId}`);
      } else {
        setLocation(`/bible/journey/${journeyId}`);
      }
    } else {
      if (nextChapter) {
        setLocation(`/bible/read/${book!.id}/${nextChapter}`);
      } else {
        setLocation(`/bible/books/${book!.id}`);
      }
    }
  }

  function handleFinishForToday() {
    setCompletionOpen(false);
    setLocation('/walk');
  }

  function handleToggleBookmark() {
    if (bookmarked) {
      removeBookmark(book!.id, chapterNum);
    } else {
      addBookmark({
        bookId: book!.id,
        bookName: book!.name,
        chapter: chapterNum,
        chapterHeading: chapterData!.heading,
      });
    }
  }

  function toggleFavourite(verse: number, text: string) {
    if (isFavourite(book!.id, chapterNum, verse)) {
      removeFavourite(book!.id, chapterNum, verse);
    } else {
      addFavourite({ bookId: book!.id, bookName: book!.name, chapter: chapterNum, verse, verseText: text });
    }
  }

  function setHighlightColor(verse: number, color: HighlightColor) {
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

  // ── Ask Emmaus ─────────────────────────────────────────────────────────────

  async function handleSendToEmmaus() {
    const text = aiInput.trim();
    if (!text || aiLoading) return;

    const userMsg: AiMessage = { id: `u-${Date.now()}`, role: 'user', content: text };
    setAiMessages(prev => [...prev, userMsg]);
    setAiInput('');
    setAiLoading(true);
    setAiError(null);

    const assistantId = `a-${Date.now()}`;
    setAiMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    try {
      const apiBase = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';
      const response = await fetch(`${apiBase}/api/bible/ask-emmaus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: resolvedBookId,
          chapter: chapterNum,
          chapterHeading: chapterData?.heading,
          messages: [...aiMessages.filter(m => m.content), userMsg].map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({})) as { message?: string };
        const msg = errData?.message ?? `Request failed (${response.status})`;
        setAiError(msg);
        setAiMessages(prev => prev.filter(m => m.id !== assistantId));
        setAiLoading(false);
        return;
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          try {
            const parsed = JSON.parse(data) as { content?: string; done?: boolean; error?: string };
            if (parsed.error) {
              setAiError(parsed.error);
              setAiMessages(prev => prev.filter(m => m.id !== assistantId));
            } else if (parsed.content) {
              setAiMessages(prev =>
                prev.map(m => m.id === assistantId
                  ? { ...m, content: m.content + parsed.content }
                  : m
                )
              );
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } catch (err) {
      setAiError('Something went wrong. Please try again.');
      setAiMessages(prev => prev.filter(m => m.id !== assistantId));
    } finally {
      setAiLoading(false);
    }
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

      {/* Scripture */}
      <main className="px-5 pt-8 pb-32 max-w-[600px] mx-auto">
        {chapterData.isPlaceholder ? (
          <div className="py-16 text-center space-y-4">
            <p className="text-[17px] text-muted-foreground">
              Full text for {book.name} {chapterNum} will be available when the complete Bible is connected.
            </p>
            <p className="text-[13px] text-muted-foreground">
              The provider architecture is ready for a licensed translation.
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
                  onClick={() => setVerseSheet({ verse: v.verse, text: v.text })}
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

          {/* Ask Emmaus */}
          <button
            onClick={() => setAskOpen(true)}
            className="flex flex-col items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors p-2 min-w-[44px] relative"
            aria-label="Ask Emmaus"
          >
            <MessageCircle size={20} />
            <span className="text-[10px]">Ask</span>
            {aiMessages.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
            )}
          </button>

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

          {/* Bookmark */}
          <button
            onClick={handleToggleBookmark}
            className={[
              'flex flex-col items-center gap-0.5 transition-colors p-2 min-w-[44px]',
              bookmarked ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
            aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark chapter'}
          >
            <Bookmark size={20} className={bookmarked ? 'fill-primary' : ''} />
            <span className="text-[10px]">{bookmarked ? 'Saved' : 'Bookmark'}</span>
          </button>

          {/* Continue */}
          <button
            onClick={handleContinue}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 h-10 rounded-xl text-[14px] font-medium hover:bg-primary/90 transition-colors"
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
          {verseSheet && (() => {
            const sermonLinks = getVerseSermonLinks(resolvedBookId, chapterNum, verseSheet.verse);
            return (
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
                  {/* Save / Favourite */}
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

                {/* Preached Here */}
                {sermonLinks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-widest">
                      Preached Here
                    </p>
                    <div className="space-y-2">
                      {sermonLinks.map(link => (
                        <button
                          key={link.sermonId}
                          onClick={() => setLocation('/admin')}
                          className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-primary/5 transition-colors text-left"
                        >
                          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                            <span className="text-[16px]">🎙️</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-foreground line-clamp-1">{link.title}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {link.speaker}
                              {link.sermonDate && ` · ${formatDate(link.sermonDate)}`}
                            </p>
                          </div>
                          <ExternalLink size={14} className="text-muted-foreground shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Highlight colours */}
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
                          onClick={() => setHighlightColor(verseSheet.verse, color)}
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
            );
          })()}
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
      <Sheet open={askOpen} onOpenChange={setAskOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl h-[85dvh] flex flex-col p-0">
          {/* Header */}
          <div className="px-5 pt-5 pb-3 border-b border-border/50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                <MessageCircle size={16} className="text-primary" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-foreground">Ask Emmaus</p>
                <p className="text-[12px] text-muted-foreground">
                  {book.name} {chapterNum} · {chapterData.heading}
                </p>
              </div>
            </div>
          </div>

          {/* Message list */}
          <div
            ref={aiScrollRef}
            className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
          >
            {aiMessages.length === 0 && !aiLoading && (
              <div className="py-8 text-center space-y-3">
                <p className="text-[22px]">✦</p>
                <p className="text-[15px] text-foreground font-medium">
                  What's on your mind?
                </p>
                <p className="text-[13px] text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
                  Ask anything about {book.name} {chapterNum} — a word, a question, or something that struck you.
                </p>
                {/* Starter prompts */}
                <div className="pt-2 flex flex-col gap-2">
                  {[
                    `What's the main idea of ${book.name} ${chapterNum}?`,
                    'What does this mean for my life today?',
                    'Are there any cross-references I should read?',
                  ].map(q => (
                    <button
                      key={q}
                      onClick={() => setAiInput(q)}
                      className="text-left text-[13px] text-primary bg-primary/8 hover:bg-primary/12 px-4 py-2.5 rounded-xl border border-primary/15 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {aiMessages.map(msg => (
              <div
                key={msg.id}
                className={[
                  'flex',
                  msg.role === 'user' ? 'justify-end' : 'justify-start',
                ].join(' ')}
              >
                <div
                  className={[
                    'max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm',
                  ].join(' ')}
                >
                  {msg.content || (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" />
                      <span className="text-[13px]">Thinking…</span>
                    </span>
                  )}
                </div>
              </div>
            ))}

            {aiError && (
              <div className="text-center py-2">
                <p className="text-[13px] text-destructive bg-destructive/10 rounded-xl px-4 py-2.5 inline-block">
                  {aiError}
                </p>
              </div>
            )}
          </div>

          {/* Input row */}
          <div className="px-4 pb-6 pt-3 border-t border-border/50 shrink-0">
            <div className="flex gap-2 items-end">
              <Textarea
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendToEmmaus();
                  }
                }}
                placeholder="Ask about this chapter…"
                className="flex-1 min-h-[44px] max-h-[120px] resize-none text-[15px] rounded-xl"
                disabled={aiLoading}
              />
              <Button
                onClick={handleSendToEmmaus}
                disabled={!aiInput.trim() || aiLoading}
                size="icon"
                className="w-11 h-11 rounded-xl shrink-0"
                aria-label="Send"
              >
                {aiLoading
                  ? <Loader2 size={18} className="animate-spin" />
                  : <Send size={18} />
                }
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground text-center mt-2">
              Responses are AI-generated. Always weigh them against Scripture.
            </p>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Chapter Completion Sheet ───────────────────────────────────────── */}
      <Sheet open={completionOpen} onOpenChange={setCompletionOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <div className="space-y-4 pb-6 pt-2">
            {/* Status line */}
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center shrink-0">
                <Check size={13} strokeWidth={2.5} />
              </div>
              <p className="text-[15px] font-semibold text-foreground">
                {book.name} {chapterNum} Complete
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2.5">
              {nextChapter ? (
                <Button
                  className="h-12 rounded-xl text-[16px]"
                  onClick={handleNextChapter}
                >
                  Continue to {book.name} {nextChapter}
                  <ChevronRight size={17} className="ml-1.5" />
                </Button>
              ) : (
                <Button
                  className="h-12 rounded-xl text-[16px]"
                  onClick={handleNextChapter}
                >
                  You've finished {book.name}
                  <Check size={17} className="ml-1.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                className="h-11 text-muted-foreground text-[15px]"
                onClick={handleFinishForToday}
              >
                Finish for today
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoDate;
  }
}
