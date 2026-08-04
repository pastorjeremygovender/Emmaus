/**
 * BibleBookChapterSheet — bottom sheet for navigating to any Bible book and chapter.
 *
 * DEFAULT VIEW: chapter grid for the currently open book.
 * The user can reach a nearby chapter with one tap after opening the selector.
 *
 * CHANGE BOOK VIEW: book list (OT / NT) with an optional search field.
 * The search field does NOT autofocus — the keyboard never opens automatically.
 *
 * Flow:
 *   Tap passage selector
 *   → chapter grid for current book          (default)
 *   → tap "Change Book"
 *   → book list
 *   → tap a book
 *   → chapter grid for that book
 *   → tap a chapter
 *   → selector closes, chapter loads
 *
 * Back / close behaviour:
 *   • From chapter grid → closes the sheet (returns to reader unchanged)
 *   • From book list    → returns to the chapter grid (does NOT close)
 *   • Close (×) button  → always closes
 */

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Search, X, ChevronRight, BookOpen } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { BIBLE_BOOKS } from '@/lib/bible-data';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBookId: string;
  currentChapter: number;
  onNavigate: (bookId: string, chapter: number) => void;
}

type View = 'chapters' | 'bookList';

const OT_BOOKS = BIBLE_BOOKS.filter((b) => b.testament === 'OT');
const NT_BOOKS = BIBLE_BOOKS.filter((b) => b.testament === 'NT');

