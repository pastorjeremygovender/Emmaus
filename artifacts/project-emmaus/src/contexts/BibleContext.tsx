import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type HighlightColor = 'amber' | 'blue' | 'green';

export type VerseHighlight = { bookId: string; chapter: number; verse: number; color: HighlightColor };
export type VerseFavourite = { id: string; bookId: string; bookName: string; chapter: number; verse: number; verseText: string; savedAt: string };
export type VerseNote = { id: string; bookId: string; chapter: number; verse: number; verseText: string; text: string; createdAt: string; updatedAt: string };
export type ChapterBookmark = { id: string; bookId: string; bookName: string; chapter: number; chapterHeading: string; savedAt: string };

export type ReadingHistoryEntry = {
  bookId: string;
  bookName: string;
  chapter: number;
  chapterHeading: string;
  openedAt: string;
};

export type BibleJourneyProgress = {
  journeyId: string;
  currentChapter: number;
  completedChapters: number[];
  startedAt: string;
  lastCompletedAt: string | null;
};

export type ChapterReflection = { id: string; bookId: string; chapter: number; text: string; createdAt: string };
export type PersonalPrayer = { id: string; bookId: string; chapter: number; text: string; savedAt: string };

// ─── Storage keys ─────────────────────────────────────────────────────────────

const LS = {
  history:           'emmaus_bible_history_v2',    // now an array
  completed:         'emmaus_bible_completed',
  journeyProgress:   'emmaus_bible_journey_progress',
  highlights:        'emmaus_bible_highlights',
  favourites:        'emmaus_bible_favourites',
  notes:             'emmaus_bible_notes',
  reflections:       'emmaus_bible_reflections',
  prayers:           'emmaus_bible_prayers',
  bookmarks:         'emmaus_bible_bookmarks_v2',
  translation:       'emmaus_bible_translation',
} as const;

const HISTORY_MAX = 20;

function load<T>(key: string, fallback: T): T {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; }
  catch { return fallback; }
}

