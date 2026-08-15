import { useLocation } from 'wouter';
import { useBible } from '@/contexts/BibleContext';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BookOpen, ChevronRight, Bookmark, Heart, BookMarked, Library } from 'lucide-react';
import { useState, useEffect } from 'react';
import MyLibrary from '@/pages/bible/MyLibrary';

type Tab = 'home' | 'library';

export default function Bible() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const [, setLocation] = useLocation();
  const { lastRead, favourites, bookmarks, notes, prayers, highlights } = useBible();
  const [activeTab, setActiveTab] = useState<Tab>('home');

  const libraryCount = notes.length + prayers.length + favourites.length + bookmarks.length + highlights.length;

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      <main className="px-5 pt-12 max-w-[520px] mx-auto space-y-6">

        {/* Header */}
        <header className="space-y-1">
          <h1 className="text-[30px] font-sans font-medium tracking-tight">My Bible</h1>
        </header>

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 bg-muted/60 rounded-xl">
          <button
            onClick={() => setActiveTab('home')}
            className={[
              'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-medium transition-colors',
              activeTab === 'home'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            <BookOpen size={14} />
            Home
          </button>
          <button
            onClick={() => setActiveTab('library')}
            className={[
              'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-medium transition-colors',
              activeTab === 'library'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            <Library size={14} />
            My Library
            {libraryCount > 0 && (
              <span className={[
                'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                activeTab === 'library'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted-foreground/20 text-muted-foreground',
              ].join(' ')}>
                {libraryCount}
              </span>
            )}
          </button>
        </div>

        {/* ── Home Tab ─────────────────────────────────────────────────────── */}
        {activeTab === 'home' && (
          <div className="space-y-9 pb-4">

            {/* Continue / Begin Reading */}
            {lastRead ? (
              <section className="space-y-3">
                <SectionLabel>Continue Reading</SectionLabel>
                <Card
                  className="bg-card border-border cursor-pointer active:scale-[0.98] transition-transform"
                  onClick={() => setLocation(`/bible/read/${lastRead.bookId}/${lastRead.chapter}`)}
                >
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center shrink-0">
                      <BookOpen size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-primary uppercase tracking-widest mb-0.5">
                        {lastRead.bookName} {lastRead.chapter}
                      </div>
                      <div className="text-[16px] font-medium text-foreground truncate">
                        {lastRead.chapterHeading}
                      </div>
                    </div>
                    <Button size="sm" className="shrink-0 rounded-xl h-9 px-4">Continue</Button>
                  </CardContent>
                </Card>
              </section>
            ) : (
              <section className="space-y-3">
                <SectionLabel>Begin Reading</SectionLabel>
                <Card
                  className="bg-card border-border cursor-pointer active:scale-[0.98] transition-transform"
                  onClick={() => setLocation('/bible/read/luke/1')}
                >
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center shrink-0">
                      <BookOpen size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-primary uppercase tracking-widest mb-0.5">
                        Walk Through Luke · Luke 1
                      </div>
                      <div className="text-[16px] font-medium text-foreground">
                        The Birth of John the Baptist Foretold
                      </div>
                    </div>
                    <Button size="sm" className="shrink-0 rounded-xl h-9 px-4">Read</Button>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Browse Books */}
            <section className="space-y-3">
              <SectionLabel>Browse Books</SectionLabel>
              <div
                className="p-4 rounded-xl border border-border bg-card flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform"
                onClick={() => setLocation('/bible/books')}
              >
                <div className="flex items-center gap-3">
                  <BookMarked size={17} className="text-primary" />
                  <div>
                    <div className="text-[15px] font-medium text-foreground">Old Testament · New Testament</div>
                    <div className="text-[12px] text-muted-foreground">66 books</div>
                  </div>
                </div>
                <ChevronRight size={17} className="text-muted-foreground" />
              </div>
            </section>

            {/* Bookmarks */}
            <section className="space-y-3">
              <SectionLabel>Bookmarks</SectionLabel>
              {bookmarks.length === 0 && favourites.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-10 border border-dashed border-border rounded-2xl text-center space-y-3">
                  <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center text-muted-foreground">
                    <Bookmark size={18} />
                  </div>
                  <p className="text-[14px] text-muted-foreground leading-relaxed">
                    Tap the bookmark icon while reading to save chapters here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {bookmarks.slice(0, 3).map(bkm => (
                    <div
                      key={bkm.id}
                      className="p-4 rounded-xl border border-border bg-card space-y-1 cursor-pointer active:scale-[0.98] transition-transform"
                      onClick={() => setLocation(`/bible/read/${bkm.bookId}/${bkm.chapter}`)}
                    >
                      <div className="flex items-center gap-2">
                        <Bookmark size={12} className="text-primary fill-primary" />
                        <div className="text-[11px] font-semibold text-primary uppercase tracking-widest">
                          {bkm.bookName} {bkm.chapter}
                        </div>
                      </div>
                      <p className="text-[14px] font-medium text-foreground">{bkm.chapterHeading}</p>
                    </div>
                  ))}
                  {favourites.slice(0, 2).map(fav => (
                    <div
                      key={fav.id}
                      className="p-4 rounded-xl border border-border bg-card space-y-1.5 cursor-pointer active:scale-[0.98] transition-transform"
                      onClick={() => setLocation(`/bible/read/${fav.bookId}/${fav.chapter}`)}
                    >
                      <div className="flex items-center gap-2">
                        <Heart size={12} className="text-primary fill-primary" />
                        <div className="text-[11px] font-semibold text-primary uppercase tracking-widest">
                          {fav.bookName} {fav.chapter}:{fav.verse}
                        </div>
                      </div>
                      <p className="text-[14px] font-sans leading-relaxed text-foreground italic line-clamp-2">
                        "{fav.verseText}"
                      </p>
                    </div>
                  ))}
                  {(bookmarks.length + favourites.length) > 5 && (
                    <button
                      onClick={() => setActiveTab('library')}
                      className="text-[13px] text-primary font-medium py-1 w-full text-center hover:underline"
                    >
                      View all saved passages
                    </button>
                  )}
                </div>
              )}
            </section>

          </div>
        )}

        {/* ── My Library Tab ────────────────────────────────────────────────── */}
        {activeTab === 'library' && (
          <MyLibrary />
        )}

      </main>
      <BottomNav />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
      {children}
    </h2>
  );
}
