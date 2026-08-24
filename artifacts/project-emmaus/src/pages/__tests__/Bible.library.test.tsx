import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Bible from '../Bible';

const setLocation = vi.fn();

vi.mock('wouter', () => ({
  useLocation: () => ['/bible', setLocation],
}));

vi.mock('@/contexts/BibleContext', () => ({
  useBible: () => ({
    lastRead: null,
    favourites: [],
    bookmarks: [],
    notes: [],
    prayers: [],
    highlights: [],
  }),
}));

vi.mock('@/components/BottomNav', () => ({ BottomNav: () => null }));
vi.mock('@/components/UnifiedEmmausInput', () => ({ UnifiedEmmausInput: () => null }));
vi.mock('@/components/ShareEmmausButton', () => ({ ShareEmmausButton: () => null }));
vi.mock('@/components/SectionWrapper', () => ({
  SectionWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/pages/bible/MyLibrary', () => ({
  default: () => <div data-testid="my-library">My Library content</div>,
}));

describe('Bible My Library tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/bible');
  });

  it('opens the library content and updates the URL when selected', () => {
    render(<Bible />);

    expect(screen.queryByTestId('my-library')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /my library/i }));

    expect(screen.getByTestId('my-library')).toBeInTheDocument();
    expect(setLocation).toHaveBeenCalledWith('/bible?tab=library');
  });
});