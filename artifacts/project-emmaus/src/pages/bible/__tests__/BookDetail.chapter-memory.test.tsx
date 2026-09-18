import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BookDetail from '@/pages/bible/BookDetail';
import { getChapterHeading } from '@/data/chapter-headings';

const { setLocation, rememberedChapter } = vi.hoisted(() => ({
  setLocation: vi.fn(),
  rememberedChapter: { value: 4 as number | null },
}));

vi.mock('wouter', () => ({
  useParams: () => ({ bookId: 'daniel' }),
  useLocation: () => ['/bible/books/daniel', setLocation],
}));

vi.mock('@/contexts/BibleContext', () => ({
  useBible: () => ({
    translationId: 'niv',
    isChapterComplete: (_bookId: string, chapter: number) => chapter === 4,
    getRememberedChapter: () => rememberedChapter.value,
  }),
}));

vi.mock('@/components/BottomNav', () => ({ BottomNav: () => null }));

describe('BookDetail chapter memory', () => {
  beforeEach(() => {
    setLocation.mockClear();
    rememberedChapter.value = 4;
  });

  it('uses the remembered chapter for the book-level continue action', () => {
    render(<BookDetail />);

    fireEvent.click(screen.getByRole('button', { name: /continue — daniel 4/i }));

    expect(setLocation).toHaveBeenCalledWith('/bible/read/daniel/4');
  });

  it('lets an explicit chapter selection override remembered position', () => {
    render(<BookDetail />);

    fireEvent.click(screen.getByText(getChapterHeading('daniel', 2)));

    expect(setLocation).toHaveBeenCalledWith('/bible/read/daniel/2');
  });

  it('falls back to Chapter 1 when no valid position is remembered', () => {
    rememberedChapter.value = null;
    render(<BookDetail />);

    fireEvent.click(screen.getByRole('button', { name: /continue — daniel 1/i }));

    expect(setLocation).toHaveBeenCalledWith('/bible/read/daniel/1');
  });
});