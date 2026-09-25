import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BibleMaps from '../bible/BibleMaps';

// Exercise the real router and readable fallback when the GPU cannot initialise.
vi.mock('maplibre-gl', () => ({ Map: class { constructor() { throw new Error('WebGL unavailable'); } } }));

describe('Bible map fallback and Scripture navigation', () => {
  beforeEach(() => window.history.replaceState({}, '', '/bible/maps'));
  afterEach(cleanup);

  it('keeps places and Scripture available after a WebGL failure', async () => {
    render(<BibleMaps />);
    await screen.findByText(/This device could not open the 3D map/);
    fireEvent.click(screen.getByRole('button', { name: 'Explore Nazareth' }));
    const link = screen.getByRole('link', { name: 'Read Luke 4:16–21' });
    const url = new URL(link.getAttribute('href')!, 'https://emmaus.co.za');
    expect(url.pathname).toBe('/bible/read/luke/4');
    expect(url.searchParams.get('startVerse')).toBe('16');
    expect(url.searchParams.get('endVerse')).toBe('21');
    expect(url.searchParams.get('returnTo')).toBe('/bible/maps?place=nazareth');
  });

  it('combines region and search filters and explains empty results', async () => {
    render(<BibleMaps />);
    await screen.findByText(/This device could not open the 3D map/);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Galilee' } });
    expect(screen.queryByRole('button', { name: 'Explore Bethlehem' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Capernaum' } });
    expect(screen.getByRole('button', { name: 'Explore Capernaum' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Rome' } });
    expect(screen.getByText(/No matching places/)).toBeInTheDocument();
  });

  it('restores a deep-linked place and identifies Emmaus as disputed', async () => {
    window.history.replaceState({}, '', '/bible/maps?place=emmaus');
    render(<BibleMaps />);
    await screen.findByText(/This device could not open the 3D map/);
    expect(screen.getByRole('heading', { name: 'Emmaus · possible location' })).toBeInTheDocument();
    expect(screen.getByText(/Disputed. Nicopolis/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read Luke 24:13–35' })).toBeInTheDocument();
  });
});
