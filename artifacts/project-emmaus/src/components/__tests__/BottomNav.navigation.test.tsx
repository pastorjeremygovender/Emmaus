import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BottomNav } from '@/components/BottomNav';

vi.mock('wouter', () => ({
  useLocation: () => ['/daily-rhythm/day/1'],
}));

vi.mock('@/lib/emmaus-pending', () => ({
  getReturnDestination: () => null,
}));

describe('BottomNav navigation', () => {
  it('links directly from an incomplete Daily Rhythm to My Bible', () => {
    render(<BottomNav />);

    expect(screen.getByTestId('nav-bible')).toHaveAttribute('href', '/bible');
  });

  it("links directly from an incomplete Daily Rhythm to Today's Steps", () => {
    render(<BottomNav />);

    expect(screen.getByTestId('nav-walk')).toHaveAttribute('href', '/walk');
  });
});