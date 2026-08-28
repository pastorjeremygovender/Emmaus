/**
 * SharedScripturePanel.tsx — Shared scripture view for a guided Room session.
 *
 * Displays a Bible passage that the leader opened for the group.
 * Features:
 *  - Renders passage verses using the same useChapter hook as the Bible reader
 *  - Focus Verse badge: marks the verse the leader pinned, auto-scrolls to it
 *  - Shared highlights: coloured underline chips per member
 *  - Tap a verse → sheet with "Highlight" + optional note + "Set as Focus" (leaders)
 *  - Tap a highlight chip → popover showing author + optional note
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, BookOpen, Pin, Loader2, Star } from 'lucide-react';
import { useChapter } from '@/hooks/useChapter';
import { useBible } from '@/contexts/BibleContext';
import { parseScriptureRef } from '@/lib/scripture-ref';
import { apiAddHighlight, apiGetHighlights, apiSetFocusVerse } from '@/lib/rooms-api';
import type { RoomHighlight, ScriptureRef } from '@/lib/rooms-types';

// ─── Colour palette for member highlights ─────────────────────────────────────

const HIGHLIGHT_COLOURS = [
  { bg: 'bg-yellow-200/60 dark:bg-yellow-900/40', border: 'border-yellow-400/60' },
  { bg: 'bg-blue-200/50 dark:bg-blue-900/40',    border: 'border-blue-400/50' },
  { bg: 'bg-green-200/50 dark:bg-green-900/40',  border: 'border-green-400/50' },
  { bg: 'bg-pink-200/50 dark:bg-pink-900/40',    border: 'border-pink-400/50' },
  { bg: 'bg-purple-200/50 dark:bg-purple-900/40',border: 'border-purple-400/50' },
  { bg: 'bg-orange-200/50 dark:bg-orange-900/40',border: 'border-orange-400/50' },
];

function colourForUser(userId: string) {
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return HIGHLIGHT_COLOURS[Math.abs(hash) % HIGHLIGHT_COLOURS.length];
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SharedScripturePanelProps {
  roomId: string;
  userId: string;
  sessionId: string;
  scripture: ScriptureRef;
  /** New highlights arriving from SSE (merged without re-fetching). */
  incomingHighlights?: RoomHighlight[];
  /** Latest focus-highlight ID from SSE (null = clear). */
  focusHighlightId?: string | null;
  isLeader: boolean;
  userName: string;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SharedScripturePanel({
  roomId,
  userId,
  sessionId,
  scripture,
  incomingHighlights = [],
  focusHighlightId,
  isLeader,
  userName,
  onClose,
}: SharedScripturePanelProps) {
  const { translationId } = useBible();

  // Convert book name → bookId using the existing scripture-ref parser
  const refString = scripture.verseStart
    ? `${scripture.book} ${scripture.chapter}:${scripture.verseStart}${scripture.verseEnd ? `-${scripture.verseEnd}` : ''}`
    : `${scripture.book} ${scripture.chapter}`;
  const parsed = parseScriptureRef(refString);
  const bookId = parsed?.bookId ?? scripture.book.toLowerCase().replace(/\s+/g, '');

  // Fetch the chapter using the shared async hook (same as Bible reader)
  const { chapter: chapterData, loading } = useChapter(
    bookId,
    scripture.chapter,
    translationId,
  );

  // Filter verses to the requested range
  const verses = chapterData?.verses
    ? (scripture.verseStart
        ? chapterData.verses.filter(
            v => v.verse >= (scripture.verseStart ?? 1) &&
                 v.verse <= (scripture.verseEnd ?? 9999)
          )
        : chapterData.verses)
    : [];

  const [highlights, setHighlights] = useState<RoomHighlight[]>([]);
  const [highlightsLoading, setHighlightsLoading] = useState(true);
  const [selectedVerse, setSelectedVerse] = useState<number | null>(null);
  const [highlightNote, setHighlightNote] = useState('');
  const [addingHighlight, setAddingHighlight] = useState(false);
  const [settingFocus, setSettingFocus] = useState(false);
  const [popoverHighlight, setPopoverHighlight] = useState<RoomHighlight | null>(null);

  const focusVerseRef = useRef<HTMLDivElement>(null);

  // ── Load existing highlights ────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    setHighlightsLoading(true);
    apiGetHighlights(userId, roomId, sessionId)
      .then(h => setHighlights(h))
      .catch(() => {})
      .finally(() => setHighlightsLoading(false));
  }, [userId, roomId, sessionId]);

  // ── Merge incoming real-time highlights ────────────────────────────────────
  useEffect(() => {
    if (incomingHighlights.length === 0) return;
    setHighlights(prev => {
      const existingIds = new Set(prev.map(h => h.id));
      const newOnes = incomingHighlights.filter(h => !existingIds.has(h.id));
      return newOnes.length ? [...prev, ...newOnes] : prev;
    });
  }, [incomingHighlights]);

  // ── Sync focus verse changes from SSE ──────────────────────────────────────
  useEffect(() => {
    if (focusHighlightId === undefined) return;
    setHighlights(prev =>
      prev.map(h => ({ ...h, isFocusVerse: h.id === focusHighlightId }))
    );
  }, [focusHighlightId]);

  // ── Auto-scroll to focus verse ──────────────────────────────────────────────
  useEffect(() => {
    if (focusVerseRef.current) {
      focusVerseRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusHighlightId]);

  // ── Highlights by verse lookup ──────────────────────────────────────────────
  const highlightsByVerse = useCallback(
    (verse: number) =>
      highlights.filter(
        h => h.book === scripture.book &&
             h.chapter === scripture.chapter &&
             h.verse === verse
      ),
    [highlights, scripture]
  );

  const focusVerse = highlights.find(h => h.isFocusVerse);

  // ── Add highlight ───────────────────────────────────────────────────────────
  const handleAddHighlight = async () => {
    if (selectedVerse === null) return;
    setAddingHighlight(true);
    try {
      const verseObj = verses.find(v => v.verse === selectedVerse);
      const verseText = verseObj?.text ?? '';
      const h = await apiAddHighlight(userId, roomId, {
        sessionId,
        book: scripture.book,
        chapter: scripture.chapter,
        verse: selectedVerse,
        verseText,
        note: highlightNote.trim() || undefined,
        authorName: userName,
      });
      setHighlights(prev => [...prev, h]);
      setSelectedVerse(null);
      setHighlightNote('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add highlight');
    } finally {
      setAddingHighlight(false);
    }
  };

  // ── Set focus verse ─────────────────────────────────────────────────────────
  const handleSetFocusVerse = async (highlightId: string) => {
    setSettingFocus(true);
    try {
      await apiSetFocusVerse(userId, roomId, highlightId, sessionId);
      setHighlights(prev =>
        prev.map(h => ({ ...h, isFocusVerse: h.id === highlightId }))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to set focus verse');
    } finally {
      setSettingFocus(false);
    }
  };

  const tappedVerse = verses.find(v => v.verse === selectedVerse);
  const verseHighlights = selectedVerse !== null ? highlightsByVerse(selectedVerse) : [];
  const myHighlight = verseHighlights.find(h => h.userId === userId);

  const displayLabel = scripture.displayLabel ||
    (scripture.verseStart
      ? `${scripture.book} ${scripture.chapter}:${scripture.verseStart}${scripture.verseEnd ? `–${scripture.verseEnd}` : ''}`
      : `${scripture.book} ${scripture.chapter}`);

  return (
    <div className="fixed inset-0 z-50 flex flex-col h-[100dvh] bg-background pb-page-safe">
      {/* Header */}
      <header className="flex items-center justify-between px-4 h-14 border-b border-border/60 shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen size={18} className="text-primary shrink-0" />
          <h2 className="font-semibold text-[16px] text-foreground">{displayLabel}</h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl"
          aria-label="Close scripture"
        >
          <X size={20} />
        </button>
      </header>

      {/* Focus verse notice bar */}
      {focusVerse && (
        <div className="flex items-center gap-2.5 px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800/40 shrink-0">
          <Pin size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-[12px] text-amber-700 dark:text-amber-300 font-medium">
            Focus Verse: {scripture.book} {scripture.chapter}:{focusVerse.verse}
          </p>
        </div>
      )}

      {/* Passage */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-1">
        {(loading || highlightsLoading) && verses.length === 0 ? (
          <div className="flex justify-center py-16">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : verses.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <BookOpen size={28} className="text-muted-foreground/30 mx-auto" />
            <p className="text-[14px] text-muted-foreground">
              Passage text not available for {scripture.book} {scripture.chapter}.
            </p>
            <p className="text-[12px] text-muted-foreground/60">
              Use your Bible app to follow along.
            </p>
          </div>
        ) : (
          verses.map(v => {
            const vHighlights = highlightsByVerse(v.verse);
            const isFocus = focusVerse?.verse === v.verse;
            const isSelected = selectedVerse === v.verse;
            const topHighlight = vHighlights[0];

            return (
              <div
                key={v.verse}
                ref={isFocus ? focusVerseRef : undefined}
                onClick={() => setSelectedVerse(isSelected ? null : v.verse)}
                className={`relative px-3 py-2.5 rounded-xl cursor-pointer transition-all select-none ${
                  isFocus
                    ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/60'
                    : isSelected
                    ? 'bg-primary/8 border border-primary/30'
                    : topHighlight
                    ? `${colourForUser(topHighlight.userId).bg} border ${colourForUser(topHighlight.userId).border}`
                    : 'hover:bg-muted/40 border border-transparent'
                }`}
              >
                <div className="flex gap-2.5 items-start">
                  <span
                    className={`text-[11px] font-bold shrink-0 mt-0.5 w-6 text-right ${
                      isFocus ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                    }`}
                  >
                    {v.verse}
                  </span>
                  <p className="text-[15px] leading-relaxed text-foreground flex-1">
                    {v.text}
                    {isFocus && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-full">
                        <Star size={8} />
                        Focus
                      </span>
                    )}
                  </p>
                </div>

                {/* Highlight chips */}
                {vHighlights.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 pl-8">
                    {vHighlights.map(h => (
                      <button
                        key={h.id}
                        onClick={e => {
                          e.stopPropagation();
                          setPopoverHighlight(popoverHighlight?.id === h.id ? null : h);
                        }}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all ${colourForUser(h.userId).bg} ${colourForUser(h.userId).border}`}
                      >
                        {h.authorName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Popover: highlight detail ─────────────────────────────────────── */}
      {popoverHighlight && (
        <>
          <div className="fixed inset-0 z-60" onClick={() => setPopoverHighlight(null)} />
          <div className="fixed bottom-24 left-4 right-4 max-w-[440px] mx-auto z-[70] bg-card border border-border rounded-2xl shadow-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-foreground">
                {popoverHighlight.authorName} — {scripture.book} {scripture.chapter}:{popoverHighlight.verse}
              </p>
              <button onClick={() => setPopoverHighlight(null)} className="text-muted-foreground">
                <X size={16} />
              </button>
            </div>
            {popoverHighlight.note && (
              <p className="text-[13px] text-muted-foreground italic leading-snug">
                "{popoverHighlight.note}"
              </p>
            )}
            {isLeader && !popoverHighlight.isFocusVerse && (
              <button
                onClick={async () => { await handleSetFocusVerse(popoverHighlight.id); setPopoverHighlight(null); }}
                disabled={settingFocus}
                className="flex items-center gap-1.5 text-[12px] text-primary font-semibold disabled:opacity-50"
              >
                {settingFocus ? <Loader2 size={12} className="animate-spin" /> : <Pin size={12} />}
                Set as Focus Verse
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Bottom sheet: verse action ─────────────────────────────────────── */}
      {selectedVerse !== null && !popoverHighlight && (
        <>
          <div
            className="fixed inset-0 z-[55] bg-black/10"
            onClick={() => { setSelectedVerse(null); setHighlightNote(''); }}
          />
          <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto z-[60] bg-card border-t border-border rounded-t-3xl shadow-2xl p-5 space-y-4">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto" />

            <div>
              <p className="text-[13px] font-semibold text-foreground mb-0.5">
                {scripture.book} {scripture.chapter}:{selectedVerse}
              </p>
              {tappedVerse && (
                <p className="text-[13px] text-muted-foreground leading-snug line-clamp-2">
                  {tappedVerse.text}
                </p>
              )}
            </div>

            {/* Existing highlights on this verse */}
            {verseHighlights.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Highlighted by
                </p>
                {verseHighlights.map(h => (
                  <div key={h.id} className={`px-3 py-2 rounded-xl ${colourForUser(h.userId).bg} border ${colourForUser(h.userId).border}`}>
                    <p className="text-[12px] font-semibold text-foreground">{h.authorName}</p>
                    {h.note && (
                      <p className="text-[12px] text-muted-foreground mt-0.5 italic">"{h.note}"</p>
                    )}
                    {isLeader && !h.isFocusVerse && (
                      <button
                        onClick={() => handleSetFocusVerse(h.id)}
                        disabled={settingFocus}
                        className="mt-1 flex items-center gap-1 text-[11px] text-primary font-semibold disabled:opacity-50"
                      >
                        <Pin size={10} /> Set as Focus Verse
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add highlight (only if this user hasn't highlighted yet) */}
            {!myHighlight && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Add your highlight
                </p>
                <textarea
                  value={highlightNote}
                  onChange={e => setHighlightNote(e.target.value)}
                  placeholder="Why this stood out… (optional)"
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-[14px] text-foreground outline-none focus:border-primary resize-none"
                />
                <button
                  onClick={handleAddHighlight}
                  disabled={addingHighlight}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-[14px] flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {addingHighlight && <Loader2 size={15} className="animate-spin" />}
                  Highlight Verse
                </button>
              </div>
            )}

            <button
              onClick={() => { setSelectedVerse(null); setHighlightNote(''); }}
              className="w-full py-2.5 text-[13px] text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
