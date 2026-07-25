import { useState, useEffect } from 'react';
import { remoteBibleProvider, type BibleProviderChapter } from '@/lib/bible-provider';

type UseChapterResult = {
  chapter: BibleProviderChapter | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
};

/**
 * Async hook to load a Bible chapter from the remote provider.
 * Caches results via remoteBibleProvider's internal cache.
 *
 * Uses a per-effect `cancelled` flag (not a mounted ref) so that
 * stale in-flight responses from a previous translationId / bookId /
 * chapterNum can never overwrite the result of the latest request.
 */
export function useChapter(
  bookId: string,
  chapterNum: number,
  translationId: string,
): UseChapterResult {
  const [chapter, setChapter] = useState<BibleProviderChapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!bookId || !chapterNum || !translationId) return;

    // Each effect invocation gets its own cancellation flag.
    // The cleanup (returned below) sets it to true when deps change or
    // the component unmounts, preventing stale responses from committing.
    let cancelled = false;

    setLoading(true);
    setError(null);
    setChapter(null);

    remoteBibleProvider
      .getChapter(bookId, chapterNum, translationId)
      .then(data => {
        if (cancelled) return;
        setChapter(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('This chapter could not be loaded just now.');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [bookId, chapterNum, translationId, retryCount]);

  const retry = () => setRetryCount(c => c + 1);

  return { chapter, loading, error, retry };
}
