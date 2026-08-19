/**
 * VerseStudyPanel
 *
 * Full-height bottom sheet opened when a user taps "Study" on a verse.
 * Loads passage-level study notes, DB-backed cross-references, and chapter overview.
 *
 * Per spec:
 * - Find the passage containing the selected verse (verse_start ≤ v ≤ verse_end)
 * - Show only sections that have content (never render empty accordion rows)
 * - Chapter overview available on demand
 */

import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { getApiUrl } from '@/lib/api';
import {
  X, ChevronDown, ChevronUp, BookOpen, Globe, GitBranch,
  Clock, LetterText, Flame, Lightbulb, Mic2, Footprints,
  Loader2, BookMarked, ArrowRight, Link2,
} from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StudyVerse = {
  bookId: string;
  bookName: string;
  chapter: number;
  verse: number;
  text: string;
};

type CrossReference = {
  id: string;
  targetBookId: string;
  targetBookName: string;
  targetChapter: number;
  targetVerse: number;
  targetRef: string;
  targetVerseText: string | null;
  relationship_note: string;
};

type StudyNote = {
  id: string;
  book_id: string;
  chapter: number;
  verse_start: number;
  verse_end: number | null;
  title: string;
  content: string;
  context_note: string;
  historical_note: string;
  original_language_note: string;
  jesus_connection: string;
  apply_it: string;
  key_truth: string;
  reflection_question: string;
  related_scriptures: string;
  cross_references: unknown[];
  key_themes: string[];
  important_people: string[];
  important_places: string[];
};

type ChapterOverview = {
  id: string;
  title: string;
  summary: string;
  main_themes: string[];
  important_people: string[];
  important_locations: string[];
  key_verse: string;
  book_connection: string;
  jesus_connection: string;
};

type PreachedHereSermon = {
  sermonId: string;
  title: string;
  speaker: string;
  sermonDate?: string;
  timestampedUrl: string;
  timestampLabel: string;
  audioUrl?: string;
};

// ─── Section accordion — only renders if content is non-empty ─────────────────

export function StudySection({
  icon, title, content, defaultOpen = false,
}: {
  icon: React.ReactNode;
  title: string;
  content: string | undefined;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!content) return null;

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 py-4 text-left"
      >
        <span className="text-primary/70 shrink-0">{icon}</span>
        <span className="flex-1 text-[15px] font-semibold text-foreground">{title}</span>
        {open
          ? <ChevronUp size={16} className="text-muted-foreground shrink-0" />
          : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="pb-4">
          <p className="text-[15px] text-foreground leading-[1.7] whitespace-pre-wrap">{content}</p>
        </div>
      )}
    </div>
  );
}

// ─── Key Truth section — bold takeaway callout ────────────────────────────────

