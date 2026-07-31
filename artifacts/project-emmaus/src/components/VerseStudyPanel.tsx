/**
 * VerseStudyPanel
 *
 * A full-height bottom sheet that opens when the user taps "Study" on a verse.
 * Fetches admin-curated study notes from /api/bible/study-notes and displays
 * them across expandable accordion sections. Each section shows an empty-state
 * prompt when content isn't available yet.
 */

import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { getApiUrl } from '@/lib/api';
import {
  X, ChevronDown, ChevronUp, BookOpen, Globe, GitBranch,
  Clock, LetterText, Flame, Lightbulb, Mic2, Footprints,
  Loader2,
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

// ─── Section accordion ────────────────────────────────────────────────────────

function StudySection({
  icon, title, content, defaultOpen = false,
}: {
  icon: React.ReactNode;
  title: string;
  content: string | undefined;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasContent = !!content?.trim();

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 py-4 text-left"
      >
        <span className="text-primary/70 shrink-0">{icon}</span>
        <span className="flex-1 text-[15px] font-semibold text-foreground">{title}</span>
        {open ? <ChevronUp size={16} className="text-muted-foreground shrink-0" /> : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="pb-4">
          {hasContent ? (
            <p className="text-[15px] text-foreground leading-[1.7] whitespace-pre-wrap">{content}</p>
          ) : (
            <p className="text-[14px] text-muted-foreground italic">
              No study note for this section yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

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
  const [loading, setLoading] = useState(false);

  // Fetch study note + sermons when panel opens for a verse
  useEffect(() => {
    if (!open || !verse) return;
    setStudyNote(null);
    setSermons([]);
    setLoading(true);

    const noteUrl = getApiUrl(
      `/api/bible/study-notes?bookId=${verse.bookId}&chapter=${verse.chapter}&verse=${verse.verse}`
    );
    const sermonUrl = getApiUrl(
      `/api/youtube-archive/preached-here?bookId=${encodeURIComponent(verse.bookId)}&chapter=${verse.chapter}`
    );

    Promise.all([
      fetch(noteUrl).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(sermonUrl).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]).then(([note, rawData]) => {
      const sermonData = rawData as { chapterSermons?: PreachedHereSermon[]; sermons?: PreachedHereSermon[] };
      setStudyNote(note);
      setSermons(sermonData.chapterSermons ?? sermonData.sermons ?? []);
    }).finally(() => setLoading(false));
  }, [open, verse?.bookId, verse?.chapter, verse?.verse]); // eslint-disable-line react-hooks/exhaustive-deps

  const ref = verse
    ? `${verse.bookName} ${verse.chapter}:${verse.verse}`
    : '';

  return (
    <Sheet open={open} onOpenChange={o => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl h-[92dvh] flex flex-col p-0 overflow-hidden"
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
              {/* Study note title */}
              {studyNote?.title && (
                <div className="pt-4 pb-2">
                  <h2 className="text-[18px] font-bold text-foreground">{studyNote.title}</h2>
                  {studyNote.verse_end && studyNote.verse_end !== studyNote.verse_start && (
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      Covers verses {studyNote.verse_start}–{studyNote.verse_end}
                    </p>
                  )}
                </div>
              )}

              <div className="divide-y divide-border/50 pt-2">

                {/* 1. Explanation */}
                <StudySection
                  icon={<BookOpen size={17} />}
                  title="Explanation"
                  content={studyNote?.content}
                  defaultOpen
                />

                {/* 2. Passage context */}
                <StudySection
                  icon={<Globe size={17} />}
                  title="Passage Context"
                  content={studyNote?.context_note}
                />

                {/* 3. Historical background */}
                <StudySection
                  icon={<Clock size={17} />}
                  title="Historical Background"
                  content={studyNote?.historical_note}
                />

                {/* 4. Original language */}
                <StudySection
                  icon={<LetterText size={17} />}
                  title="Original Language"
                  content={studyNote?.original_language_note}
                />

                {/* 5. How this points to Jesus */}
                <StudySection
                  icon={<Flame size={17} />}
                  title="How This Points to Jesus"
                  content={studyNote?.jesus_connection}
                />

                {/* 6. Apply It */}
                <StudySection
                  icon={<Lightbulb size={17} />}
                  title="Apply It"
                  content={studyNote?.apply_it}
                />

                {/* 7. Preached Here sermons */}
                <div className="border-b border-border/50 last:border-0">
                  <button
                    onClick={() => setSermons(s => s.length ? [] : s)} // toggle handled by separate state
                    className="w-full flex items-center gap-3 py-4 text-left"
                  >
                    <span className="text-primary/70 shrink-0"><Mic2 size={17} /></span>
                    <span className="flex-1 text-[15px] font-semibold text-foreground">Preached Here</span>
                    {sermons.length > 0 && (
                      <span className="text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        {sermons.length}
                      </span>
                    )}
                    <ChevronDown size={16} className="text-muted-foreground shrink-0" />
                  </button>
                  <PreachedHereSection sermons={sermons} />
                </div>

                {/* 8. Ask Emmaus */}
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
                      <GitBranch size={18} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-foreground">Ask Emmaus about this verse</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">Get a deeper explanation or ask a question</p>
                    </div>
                  </button>
                </div>

                {/* 9. Related Walks */}
                <div className="py-4">
                  <button
                    onClick={() => {
                      onClose();
                      setLocation('/journeys');
                    }}
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

// ─── Preached Here section (always open) ─────────────────────────────────────

function PreachedHereSection({ sermons }: { sermons: PreachedHereSermon[] }) {
  if (sermons.length === 0) {
    return (
      <p className="text-[14px] text-muted-foreground italic pb-4">
        No sermons linked to this chapter yet.
      </p>
    );
  }
  return (
    <div className="space-y-2.5 pb-4">
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
  );
}