export function BibleBookChapterSheet({
  open,
  onOpenChange,
  currentBookId,
  currentChapter,
  onNavigate,
}: Props) {
  // Start on the chapter grid for the book the user is already reading.
  const [view, setView]               = useState<View>('chapters');
  const [activeBookId, setActiveBookId] = useState(currentBookId);
  const [search, setSearch]           = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // When the sheet opens, always reset to the chapter grid for the current book.
  // Also sync activeBookId in case the user navigated to a different book while
  // the sheet was closed.
  useEffect(() => {
    if (open) {
      setView('chapters');
      setActiveBookId(currentBookId);
      setSearch('');
    }
  }, [open, currentBookId]);

  // Scroll the content panel to top on every view or book change.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [view, activeBookId]);

  const activeBook = BIBLE_BOOKS.find((b) => b.id === activeBookId) ?? BIBLE_BOOKS[0];

  // ── Book list filtering ────────────────────────────────────────────────────
  const query = search.toLowerCase().trim();

  function filterBooks(books: typeof BIBLE_BOOKS) {
    if (!query) return books;
    return books.filter(
      (b) =>
        b.name.toLowerCase().includes(query) ||
        b.shortName.toLowerCase().includes(query),
    );
  }

  const otFiltered = filterBooks(OT_BOOKS);
  const ntFiltered = filterBooks(NT_BOOKS);
  const anyResults = otFiltered.length > 0 || ntFiltered.length > 0;

  // ── Search: parse "John 3", "Romans 8", etc. ──────────────────────────────
  function tryDirectNavigate(raw: string) {
    const parts = raw.trim().match(/^(.+?)\s+(\d+)$/);
    if (!parts) return;
    const [, bookPart, chPart] = parts;
    const ch   = parseInt(chPart, 10);
    const book = BIBLE_BOOKS.find(
      (b) =>
        b.name.toLowerCase() === bookPart.toLowerCase() ||
        b.shortName.toLowerCase() === bookPart.toLowerCase(),
    );
    if (book && ch >= 1 && ch <= book.chapters) {
      onNavigate(book.id, ch);
      onOpenChange(false);
    }
  }

  // ── Event handlers ────────────────────────────────────────────────────────
  function handleSelectBook(bookId: string) {
    setActiveBookId(bookId);
    setSearch('');
    setView('chapters');
  }

  function handleSelectChapter(chapter: number) {
    onNavigate(activeBookId, chapter);
    onOpenChange(false);
  }

  function handleBack() {
    if (view === 'bookList') {
      setSearch('');
      setView('chapters');
    } else {
      onOpenChange(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        hideDefaultClose
        className="h-[76vh] flex flex-col p-0 rounded-t-2xl overflow-hidden"
      >
        {/* ── Drag handle ──────────────────────────────────────────────────── */}
        <div className="shrink-0 flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-border">
          <div className="flex items-center h-12 px-2 gap-1">
            {/* Back / close — left */}
            <button
              onClick={handleBack}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
              aria-label={view === 'bookList' ? 'Back to chapter list' : 'Close'}
            >
              <ArrowLeft size={20} />
            </button>

            {/* Centre title */}
            <div className="flex-1 text-center">
              <p className="text-[13px] font-semibold text-foreground leading-none">
                Go to Passage
              </p>
            </div>

            {/* Close — right */}
            <button
              onClick={() => onOpenChange(false)}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Current-book row + "Change Book" — only in chapter grid view */}
          {view === 'chapters' && (
            <div className="flex items-center justify-between gap-3 px-5 pb-3">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen size={14} className="text-muted-foreground shrink-0" />
                <p className="text-[15px] font-semibold text-foreground truncate">
                  {activeBook.name}
                </p>
                <span className="text-[12px] text-muted-foreground shrink-0">
                  · {activeBook.chapters} ch
                </span>
              </div>
              <button
                onClick={() => setView('bookList')}
                className="shrink-0 text-[13px] font-medium text-primary hover:underline transition-colors"
              >
                Change Book
              </button>
            </div>
          )}

          {/* Search bar — only in book list view, NOT autofocused */}
          {view === 'bookList' && (
            <div className="px-4 pb-3">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') tryDirectNavigate(search);
                  }}
                  placeholder={'Book or \u201cJohn 3\u201d, \u201cRomans 8\u201d\u2026'}
                  // autoFocus intentionally omitted — keyboard must not open automatically
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-muted/40 text-[14px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  aria-label="Search Bible books"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Scrollable content ────────────────────────────────────────────── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="px-4 pb-10">

            {view === 'chapters' ? (

              /* ── Chapter grid ──────────────────────────────────────────────── */
              <div className="pt-3">
                <div className="grid grid-cols-5 gap-2">
                  {Array.from({ length: activeBook.chapters }, (_, i) => i + 1).map((ch) => {
                    const isCurrent =
                      activeBook.id === currentBookId && ch === currentChapter;
                    return (
                      <button
                        key={ch}
                        onClick={() => handleSelectChapter(ch)}
                        className={[
                          'flex items-center justify-center rounded-xl text-[15px] font-semibold transition-colors min-h-[48px]',
                          isCurrent
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-muted/60 text-foreground hover:bg-primary/15 hover:text-primary active:bg-primary/20',
                        ].join(' ')}
                        aria-label={`${activeBook.name} chapter ${ch}`}
                        aria-current={isCurrent ? 'true' : undefined}
                      >
                        {ch}
                      </button>
                    );
                  })}
                </div>
              </div>

            ) : anyResults ? (

              /* ── Book list ─────────────────────────────────────────────────── */
              <div className="pt-3 space-y-5">
                {[
                  { label: 'Old Testament', books: otFiltered },
                  { label: 'New Testament', books: ntFiltered },
                ]
                  .filter((s) => s.books.length > 0)
                  .map((section) => (
                    <div key={section.label} className="space-y-1">
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-1 pb-1">
                        {section.label}
                      </div>
                      <div className="divide-y divide-border/60 rounded-xl border border-border overflow-hidden bg-card">
                        {section.books.map((book) => {
                          const isCurrent = book.id === currentBookId;
                          return (
                            <button
                              key={book.id}
                              onClick={() => handleSelectBook(book.id)}
                              className={[
                                'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                                isCurrent
                                  ? 'bg-primary/8 text-primary'
                                  : 'hover:bg-muted/60 text-foreground',
                              ].join(' ')}
                            >
                              <span
                                className={[
                                  'text-[11px] font-bold w-9 shrink-0',
                                  isCurrent ? 'text-primary' : 'text-muted-foreground',
                                ].join(' ')}
                              >
                                {book.shortName}
                              </span>
                              <span className="flex-1 text-[15px] font-medium">{book.name}</span>
                              <span className="text-[11px] text-muted-foreground shrink-0">
                                {book.chapters} ch
                              </span>
                              <ChevronRight
                                size={14}
                                className={isCurrent ? 'text-primary' : 'text-muted-foreground'}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>

            ) : (

              /* ── No search results ─────────────────────────────────────────── */
              <div className="pt-12 text-center text-muted-foreground text-[15px]">
                No books match "{search}"
              </div>

            )}

          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
