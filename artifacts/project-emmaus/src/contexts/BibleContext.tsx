import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { loadBibleDataWithStatus, patchBibleData } from '../lib/bible-api';
import { accountStorageKey } from '../lib/account-storage';
import {
  getRememberedBibleChapter,
  loadBibleReadingPositions,
  rememberBibleChapter,
  saveBibleReadingPositions,
  type BibleReadingPositions,
} from '../lib/bible-reading-position';

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

// ─── Account-scoped local cache keys ──────────────────────────────────────────

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
export const DEFAULT_BIBLE_TRANSLATION = 'niv';
const VALID_TRANSLATION_IDS = new Set(['bsb', 'asv', 'kjv', 'niv', 'gnt', 'msg']);

function normalizeTranslation(value: unknown): string | null {
  return typeof value === 'string' && VALID_TRANSLATION_IDS.has(value) ? value : null;
}

function load<T>(key: string, fallback: T, subject: string): T {
  try {
    const s = localStorage.getItem(accountStorageKey(key, subject));
    return s ? JSON.parse(s) : fallback;
  }
  catch { return fallback; }
}

function loadStoredTranslation(subject: string): string | undefined {
  try {
    const raw = localStorage.getItem(accountStorageKey(LS.translation, subject));
    if (raw === null) return undefined;
    return normalizeTranslation(JSON.parse(raw)) ?? undefined;
  } catch {
    return undefined;
  }
}

