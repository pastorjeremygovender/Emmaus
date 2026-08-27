import { useLocation } from 'wouter';
import { useBible } from '@/contexts/BibleContext';
import { BottomNav } from '@/components/BottomNav';
import { UnifiedEmmausInput } from '@/components/UnifiedEmmausInput';
import { SectionWrapper } from '@/components/SectionWrapper';
import { ShareEmmausButton } from '@/components/ShareEmmausButton';
import { BookOpen, ChevronRight, Bookmark, Heart, BookMarked, Library } from 'lucide-react';
import { useState, useEffect } from 'react';
import MyLibrary from '@/pages/bible/MyLibrary';

type Tab = 'home' | 'library';

export default function Bible() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const [location, setLocation] = useLocation();
  const { lastRead, favourites, bookmarks, notes, prayers, highlights } = useBible();
  const [activeTab, setActiveTab] = useState<Tab>(() => (
    new URLSearchParams(window.location.search).get('tab') === 'library' ? 'library' : 'home'
  ));

  // Keep the selected Bible tab addressable. This also makes a library link
  // survive remounts and gives members a reliable deep link to their saved
  // notes, highlights, bookmarks, and prayers.
  useEffect(() => {
    setActiveTab(new URLSearchParams(window.location.search).get('tab') === 'library' ? 'library' : 'home');
  }, [location]);

  function openTab(tab: Tab) {
    setActiveTab(tab);
    setLocation(tab === 'library' ? '/bible?tab=library' : '/bible');
  }

  const libraryCount = notes.length + prayers.length + favourites.length + bookmarks.length + highlights.length;

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      <main className="relative px-5 pt-10 max-w-[520px] mx-auto space-y-6">

        <div className="absolute right-2 top-3 z-10">
          <ShareEmmausButton />
        </div>

        {/* Header */}
        <header className="space-y-1">
          <h1 className="text-[30px] font-sans font-medium tracking-tight">My Bible</h1>
        </header>

        {/* Ask Emmaus */}
        <UnifiedEmmausInput launchOnly />

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 bg-muted/60 rounded-xl">
          <button
            type="button"
            onClick={() => openTab('home')}
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
            type="button"
            onClick={() => openTab('library')}
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
          <div className="space-y-4 pb-4">

            {/* Continue / Begin Reading */}
            {lastRead ? (
              <SectionWrapper color="amber" label="Continue Reading">
                <div
                  className="bg-card rounded-xl border border-border/50 px-3.5 py-2.5 cursor-pointer hover:border-primary/25 active:opacity-75 transition-colors select-none"
                  onClick={() => setLocation(`/bible/read/${lastRead.bookId}/${lastRead.chapter}`)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-foreground leading-snug truncate">
                        {lastRead.chapterHeading}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                        {lastRead.bookName} {lastRead.chapter}
                      </p>
                    </div>
                    <ChevronRight size={15} className="shrink-0 text-muted-foreground/40" />
                  </div>
                </div>
              </SectionWrapper>
            ) : (
              <SectionWrapper color="amber" label="Begin Reading">
                <div
                  className="bg-card rounded-xl border border-border/50 px-3.5 py-2.5 cursor-pointer hover:border-primary/25 active:opacity-75 transition-colors select-none"
                  onClick={() => setLocation('/bible/read/luke/1')}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-foreground leading-snug">
                        The Birth of John the Baptist Foretold
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                        Walk Through Luke · Luke 1
                      </p>
                    </div>
                    <ChevronRight size={15} className="shrink-0 text-muted-foreground/40" />
                  </div>
                </div>
              </SectionWrapper>
            )}

            {/* Browse Books */}
            <SectionWrapper color="emerald" label="Browse Books">
              <div
                className="bg-card rounded-xl border border-border/50 px-3.5 py-2.5 cursor-pointer hover:border-primary/25 active:opacity-75 transition-colors select-none"
                onClick={() => setLocation('/bible/books')}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-foreground leading-snug">Old Testament · New Testament</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">66 books</p>
                  </div>
                  <ChevronRight size={15} className="shrink-0 text-muted-foreground/40" />
                </div>
              </div>
            </SectionWrapper>

          </div>
        )}

        {/* ── My Library Tab ────────────────────────────────────────────────── */}
        {activeTab === 'library' && (
          <div className="pb-4">
            <MyLibrary />
          </div>
        )}

      </main>
      <BottomNav />
    </div>
  );
}
