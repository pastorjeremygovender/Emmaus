/**
 * EmbeddedScripture — inline Bible passage for the Daily Rhythm reader.
 *
 * Fetches the requested verse range using the member's selected translation
 * and renders it directly on the page. The member never has to leave the
 * Daily Rhythm reader to read the assigned Scripture.
 *
 * Used by DailyRhythmReading so both member-facing and Content Studio
 * preview surfaces show identical output automatically.
 */

import { useLocation } from 'wouter';
import { useChapter } from '@/hooks/useChapter';
import { useBible } from '@/contexts/BibleContext';
import { useTranslations } from '@/hooks/useTranslations';
import { parseScriptureRef } from '@/lib/scripture-ref';
import { RefreshCw } from 'lucide-react';

// Session-storage key used to save the Daily Rhythm scroll position before
// navigating to My Bible. DailyRhythmDay restores it on return.
export function buildReturnScrollKey(returnPath: string): string {
  return `emmaus_return_scroll_${encodeURIComponent(returnPath)}`;
}

interface EmbeddedScriptureProps {
  /** Authored scripture reference, e.g. "John 1:35–39". */
  scripture: string;
  /**
   * The Daily Rhythm day path the member came from, e.g. "/daily-rhythm/day/2".
   * When set, the "Open in My Bible" link passes returnTo so the back arrow
   * in My Bible returns here. Omit in Content Studio preview.
   */
  returnPath?: string;
}

export function EmbeddedScripture({ scripture, returnPath }: EmbeddedScriptureProps) {
  const [, setLocation] = useLocation();
  const { translationId } = useBible();
  const { translations } = useTranslations();

  const parsed = parseScriptureRef(scripture);

  const translationName =
    translations.find(t => t.id === translationId)?.name ??
    translationId.toUpperCase();

  // Hook must be called unconditionally; the hook guards empty bookId/chapter itself.
  const { chapter: chapterData, loading, error, retry } = useChapter(
    parsed?.bookId ?? '',
    parsed?.chapter ?? 0,
    translationId,
  );

  // Build the "Open in My Bible" URL with return context and starting verse.
  const bibleUrl = parsed && returnPath
    ? `/bible/read/${parsed.bookId}/${parsed.chapter}` +
      `?returnTo=${encodeURIComponent(returnPath)}` +
      (parsed.startVerse != null ? `&startVerse=${parsed.startVerse}` : '')
    : parsed
      ? `/bible/read/${parsed.bookId}/${parsed.chapter}`
      : null;

  function handleOpenInBible() {
    if (!bibleUrl) return;
    // Save current scroll so DailyRhythmDay can restore it on return.
    if (returnPath) {
      sessionStorage.setItem(
        buildReturnScrollKey(returnPath),
        String(Math.round(window.scrollY)),
      );
    }
    setLocation(bibleUrl);
  }

  // ── Unparseable reference — show as plain text ────────────────────────────
  if (!parsed) {
    return (
      <p className="text-[17px] text-foreground leading-[1.65]">{scripture}</p>
    );
  }

  // Filter to only the requested verse range.
  const verses = chapterData?.verses.filter(v => {
    if (parsed.startVerse == null) return true;
    const end = parsed.endVerse ?? parsed.startVerse;
    return v.verse >= parsed.startVerse && v.verse <= end;
  }) ?? [];

  return (
    <div>
      {/* Reference */}
      <p className="text-[18px] font-medium text-foreground leading-snug">
        {parsed.display}
      </p>

      {/* Translation name */}
      <p className="mt-1 text-[13px] text-muted-foreground">{translationName}</p>

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {loading && (
        <div className="mt-4 flex items-center gap-2 text-[14px] text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          Loading passage…
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {!loading && (error || !chapterData) && (
        <div className="mt-4 space-y-3">
          <p className="text-[15px] text-muted-foreground">
            We couldn't load today's Scripture.
          </p>
          <div className="flex items-center gap-5">
            <button
              onClick={retry}
              className="flex items-center gap-1.5 text-[14px] text-primary hover:underline"
            >
              <RefreshCw size={13} />
              Try Again
            </button>
            {bibleUrl && (
              <button
                onClick={handleOpenInBible}
                className="text-[14px] text-muted-foreground hover:text-foreground hover:underline transition-colors"
              >
                Open in My Bible
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Passage ──────────────────────────────────────────────────────── */}
      {!loading && chapterData && verses.length === 0 && (
        <p className="mt-4 text-[15px] text-muted-foreground">
          Passage not available in this translation.
        </p>
      )}

      {!loading && chapterData && verses.length > 0 && (
        <p className="mt-4 text-[17px] text-foreground leading-[1.75]">
          {verses.map(v => (
            <span key={v.verse}>
              <sup className="text-[10px] font-semibold text-primary/60 mr-0.5 select-none">
                {v.verse}
              </sup>
              {v.text}{' '}
            </span>
          ))}
        </p>
      )}

      {/* ── Open in My Bible — secondary, understated ─────────────────────── */}
      {!loading && chapterData && verses.length > 0 && bibleUrl && (
        <button
          onClick={handleOpenInBible}
          className="mt-3 text-[14px] text-muted-foreground hover:text-primary hover:underline transition-colors"
        >
          Open in My Bible →
        </button>
      )}
    </div>
  );
}
