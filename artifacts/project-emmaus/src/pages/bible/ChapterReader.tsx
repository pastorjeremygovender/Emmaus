import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useSearch } from 'wouter';
import { getApiUrl } from '@/lib/api';
import { SermonAudioPlayer } from '@/components/SermonAudioPlayer';
import {
  ArrowLeft, Heart, FileText, Bookmark, X, Check,
  ChevronLeft, ChevronRight, Loader2, ExternalLink, RefreshCw, ChevronDown,
  BookOpen, Share2, Highlighter, MessageSquare, Sparkles, ArrowLeftRight, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getBibleBook, getPrevBook, getNextBook } from '@/lib/bible-data';
import { useBible, HighlightColor } from '@/contexts/BibleContext';
import { useChapter } from '@/hooks/useChapter';
import { getVerseSermonLinks } from '@/data/sermon-verse-links';
import { BibleBookChapterSheet } from '@/components/BibleBookChapterSheet';
import { VerseStudyPanel, type StudyVerse } from '@/components/VerseStudyPanel';
import { useTranslations, type TranslationMeta } from '@/hooks/useTranslations';
import { BottomNav } from '@/components/BottomNav';
import { FavouriteButton } from '@/components/FavouriteButton';

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
  const journeyId      = queryParams.get('journey');
  const returnTo       = queryParams.get('returnTo');       // set when opened from Daily Rhythm
  const startVerseParam = queryParams.get('startVerse');    // set when opened with a verse ref
  const qs = journeyId ? `?journey=${journeyId}` : '';

  const {
    translationId, setTranslation,
    markChapterOpened,
    getHighlight, addHighlight, removeHighlight,
    isFavourite, addFavourite, removeFavourite,
    getNote, saveNote, getChapterNotes,
    isBookmarked, addBookmark, removeBookmark,
    savePrayer,
  } = useBible();

  const { translations } = useTranslations();

  const resolvedBookId = bookId || 'luke';
  const book = getBibleBook(resolvedBookId);

  const { chapter: chapterData, loading, error, retry } = useChapter(resolvedBookId, chapterNum, translationId);

  const [verseSheet, setVerseSheet] = useState<{ verse: number; text: string } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showPrayerInput, setShowPrayerInput] = useState(false);
  const [prayerText, setPrayerText] = useState('');
  const [studyPanelVerse, setStudyPanelVerse] = useState<StudyVerse | null>(null);
  const [compareSheet, setCompareSheet] = useState<{ verse: number; text: string } | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [translationDropdownOpen, setTranslationDropdownOpen] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [preachedHereSermons, setPreachedHereSermons] = useState<Array<{
    sermonId: string; title: string; speaker: string; sermonDate?: string;
    timestampedUrl: string; timestampLabel: string; matchingReference?: string;
    audioUrl?: string; relativeStartSeconds?: number; relativeTimestampLabel?: string;
    youtubeUrl?: string;
  }>>([]);
  // Book-level fallback sermons — shown only when no chapter-specific results exist
  const [preachedHereBookSermons, setPreachedHereBookSermons] = useState<Array<{
    sermonId: string; title: string; speaker: string; sermonDate?: string;
    timestampedUrl: string; timestampLabel: string;
    audioUrl?: string; relativeStartSeconds?: number; relativeTimestampLabel?: string;
    youtubeUrl?: string;
  }>>([]);
  // Book intro + chapter overview
  const [bookIntro, setBookIntro] = useState<{
    author: string; dateWritten: string; theme: string;
    keyVerse: string; keyVerseRef: string; overview: string;
  } | null>(null);
  const [chapterOverview, setChapterOverview] = useState<string | null>(null);
  const [introExpanded, setIntroExpanded] = useState(false);

  const [preachedHereOpen, setPreachedHereOpen] = useState(false);
  const [preachedHerePlayer, setPreachedHerePlayer] = useState<{
    audioUrl: string; startSeconds: number; title: string; speaker?: string; watchUrl?: string;
  } | null>(null);

  const scrollSaveKey = `emmaus_scroll_${resolvedBookId}_${chapterNum}`;
  const scrollBeforeTranslation = useRef<number | null>(null);
  const dropdownWrapperRef = useRef<HTMLDivElement>(null);
  const prevTranslationRef = useRef<string>(translationId);

  // ── Swipe navigation ──────────────────────────────────────────────────────
  const swipeTouchStartX = useRef<number | null>(null);
  const swipeTouchStartY = useRef<number | null>(null);

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
    // Deep-link: scroll to specific verse when opened from Daily Rhythm.
    // Takes priority over saved session scroll so the reader starts at
    // the exact passage referenced in today's reading.
    if (startVerseParam) {
      const el = document.getElementById(`verse-${startVerseParam}`);
      if (el) {
        requestAnimationFrame(() => el.scrollIntoView({ block: 'center' }));
        return;
      }
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

  // Fetch book intro + chapter overview when book/chapter changes (non-critical)
  useEffect(() => {
    setBookIntro(null);
    setChapterOverview(null);
    setIntroExpanded(false);

    // BS-1: use query-param routes that read from the DB (Published rows),
    // not the legacy path-param routes that returned static hardcoded data.
    // BS-2: map DB snake_case column names to the shape this component expects.
    fetch(getApiUrl(`/api/bible/book-intro?bookId=${encodeURIComponent(resolvedBookId)}`))
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) { setBookIntro(null); return; }
        setBookIntro({
          author: data.author_attribution ?? data.author ?? '',
          dateWritten: data.date_range ?? data.dateWritten ?? '',
          theme: Array.isArray(data.major_themes)
            ? data.major_themes.join(', ')
            : (data.theme ?? ''),
          keyVerse: Array.isArray(data.key_passages) && data.key_passages[0]
            ? data.key_passages[0]
            : (data.keyVerse ?? ''),
          keyVerseRef: data.keyVerseRef ?? '',
          overview: data.purpose ?? data.historical_setting ?? data.overview ?? '',
        });
      })
      .catch(() => {/* non-critical */});

    fetch(getApiUrl(`/api/bible/chapter-overview?bookId=${encodeURIComponent(resolvedBookId)}&chapter=${chapterNum}`))
      .then(r => r.ok ? r.json() : null)
      .then(data => setChapterOverview(data?.summary ?? null))
      .catch(() => {/* non-critical */});
  }, [resolvedBookId, chapterNum]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch Preached Here sermons when book/chapter changes (non-critical)
  useEffect(() => {
    setPreachedHereSermons([]);
    setPreachedHereBookSermons([]);
    const url = getApiUrl(
      `/api/youtube-archive/preached-here?bookId=${encodeURIComponent(resolvedBookId)}&chapter=${chapterNum}`
    );
    fetch(url)
      .then(r => r.ok ? r.json() : { chapterSermons: [], bookSermons: [] })
      .then((data: {
        sermons?: typeof preachedHereSermons;
        chapterSermons?: typeof preachedHereSermons;
        bookSermons?: typeof preachedHereBookSermons;
      }) => {
        // chapterSermons is the new field; fall back to legacy `sermons` key
        setPreachedHereSermons(data.chapterSermons ?? data.sermons ?? []);
        setPreachedHereBookSermons(data.bookSermons ?? []);
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

  // Share verse via Web Share API (with clipboard fallback).
  // deepLink: null suppresses the "Continue your journey" block — verse shares
  // stand alone and don't need a deep link to a specific verse.
  async function handleShare(verseNum: number, text: string) {
    const ref = `${book!.name} ${chapterNum}:${verseNum}`;
    const { shareContent } = await import('@/lib/share');
    try {
      await shareContent({
        title: ref,
        reflection: `"${text}"`,
        deepLink: null,
      });
    } catch { /* cancelled or clipboard unavailable */ }
  }

  // Save verse prayer — prepends the verse reference to the prayer text
  function handleSavePrayer(verseNum: number) {
    if (!prayerText.trim()) return;
    savePrayer(book!.id, chapterNum, `${book!.name} ${chapterNum}:${verseNum} — ${prayerText.trim()}`);
    setPrayerText('');
    setShowPrayerInput(false);
  }

  // Open study panel for a verse
  function openStudyPanel(verseNum: number, text: string) {
    setVerseSheet(null);
    setStudyPanelVerse({
      bookId: resolvedBookId,
      bookName: book!.name,
      chapter: chapterNum,
      verse: verseNum,
      text,
    });
  }

  // Any open overlay should suppress swipe so the gesture doesn't fire through panels
  const anyOverlayOpen =
    !!verseSheet || !!studyPanelVerse || !!compareSheet ||
    notesOpen || pickerOpen || preachedHereOpen ||
    translationDropdownOpen || !!preachedHerePlayer;

  function handleSwipeTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    swipeTouchStartX.current = t.clientX;
    swipeTouchStartY.current = t.clientY;
  }

  function handleSwipeTouchEnd(e: React.TouchEvent) {
    if (anyOverlayOpen) return;
    if (swipeTouchStartX.current === null || swipeTouchStartY.current === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeTouchStartX.current;
    const dy = t.clientY - swipeTouchStartY.current;
    swipeTouchStartX.current = null;
    swipeTouchStartY.current = null;

    const MIN_SWIPE = 60; // px — minimum horizontal travel
    // Only treat as a horizontal swipe if the lateral movement clearly dominates vertical
    if (Math.abs(dx) < MIN_SWIPE || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    if (dx < 0 && nextPath) {
      // Swiped left → next chapter
      navigateChapter(nextPath);
    } else if (dx > 0 && prevPath) {
      // Swiped right → previous chapter
      navigateChapter(prevPath);
    }
  }

  return (
    <div
      className="min-h-[100dvh] bg-background"
      onTouchStart={handleSwipeTouchStart}
      onTouchEnd={handleSwipeTouchEnd}
    >

      {/* ── Bible Book + Chapter sheet ───────────────────────────────────────── */}
      <BibleBookChapterSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        currentBookId={resolvedBookId}
        currentChapter={chapterNum}
        onNavigate={handlePickerNavigate}
      />

      {/* ── Sticky Header ───────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[600px] mx-auto gap-2">

          {/* Back — returns to caller (Daily Rhythm) or My Bible home */}
          <button
            onClick={() => { if (window.history.length > 1) window.history.back(); else setLocation(returnTo ?? '/bible'); }}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
            aria-label={returnTo ? 'Back to 10 Minutes with Jesus' : 'Back to My Bible'}
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

          {/* Notes + Save + Favourite — moved here from bottom toolbar to avoid FAB overlap */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setNotesOpen(true)}
              className="relative p-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Chapter notes"
            >
              <FileText size={20} />
              {chapterNotes.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 bg-primary text-[7px] text-primary-foreground rounded-full flex items-center justify-center font-bold leading-none">
                  {chapterNotes.length}
                </span>
              )}
            </button>
            <button
              onClick={handleToggleBookmark}
              className={['p-2 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center', bookmarked ? 'text-primary' : 'text-muted-foreground hover:text-foreground'].join(' ')}
              aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this chapter'}
            >
              <Bookmark size={20} className={bookmarked ? 'fill-primary' : ''} />
            </button>
            <FavouriteButton
              contentType="bible-chapter"
              contentId={`${resolvedBookId}-${chapterNum}`}
              contentTitle={`${book.name} ${chapterNum}${chapterData?.heading ? ` — ${chapterData.heading}` : ''}`}
              contentRoute={`/bible/read/${resolvedBookId}/${chapterNum}`}
              size={20}
            />
          </div>
        </div>

        {/* Chapter heading (sub-line) */}
        {chapterData?.heading && (
          <div className="text-center pb-2 px-4">
            <span className="text-[11px] text-muted-foreground truncate">{chapterData.heading}</span>
          </div>
        )}

        {/* Verse-tap hint — one compact line, no card */}
        <div className="px-5 pb-2">
          <p className="text-[11px] text-muted-foreground/60 text-center">
            Tap any verse to open Bible Study options.
          </p>
        </div>

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
      {/* pb accounts for the raised FAB on the bible reader: FAB bottom 8.5rem + FAB height 3rem + breathing 1rem */}
      <main
        className="px-5 pt-8 max-w-[600px] mx-auto"
        style={{ paddingBottom: 'calc(12.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
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

            {/* Book intro card — shown on chapter 1 only */}
            {chapterNum === 1 && bookIntro && (
              <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 overflow-hidden">
                <button
                  onClick={() => setIntroExpanded(v => !v)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                >
                  <div className="w-8 h-8 bg-primary/15 rounded-xl flex items-center justify-center shrink-0">
                    <Info size={15} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-foreground">About {book.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{bookIntro.theme}</p>
                  </div>
                  <ChevronDown
                    size={15}
                    className={['text-muted-foreground transition-transform shrink-0', introExpanded ? 'rotate-180' : ''].join(' ')}
                  />
                </button>

                {introExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-primary/10">
                    <p className="text-[14px] text-foreground leading-[1.7] pt-3">{bookIntro.overview}</p>

                    <div className="rounded-xl bg-background/60 border border-primary/10 p-3.5 space-y-1">
                      <p className="text-[12px] font-semibold text-primary/80 uppercase tracking-widest">Key Verse</p>
                      <p className="text-[14px] text-foreground italic leading-[1.6]">"{bookIntro.keyVerse}"</p>
                      <p className="text-[12px] text-muted-foreground font-medium">— {bookIntro.keyVerseRef}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-background/60 border border-border/50 p-3">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Author</p>
                        <p className="text-[13px] text-foreground leading-snug">{bookIntro.author}</p>
                      </div>
                      <div className="rounded-xl bg-background/60 border border-border/50 p-3">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Written</p>
                        <p className="text-[13px] text-foreground leading-snug">{bookIntro.dateWritten}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {chapterData.verses.map(v => {
              const hl = getHighlight(book.id, chapterNum, v.verse);
              const fav = isFavourite(book.id, chapterNum, v.verse);
              const note = getNote(book.id, chapterNum, v.verse);
              return (
                <span
                  id={`verse-${v.verse}`}
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

      {/* ── Standard App Navigation ─────────────────────────────────────────── */}
      <BottomNav />

      {/* ── Chapter Navigation — sits directly above the app nav ─────────────── */}
      {/* bottom = BottomNav height (h-16=4rem) + device safe-area inset */}
      <div
        className="fixed left-0 right-0 z-20 bg-background/95 backdrop-blur-sm border-t border-border/50"
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="max-w-[600px] mx-auto">

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
      <Sheet open={!!verseSheet} onOpenChange={open => {
        if (!open) {
          setVerseSheet(null);
          setShowNoteInput(false);
          setShowHighlightPicker(false);
          setShowPrayerInput(false);
        }
      }}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[92dvh] overflow-y-auto">
          {verseSheet && (() => {
            const fav = isFavourite(book.id, chapterNum, verseSheet.verse);
            const bkm = isBookmarked(book.id, chapterNum);
            const hl  = getHighlight(book.id, chapterNum, verseSheet.verse);
            const ref = `${book.name} ${chapterNum}:${verseSheet.verse}`;
            return (
              <div className="space-y-4 pb-4">
                {/* Reference + text */}
                <SheetHeader>
                  <SheetTitle className="text-left text-[12px] font-semibold text-primary uppercase tracking-widest">
                    {ref}
                  </SheetTitle>
                </SheetHeader>
                <p className="font-sans text-[17px] leading-[1.65] text-foreground italic">"{verseSheet.text}"</p>

                {/* 8-action grid */}
                <div className="grid grid-cols-4 gap-2">
                  {/* Study */}
                  <button
                    onClick={() => openStudyPanel(verseSheet.verse, verseSheet.text)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl border bg-card border-border hover:bg-primary/5 hover:border-primary/30 transition-colors"
                  >
                    <BookOpen size={20} className="text-primary" />
                    <span className="text-[11px] font-medium text-foreground">Study</span>
                  </button>

                  {/* Highlight */}
                  <button
                    onClick={() => { setShowHighlightPicker(v => !v); setShowNoteInput(false); setShowPrayerInput(false); }}
                    className={['flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-colors', showHighlightPicker || hl ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' : 'bg-card border-border hover:bg-muted/50'].join(' ')}
                  >
                    <Highlighter size={20} className={hl ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'} />
                    <span className="text-[11px] font-medium text-foreground">Highlight</span>
                  </button>

                  {/* Note */}
                  <button
                    onClick={() => { setShowNoteInput(v => !v); setShowHighlightPicker(false); setShowPrayerInput(false); }}
                    className={['flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-colors', showNoteInput ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-card border-border hover:bg-muted/50'].join(' ')}
                  >
                    <FileText size={20} className={showNoteInput ? 'text-primary' : getNote(book.id, chapterNum, verseSheet.verse) ? 'text-primary' : 'text-muted-foreground'} />
                    <span className="text-[11px] font-medium text-foreground">Note</span>
                  </button>

                  {/* Bookmark (chapter) */}
                  <button
                    onClick={handleToggleBookmark}
                    className={['flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-colors', bkm ? 'bg-primary/10 border-primary/30' : 'bg-card border-border hover:bg-muted/50'].join(' ')}
                  >
                    <Bookmark size={20} className={bkm ? 'fill-primary text-primary' : 'text-muted-foreground'} />
                    <span className="text-[11px] font-medium text-foreground">{bkm ? 'Saved' : 'Bookmark'}</span>
                  </button>

                  {/* Favourite */}
                  <button
                    onClick={() => toggleFavourite(verseSheet.verse, verseSheet.text)}
                    className={['flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-colors', fav ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800' : 'bg-card border-border hover:bg-muted/50'].join(' ')}
                  >
                    <Heart size={20} className={fav ? 'fill-rose-500 text-rose-500' : 'text-muted-foreground'} />
                    <span className="text-[11px] font-medium text-foreground">{fav ? 'Saved' : 'Favourite'}</span>
                  </button>

                  {/* Prayer */}
                  <button
                    onClick={() => { setShowPrayerInput(v => !v); setShowNoteInput(false); setShowHighlightPicker(false); }}
                    className={['flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-colors', showPrayerInput ? 'bg-primary/10 border-primary/30' : 'bg-card border-border hover:bg-muted/50'].join(' ')}
                  >
                    <MessageSquare size={20} className={showPrayerInput ? 'text-primary' : 'text-muted-foreground'} />
                    <span className="text-[11px] font-medium text-foreground">Prayer</span>
                  </button>

                  {/* Share */}
                  <button
                    onClick={() => handleShare(verseSheet.verse, verseSheet.text)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl border bg-card border-border hover:bg-muted/50 transition-colors"
                  >
                    <Share2 size={20} className="text-muted-foreground" />
                    <span className="text-[11px] font-medium text-foreground">Share</span>
                  </button>

                  {/* Ask Emmaus */}
                  <button
                    onClick={() => {
                      setVerseSheet(null);
                      setLocation(
                        `/personal/ask-emmaus/conversation?verse=${encodeURIComponent(ref)}&q=${encodeURIComponent(`Help me understand ${ref}: "${verseSheet.text}"`)}`
                      );
                    }}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl border bg-card border-border hover:bg-primary/5 hover:border-primary/30 transition-colors"
                  >
                    <Sparkles size={20} className="text-muted-foreground" />
                    <span className="text-[11px] font-medium text-foreground">Ask AI</span>
                  </button>

                  {/* Compare translations */}
                  <button
                    onClick={() => {
                      setCompareSheet({ verse: verseSheet.verse, text: verseSheet.text });
                      setVerseSheet(null);
                    }}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl border bg-card border-border hover:bg-primary/5 hover:border-primary/30 transition-colors"
                  >
                    <ArrowLeftRight size={20} className="text-muted-foreground" />
                    <span className="text-[11px] font-medium text-foreground">Compare</span>
                  </button>
                </div>

                {/* Highlight colour picker (shown when Highlight is toggled) */}
                {showHighlightPicker && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Choose colour</p>
                    <div className="flex gap-3 items-center">
                      {HIGHLIGHT_COLORS.map(({ color, swatch }) => {
                        const active = hl?.color === color;
                        return (
                          <button
                            key={color}
                            onClick={() => setHighlightColor(verseSheet.verse, color)}
                            className={['w-10 h-10 rounded-full border-2 transition-all', swatch, active ? 'border-foreground scale-110' : 'border-transparent'].join(' ')}
                            aria-label={`Highlight ${color}`}
                          />
                        );
                      })}
                      {hl && (
                        <button
                          onClick={() => removeHighlight(book!.id, chapterNum, verseSheet.verse)}
                          className="w-10 h-10 rounded-full border-2 border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground"
                          aria-label="Remove highlight"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Note input (shown when Note is toggled) */}
                {showNoteInput && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Note</p>
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

                {/* Prayer input (shown when Prayer is toggled) */}
                {showPrayerInput && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Prayer journal</p>
                    <p className="text-[12px] text-muted-foreground italic">"{verseSheet.text}"</p>
                    <textarea
                      value={prayerText}
                      onChange={e => setPrayerText(e.target.value)}
                      placeholder="Write a prayer inspired by this verse…"
                      className="w-full min-h-[100px] resize-none text-[15px] rounded-xl border border-border bg-background px-4 py-3 focus:outline-none focus:ring-1 focus:ring-primary"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button onClick={() => handleSavePrayer(verseSheet.verse)} disabled={!prayerText.trim()} className="flex-1 rounded-xl">
                        <Check size={15} className="mr-1.5" /> Save prayer
                      </Button>
                      <Button variant="ghost" onClick={() => setShowPrayerInput(false)} className="rounded-xl">Cancel</Button>
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

            {preachedHereSermons.length > 0 ? (
              /* Chapter-specific results — confirmed references to this chapter */
              <div className="space-y-2.5">
                {preachedHereSermons.map((sermon, i) => (
                  <PreachedHereCard
                    key={sermon.sermonId ?? i}
                    sermon={sermon}
                    onListen={sermon.audioUrl ? () => {
                      setPreachedHereOpen(false);
                      setPreachedHerePlayer({
                        audioUrl: sermon.audioUrl!,
                        startSeconds: sermon.relativeStartSeconds ?? 0,
                        title: sermon.title,
                        speaker: sermon.speaker,
                        watchUrl: sermon.timestampedUrl,
                      });
                    } : undefined}
                  />
                ))}
              </div>
            ) : preachedHereBookSermons.length > 0 ? (
              /* Book-level fallback — shown only when no chapter-specific results exist */
              <div className="space-y-3">
                <div className="px-3 py-2.5 rounded-xl bg-muted/50 border border-border">
                  <p className="text-[13px] text-muted-foreground leading-relaxed">
                    We found sermons from the book of {book.name}, but none linked specifically to this chapter yet.
                  </p>
                </div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest pt-1">
                  Other sermons from {book.name}
                </p>
                <div className="space-y-2.5">
                  {preachedHereBookSermons.map((sermon, i) => (
                    <PreachedHereCard
                      key={sermon.sermonId ?? i}
                      sermon={sermon}
                      onListen={sermon.audioUrl ? () => {
                        setPreachedHereOpen(false);
                        setPreachedHerePlayer({
                          audioUrl: sermon.audioUrl!,
                          startSeconds: sermon.relativeStartSeconds ?? 0,
                          title: sermon.title,
                          speaker: sermon.speaker,
                          watchUrl: sermon.timestampedUrl,
                        });
                      } : undefined}
                    />
                  ))}
                </div>
              </div>
            ) : (
              /* Empty state */
              <div className="py-8 text-center">
                <p className="text-[14px] text-muted-foreground">
                  No sermons linked to this chapter yet.
                </p>
              </div>
            )}
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

      {/* ── Verse Study Panel ────────────────────────────────────────────────── */}
      <VerseStudyPanel
        verse={studyPanelVerse}
        open={!!studyPanelVerse}
        onClose={() => setStudyPanelVerse(null)}
      />

      {/* ── Compare Translations Sheet ───────────────────────────────────────── */}
      <CompareVerseSheet
        open={!!compareSheet}
        onClose={() => setCompareSheet(null)}
        bookId={resolvedBookId}
        bookName={book.name}
        chapterNum={chapterNum}
        verse={compareSheet?.verse ?? 1}
        currentText={compareSheet?.text ?? ''}
        currentTranslationId={translationId}
        translations={translations}
      />

    </div>
  );
}

interface CompareVerseSheetProps {
  open: boolean;
  onClose: () => void;
  bookId: string;
  bookName: string;
  chapterNum: number;
  verse: number;
  currentText: string;
  currentTranslationId: string;
  translations: TranslationMeta[];
}
interface PHSSermon {
  sermonId: string; title: string; speaker: string; sermonDate?: string;
  timestampedUrl: string; timestampLabel: string; matchingReference?: string;
  audioUrl?: string; relativeStartSeconds?: number; relativeTimestampLabel?: string;
}

function PreachedHereCard({
  sermon, onListen,
}: { sermon: PHSSermon; onListen?: () => void }) {
  return (
    <div className="flex items-start gap-3 p-3.5 rounded-xl border border-border">
      <span className="text-[22px] leading-none mt-0.5 shrink-0" aria-hidden="true">🎧</span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-foreground line-clamp-2">{sermon.title}</p>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          {sermon.speaker}
          {sermon.sermonDate && ` · ${formatDate(sermon.sermonDate)}`}
        </p>
        {/* Matching scripture reference — explains why this sermon appeared */}
        {sermon.matchingReference && (
          <p className="text-[11px] font-medium text-primary mt-1">{sermon.matchingReference}</p>
        )}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {onListen && (
            <button
              onClick={onListen}
              className="flex items-center gap-1 text-[12px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded-full hover:bg-amber-100 transition-colors"
            >
              🎧 {sermon.relativeTimestampLabel ? `Listen from ${sermon.relativeTimestampLabel}` : 'Listen'}
            </button>
          )}
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
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

function CompareVerseSheet({
  open, onClose, bookId, bookName, chapterNum, verse,
  currentText, currentTranslationId, translations,
}: CompareVerseSheetProps) {
  // Default the compare translation to the first translation that isn't current
  const defaultCompare = translations.find(t => t.id !== currentTranslationId)?.id ?? '';
  const [compareId, setCompareId] = useState(defaultCompare);

  // When the sheet opens, reset to a sensible default if the current value is the same as
  // the primary translation (can happen when the primary changes while the sheet is open)
  useEffect(() => {
    if (open) {
      if (!compareId || compareId === currentTranslationId) {
        const other = translations.find(t => t.id !== currentTranslationId);
        if (other) setCompareId(other.id);
      }
    }
  }, [open, currentTranslationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { chapter: compareChapter, loading: compareLoading } = useChapter(
    bookId, chapterNum, compareId,
  );
  const compareVerseText = compareChapter?.verses.find(v => v.verse === verse)?.text ?? null;

  const currentMeta = translations.find(t => t.id === currentTranslationId);
  const compareMeta = translations.find(t => t.id === compareId);

  const ref = `${bookName} ${chapterNum}:${verse}`;

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[92dvh] overflow-y-auto">
        <div className="space-y-4 pb-4">
          <SheetHeader>
            <SheetTitle className="text-left text-[12px] font-semibold text-primary uppercase tracking-widest">
              {ref} — Compare
            </SheetTitle>
          </SheetHeader>

          {/* Translation pair selector */}
          <div className="flex items-center gap-2">
            {/* Primary (read-only, current translation) */}
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-muted/40">
              <span className="w-9 h-6 rounded text-[10px] font-bold flex items-center justify-center bg-primary text-primary-foreground shrink-0">
                {currentMeta?.abbreviation ?? currentTranslationId.toUpperCase()}
              </span>
              <span className="text-[13px] font-medium text-foreground truncate">
                {currentMeta?.name ?? currentTranslationId}
              </span>
            </div>

            <ArrowLeftRight size={16} className="text-muted-foreground shrink-0" />

            {/* Compare — user picks */}
            <div className="flex-1 relative">
              <select
                value={compareId}
                onChange={e => setCompareId(e.target.value)}
                className="w-full appearance-none px-3 py-2 rounded-xl border border-border bg-card text-[13px] font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                aria-label="Select comparison translation"
              >
                {translations
                  .filter(t => t.id !== currentTranslationId)
                  .map(t => (
                    <option key={t.id} value={t.id}>{t.abbreviation} — {t.name}</option>
                  ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Side-by-side verse panels */}
          <div className="grid grid-cols-2 gap-3">
            {/* Current translation */}
            <div className="p-3.5 rounded-xl border border-border bg-card space-y-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-primary text-primary-foreground">
                {currentMeta?.abbreviation ?? currentTranslationId.toUpperCase()}
              </span>
              <p className="text-[14px] leading-[1.7] text-foreground">{currentText}</p>
            </div>

            {/* Compare translation */}
            <div className="p-3.5 rounded-xl border border-border bg-card space-y-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted text-muted-foreground">
                {compareMeta?.abbreviation ?? compareId.toUpperCase()}
              </span>
              {compareLoading ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 size={14} className="text-primary animate-spin shrink-0" />
                  <span className="text-[13px] text-muted-foreground">Loading…</span>
                </div>
              ) : compareVerseText ? (
                <p className="text-[14px] leading-[1.7] text-foreground">{compareVerseText}</p>
              ) : (
                <p className="text-[13px] text-muted-foreground italic">
                  This verse is not available in the selected translation.
                </p>
              )}
            </div>
          </div>

          {/* Attribution for licensed translations */}
          {compareMeta?.attributionUrl && (
            <p className="text-[11px] text-muted-foreground text-center">
              {compareMeta.name} text provided via API.Bible
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
