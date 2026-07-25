import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useSearch } from 'wouter';
import { getApiUrl } from '@/lib/api';
import { SermonAudioPlayer } from '@/components/SermonAudioPlayer';
import {
  ArrowLeft, Heart, FileText, Bookmark, X, Check,
  ChevronLeft, ChevronRight, Loader2, ExternalLink, RefreshCw, ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getBibleBook, getPrevBook, getNextBook } from '@/lib/bible-data';
import { useBible, HighlightColor } from '@/contexts/BibleContext';
import { useChapter } from '@/hooks/useChapter';
import { useTranslations } from '@/hooks/useTranslations';
import { getVerseSermonLinks } from '@/data/sermon-verse-links';
import { BibleReferencePicker } from '@/components/BibleReferencePicker';

const HIGHLIGHT_CLASSES: Record<HighlightColor, string> = {
  amber: 'bg-amber-100/80 dark:bg-amber-900/30',
  blue:  'bg-blue-100/80 dark:bg-blue-900/30',
  green: 'bg-green-100/80 dark:bg-green-900/30',
};

const HIGHLIGHT_COLORS: Array<{ color: HighlightColor; label: string; swatch: string }> = [
  { color: 'amber', label: 'Amber', swatch: 'bg-amber-300' },
  { color: 'blue',  label: 'Blue',  swatch: 'bg-blue-300' },
  { color: 'green', label: 'Green', swatch: 'bg-green-300' },
];