function save(key: string, value: unknown, subject: string) {
  try {
    localStorage.setItem(accountStorageKey(key, subject), JSON.stringify(value));
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
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
  getRememberedChapter: (bookId: string, translationId?: string) => number | null;
  rememberChapter: (bookId: string, chapter: number, translationId?: string) => void;

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
  updatePrayer: (id: string, text: string) => void;
  getPrayer: (bookId: string, chapter: number) => PersonalPrayer | undefined;
  deletePrayer: (prayerId: string) => void;

  // Chapter reflections (delete)
  deleteReflection: (reflectionId: string) => void;
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

   const [translationId, setTranslationIdState] = useState<string>(DEFAULT_BIBLE_TRANSLATION);
  const [readingHistory, setReadingHistory] = useState<ReadingHistoryEntry[]>([]);
  const [readingPositions, setReadingPositions] = useState<BibleReadingPositions>({});
  const [completedChapters, setCompletedChapters] = useState<Set<string>>(new Set());
  const [journeyProgress, setJourneyProgress] = useState<Record<string, BibleJourneyProgress>>({});
  const [highlights, setHighlights] = useState<VerseHighlight[]>([]);
  const [favourites, setFavourites] = useState<VerseFavourite[]>([]);
  const [bookmarks, setBookmarks] = useState<ChapterBookmark[]>([]);
  const [notes, setNotes] = useState<VerseNote[]>([]);
  const [reflections, setReflections] = useState<ChapterReflection[]>([]);
  const [prayers, setPrayers] = useState<PersonalPrayer[]>([]);
  const [loadedSubject, setLoadedSubject] = useState<string | null>(null);

  // ─── Storage helpers ────────────────────────────────────────────────────────

  /**
   * Persist a partial update only for the currently verified account.
   * PostgreSQL remains authoritative; localStorage is an owned offline cache.
   */
  const persist = useCallback((patch: Parameters<typeof patchBibleData>[1]) => {
    const uid = userIdRef.current;
    if (!uid) return;
    void patchBibleData(uid, patch).catch(error => {
      console.error('[BibleContext] Cloud sync failed:', error);
    });
    if ('history' in patch)         save(LS.history,         patch.history, uid);
    if ('completed' in patch)       save(LS.completed,       patch.completed, uid);
    if ('journeyProgress' in patch) save(LS.journeyProgress, patch.journeyProgress, uid);
    if ('highlights' in patch)      save(LS.highlights,      patch.highlights, uid);
    if ('favourites' in patch)      save(LS.favourites,      patch.favourites, uid);
    if ('bookmarks' in patch)       save(LS.bookmarks,       patch.bookmarks, uid);
    if ('notes' in patch)           save(LS.notes,           patch.notes, uid);
    if ('reflections' in patch)     save(LS.reflections,     patch.reflections, uid);
    if ('prayers' in patch)         save(LS.prayers,         patch.prayers, uid);
  }, []);

  // ─── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const subject = user?.id ?? null;
    userIdRef.current = subject;
    let cancelled = false;

    // Blank all personal state before the next account's request starts.
    setLoadedSubject(null);
    setTranslationIdState(DEFAULT_BIBLE_TRANSLATION);
    setReadingHistory([]);
    setReadingPositions({});
    setCompletedChapters(new Set());
    setJourneyProgress({});
    setHighlights([]);
    setFavourites([]);
    setBookmarks([]);
    setNotes([]);
    setReflections([]);
    setPrayers([]);

    if (!subject) {
      return () => {
        cancelled = true;
      };
    }
    const accountSubject = subject;

    // Translation is an account-owned cache until the cloud record resolves.
    // A present BSB value is intentional; only an absent value gets NIV.
    const cachedTranslation = loadStoredTranslation(accountSubject);
    setTranslationIdState(cachedTranslation ?? DEFAULT_BIBLE_TRANSLATION);
    setReadingPositions(loadBibleReadingPositions(accountSubject));

    async function loadData() {
      const cached = {
        history: load<ReadingHistoryEntry[]>(LS.history, [], accountSubject),
        completed: load<string[]>(LS.completed, [], accountSubject),
        journeyProgress: load<Record<string, BibleJourneyProgress>>(LS.journeyProgress, {}, accountSubject),
        highlights: load<VerseHighlight[]>(LS.highlights, [], accountSubject),
        favourites: load<VerseFavourite[]>(LS.favourites, [], accountSubject),
        bookmarks: load<ChapterBookmark[]>(LS.bookmarks, [], accountSubject),
        notes: load<VerseNote[]>(LS.notes, [], accountSubject),
        reflections: load<ChapterReflection[]>(LS.reflections, [], accountSubject),
        prayers: load<PersonalPrayer[]>(LS.prayers, [], accountSubject),
      };
      const cloudResult = await loadBibleDataWithStatus(accountSubject).catch(error => {
        console.error('[BibleContext] Cloud load failed:', error);
        return { data: null, status: 'unavailable' as const };
      });
      const cloud = cloudResult.data;
      if (cancelled || userIdRef.current !== accountSubject) return;

      const owned = cloud ?? cached;
      const cloudTranslation = normalizeTranslation(cloud?.translationId);
      const selectedTranslation =
        cloudTranslation ?? cachedTranslation ?? DEFAULT_BIBLE_TRANSLATION;
      setTranslationIdState(selectedTranslation);
      const history = owned.history ?? [];
      const completed = owned.completed ?? [];
      const journeyProg = owned.journeyProgress ?? {};
      const hlights = owned.highlights ?? [];
      const favs = owned.favourites ?? [];
      const bkms = owned.bookmarks ?? [];
      const nts = owned.notes ?? [];
      const refls = owned.reflections ?? [];
      const prays = owned.prayers ?? [];

      if (cloud) {
        save(LS.history, history, accountSubject);
        save(LS.completed, completed, accountSubject);
        save(LS.journeyProgress, journeyProg, accountSubject);
        save(LS.highlights, hlights, accountSubject);
        save(LS.favourites, favs, accountSubject);
        save(LS.bookmarks, bkms, accountSubject);
        save(LS.notes, nts, accountSubject);
        save(LS.reflections, refls, accountSubject);
        save(LS.prayers, prays, accountSubject);
        save(LS.translation, selectedTranslation, accountSubject);
        // Legacy cloud records may have no preference field. Preserve an
        // account-scoped explicit choice, otherwise persist the new NIV default.
        if (!cloudTranslation) {
          void patchBibleData(accountSubject, { translationId: selectedTranslation });
        }
      } else if (cloudResult.status === 'missing') {
        // First authenticated load: migrate owned offline data atomically.
        // This is deliberately skipped when the GET was unavailable.
        save(LS.translation, selectedTranslation, accountSubject);
        void patchBibleData(accountSubject, {
          ...cached,
          translationId: selectedTranslation,
        });
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
      setLoadedSubject(accountSubject);
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // ─── Reading history ────────────────────────────────────────────────────────

  const setTranslation = useCallback((id: string) => {
    const next = normalizeTranslation(id);
    if (!next) return;
    setTranslationIdState(next);
    const subject = userIdRef.current;
    if (subject) {
      save(LS.translation, next, subject);
      void patchBibleData(subject, { translationId: next });
    }
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

  const getRememberedChapter = useCallback((
    bookId: string,
    requestedTranslationId = translationId,
  ) => getRememberedBibleChapter(readingPositions, requestedTranslationId, bookId), [
    readingPositions,
    translationId,
  ]);

  const rememberChapter = useCallback((
    bookId: string,
    chapter: number,
    requestedTranslationId = translationId,
  ) => {
    const subject = userIdRef.current;
    if (!subject) return;
    setReadingPositions(prev => {
      const next = rememberBibleChapter(prev, requestedTranslationId, bookId, chapter);
      if (next !== prev) saveBibleReadingPositions(subject, next);
      return next;
    });
  }, [translationId]);

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

  const updatePrayer = useCallback((id: string, text: string) => {
    setPrayers(prev => {
      const next = prev.map(p => p.id === id ? { ...p, text, savedAt: new Date().toISOString() } : p);
      persist({ prayers: next });
      return next;
    });
  }, [persist]);

  const deletePrayer = useCallback((prayerId: string) => {
    setPrayers(prev => { const next = prev.filter(p => p.id !== prayerId); persist({ prayers: next }); return next; });
  }, [persist]);

  // ─── Reflections (delete) ────────────────────────────────────────────────────

  const deleteReflection = useCallback((reflectionId: string) => {
    setReflections(prev => { const next = prev.filter(r => r.id !== reflectionId); persist({ reflections: next }); return next; });
  }, [persist]);

  const ownsVisibleState = Boolean(user?.id && loadedSubject === user.id);
  const visibleHistory = ownsVisibleState ? readingHistory : [];
  const visibleCompleted = ownsVisibleState ? completedChapters : new Set<string>();
  const visibleJourneyProgress = ownsVisibleState ? journeyProgress : {};
  const visibleHighlights = ownsVisibleState ? highlights : [];
  const visibleFavourites = ownsVisibleState ? favourites : [];
  const visibleBookmarks = ownsVisibleState ? bookmarks : [];
  const visibleNotes = ownsVisibleState ? notes : [];
  const visibleReflections = ownsVisibleState ? reflections : [];
  const visiblePrayers = ownsVisibleState ? prayers : [];
  const lastRead = visibleHistory.length > 0 ? visibleHistory[0] : null;

  return (
    <BibleContext.Provider value={{
       translationId: ownsVisibleState ? translationId : DEFAULT_BIBLE_TRANSLATION, setTranslation,
       readingHistory: visibleHistory, lastRead, markChapterOpened,
       getRememberedChapter: ownsVisibleState ? getRememberedChapter : () => null,
       rememberChapter,
      completedChapters: visibleCompleted, markChapterComplete,
      isChapterComplete: ownsVisibleState ? isChapterComplete : () => false,
      journeyProgress: visibleJourneyProgress, startBibleJourney, markJourneyChapterComplete,
      getJourneyProgress: ownsVisibleState ? getJourneyProgress : () => null,
      highlights: visibleHighlights, addHighlight, removeHighlight,
      getHighlight: ownsVisibleState ? getHighlight : () => undefined,
      favourites: visibleFavourites, addFavourite, removeFavourite,
      isFavourite: ownsVisibleState ? isFavourite : () => false,
      bookmarks: visibleBookmarks, addBookmark, removeBookmark,
      isBookmarked: ownsVisibleState ? isBookmarked : () => false,
      notes: visibleNotes, saveNote, deleteNote,
      getNote: ownsVisibleState ? getNote : () => undefined,
      getChapterNotes: ownsVisibleState ? getChapterNotes : () => [],
      reflections: visibleReflections, saveReflection,
      getReflection: ownsVisibleState ? getReflection : () => undefined,
      prayers: visiblePrayers, savePrayer, updatePrayer,
      getPrayer: ownsVisibleState ? getPrayer : () => undefined,
      deletePrayer,
      deleteReflection,
    }}>
      {children}
    </BibleContext.Provider>
  );
}
