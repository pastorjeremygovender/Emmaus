import { useLocation } from 'wouter';
import { useBible } from '@/contexts/BibleContext';
import { BottomNav } from '@/components/BottomNav';
import { UnifiedEmmausInput } from '@/components/UnifiedEmmausInput';
import { BookOpen, ChevronRight, Bookmark, Heart, BookMarked, Library, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';
import MyLibrary from '@/pages/bible/MyLibrary';

type Tab = 'home' | 'library';

function formatRelativeDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch { return ''; }
}

export default function Bible() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const [, setLocation] = useLocation();
  const { lastRead, favourites, bookmarks, notes, prayers, highlights, readingHistory } = useBible();
  const [activeTab, setActiveTab] = useState<Tab>('home');

  const libraryCount = notes.length + prayers.length + favourites.length + bookmarks.length + highlights.length;

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      <main className="px-5 pt-12 max-w-[520px] mx-auto space-y-6">

        {/* Header */}
        <header className="space-y-1">
          <h1 className="text-[30px] font-sans font-medium tracking-tight">My Bible</h1>
        </header>

        {/* Ask Emmaus */}
        <UnifiedEmmausInput />

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
                <div
                  className="p-4 rounded-xl border border-border bg-card flex items-center gap-4 cursor-pointer active:scale-[0.98] transition-transform"
                  onClick={() => setLocation(`/bible/read/${lastRead.bookId}/${lastRead.chapter}`)}
                >
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
                  <ChevronRight size={17} className="text-muted-foreground shrink-0" />
                </div>
              </section>
            ) : (
              <section className="space-y-3">
                <SectionLabel>Begin Reading</SectionLabel>
                <div
                  className="p-4 rounded-xl border border-border bg-card flex items-center gap-4 cursor-pointer active:scale-[0.98] transition-transform"
                  onClick={() => setLocation('/bible/read/luke/1')}
                >
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
                  <ChevronRight size={17} className="text-muted-foreground shrink-0" />
                </div>
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


          </div>
        )}

        {/* ── My Library Tab ────────────────────────────────────────────────── */}
        {activeTab === 'library' && (
          <div className="space-y-8 pb-4">

            {/* Reading History */}
            <section className="space-y-3">
              <SectionLabel>Reading History</SectionLabel>
              {readingHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-10 border border-dashed border-border rounded-2xl text-center space-y-3">
                  <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center text-muted-foreground">
                    <Clock size={18} />
                  </div>
                  <p className="text-[14px] text-muted-foreground leading-relaxed">
                    Chapters you read will appear here.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/60 rounded-xl border border-border overflow-hidden">
                  {readingHistory.map((entry, i) => (
                    <div
                      key={`${entry.bookId}-${entry.chapter}-${entry.openedAt}`}
                      onClick={() => setLocation(`/bible/read/${entry.bookId}/${entry.chapter}`)}
                      className="flex items-center gap-3 px-4 py-3.5 bg-card hover:bg-muted/40 active:bg-muted/60 cursor-pointer transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        {i === 0 ? (
                          <BookOpen size={16} className="text-primary" />
                        ) : (
                          <span className="text-[12px] font-semibold text-muted-foreground">{i + 1}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold text-primary uppercase tracking-widest">
                          {entry.bookName} {entry.chapter}
                        </div>
                        <div className="text-[14px] font-medium text-foreground truncate">
                          {entry.chapterHeading}
                        </div>
                      </div>
                      <div className="shrink-0 text-[11px] text-muted-foreground">
                        {formatRelativeDate(entry.openedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <MyLibrary />
          </div>
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
