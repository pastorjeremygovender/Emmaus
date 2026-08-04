/**
 * BibleBookChapterSheet — bottom sheet for picking any Bible book and chapter.
 *
 * Replaces the legacy full-screen BibleReferencePicker. Opens as a bottom
 * drawer (76 vh) so the reader stays visible beneath it.
 *
 * Flow:
 *   1. Sheet opens from the bottom.
 *   2. Book list view: OT / NT groups with a search filter; current book highlighted.
 *   3. Tapping a book → chapter grid for that book.
 *   4. Tapping a chapter → calls onNavigate(bookId, chapter) and closes.
 *
 * The translation selector stays in the reader header — this sheet only
 * changes book + chapter.
 */

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Search, X, ChevronRight } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { BIBLE_BOOKS } from '@/lib/bible-data';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBookId: string;
  currentChapter: number;
  onNavigate: (bookId: string, chapter: number) => void;
}

const OT_BOOKS = BIBLE_BOOKS.filter((b) => b.testament === 'OT');
const NT_BOOKS = BIBLE_BOOKS.filter((b) => b.testament === 'NT');

export function BibleBookChapterSheet({
  open,
  onOpenChange,
  currentBookId,
  currentChapter,
  onNavigate,
}: Props) {
  const [search, setSearch]               = useState('');
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset panel state every time the sheet opens so it always starts on the book list.
  useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedBookId(null);
    }
  }, [open]);

  // Auto-focus the search field when the book list is visible.
  useEffect(() => {
    if (!open || selectedBookId) return;
    const t = setTimeout(() => searchRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open, selectedBookId]);

  // Scroll the content panel to top whenever the active panel changes.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [selectedBookId]);

  const query        = search.toLowerCase().trim();
  const selectedBook = selectedBookId
    ? BIBLE_BOOKS.find((b) => b.id === selectedBookId) ?? null
    : null;

  function filterBooks(books: typeof BIBLE_BOOKS) {
    if (!query) return books;
    return books.filter(
      (b) =>
        b.name.toLowerCase().includes(query) ||
        b.shortName.toLowerCase().includes(query),
    );
  }

  const otFiltered  = filterBooks(OT_BOOKS);
  const ntFiltered  = filterBooks(NT_BOOKS);
  const anyResults  = otFiltered.length > 0 || ntFiltered.length > 0;

  function handleSelectBook(bookId: string) {
    setSelectedBookId(bookId);
    setSearch('');
  }

  function handleSelectChapter(chapter: number) {
    if (!selectedBookId) return;
    onNavigate(selectedBookId, chapter);
    onOpenChange(false);
  }

  function handleBack() {
    if (selectedBookId) {
      setSelectedBookId(null);
    } else {
      onOpenChange(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        hideDefaultClose
        className="h-[76vh] flex flex-col p-0 rounded-t-2xl overflow-hidden"
      >
        {/* ── Drag handle ──────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* ── Header ───────────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-border">
          <div className="flex items-center h-12 px-2 gap-1">
            {/* Back / close left button */}
            <button
              onClick={handleBack}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
              aria-label={selectedBook ? 'Back to book list' : 'Close'}
            >
              <ArrowLeft size={20} />
            </button>

            {/* Centre title */}
            <div className="flex-1 text-center">
              <p className="text-[15px] font-semibold text-foreground leading-none">
                {selectedBook ? selectedBook.name : 'Go to…'}
              </p>
              {selectedBook && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {selectedBook.chapters} chapter{selectedBook.chapters !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            {/* Close right button */}
            <button
              onClick={() => onOpenChange(false)}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Search — book list view only */}
          {!selectedBook && (
            <div className="px-4 pb-3">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <input
                  ref={searchRef}
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search books…"
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-muted/40 text-[14px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  aria-label="Search Bible books"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Scrollable content ───────────────────────────────────────────────── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="px-4 pb-10">

            {selectedBook ? (

              /* ── Chapter grid ──────────────────────────────────────────────── */
              <div className="pt-4 space-y-3">
                <p className="text-[12px] text-muted-foreground">
                  Tap a chapter to open it in the current translation.
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {Array.from({ length: selectedBook.chapters }, (_, i) => i + 1).map((ch) => {
                    const isCurrent =
                      selectedBook.id === currentBookId && ch === currentChapter;
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
                        aria-label={`${selectedBook.name} chapter ${ch}`}
                        aria-current={isCurrent ? 'true' : undefined}
                      >
                        {ch}
                      </button>
                    );
                  })}
                </div>
              </div>

            ) : anyResults ? (

              /* ── Book list — OT then NT ────────────────────────────────────── */
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

              /* ── No results ────────────────────────────────────────────────── */
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
