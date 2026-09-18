import { useLocation } from 'wouter';
import { useBible } from '@/contexts/BibleContext';
import { BottomNav } from '@/components/BottomNav';
import { UnifiedEmmausInput } from '@/components/UnifiedEmmausInput';
import { SectionWrapper } from '@/components/SectionWrapper';
import { motion } from 'framer-motion';
import { BookOpen, ChevronRight, Bookmark, Heart, BookMarked, Library } from 'lucide-react';
import { useState, useEffect } from 'react';
import MyLibrary from '@/pages/bible/MyLibrary';
import { MemberHeaderActions } from '@/components/MemberHeaderActions';

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
      <main className="relative px-4 pt-4 max-w-[520px] mx-auto space-y-3">

        {/* Header */}
        <header>
          <div className="mb-1 flex justify-end">
            <MemberHeaderActions compact />
          </div>
          <motion.h1
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="min-w-0 text-[28px] font-sans font-medium tracking-tight"
          >
            My Bible
          </motion.h1>
        </header>

        {/* Ask Emmaus */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
        >
          <UnifiedEmmausInput launchOnly />
        </motion.div>

        {/* Tab switcher */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.13 }}
          className="flex gap-1 p-1 bg-muted/60 rounded-xl"
        >
          <button
            type="button"
            onClick={() => openTab('home')}
            className={[
              'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors',
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
              'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors',
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
        </motion.div>

        {/* ── Home Tab ─────────────────────────────────────────────────────── */}
        {activeTab === 'home' && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.18 }}
            className="space-y-2 pb-0"
          >

            {/* Continue / Begin Reading */}
            {lastRead ? (
              <SectionWrapper color="amber" label="Continue Reading" className="px-3 py-2 space-y-1.5">
                <div
                  className="bg-card rounded-xl border border-border/50 px-3 py-2 cursor-pointer hover:border-primary/25 active:opacity-75 transition-colors select-none"
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
              <SectionWrapper color="amber" label="Begin Reading" className="px-3 py-2 space-y-1.5">
                <div
                  className="bg-card rounded-xl border border-border/50 px-3 py-2 cursor-pointer hover:border-primary/25 active:opacity-75 transition-colors select-none"
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
            <SectionWrapper color="emerald" label="Browse Books" className="px-3 py-2 space-y-1.5">
              <div
                className="bg-card rounded-xl border border-border/50 px-3 py-2 cursor-pointer hover:border-primary/25 active:opacity-75 transition-colors select-none"
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

          </motion.div>
        )}

        {/* ── My Library Tab ────────────────────────────────────────────────── */}
        {activeTab === 'library' && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.18 }}
            className="pb-0"
          >
            <MyLibrary />
          </motion.div>
        )}

      </main>
      <BottomNav />
    </div>
  );
}
