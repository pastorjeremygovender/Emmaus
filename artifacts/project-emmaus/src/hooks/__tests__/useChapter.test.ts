import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChapter } from '@/hooks/useChapter';

const { getChapter } = vi.hoisted(() => ({
  getChapter: vi.fn(),
}));

vi.mock('@/lib/bible-provider', () => ({
  remoteBibleProvider: { getChapter },
}));

function chapter(bookId: string, chapterNumber: number) {
  return {
    bookId,
    chapter: chapterNumber,
    heading: `${bookId} ${chapterNumber}`,
    readingMinutes: 5,
    verses: [{ verse: 1, text: `${bookId} text` }],
    sermonRefs: [],
  };
}

describe('useChapter request identity', () => {
  beforeEach(() => {
    getChapter.mockReset();
  });

  it('never exposes John while a requested Daniel 4 chapter is resolving', async () => {
    let resolveDaniel: ((value: ReturnType<typeof chapter>) => void) | undefined;
    getChapter.mockImplementation((bookId: string, chapterNumber: number) => {
      if (bookId === 'john') return Promise.resolve(chapter('john', chapterNumber));
      return new Promise(resolve => { resolveDaniel = resolve; });
    });

    const { result, rerender } = renderHook(
      ({ bookId, chapterNumber }) => useChapter(bookId, chapterNumber, 'niv'),
      { initialProps: { bookId: 'john', chapterNumber: 1 } },
    );
    await waitFor(() => expect(result.current.chapter?.bookId).toBe('john'));

    rerender({ bookId: 'daniel', chapterNumber: 4 });

    expect(result.current.chapter).toBeNull();
    expect(result.current.loading).toBe(true);

    resolveDaniel?.(chapter('daniel', 4));
    await waitFor(() => expect(result.current.chapter?.bookId).toBe('daniel'));
    expect(result.current.chapter?.chapter).toBe(4);
  });
});