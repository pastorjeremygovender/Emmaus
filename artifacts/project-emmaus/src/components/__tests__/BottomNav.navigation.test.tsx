import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomNav } from '@/components/BottomNav';

const { setLocation } = vi.hoisted(() => ({ setLocation: vi.fn() }));
let currentLocation = '/daily-rhythm/day/1';

vi.mock('wouter', () => ({
  useLocation: () => [currentLocation, setLocation],
}));

vi.mock('@/lib/emmaus-pending', () => ({
  getReturnDestination: () => null,
}));

describe('BottomNav navigation', () => {
  beforeEach(() => {
    currentLocation = '/daily-rhythm/day/1';
    setLocation.mockClear();
  });

  it('links directly from an incomplete Daily Rhythm to My Bible', () => {
    render(<BottomNav />);

    expect(screen.getByTestId('nav-bible')).toHaveAttribute('href', '/bible');
  });

  it("links directly from an incomplete Daily Rhythm to Today's Steps", () => {
    render(<BottomNav />);

    expect(screen.getByTestId('nav-walk')).toHaveAttribute('href', '/walk');
  });

  it('uses client-side navigation for My Bible without following the document link', () => {
    currentLocation = '/walk';
    render(<BottomNav />);

    const bibleLink = screen.getByTestId('nav-bible');
    fireEvent.click(bibleLink);

    expect(window.location.pathname).toBe('/');
    expect(setLocation).toHaveBeenCalledWith('/bible');
  });

  it("uses client-side navigation for Today's Steps without following the document link", () => {
    currentLocation = '/bible';
    render(<BottomNav />);

    const walkLink = screen.getByTestId('nav-walk');
    fireEvent.click(walkLink);

    expect(window.location.pathname).toBe('/');
    expect(setLocation).toHaveBeenCalledWith('/walk');
  });
});