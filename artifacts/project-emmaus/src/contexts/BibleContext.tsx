import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { loadBibleData, patchBibleData } from '../lib/bible-api';

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

// ─── localStorage keys (unauthenticated fallback) ─────────────────────────────

const LS = {
  history:           'emmaus_bible_history_v2',    // array, newest-first
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
  const { user } = useAuth();
  const userIdRef = useRef<string | null>(null);

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

  // ─── Storage helpers ────────────────────────────────────────────────────────

  /**
   * Persist a partial update — always writes to localStorage,
   * and also fires a cloud PATCH when the user is authenticated.
   */
  const persist = useCallback((patch: Parameters<typeof patchBibleData>[1]) => {
    const uid = userIdRef.current;
    if (uid) {
      // Fire-and-forget cloud write; localStorage remains the immediate fallback
      patchBibleData(uid, patch);
    }
    // Always mirror to localStorage so unauthenticated sessions and cloud
    // fallback work seamlessly
    if ('history' in patch)         save(LS.history,         patch.history);
    if ('completed' in patch)       save(LS.completed,       patch.completed);
    if ('journeyProgress' in patch) save(LS.journeyProgress, patch.journeyProgress);
    if ('highlights' in patch)      save(LS.highlights,      patch.highlights);
    if ('favourites' in patch)      save(LS.favourites,      patch.favourites);
    if ('bookmarks' in patch)       save(LS.bookmarks,       patch.bookmarks);
    if ('notes' in patch)           save(LS.notes,           patch.notes);
    if ('reflections' in patch)     save(LS.reflections,     patch.reflections);
    if ('prayers' in patch)         save(LS.prayers,         patch.prayers);
  }, []);

  // ─── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    userIdRef.current = user?.id ?? null;

    // Translation preference is always local — not synced to cloud
    setTranslationIdState(load(LS.translation, 'bsb'));

    async function loadData() {
      let history: ReadingHistoryEntry[] = [];
      let completed: string[] = [];
      let journeyProg: Record<string, BibleJourneyProgress> = {};
      let hlights: VerseHighlight[] = [];
      let favs: VerseFavourite[] = [];
      let bkms: ChapterBookmark[] = [];
      let nts: VerseNote[] = [];
      let refls: ChapterReflection[] = [];
      let prays: PersonalPrayer[] = [];

      if (user) {
        // Try cloud first
        const cloud = await loadBibleData(user.id);
        if (cloud) {
          history    = cloud.history ?? [];
          completed  = cloud.completed;
          journeyProg = cloud.journeyProgress;
          hlights    = cloud.highlights;
          favs       = cloud.favourites;
          bkms       = cloud.bookmarks;
          nts        = cloud.notes;
          refls      = cloud.reflections;
          prays      = cloud.prayers;
        } else {
          // Cloud unavailable — fall back to localStorage
          history    = loadFromLocalStorage();
          completed  = load(LS.completed, []);
          journeyProg = load(LS.journeyProgress, {});
          hlights    = load(LS.highlights, []);
          favs       = load(LS.favourites, []);
          bkms       = load(LS.bookmarks, []);
          nts        = load(LS.notes, []);
          refls      = load(LS.reflections, []);
          prays      = load(LS.prayers, []);
        }
      } else {
        // Unauthenticated — localStorage only
        history    = loadFromLocalStorage();
        completed  = load(LS.completed, []);
        journeyProg = load(LS.journeyProgress, {});
        hlights    = load(LS.highlights, []);
        favs       = load(LS.favourites, []);
        bkms       = load(LS.bookmarks, []);
        nts        = load(LS.notes, []);
        refls      = load(LS.reflections, []);
        prays      = load(LS.prayers, []);
      }

      setReadingHistory(history);
      setCompletedChapters(new Set(completed));
      setJourneyProgress(journeyProg);
      setHighlights(hlights);
      setFavourites(favs);
      setBookmarks(bkms);
      setNotes(nts);
      setReflections(refls);
      setPrayers(prays);
    }

    loadData();
  }, [user]);

  // ─── Reading history ────────────────────────────────────────────────────────

  const setTranslation = useCallback((id: string) => {
    setTranslationIdState(id);
    save(LS.translation, id);
  }, []);

  const markChapterOpened = useCallback((entry: Omit<ReadingHistoryEntry, 'openedAt'>) => {
    setReadingHistory(prev => {
      // Remove existing entry for same book+chapter, prepend new one, cap at HISTORY_MAX
      const filtered = prev.filter(e => !(e.bookId === entry.bookId && e.chapter === entry.chapter));
      const next = [{ ...entry, openedAt: new Date().toISOString() }, ...filtered].slice(0, HISTORY_MAX);
      persist({ history: next });
      return next;
    });
  }, [persist]);

  // ─── Completed chapters ─────────────────────────────────────────────────────

  const markChapterComplete = useCallback((bookId: string, chapter: number) => {
    setCompletedChapters(prev => {
      const next = new Set(prev);
      next.add(chapterKey(bookId, chapter));
      persist({ completed: Array.from(next) });
      return next;
    });
  }, [persist]);

  const isChapterComplete = useCallback((bookId: string, chapter: number) => {
    return completedChapters.has(chapterKey(bookId, chapter));
  }, [completedChapters]);

  // ─── Bible Journey progress ─────────────────────────────────────────────────

  const startBibleJourney = useCallback((journeyId: string) => {
    setJourneyProgress(prev => {
      if (prev[journeyId]) return prev;
      const next = { ...prev, [journeyId]: { journeyId, currentChapter: 1, completedChapters: [], startedAt: new Date().toISOString(), lastCompletedAt: null } };
      persist({ journeyProgress: next });
      return next;
    });
  }, [persist]);

  const markJourneyChapterComplete = useCallback((journeyId: string, chapter: number) => {
    setJourneyProgress(prev => {
      const existing = prev[journeyId];
      if (!existing) return prev;
      const completedChaps = existing.completedChapters.includes(chapter) ? existing.completedChapters : [...existing.completedChapters, chapter];
      const next = { ...prev, [journeyId]: { ...existing, completedChapters: completedChaps, currentChapter: Math.max(existing.currentChapter, chapter + 1), lastCompletedAt: new Date().toISOString() } };
      persist({ journeyProgress: next });
      return next;
    });
  }, [persist]);

  const getJourneyProgress = useCallback((journeyId: string) => journeyProgress[journeyId] ?? null, [journeyProgress]);

  // ─── Highlights ─────────────────────────────────────────────────────────────

  const addHighlight = useCallback((bookId: string, chapter: number, verse: number, color: HighlightColor) => {
    setHighlights(prev => {
      const filtered = prev.filter(h => !(h.bookId === bookId && h.chapter === chapter && h.verse === verse));
      const next = [...filtered, { bookId, chapter, verse, color }];
      persist({ highlights: next });
      return next;
    });
  }, [persist]);

  const removeHighlight = useCallback((bookId: string, chapter: number, verse: number) => {
    setHighlights(prev => { const next = prev.filter(h => !(h.bookId === bookId && h.chapter === chapter && h.verse === verse)); persist({ highlights: next }); return next; });
  }, [persist]);

  const getHighlight = useCallback((bookId: string, chapter: number, verse: number) => highlights.find(h => h.bookId === bookId && h.chapter === chapter && h.verse === verse), [highlights]);

  // ─── Favourites ─────────────────────────────────────────────────────────────

  const addFavourite = useCallback((fav: Omit<VerseFavourite, 'id' | 'savedAt'>) => {
    setFavourites(prev => {
      if (prev.some(f => f.bookId === fav.bookId && f.chapter === fav.chapter && f.verse === fav.verse)) return prev;
      const next = [...prev, { ...fav, id: genId('fav'), savedAt: new Date().toISOString() }];
      persist({ favourites: next });
      return next;
    });
  }, [persist]);

  const removeFavourite = useCallback((bookId: string, chapter: number, verse: number) => {
    setFavourites(prev => { const next = prev.filter(f => !(f.bookId === bookId && f.chapter === chapter && f.verse === verse)); persist({ favourites: next }); return next; });
  }, [persist]);

  const isFavourite = useCallback((bookId: string, chapter: number, verse: number) => favourites.some(f => f.bookId === bookId && f.chapter === chapter && f.verse === verse), [favourites]);

  // ─── Chapter bookmarks ──────────────────────────────────────────────────────

  const addBookmark = useCallback((entry: Omit<ChapterBookmark, 'id' | 'savedAt'>) => {
    setBookmarks(prev => {
      if (prev.some(b => b.bookId === entry.bookId && b.chapter === entry.chapter)) return prev;
      const next = [...prev, { ...entry, id: genId('bkm'), savedAt: new Date().toISOString() }];
      persist({ bookmarks: next });
      return next;
    });
  }, [persist]);

  const removeBookmark = useCallback((bookId: string, chapter: number) => {
    setBookmarks(prev => { const next = prev.filter(b => !(b.bookId === bookId && b.chapter === chapter)); persist({ bookmarks: next }); return next; });
  }, [persist]);

  const isBookmarked = useCallback((bookId: string, chapter: number) => bookmarks.some(b => b.bookId === bookId && b.chapter === chapter), [bookmarks]);

  // ─── Notes ──────────────────────────────────────────────────────────────────

  const saveNote = useCallback((bookId: string, chapter: number, verse: number, verseText: string, text: string) => {
    setNotes(prev => {
      const existing = prev.find(n => n.bookId === bookId && n.chapter === chapter && n.verse === verse);
      let next: VerseNote[];
      if (existing) {
        next = prev.map(n => n.id === existing.id ? { ...n, text, updatedAt: new Date().toISOString() } : n);
      } else {
        next = [...prev, { id: genId('note'), bookId, chapter, verse, verseText, text, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
      }
      persist({ notes: next }); return next;
    });
  }, [persist]);

  const deleteNote = useCallback((noteId: string) => {
    setNotes(prev => { const next = prev.filter(n => n.id !== noteId); persist({ notes: next }); return next; });
  }, [persist]);

  const getNote = useCallback((bookId: string, chapter: number, verse: number) => notes.find(n => n.bookId === bookId && n.chapter === chapter && n.verse === verse), [notes]);
  const getChapterNotes = useCallback((bookId: string, chapter: number) => notes.filter(n => n.bookId === bookId && n.chapter === chapter).sort((a, b) => a.verse - b.verse), [notes]);

  // ─── Reflections ────────────────────────────────────────────────────────────

  const saveReflection = useCallback((bookId: string, chapter: number, text: string) => {
    setReflections(prev => {
      const existing = prev.find(r => r.bookId === bookId && r.chapter === chapter);
      let next: ChapterReflection[];
      if (existing) { next = prev.map(r => r.id === existing.id ? { ...r, text } : r); }
      else { next = [...prev, { id: genId('refl'), bookId, chapter, text, createdAt: new Date().toISOString() }]; }
      persist({ reflections: next }); return next;
    });
  }, [persist]);

  const getReflection = useCallback((bookId: string, chapter: number) => reflections.find(r => r.bookId === bookId && r.chapter === chapter), [reflections]);

  // ─── Prayers ────────────────────────────────────────────────────────────────

  const savePrayer = useCallback((bookId: string, chapter: number, text: string) => {
    setPrayers(prev => {
      const existing = prev.find(p => p.bookId === bookId && p.chapter === chapter);
      let next: PersonalPrayer[];
      if (existing) { next = prev.map(p => p.id === existing.id ? { ...p, text, savedAt: new Date().toISOString() } : p); }
      else { next = [...prev, { id: genId('pray'), bookId, chapter, text, savedAt: new Date().toISOString() }]; }
      persist({ prayers: next }); return next;
    });
  }, [persist]);

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

// ─── localStorage history loader (handles v2 array + v1 migration) ────────────

function loadFromLocalStorage(): ReadingHistoryEntry[] {
  const rawV2 = localStorage.getItem('emmaus_bible_history_v2');
  if (rawV2) {
    try { return JSON.parse(rawV2) as ReadingHistoryEntry[]; } catch { /* ignore */ }
  }
  // Migrate v1 single-entry key
  const rawV1 = localStorage.getItem('emmaus_bible_history');
  if (rawV1) {
    try {
      const old = JSON.parse(rawV1) as ReadingHistoryEntry | null;
      if (old && old.bookId) return [old];
    } catch { /* ignore */ }
  }
  return [];
}