function KeyTruthSection({ content }: { content: string | undefined }) {
  const [open, setOpen] = useState(false);
  if (!content) return null;

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 py-4 text-left"
      >
        <span className="text-orange-500 shrink-0"><Flame size={17} /></span>
        <span className="flex-1 text-[15px] font-semibold text-foreground">Key Truth</span>
        {open
          ? <ChevronUp size={16} className="text-muted-foreground shrink-0" />
          : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="pb-4">
          <div className="rounded-xl bg-orange-500/8 border border-orange-500/20 px-4 py-3.5">
            <p className="text-[15px] font-semibold text-foreground leading-[1.65] whitespace-pre-wrap">
              {content}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Reflection section — interactive question callout ────────────────────────

function ReflectionSection({ content }: { content: string | undefined }) {
  const [open, setOpen] = useState(false);
  if (!content) return null;

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 py-4 text-left"
      >
        <span className="text-amber-500 shrink-0"><Lightbulb size={17} /></span>
        <span className="flex-1 text-[15px] font-semibold text-foreground">Reflection</span>
        {open
          ? <ChevronUp size={16} className="text-muted-foreground shrink-0" />
          : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="pb-4">
          <div className="rounded-xl bg-amber-500/8 border border-amber-500/25 px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[13px] font-bold text-amber-600 leading-none">?</span>
              </div>
              <p className="text-[15px] text-foreground leading-[1.7] whitespace-pre-wrap italic">
                {content}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 px-1">
            Take a moment to sit with this question.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Cross references section ─────────────────────────────────────────────────

function CrossReferencesSection({
  refs,
  onNavigate,
}: {
  refs: CrossReference[];
  onNavigate: (bookId: string, chapter: number, verse: number) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!refs || refs.length === 0) return null;

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 py-4 text-left"
      >
        <span className="text-primary/70 shrink-0"><Link2 size={17} /></span>
        <span className="flex-1 text-[15px] font-semibold text-foreground">Cross References</span>
        <span className="text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full mr-1">
          {refs.length}
        </span>
        {open
          ? <ChevronUp size={16} className="text-muted-foreground shrink-0" />
          : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="pb-4 space-y-2.5">
          {refs.map(ref => (
            <button
              key={ref.id}
              onClick={() => onNavigate(ref.targetBookId, ref.targetChapter, ref.targetVerse)}
              className="w-full flex items-start gap-3 p-3.5 rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-primary/5 transition-colors text-left"
            >
              <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                <Link2 size={14} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-primary">{ref.targetRef}</p>
                {ref.targetVerseText ? (
                  <p className="text-[13px] text-foreground leading-[1.6] mt-0.5 line-clamp-3">
                    "{ref.targetVerseText}"
                  </p>
                ) : null}
                {ref.relationship_note ? (
                  <p className="text-[11px] text-muted-foreground mt-1 italic">{ref.relationship_note}</p>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Chapter overview section ─────────────────────────────────────────────────

function ChapterOverviewSection({
  overview,
  chapterRef,
}: {
  overview: ChapterOverview | null | 'loading';
  chapterRef: string;
}) {
  const [open, setOpen] = useState(false);
  if (!overview && overview !== 'loading') return null;

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 py-4 text-left"
      >
        <span className="text-primary/70 shrink-0"><BookMarked size={17} /></span>
        <span className="flex-1 text-[15px] font-semibold text-foreground">Chapter Overview</span>
        <span className="text-[11px] text-muted-foreground mr-1">{chapterRef}</span>
        {open
          ? <ChevronUp size={16} className="text-muted-foreground shrink-0" />
          : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="pb-4">
          {overview === 'loading' ? (
            <div className="flex items-center gap-2 text-muted-foreground text-[14px]">
              <Loader2 size={14} className="animate-spin" /> Loading overview…
            </div>
          ) : (
            <div className="space-y-3">
                {overview.title && (
                  <h3 className="text-[16px] font-bold text-foreground leading-snug">
                    {overview.title}
                  </h3>
                )}
              {overview.summary && (
                <p className="text-[15px] text-foreground leading-[1.7]">{overview.summary}</p>
              )}
              {overview.main_themes?.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                    Themes
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {overview.main_themes.map((t, i) => (
                      <span key={i} className="text-[12px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {overview.key_verse && (
                <p className="text-[13px] text-muted-foreground">
                  <span className="font-semibold">Key verse: </span>{overview.key_verse}
                </p>
              )}
              {overview.jesus_connection && (
                <p className="text-[14px] text-foreground leading-[1.6] italic border-l-2 border-primary/30 pl-3">
                  {overview.jesus_connection}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Preached Here section ────────────────────────────────────────────────────

function PreachedHereSection({ sermons }: { sermons: PreachedHereSermon[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 py-4 text-left"
      >
        <span className="text-primary/70 shrink-0"><Mic2 size={17} /></span>
        <span className="flex-1 text-[15px] font-semibold text-foreground">Preached Here</span>
        {sermons.length > 0 && (
          <span className="text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full mr-1">
            {sermons.length}
          </span>
        )}
        {open
          ? <ChevronUp size={16} className="text-muted-foreground shrink-0" />
          : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="pb-4">
          {sermons.length === 0 ? (
            <p className="text-[14px] text-muted-foreground italic">
              No sermons found for this passage yet.
            </p>
          ) : (
            <div className="space-y-2.5">
              {sermons.slice(0, 3).map((s, i) => (
                <a
                  key={s.sermonId ?? i}
                  href={s.timestampedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 p-3.5 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors"
                >
                  <span className="text-[20px] leading-none mt-0.5 shrink-0" aria-hidden>🎧</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-foreground line-clamp-2">{s.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {s.speaker}
                      {s.sermonDate && ` · ${new Date(s.sermonDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Books that have study notes in the database ─────────────────────────────
// Update this list whenever new books are seeded.
const BOOKS_WITH_NOTES = new Set([
  'luke', 'acts', 'romans', '1corinthians', '2corinthians', 'psalms',
]);

// ─── Main component ───────────────────────────────────────────────────────────

interface VerseStudyPanelProps {
  verse: StudyVerse | null;
  open: boolean;
  onClose: () => void;
}

export function VerseStudyPanel({ verse, open, onClose }: VerseStudyPanelProps) {
  const [, setLocation] = useLocation();
  const [studyNote, setStudyNote] = useState<StudyNote | null>(null);
  const [sermons, setSermons] = useState<PreachedHereSermon[]>([]);
  const [crossRefs, setCrossRefs] = useState<CrossReference[]>([]);
  const [chapterOverview, setChapterOverview] = useState<ChapterOverview | null | 'loading'>(null);
  const [loading, setLoading] = useState(false);

  // Fetch study note, sermons, DB cross references, and chapter overview when panel opens
  useEffect(() => {
    if (!open || !verse) return;
    setStudyNote(null);
    setSermons([]);
    setCrossRefs([]);
    setChapterOverview(null);
    setLoading(true);

    const noteUrl = getApiUrl(
      `/api/bible/study-notes?bookId=${verse.bookId}&chapter=${verse.chapter}&verse=${verse.verse}`
    );
    const sermonUrl = getApiUrl(
      `/api/youtube-archive/preached-here?bookId=${encodeURIComponent(verse.bookId)}&chapter=${verse.chapter}`
    );
    const crossRefUrl = getApiUrl(
      `/api/bible/cross-references?bookId=${verse.bookId}&chapter=${verse.chapter}&verse=${verse.verse}`
    );
    const overviewUrl = getApiUrl(
      `/api/bible/chapter-overview?bookId=${encodeURIComponent(verse.bookId)}&chapter=${verse.chapter}`
    );

    Promise.all([
      fetch(noteUrl).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(sermonUrl).then(r => r.ok ? r.json() : {}).catch(() => ({})),
      fetch(crossRefUrl).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(overviewUrl).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([note, rawSermons, refs, overview]) => {
      setStudyNote(note as StudyNote | null);
      const sd = rawSermons as { chapterSermons?: PreachedHereSermon[]; bookSermons?: PreachedHereSermon[]; sermons?: PreachedHereSermon[] };
      // Prefer chapter-specific results; fall back to book-level when none found
      const chapterHits = sd.chapterSermons ?? [];
      setSermons(chapterHits.length > 0 ? chapterHits : (sd.bookSermons ?? sd.sermons ?? []));
      setCrossRefs(Array.isArray(refs) ? refs : []);
      setChapterOverview((overview as ChapterOverview | null) ?? null);
    }).finally(() => setLoading(false));
  }, [open, verse?.bookId, verse?.chapter, verse?.verse]); // eslint-disable-line react-hooks/exhaustive-deps

  const ref = verse ? `${verse.bookName} ${verse.chapter}:${verse.verse}` : '';
  const chapterRef = verse ? `${verse.bookName} ${verse.chapter}` : '';

  const hasAnyContent = studyNote && (
    studyNote.content || studyNote.context_note || studyNote.historical_note ||
    studyNote.original_language_note || studyNote.jesus_connection || studyNote.apply_it ||
    studyNote.key_truth || studyNote.reflection_question || studyNote.related_scriptures
  );

  return (
    <Sheet open={open} onOpenChange={o => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl h-[92dvh] flex flex-col p-0 overflow-hidden"
        hideDefaultClose
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-border/50 shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-primary uppercase tracking-widest mb-1">
              Study — {ref}
            </p>
            {verse && (
              <p className="text-[15px] text-muted-foreground leading-[1.6] italic line-clamp-2">
                "{verse.text}"
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1 text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="text-primary animate-spin" />
            </div>
          ) : (
            <>
              {/* Passage title */}
              {studyNote?.title && (
                <div className="pt-4 pb-2">
                  <h2 className="text-[18px] font-bold text-foreground">{studyNote.title}</h2>
                  {studyNote.verse_end && studyNote.verse_end !== studyNote.verse_start && (
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      {verse?.bookName} {verse?.chapter}:{studyNote.verse_start}–{studyNote.verse_end}
                    </p>
                  )}
                </div>
              )}

              <div className="divide-y divide-border/50 pt-2">

                {/* Chapter Overview — available on demand */}
                <ChapterOverviewSection overview={chapterOverview} chapterRef={chapterRef} />

                {/* 1. Explanation */}
                <StudySection
                  icon={<BookOpen size={17} />}
                  title="Explanation"
                  content={studyNote?.content}
                />

                {/* 2. Passage Context */}
                <StudySection
                  icon={<Globe size={17} />}
                  title="Passage Context"
                  content={studyNote?.context_note}
                />

                {/* 3. Key Truth */}
                <KeyTruthSection content={studyNote?.key_truth} />

                {/* 4. Reflection */}
                <ReflectionSection content={studyNote?.reflection_question} />

                {/* 5. Practical Application */}
                <StudySection
                  icon={<Footprints size={17} />}
                  title="Practical Application"
                  content={studyNote?.apply_it}
                />

                {/* 6. Related Scriptures */}
                <StudySection
                  icon={<Link2 size={17} />}
                  title="Related Scriptures"
                  content={studyNote?.related_scriptures}
                />

                {/* 7. Historical Background */}
                <StudySection
                  icon={<Clock size={17} />}
                  title="Historical Background"
                  content={studyNote?.historical_note}
                />

                {/* 8. Original Language */}
                <StudySection
                  icon={<LetterText size={17} />}
                  title="Original Language"
                  content={studyNote?.original_language_note}
                />

                {/* 9. How This Points to Jesus */}
                <StudySection
                  icon={<BookMarked size={17} />}
                  title="How This Points to Jesus"
                  content={studyNote?.jesus_connection}
                />

                {/* 7. Cross References — DB-backed, tap to navigate */}
                <CrossReferencesSection
                  refs={crossRefs}
                  onNavigate={(bookId, chapter, verseNum) => {
                    onClose();
                    setLocation(`/bible/read/${bookId}/${chapter}?startVerse=${verseNum}`);
                  }}
                />

                {/* 8. Preached Here */}
                <PreachedHereSection sermons={sermons} />

                {/* No content state */}
                {!hasAnyContent && !chapterOverview && sermons.length === 0 && crossRefs.length === 0 && (
                  <div className="py-8 text-center">
                    <p className="text-[15px] font-semibold text-foreground mb-2">
                      No study notes yet for this passage
                    </p>
                    <p className="text-[13px] text-muted-foreground">
                      {verse && BOOKS_WITH_NOTES.has(verse.bookId)
                        ? `Notes are available for parts of ${verse.bookName} — this passage hasn't been covered yet.`
                        : `We're working on adding notes for ${verse?.bookName ?? 'this book'}. Check back soon.`}
                    </p>
                  </div>
                )}

                {/* Go Deeper — Ask Emmaus */}
                <div className="py-4">
                  <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                    Go Deeper
                  </p>
                  <button
                    onClick={() => {
                      onClose();
                      setLocation(
                        `/personal/ask-emmaus/conversation?verse=${encodeURIComponent(ref)}&q=${encodeURIComponent(`Help me understand ${ref}: "${verse?.text ?? ''}"`)}`
                      );
                    }}
                    className="w-full flex items-center gap-3 p-4 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors text-left"
                  >
                    <div className="w-9 h-9 bg-primary/15 rounded-xl flex items-center justify-center shrink-0">
                      <ArrowRight size={18} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-foreground">Ask Emmaus about this verse</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">Get a deeper explanation or ask a question</p>
                    </div>
                  </button>
                </div>

                {/* Related Walks */}
                <div className="py-4">
                  <button
                    onClick={() => { onClose(); setLocation('/journeys'); }}
                    className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-primary/5 transition-colors text-left"
                  >
                    <div className="w-9 h-9 bg-muted rounded-xl flex items-center justify-center shrink-0">
                      <Footprints size={18} className="text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-foreground">Find a Walk on this passage</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">Explore guided journeys through Scripture</p>
                    </div>
                  </button>
                </div>

              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
