import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomNav } from '@/components/BottomNav';

const { setLocation } = vi.hoisted(() => ({ setLocation: vi.fn() }));
let currentLocation = '/daily-rhythm/day/1';

vi.mock('wouter', () => ({ useLocation: () => [currentLocation, setLocation] }));

describe('BottomNav navigation', () => {
  beforeEach(() => {
    currentLocation = '/daily-rhythm/day/1';
    setLocation.mockClear();
  });

  it('always shows My Emmaus and My Bible', () => {
    render(<BottomNav />);
    expect(screen.getByTestId('nav-walk')).toHaveTextContent('My Emmaus');
    expect(screen.getByTestId('nav-bible')).toHaveTextContent('My Bible');
    expect(screen.getByTestId('nav-walk')).toHaveAttribute('aria-current', 'page');
  });

  it('marks My Bible active and navigates without a reload', () => {
    currentLocation = '/bible/43/3';
    render(<BottomNav />);
    expect(screen.getByTestId('nav-bible')).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByTestId('nav-walk'));
    expect(setLocation).toHaveBeenCalledWith('/walk');
  });
});
