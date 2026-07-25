/**
 * BibleReferencePicker — full-screen overlay for picking any Bible book and chapter.
 *
 * Flow:
 *   1. Shows all 66 books in OT / NT groups with optional search filter.
 *   2. Tapping a book expands to show chapter buttons for that book.
 *   3. Tapping a chapter immediately calls onNavigate(bookId, chapter) and closes.
 *
 * The current book and chapter are highlighted.
 * No "Intro" chapter is included. No placeholders.
 */

import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Search, X, ChevronRight } from 'lucide-react';
import { BIBLE_BOOKS } from '@/lib/bible-data';

interface Props {
  currentBookId: string;
  currentChapter: number;
  onNavigate: (bookId: string, chapter: number) => void;
  onClose: () => void;
}

const OT_BOOKS = BIBLE_BOOKS.filter((b) => b.testament === 'OT');
const NT_BOOKS = BIBLE_BOOKS.filter((b) => b.testament === 'NT');

export function BibleReferencePicker({ currentBookId, currentChapter, onNavigate, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Auto-focus search on open
  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 50);
  }, []);

  // When a book is selected, scroll chapters panel to top
  const chaptersRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedBookId) chaptersRef.current?.scrollTo(0, 0);
  }, [selectedBookId]);

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

  const selectedBook = selectedBookId ? BIBLE_BOOKS.find((b) => b.id === selectedBookId) : null;

  function handleSelectBook(bookId: string) {
    setSelectedBookId(bookId);
    setSearch('');
  }

  function handleSelectChapter(chapter: number) {
    if (!selectedBookId) return;
    onNavigate(selectedBookId, chapter);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-background flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Bible Reference Picker"
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-background">
        <div className="flex items-center h-14 px-4 max-w-[600px] mx-auto gap-3">
          <button
            onClick={selectedBookId ? () => setSelectedBookId(null) : onClose}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
            aria-label={selectedBookId ? 'Back to book list' : 'Close'}
          >
            <ArrowLeft size={22} />
          </button>

          <div className="flex-1 text-center">
            <div className="text-[16px] font-semibold text-foreground">
              {selectedBook ? selectedBook.name : 'References'}
            </div>
            {selectedBook && (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {selectedBook.chapters} chapter{selectedBook.chapters !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search — only shown in book list view */}
        {!selectedBook && (
          <div className="px-4 pb-3 max-w-[600px] mx-auto">
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search books…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-muted/40 text-[14px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                aria-label="Search Bible books"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" ref={chaptersRef}>
        <div className="max-w-[600px] mx-auto px-4 pb-8">

          {selectedBook ? (
            /* Chapter grid */
            <div className="pt-5 space-y-4">
              <p className="text-[12px] text-muted-foreground">
                Tap a chapter to open it in the current translation.
              </p>
              <div className="grid grid-cols-5 gap-2.5">
                {Array.from({ length: selectedBook.chapters }, (_, i) => i + 1).map((ch) => {
                  const isCurrent = selectedBook.id === currentBookId && ch === currentChapter;
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
            /* Book list — OT then NT */
            <div className="pt-4 space-y-6">
              {[
                { label: 'Old Testament', books: otFiltered },
                { label: 'New Testament', books: ntFiltered },
              ]
                .filter((section) => section.books.length > 0)
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
                              'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors',
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
            <div className="pt-16 text-center text-muted-foreground text-[15px]">
              No books match "{search}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
