import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type HighlightColor = 'amber' | 'blue' | 'green';

export type VerseHighlight = {
  bookId: string;
  chapter: number;
  verse: number;
  color: HighlightColor;
};

export type VerseFavourite = {
  id: string;
  bookId: string;
  bookName: string;
  chapter: number;
  verse: number;
  verseText: string;
  savedAt: string;
};

export type VerseNote = {
  id: string;
  bookId: string;
  chapter: number;
  verse: number;
  verseText: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

/** Chapter-level bookmark — distinct from verse highlights/favourites */
export type ChapterBookmark = {
  id: string;
  bookId: string;
  bookName: string;
  chapter: number;
  chapterHeading: string;
  savedAt: string;
};

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

export type ChapterReflection = {
  id: string;
  bookId: string;
  chapter: number;
  text: string;
  createdAt: string;
};

export type PersonalPrayer = {
  id: string;
  bookId: string;
  chapter: number;
  text: string;
  savedAt: string;
};

// ─── Storage keys ─────────────────────────────────────────────────────────────

const LS = {
  history:         'emmaus_bible_history',
  completed:       'emmaus_bible_completed',       // string[] "bookId-chapter"
  journeyProgress: 'emmaus_bible_journey_progress',
  highlights:      'emmaus_bible_highlights',
  favourites:      'emmaus_bible_favourites',
  notes:           'emmaus_bible_notes',
  reflections:     'emmaus_bible_reflections',
  prayers:         'emmaus_bible_prayers',
  bookmarks:       'emmaus_bible_bookmarks_v2',    // chapter bookmarks (v2 key)
} as const;

function load<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : fallback;
  } catch { return fallback; }
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
  // Reading history (last opened chapter)
  readingHistory: ReadingHistoryEntry | null;
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

  // Favourites (saved verses)
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
  const [readingHistory, setReadingHistory] = useState<ReadingHistoryEntry | null>(null);
  const [completedChapters, setCompletedChapters] = useState<Set<string>>(new Set());
  const [journeyProgress, setJourneyProgress] = useState<Record<string, BibleJourneyProgress>>({});
  const [highlights, setHighlights] = useState<VerseHighlight[]>([]);
  const [favourites, setFavourites] = useState<VerseFavourite[]>([]);
  const [bookmarks, setBookmarks] = useState<ChapterBookmark[]>([]);
  const [notes, setNotes] = useState<VerseNote[]>([]);
  const [reflections, setReflections] = useState<ChapterReflection[]>([]);
  const [prayers, setPrayers] = useState<PersonalPrayer[]>([]);

  // Load on mount
  useEffect(() => {
    setReadingHistory(load(LS.history, null));
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

  // Reading history
  const markChapterOpened = useCallback((entry: Omit<ReadingHistoryEntry, 'openedAt'>) => {
    const next: ReadingHistoryEntry = { ...entry, openedAt: new Date().toISOString() };
    setReadingHistory(next);
    save(LS.history, next);
  }, []);

  // Completed chapters
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

  // Bible Journey progress
  const startBibleJourney = useCallback((journeyId: string) => {
    setJourneyProgress(prev => {
      if (prev[journeyId]) return prev;
      const next = {
        ...prev,
        [journeyId]: {
          journeyId,
          currentChapter: 1,
          completedChapters: [],
          startedAt: new Date().toISOString(),
          lastCompletedAt: null,
        },
      };
      save(LS.journeyProgress, next);
      return next;
    });
  }, []);

  const markJourneyChapterComplete = useCallback((journeyId: string, chapter: number) => {
    setJourneyProgress(prev => {
      const existing = prev[journeyId];
      if (!existing) return prev;
      const completedChapters = existing.completedChapters.includes(chapter)
        ? existing.completedChapters
        : [...existing.completedChapters, chapter];
      const next = {
        ...prev,
        [journeyId]: {
          ...existing,
          completedChapters,
          currentChapter: Math.max(existing.currentChapter, chapter + 1),
          lastCompletedAt: new Date().toISOString(),
        },
      };
      save(LS.journeyProgress, next);
      return next;
    });
  }, []);

  const getJourneyProgress = useCallback((journeyId: string): BibleJourneyProgress | null => {
    return journeyProgress[journeyId] ?? null;
  }, [journeyProgress]);

  // Highlights
  const addHighlight = useCallback((bookId: string, chapter: number, verse: number, color: HighlightColor) => {
    setHighlights(prev => {
      const filtered = prev.filter(h => !(h.bookId === bookId && h.chapter === chapter && h.verse === verse));
      const next = [...filtered, { bookId, chapter, verse, color }];
      save(LS.highlights, next);
      return next;
    });
  }, []);

  const removeHighlight = useCallback((bookId: string, chapter: number, verse: number) => {
    setHighlights(prev => {
      const next = prev.filter(h => !(h.bookId === bookId && h.chapter === chapter && h.verse === verse));
      save(LS.highlights, next);
      return next;
    });
  }, []);

  const getHighlight = useCallback((bookId: string, chapter: number, verse: number) => {
    return highlights.find(h => h.bookId === bookId && h.chapter === chapter && h.verse === verse);
  }, [highlights]);

  // Favourites
  const addFavourite = useCallback((fav: Omit<VerseFavourite, 'id' | 'savedAt'>) => {
    setFavourites(prev => {
      if (prev.some(f => f.bookId === fav.bookId && f.chapter === fav.chapter && f.verse === fav.verse)) return prev;
      const next = [...prev, { ...fav, id: genId('fav'), savedAt: new Date().toISOString() }];
      save(LS.favourites, next);
      return next;
    });
  }, []);

  const removeFavourite = useCallback((bookId: string, chapter: number, verse: number) => {
    setFavourites(prev => {
      const next = prev.filter(f => !(f.bookId === bookId && f.chapter === chapter && f.verse === verse));
      save(LS.favourites, next);
      return next;
    });
  }, []);

  const isFavourite = useCallback((bookId: string, chapter: number, verse: number) => {
    return favourites.some(f => f.bookId === bookId && f.chapter === chapter && f.verse === verse);
  }, [favourites]);

  // Chapter bookmarks
  const addBookmark = useCallback((entry: Omit<ChapterBookmark, 'id' | 'savedAt'>) => {
    setBookmarks(prev => {
      if (prev.some(b => b.bookId === entry.bookId && b.chapter === entry.chapter)) return prev;
      const next = [...prev, { ...entry, id: genId('bkm'), savedAt: new Date().toISOString() }];
      save(LS.bookmarks, next);
      return next;
    });
  }, []);

  const removeBookmark = useCallback((bookId: string, chapter: number) => {
    setBookmarks(prev => {
      const next = prev.filter(b => !(b.bookId === bookId && b.chapter === chapter));
      save(LS.bookmarks, next);
      return next;
    });
  }, []);

  const isBookmarked = useCallback((bookId: string, chapter: number) => {
    return bookmarks.some(b => b.bookId === bookId && b.chapter === chapter);
  }, [bookmarks]);

  // Notes
  const saveNote = useCallback((bookId: string, chapter: number, verse: number, verseText: string, text: string) => {
    setNotes(prev => {
      const existing = prev.find(n => n.bookId === bookId && n.chapter === chapter && n.verse === verse);
      let next: VerseNote[];
      if (existing) {
        next = prev.map(n => n.id === existing.id ? { ...n, text, updatedAt: new Date().toISOString() } : n);
      } else {
        next = [...prev, { id: genId('note'), bookId, chapter, verse, verseText, text, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
      }
      save(LS.notes, next);
      return next;
    });
  }, []);

  const deleteNote = useCallback((noteId: string) => {
    setNotes(prev => {
      const next = prev.filter(n => n.id !== noteId);
      save(LS.notes, next);
      return next;
    });
  }, []);

  const getNote = useCallback((bookId: string, chapter: number, verse: number) => {
    return notes.find(n => n.bookId === bookId && n.chapter === chapter && n.verse === verse);
  }, [notes]);

  const getChapterNotes = useCallback((bookId: string, chapter: number) => {
    return notes.filter(n => n.bookId === bookId && n.chapter === chapter).sort((a, b) => a.verse - b.verse);
  }, [notes]);

  // Reflections
  const saveReflection = useCallback((bookId: string, chapter: number, text: string) => {
    setReflections(prev => {
      const existing = prev.find(r => r.bookId === bookId && r.chapter === chapter);
      let next: ChapterReflection[];
      if (existing) {
        next = prev.map(r => r.id === existing.id ? { ...r, text } : r);
      } else {
        next = [...prev, { id: genId('refl'), bookId, chapter, text, createdAt: new Date().toISOString() }];
      }
      save(LS.reflections, next);
      return next;
    });
  }, []);

  const getReflection = useCallback((bookId: string, chapter: number) => {
    return reflections.find(r => r.bookId === bookId && r.chapter === chapter);
  }, [reflections]);

  // Prayers
  const savePrayer = useCallback((bookId: string, chapter: number, text: string) => {
    setPrayers(prev => {
      const existing = prev.find(p => p.bookId === bookId && p.chapter === chapter);
      let next: PersonalPrayer[];
      if (existing) {
        next = prev.map(p => p.id === existing.id ? { ...p, text, savedAt: new Date().toISOString() } : p);
      } else {
        next = [...prev, { id: genId('pray'), bookId, chapter, text, savedAt: new Date().toISOString() }];
      }
      save(LS.prayers, next);
      return next;
    });
  }, []);

  const getPrayer = useCallback((bookId: string, chapter: number) => {
    return prayers.find(p => p.bookId === bookId && p.chapter === chapter);
  }, [prayers]);

  return (
    <BibleContext.Provider value={{
      readingHistory, markChapterOpened,
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
