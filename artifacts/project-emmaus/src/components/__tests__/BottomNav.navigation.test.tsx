import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomNav } from '@/components/BottomNav';

const { setLocation } = vi.hoisted(() => ({ setLocation: vi.fn() }));
let currentLocation = '/daily-rhythm/day/1';

vi.mock('wouter', () => ({
  useLocation: () => [currentLocation, setLocation],
}));

describe('BottomNav navigation', () => {
  beforeEach(() => {
    currentLocation = '/daily-rhythm/day/1';
    setLocation.mockClear();
  });

  it('shows only My Bible while inside Emmaus', () => {
    render(<BottomNav />);

    expect(screen.getByTestId('nav-bible')).toHaveAttribute('href', '/bible');
    expect(screen.queryByTestId('nav-walk')).not.toBeInTheDocument();
  });

  it('shows only Today\'s Steps while inside My Bible', () => {
    currentLocation = '/bible';
    render(<BottomNav />);

    expect(screen.getByTestId('nav-walk')).toHaveAttribute('href', '/walk');
    expect(screen.getByTestId('nav-walk')).toHaveTextContent("Today's Steps");
    expect(screen.queryByTestId('nav-bible')).not.toBeInTheDocument();
  });

  it('uses client-side navigation to open My Bible', () => {
    currentLocation = '/walk';
    render(<BottomNav />);

    fireEvent.click(screen.getByTestId('nav-bible'));

    expect(window.location.pathname).toBe('/');
    expect(setLocation).toHaveBeenCalledWith('/bible');
  });

  it('uses client-side navigation to return to Today\'s Steps', () => {
    currentLocation = '/bible';
    render(<BottomNav />);

    fireEvent.click(screen.getByTestId('nav-walk'));

    expect(window.location.pathname).toBe('/');
    expect(setLocation).toHaveBeenCalledWith('/walk');
  });
});