function save(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function genId(prefix = 'b') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function chapterKey(bookId: string, chapter: number) {
  return `${bookId}-${chapter}`;
}

// ─── Context type ─────────────────────────────────────────────────────────────

type BibleContextType = {
  // Translation preference
  translationId: string;
  setTranslation: (id: string) => void;

  // Reading history (list of last 20 opened chapters)
  readingHistory: ReadingHistoryEntry[];
  lastRead: ReadingHistoryEntry | null;   // convenience: most recent
  markChapterOpened: (entry: Omit<ReadingHistoryEntry, 'openedAt'>) => void;

  // Completed chapters
  completedChapters: Set<string>;
  markChapterComplete: (bookId: string, chapter: number) => void;
  isChapterComplete: (bookId: string, chapter: number) => boolean;

  // Bible Journey progress
  journeyProgress: Record<string, BibleJourneyProgress>;
  startBibleJourney: (journeyId: string) => void;
  markJourneyChapterComplete: (journeyId: string, chapter: number) => void;
  getJourneyProgress: (journeyId: string) => BibleJourneyProgress | null;

  // Highlights
  highlights: VerseHighlight[];
  addHighlight: (bookId: string, chapter: number, verse: number, color: HighlightColor) => void;
  removeHighlight: (bookId: string, chapter: number, verse: number) => void;
  getHighlight: (bookId: string, chapter: number, verse: number) => VerseHighlight | undefined;

  // Favourites
  favourites: VerseFavourite[];
  addFavourite: (fav: Omit<VerseFavourite, 'id' | 'savedAt'>) => void;
  removeFavourite: (bookId: string, chapter: number, verse: number) => void;
  isFavourite: (bookId: string, chapter: number, verse: number) => boolean;

  // Chapter bookmarks
  bookmarks: ChapterBookmark[];
  addBookmark: (entry: Omit<ChapterBookmark, 'id' | 'savedAt'>) => void;
  removeBookmark: (bookId: string, chapter: number) => void;
  isBookmarked: (bookId: string, chapter: number) => boolean;

  // Notes
  notes: VerseNote[];
  saveNote: (bookId: string, chapter: number, verse: number, verseText: string, text: string) => void;
  deleteNote: (noteId: string) => void;
  getNote: (bookId: string, chapter: number, verse: number) => VerseNote | undefined;
  getChapterNotes: (bookId: string, chapter: number) => VerseNote[];

  // Chapter reflections
  reflections: ChapterReflection[];
  saveReflection: (bookId: string, chapter: number, text: string) => void;
  getReflection: (bookId: string, chapter: number) => ChapterReflection | undefined;

  // Personal prayers
  prayers: PersonalPrayer[];
  savePrayer: (bookId: string, chapter: number, text: string) => void;
  getPrayer: (bookId: string, chapter: number) => PersonalPrayer | undefined;
};

const BibleContext = createContext<BibleContextType | null>(null);

export function useBible(): BibleContextType {
  const ctx = useContext(BibleContext);
  if (!ctx) throw new Error('useBible must be used within BibleProvider');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function BibleProvider({ children }: { children: React.ReactNode }) {
  const [translationId, setTranslationIdState] = useState<string>('bsb');
  const [readingHistory, setReadingHistory] = useState<ReadingHistoryEntry[]>([]);
  const [completedChapters, setCompletedChapters] = useState<Set<string>>(new Set());
  const [journeyProgress, setJourneyProgress] = useState<Record<string, BibleJourneyProgress>>({});
  const [highlights, setHighlights] = useState<VerseHighlight[]>([]);
  const [favourites, setFavourites] = useState<VerseFavourite[]>([]);
  const [bookmarks, setBookmarks] = useState<ChapterBookmark[]>([]);
  const [notes, setNotes] = useState<VerseNote[]>([]);
  const [reflections, setReflections] = useState<ChapterReflection[]>([]);
  const [prayers, setPrayers] = useState<PersonalPrayer[]>([]);

  useEffect(() => {
    setTranslationIdState(load(LS.translation, 'bsb'));
    // Migrate old single-entry history to array
    const rawHistory = localStorage.getItem(LS.history);
    const oldHistory = localStorage.getItem('emmaus_bible_history');
    if (rawHistory) {
      setReadingHistory(load(LS.history, []));
    } else if (oldHistory) {
      try {
        const old = JSON.parse(oldHistory) as ReadingHistoryEntry | null;
        if (old && old.bookId) setReadingHistory([old]);
      } catch { /* ignore */ }
    }
    const completed: string[] = load(LS.completed, []);
    setCompletedChapters(new Set(completed));
    setJourneyProgress(load(LS.journeyProgress, {}));
    setHighlights(load(LS.highlights, []));
    setFavourites(load(LS.favourites, []));
    setBookmarks(load(LS.bookmarks, []));
    setNotes(load(LS.notes, []));
    setReflections(load(LS.reflections, []));
    setPrayers(load(LS.prayers, []));
  }, []);

  const setTranslation = useCallback((id: string) => {
    setTranslationIdState(id);
    save(LS.translation, id);
  }, []);

  const markChapterOpened = useCallback((entry: Omit<ReadingHistoryEntry, 'openedAt'>) => {
    setReadingHistory(prev => {
      // Remove existing entry for same book+chapter, prepend new one, cap at HISTORY_MAX
      const filtered = prev.filter(e => !(e.bookId === entry.bookId && e.chapter === entry.chapter));
      const next = [{ ...entry, openedAt: new Date().toISOString() }, ...filtered].slice(0, HISTORY_MAX);
      save(LS.history, next);
      return next;
    });
  }, []);

  const markChapterComplete = useCallback((bookId: string, chapter: number) => {
    setCompletedChapters(prev => {
      const next = new Set(prev);
      next.add(chapterKey(bookId, chapter));
      save(LS.completed, Array.from(next));
      return next;
    });
  }, []);

  const isChapterComplete = useCallback((bookId: string, chapter: number) => {
    return completedChapters.has(chapterKey(bookId, chapter));
  }, [completedChapters]);

  const startBibleJourney = useCallback((journeyId: string) => {
    setJourneyProgress(prev => {
      if (prev[journeyId]) return prev;
      const next = { ...prev, [journeyId]: { journeyId, currentChapter: 1, completedChapters: [], startedAt: new Date().toISOString(), lastCompletedAt: null } };
      save(LS.journeyProgress, next);
      return next;
    });
  }, []);

  const markJourneyChapterComplete = useCallback((journeyId: string, chapter: number) => {
    setJourneyProgress(prev => {
      const existing = prev[journeyId];
      if (!existing) return prev;
      const completedChaps = existing.completedChapters.includes(chapter) ? existing.completedChapters : [...existing.completedChapters, chapter];
      const next = { ...prev, [journeyId]: { ...existing, completedChapters: completedChaps, currentChapter: Math.max(existing.currentChapter, chapter + 1), lastCompletedAt: new Date().toISOString() } };
      save(LS.journeyProgress, next);
      return next;
    });
  }, []);

  const getJourneyProgress = useCallback((journeyId: string) => journeyProgress[journeyId] ?? null, [journeyProgress]);

  const addHighlight = useCallback((bookId: string, chapter: number, verse: number, color: HighlightColor) => {
    setHighlights(prev => {
      const filtered = prev.filter(h => !(h.bookId === bookId && h.chapter === chapter && h.verse === verse));
      const next = [...filtered, { bookId, chapter, verse, color }];
      save(LS.highlights, next); return next;
    });
  }, []);

  const removeHighlight = useCallback((bookId: string, chapter: number, verse: number) => {
    setHighlights(prev => { const next = prev.filter(h => !(h.bookId === bookId && h.chapter === chapter && h.verse === verse)); save(LS.highlights, next); return next; });
  }, []);

  const getHighlight = useCallback((bookId: string, chapter: number, verse: number) => highlights.find(h => h.bookId === bookId && h.chapter === chapter && h.verse === verse), [highlights]);

  const addFavourite = useCallback((fav: Omit<VerseFavourite, 'id' | 'savedAt'>) => {
    setFavourites(prev => {
      if (prev.some(f => f.bookId === fav.bookId && f.chapter === fav.chapter && f.verse === fav.verse)) return prev;
      const next = [...prev, { ...fav, id: genId('fav'), savedAt: new Date().toISOString() }];
      save(LS.favourites, next); return next;
    });
  }, []);

  const removeFavourite = useCallback((bookId: string, chapter: number, verse: number) => {
    setFavourites(prev => { const next = prev.filter(f => !(f.bookId === bookId && f.chapter === chapter && f.verse === verse)); save(LS.favourites, next); return next; });
  }, []);

  const isFavourite = useCallback((bookId: string, chapter: number, verse: number) => favourites.some(f => f.bookId === bookId && f.chapter === chapter && f.verse === verse), [favourites]);

  const addBookmark = useCallback((entry: Omit<ChapterBookmark, 'id' | 'savedAt'>) => {
    setBookmarks(prev => {
      if (prev.some(b => b.bookId === entry.bookId && b.chapter === entry.chapter)) return prev;
      const next = [...prev, { ...entry, id: genId('bkm'), savedAt: new Date().toISOString() }];
      save(LS.bookmarks, next); return next;
    });
  }, []);

  const removeBookmark = useCallback((bookId: string, chapter: number) => {
    setBookmarks(prev => { const next = prev.filter(b => !(b.bookId === bookId && b.chapter === chapter)); save(LS.bookmarks, next); return next; });
  }, []);

  const isBookmarked = useCallback((bookId: string, chapter: number) => bookmarks.some(b => b.bookId === bookId && b.chapter === chapter), [bookmarks]);

  const saveNote = useCallback((bookId: string, chapter: number, verse: number, verseText: string, text: string) => {
    setNotes(prev => {
      const existing = prev.find(n => n.bookId === bookId && n.chapter === chapter && n.verse === verse);
      let next: VerseNote[];
      if (existing) {
        next = prev.map(n => n.id === existing.id ? { ...n, text, updatedAt: new Date().toISOString() } : n);
      } else {
        next = [...prev, { id: genId('note'), bookId, chapter, verse, verseText, text, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
      }
      save(LS.notes, next); return next;
    });
  }, []);

  const deleteNote = useCallback((noteId: string) => {
    setNotes(prev => { const next = prev.filter(n => n.id !== noteId); save(LS.notes, next); return next; });
  }, []);

  const getNote = useCallback((bookId: string, chapter: number, verse: number) => notes.find(n => n.bookId === bookId && n.chapter === chapter && n.verse === verse), [notes]);
  const getChapterNotes = useCallback((bookId: string, chapter: number) => notes.filter(n => n.bookId === bookId && n.chapter === chapter).sort((a, b) => a.verse - b.verse), [notes]);

  const saveReflection = useCallback((bookId: string, chapter: number, text: string) => {
    setReflections(prev => {
      const existing = prev.find(r => r.bookId === bookId && r.chapter === chapter);
      let next: ChapterReflection[];
      if (existing) { next = prev.map(r => r.id === existing.id ? { ...r, text } : r); }
      else { next = [...prev, { id: genId('refl'), bookId, chapter, text, createdAt: new Date().toISOString() }]; }
      save(LS.reflections, next); return next;
    });
  }, []);

  const getReflection = useCallback((bookId: string, chapter: number) => reflections.find(r => r.bookId === bookId && r.chapter === chapter), [reflections]);

  const savePrayer = useCallback((bookId: string, chapter: number, text: string) => {
    setPrayers(prev => {
      const existing = prev.find(p => p.bookId === bookId && p.chapter === chapter);
      let next: PersonalPrayer[];
      if (existing) { next = prev.map(p => p.id === existing.id ? { ...p, text, savedAt: new Date().toISOString() } : p); }
      else { next = [...prev, { id: genId('pray'), bookId, chapter, text, savedAt: new Date().toISOString() }]; }
      save(LS.prayers, next); return next;
    });
  }, []);

  const getPrayer = useCallback((bookId: string, chapter: number) => prayers.find(p => p.bookId === bookId && p.chapter === chapter), [prayers]);

  const lastRead = readingHistory.length > 0 ? readingHistory[0] : null;

  return (
    <BibleContext.Provider value={{
      translationId, setTranslation,
      readingHistory, lastRead, markChapterOpened,
      completedChapters, markChapterComplete, isChapterComplete,
      journeyProgress, startBibleJourney, markJourneyChapterComplete, getJourneyProgress,
      highlights, addHighlight, removeHighlight, getHighlight,
      favourites, addFavourite, removeFavourite, isFavourite,
      bookmarks, addBookmark, removeBookmark, isBookmarked,
      notes, saveNote, deleteNote, getNote, getChapterNotes,
      reflections, saveReflection, getReflection,
      prayers, savePrayer, getPrayer,
    }}>
      {children}
    </BibleContext.Provider>
  );
}