export default function ChapterReader() {
  const { bookId, chapter: chapterStr } = useParams<{ bookId: string; chapter: string }>();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const chapterNum = parseInt(chapterStr || '1', 10);
  const queryParams = new URLSearchParams(search);
  const journeyId = queryParams.get('journey');
  const qs = journeyId ? `?journey=${journeyId}` : '';

  const {
    translationId, setTranslation,
    markChapterOpened,
    getHighlight, addHighlight, removeHighlight,
    isFavourite, addFavourite, removeFavourite,
    getNote, saveNote, getChapterNotes,
    isBookmarked, addBookmark, removeBookmark,
  } = useBible();

  const { translations } = useTranslations();

  const resolvedBookId = bookId || 'luke';
  const book = getBibleBook(resolvedBookId);

  const { chapter: chapterData, loading, error, retry } = useChapter(resolvedBookId, chapterNum, translationId);

  const [verseSheet, setVerseSheet] = useState<{ verse: number; text: string } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [translationDropdownOpen, setTranslationDropdownOpen] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [preachedHereSermons, setPreachedHereSermons] = useState<Array<{
    sermonId: string; title: string; speaker: string;
    timestampedUrl: string; timestampLabel: string;
    audioUrl?: string; relativeStartSeconds?: number; relativeTimestampLabel?: string;
    youtubeUrl?: string;
  }>>([]);
  const [preachedHereOpen, setPreachedHereOpen] = useState(false);
  const [preachedHerePlayer, setPreachedHerePlayer] = useState<{
    audioUrl: string; startSeconds: number; title: string; speaker?: string; watchUrl?: string;
  } | null>(null);

  const scrollSaveKey = `emmaus_scroll_${resolvedBookId}_${chapterNum}`;
  const scrollBeforeTranslation = useRef<number | null>(null);
  const dropdownWrapperRef = useRef<HTMLDivElement>(null);
  const prevTranslationRef = useRef<string>(translationId);

  const chapterNotes = getChapterNotes(resolvedBookId, chapterNum);

  // Save scroll position when unmounting (covers navigating to Ask Emmaus via FAB)
  useEffect(() => {
    return () => {
      sessionStorage.setItem(scrollSaveKey, String(Math.round(window.scrollY)));
    };
  }, [scrollSaveKey]);

  // Mark chapter opened; restore scroll when data arrives
  useEffect(() => {
    if (!book || !chapterData) return;
    markChapterOpened({
      bookId: book.id,
      bookName: book.name,
      chapter: chapterNum,
      chapterHeading: chapterData.heading,
    });
    if (scrollBeforeTranslation.current !== null) {
      const y = scrollBeforeTranslation.current;
      scrollBeforeTranslation.current = null;
      requestAnimationFrame(() => window.scrollTo(0, y));
      return;
    }
    const saved = sessionStorage.getItem(scrollSaveKey);
    if (saved) {
      sessionStorage.removeItem(scrollSaveKey);
      const y = parseInt(saved, 10);
      requestAnimationFrame(() => window.scrollTo(0, y));
      return;
    }
    window.scrollTo(0, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, chapterNum, chapterData?.heading]);

  // Pre-fill note when verse sheet opens
  useEffect(() => {
    if (!verseSheet) { setNoteText(''); setShowNoteInput(false); return; }
    const existing = getNote(resolvedBookId, chapterNum, verseSheet.verse);
    setNoteText(existing ? existing.text : '');
  }, [verseSheet]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close translation dropdown on outside pointer-down
  useEffect(() => {
    if (!translationDropdownOpen) return;
    function handleOutside(e: PointerEvent) {
      if (dropdownWrapperRef.current && !dropdownWrapperRef.current.contains(e.target as Node)) {
        setTranslationDropdownOpen(false);
      }
    }
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, [translationDropdownOpen]);

  // Track last known-good translation
  useEffect(() => {
    if (chapterData && !loading && !error) prevTranslationRef.current = translationId;
  }, [chapterData, loading, error, translationId]);

  // Revert on translation load failure
  useEffect(() => {
    if (error && prevTranslationRef.current && prevTranslationRef.current !== translationId) {
      setTranslation(prevTranslationRef.current);
      setTranslationError('This translation could not be loaded just now.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  // Fetch Preached Here sermons when book/chapter changes (non-critical)
  useEffect(() => {
    setPreachedHereSermons([]);
    const url = getApiUrl(
      `/api/youtube-archive/preached-here?bookId=${encodeURIComponent(resolvedBookId)}&chapter=${chapterNum}`
    );
    fetch(url)
      .then(r => r.ok ? r.json() : { sermons: [] })
      .then((data: { sermons: typeof preachedHereSermons }) => {
        setPreachedHereSermons(data.sermons ?? []);
      })
      .catch(() => {/* Preached Here is non-critical */});
  }, [resolvedBookId, chapterNum]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!book) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-8 bg-background">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Book not found.</p>
          <Button variant="outline" onClick={() => setLocation('/bible')}>Back to My Bible</Button>
        </div>
      </div>
    );
  }

  // Navigation paths (cross-book aware)
  const prevBook = getPrevBook(resolvedBookId);
  const nextBook = getNextBook(resolvedBookId);
  const prevChapterNum = chapterNum > 1 ? chapterNum - 1 : null;
  const nextChapterNum = chapterNum < book.chapters ? chapterNum + 1 : null;

  const prevPath = prevChapterNum
    ? `/bible/read/${book.id}/${prevChapterNum}${qs}`
    : prevBook ? `/bible/read/${prevBook.id}/${prevBook.chapters}${qs}` : null;

  const nextPath = nextChapterNum
    ? `/bible/read/${book.id}/${nextChapterNum}${qs}`
    : nextBook ? `/bible/read/${nextBook.id}/1${qs}` : null;

  const prevLabel = prevChapterNum
    ? `${book.shortName} ${prevChapterNum}`
    : prevBook ? `${prevBook.shortName} ${prevBook.chapters}` : '';

  const nextLabel = nextChapterNum
    ? `${book.shortName} ${nextChapterNum}`
    : nextBook ? `${nextBook.shortName} 1` : '';

  const currentTranslation = translations.find(t => t.id === translationId) ?? translations[0];
  const bookmarked = isBookmarked(book.id, chapterNum);

  // Navigate chapters — save scroll so it can be restored on back
  function navigateChapter(path: string) {
    sessionStorage.removeItem(scrollSaveKey); // fresh start for new chapter
    setLocation(path);
  }

  function handleSetTranslation(id: string) {
    if (id === translationId) { setTranslationDropdownOpen(false); return; }
    prevTranslationRef.current = translationId;
    scrollBeforeTranslation.current = window.scrollY;
    setTranslationError(null);
    setTranslation(id);
    setTranslationDropdownOpen(false);
  }

  function handleToggleBookmark() {
    if (bookmarked) {
      removeBookmark(book!.id, chapterNum);
    } else {
      addBookmark({
        bookId: book!.id,
        bookName: book!.name,
        chapter: chapterNum,
        chapterHeading: chapterData?.heading ?? `Chapter ${chapterNum}`,
      });
    }
  }

  function toggleFavourite(verse: number, text: string) {
    if (isFavourite(book!.id, chapterNum, verse)) removeFavourite(book!.id, chapterNum, verse);
    else addFavourite({ bookId: book!.id, bookName: book!.name, chapter: chapterNum, verse, verseText: text });
  }

  function setHighlightColor(verse: number, color: HighlightColor) {
    const existing = getHighlight(book!.id, chapterNum, verse);
    if (existing?.color === color) removeHighlight(book!.id, chapterNum, verse);
    else addHighlight(book!.id, chapterNum, verse, color);
  }

  function handleSaveNote() {
    if (!verseSheet || !noteText.trim()) return;
    saveNote(book!.id, chapterNum, verseSheet.verse, verseSheet.text, noteText.trim());
    setShowNoteInput(false);
  }

  // BibleReferencePicker navigate callback
  function handlePickerNavigate(newBookId: string, newChapter: number) {
    setLocation(`/bible/read/${newBookId}/${newChapter}${qs}`);
  }

  return (
    <div className="min-h-[100dvh] bg-background">

      {/* ── Bible Reference Picker overlay ──────────────────────────────────── */}
      {pickerOpen && (
        <BibleReferencePicker
          currentBookId={resolvedBookId}
          currentChapter={chapterNum}
          onNavigate={handlePickerNavigate}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* ── Sticky Header ───────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[600px] mx-auto gap-2">

          {/* Back — always returns to My Bible home */}
          <button
            onClick={() => setLocation('/bible')}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
            aria-label="Back to My Bible"
          >
            <ArrowLeft size={22} />
          </button>

          {/* Combined book/chapter + translation selector */}
          <div className="flex-1 flex justify-center">
            <div
              className="inline-flex items-stretch border border-border rounded-xl overflow-hidden bg-card shadow-sm"
              ref={dropdownWrapperRef}
            >
              {/* LEFT: Book & Chapter — opens BibleReferencePicker */}
              <button
                onClick={() => { setTranslationDropdownOpen(false); setPickerOpen(true); }}
                className="flex items-center gap-1.5 px-3 py-2 hover:bg-muted/60 active:bg-muted transition-colors min-h-[40px]"
                aria-label={`Current reading: ${book.name} chapter ${chapterNum}. Tap to change.`}
              >
                <span className="text-[15px] font-semibold text-foreground">
                  {book.shortName} {chapterNum}
                </span>
                <ChevronDown size={13} className="text-muted-foreground" />
              </button>

              {/* Divider */}
              <div className="w-px bg-border/70 my-2" />

              {/* RIGHT: Translation — opens translation dropdown */}
              <button
                onClick={() => setTranslationDropdownOpen(v => !v)}
                className="flex items-center gap-1 px-3 py-2 hover:bg-muted/60 active:bg-muted transition-colors min-h-[40px]"
                aria-label={`Current translation: ${currentTranslation?.name ?? ''}. Tap to change.`}
                aria-expanded={translationDropdownOpen}
                aria-haspopup="listbox"
              >
                <span className="text-[12px] font-bold text-foreground">
                  {currentTranslation?.abbreviation ?? '—'}
                </span>
                <ChevronDown
                  size={11}
                  className={['text-muted-foreground transition-transform', translationDropdownOpen ? 'rotate-180' : ''].join(' ')}
                />
              </button>

              {/* Translation dropdown */}
              {translationDropdownOpen && (
                <div
                  role="listbox"
                  aria-label="Select translation"
                  className="absolute right-4 top-14 w-56 bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden"
                >
                  {translations.map(t => (
                    <button
                      key={t.id}
                      role="option"
                      aria-selected={t.id === translationId}
                      onClick={() => handleSetTranslation(t.id)}
                      className={['w-full flex items-center gap-3 px-4 py-3 text-left transition-colors', t.id === translationId ? 'bg-primary/8 text-primary' : 'hover:bg-muted'].join(' ')}
                    >
                      <span className={['w-9 h-6 rounded text-[10px] font-bold flex items-center justify-center shrink-0', t.id === translationId ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'].join(' ')}>
                        {t.abbreviation}
                      </span>
                      <span className="text-[13px] font-medium leading-tight">{t.name}</span>
                      {t.id === translationId && <Check size={14} className="ml-auto text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Spacer — balances the back button */}
          <div className="w-11 shrink-0" />
        </div>

        {/* Chapter heading (sub-line) */}
        {chapterData?.heading && (
          <div className="text-center pb-2 px-4">
            <span className="text-[11px] text-muted-foreground truncate">{chapterData.heading}</span>
          </div>
        )}

        {/* Preached Here badge — appears when ICC sermons reference this chapter */}
        {preachedHereSermons.length > 0 && (
          <div className="flex justify-center pb-2 px-4">
            <button
              onClick={() => setPreachedHereOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-[12px] font-semibold hover:bg-amber-200 dark:hover:bg-amber-900/40 transition-colors"
            >
              <span aria-hidden="true">🎧</span>
              Preached Here
            </button>
          </div>
        )}

        {/* Inline error when translation fails to load */}
        {translationError && (
          <div className="mx-4 mb-2 px-4 py-2 bg-popover border border-border rounded-xl shadow text-[12px] text-muted-foreground">
            {translationError}
          </div>
        )}
      </header>

      {/* ── Scripture ───────────────────────────────────────────────────────── */}
      <main className="px-5 pt-8 pb-40 max-w-[600px] mx-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 size={28} className="text-primary animate-spin" />
            <p className="text-[14px] text-muted-foreground">Loading {book.name} {chapterNum}…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <p className="text-[16px] text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={retry} className="gap-2">
              <RefreshCw size={15} />Try again
            </Button>
          </div>
        ) : !chapterData ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <p className="text-[16px] text-muted-foreground">
              {book.name} {chapterNum} is not available in this translation.
            </p>
            <Button variant="outline" onClick={() => setLocation('/bible')}>Back to My Bible</Button>
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
                  <sup className="text-[10px] font-semibold text-primary/70 mr-0.5 select-none">{v.verse}</sup>
                  <span className="font-sans text-[19px] text-foreground">{v.text}</span>
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

      {/* ── Fixed Bottom Toolbar ─────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-10 bg-background/95 backdrop-blur-sm border-t border-border/50 safe-area-bottom">
        <div className="max-w-[600px] mx-auto">

          {/* Tool row — Notes and Save/Bookmark only */}
          <div className="flex items-center justify-around h-12 px-6 border-b border-border/30">
            <button
              onClick={() => setNotesOpen(true)}
              className="flex flex-col items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors p-2 relative"
              aria-label="Chapter notes"
            >
              <FileText size={18} />
              <span className="text-[9px]">Notes</span>
              {chapterNotes.length > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-primary text-[8px] text-primary-foreground rounded-full flex items-center justify-center font-bold">
                  {chapterNotes.length}
                </span>
              )}
            </button>

            <button
              onClick={handleToggleBookmark}
              className={['flex flex-col items-center gap-0.5 transition-colors p-2', bookmarked ? 'text-primary' : 'text-muted-foreground hover:text-foreground'].join(' ')}
              aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this chapter'}
            >
              <Bookmark size={18} className={bookmarked ? 'fill-primary' : ''} />
              <span className="text-[9px]">{bookmarked ? 'Saved' : 'Save'}</span>
            </button>
          </div>

          {/* Chapter navigation row */}
          <div className="flex items-center h-14 px-2">
            {/* Previous */}
            <button
              onClick={() => prevPath && navigateChapter(prevPath)}
              disabled={!prevPath}
              className={[
                'flex items-center gap-1 px-3 py-2 rounded-xl min-h-[44px] min-w-[44px] transition-colors',
                prevPath ? 'text-foreground hover:bg-muted active:bg-muted/80' : 'text-muted-foreground/30 cursor-default',
              ].join(' ')}
              aria-label={prevLabel || 'No previous chapter'}
            >
              <ChevronLeft size={18} className="shrink-0" />
              {prevPath && <span className="text-[13px] font-medium max-w-[80px] truncate">{prevLabel}</span>}
            </button>

            {/* Current chapter (centre) */}
            <div className="flex-1 text-center">
              <span className="text-[13px] font-semibold text-foreground">{book.name} {chapterNum}</span>
            </div>

            {/* Next */}
            <button
              onClick={() => nextPath && navigateChapter(nextPath)}
              disabled={!nextPath}
              className={[
                'flex items-center gap-1 px-3 py-2 rounded-xl min-h-[44px] min-w-[44px] transition-colors',
                nextPath ? 'text-foreground hover:bg-muted active:bg-muted/80' : 'text-muted-foreground/30 cursor-default',
              ].join(' ')}
              aria-label={nextLabel || 'No next chapter'}
            >
              {nextPath && <span className="text-[13px] font-medium max-w-[80px] truncate">{nextLabel}</span>}
              <ChevronRight size={18} className="shrink-0" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Verse Action Sheet ───────────────────────────────────────────────── */}
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
                <p className="font-sans text-[17px] leading-[1.65] text-foreground italic">"{verseSheet.text}"</p>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => toggleFavourite(verseSheet.verse, verseSheet.text)}
                    className={['flex items-center gap-2.5 p-3.5 rounded-xl border transition-colors', isFavourite(book.id, chapterNum, verseSheet.verse) ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-card border-border text-foreground'].join(' ')}
                  >
                    <Heart size={18} className={isFavourite(book.id, chapterNum, verseSheet.verse) ? 'fill-primary' : ''} />
                    <span className="text-[14px] font-medium">{isFavourite(book.id, chapterNum, verseSheet.verse) ? 'Saved' : 'Save verse'}</span>
                  </button>
                  <button
                    onClick={() => setShowNoteInput(v => !v)}
                    className={['flex items-center gap-2.5 p-3.5 rounded-xl border transition-colors', showNoteInput ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-card border-border text-foreground'].join(' ')}
                  >
                    <FileText size={18} />
                    <span className="text-[14px] font-medium">Note</span>
                  </button>
                </div>

                {sermonLinks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-widest">Preached Here</p>
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
                              {link.speaker}{link.sermonDate && ` · ${formatDate(link.sermonDate)}`}
                            </p>
                          </div>
                          <ExternalLink size={14} className="text-muted-foreground shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-widest">Highlight</p>
                  <div className="flex gap-3">
                    {HIGHLIGHT_COLORS.map(({ color, swatch }) => {
                      const hl = getHighlight(book.id, chapterNum, verseSheet.verse);
                      const active = hl?.color === color;
                      return (
                        <button
                          key={color}
                          onClick={() => setHighlightColor(verseSheet.verse, color)}
                          className={['w-9 h-9 rounded-full border-2 transition-all', swatch, active ? 'border-foreground scale-110' : 'border-transparent'].join(' ')}
                          aria-label={`Highlight ${color}`}
                        />
                      );
                    })}
                    {getHighlight(book.id, chapterNum, verseSheet.verse) && (
                      <button
                        onClick={() => removeHighlight(book!.id, chapterNum, verseSheet.verse)}
                        className="w-9 h-9 rounded-full border-2 border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground"
                        aria-label="Remove highlight"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {showNoteInput && (
                  <div className="space-y-2">
                    <textarea
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      placeholder="Write a note for this verse…"
                      className="w-full min-h-[100px] resize-none text-[15px] rounded-xl border border-border bg-background px-4 py-3 focus:outline-none focus:ring-1 focus:ring-primary"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button onClick={handleSaveNote} disabled={!noteText.trim()} className="flex-1 rounded-xl">
                        <Check size={15} className="mr-1.5" /> Save note
                      </Button>
                      <Button variant="ghost" onClick={() => setShowNoteInput(false)} className="rounded-xl">Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ── Chapter Notes Sheet ──────────────────────────────────────────────── */}
      <Sheet open={notesOpen} onOpenChange={setNotesOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] overflow-y-auto">
          <div className="space-y-4 pb-4">
            <SheetHeader>
              <SheetTitle className="text-left">Notes — {book.name} {chapterNum}</SheetTitle>
            </SheetHeader>
            {chapterNotes.length === 0 ? (
              <p className="text-[14px] text-muted-foreground">Tap any verse while reading to add a note.</p>
            ) : (
              <div className="space-y-3">
                {chapterNotes.map(note => (
                  <div key={note.id} className="p-4 bg-card rounded-xl border border-border space-y-1.5">
                    <p className="text-[12px] font-semibold text-primary uppercase tracking-widest">Verse {note.verse}</p>
                    <p className="text-[13px] text-muted-foreground italic line-clamp-2">"{note.verseText}"</p>
                    <p className="text-[15px] text-foreground leading-relaxed">{note.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Preached Here Sheet ──────────────────────────────────────────────── */}
      <Sheet open={preachedHereOpen} onOpenChange={setPreachedHereOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[70dvh] overflow-y-auto">
          <div className="space-y-4 pb-4">
            <SheetHeader>
              <SheetTitle className="text-left">{book.name} {chapterNum} — Preached at ICC</SheetTitle>
            </SheetHeader>
            <div className="space-y-2.5">
              {preachedHereSermons.map((sermon, i) => (
                <div
                  key={sermon.sermonId ?? i}
                  className="flex items-start gap-3 p-3.5 rounded-xl border border-border"
                >
                  <span className="text-[22px] leading-none mt-0.5 shrink-0" aria-hidden="true">🎧</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-foreground line-clamp-2">{sermon.title}</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">{sermon.speaker}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {/* Listen button (in-app player) */}
                      {sermon.audioUrl && (
                        <button
                          onClick={() => {
                            setPreachedHereOpen(false);
                            setPreachedHerePlayer({
                              audioUrl: sermon.audioUrl!,
                              startSeconds: sermon.relativeStartSeconds ?? 0,
                              title: sermon.title,
                              speaker: sermon.speaker,
                              watchUrl: sermon.timestampedUrl,
                            });
                          }}
                          className="flex items-center gap-1 text-[12px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded-full hover:bg-amber-100 transition-colors"
                        >
                          🎧 {sermon.relativeTimestampLabel ? `Listen from ${sermon.relativeTimestampLabel}` : 'Listen'}
                        </button>
                      )}
                      {/* Watch button (YouTube) */}
                      <a
                        href={sermon.timestampedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        ▶ {sermon.timestampLabel ? `Watch from ${sermon.timestampLabel}` : 'Watch on YouTube'}
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Preached Here Audio Player ───────────────────────────────────────── */}
      {preachedHerePlayer && (
        <SermonAudioPlayer
          open={!!preachedHerePlayer}
          onClose={() => setPreachedHerePlayer(null)}
          audioUrl={preachedHerePlayer.audioUrl}
          startSeconds={preachedHerePlayer.startSeconds}
          title={preachedHerePlayer.title}
          speaker={preachedHerePlayer.speaker}
          watchUrl={preachedHerePlayer.watchUrl}
        />
      )}

    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}
