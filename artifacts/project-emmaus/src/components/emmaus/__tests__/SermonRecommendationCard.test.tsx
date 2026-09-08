import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SermonRecommendationCard } from '@/components/emmaus/SermonRecommendationCard';
import type { SermonRecommendation } from '@/lib/emmaus-client';

const setLocation = vi.fn();
vi.mock('wouter', () => ({ useLocation: () => ['/', setLocation] }));

const sermon = (id: string, seconds?: number): SermonRecommendation => ({
  sermonId: id,
  source: 'canonical',
  title: `Sermon ${id}`,
  speaker: 'Pastor Test',
  sermonDate: '2026-08-25',
  excerpt: `Excerpt for ${id}`,
  reason: `Matches your search for “faith”.`,
  openPath: `/sermon/${id}`,
  watchUrl: `https://youtube.com/watch?v=${id}&t=${seconds ?? 0}s`,
  ...(seconds == null ? {} : { watchTimestampSeconds: seconds }),
  listenAvailable: false,
});

describe('sermon search result cards', () => {
  beforeEach(() => setLocation.mockClear());

  it('renders at most three shared cards and preserves timestamped Watch links', () => {
    const results = [sermon('one', 112), sermon('two', 240), sermon('three'), sermon('four')];
    render(
      <div>
        {results.slice(0, 3).map((item) => <SermonRecommendationCard key={item.sermonId} sermon={item} />)}
      </div>,
    );

    expect(screen.getAllByText('Sermon', { exact: true })).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Watch · 1:52' })).toHaveAttribute(
      'href',
      'https://youtube.com/watch?v=one&t=112s',
    );
    expect(screen.queryByText('Sermon four')).not.toBeInTheDocument();
  });

  it('opens the canonical sermon route and does not redirect to Discover', () => {
    render(<SermonRecommendationCard sermon={sermon('second')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Sermon' }));
    expect(setLocation).toHaveBeenCalledWith('/sermon/second');
    expect(setLocation).not.toHaveBeenCalledWith(expect.stringContaining('discover'));
  });

  it('renders an honest empty result set without a fabricated card', () => {
    const emptyResults: SermonRecommendation[] = [];
    render(<div data-testid="results">{emptyResults.slice(0, 3).map((item) => <SermonRecommendationCard key={item.sermonId} sermon={item} />)}</div>);
    expect(screen.queryByText('Sermon')).not.toBeInTheDocument();
    expect(screen.getByTestId('results')).toBeEmptyDOMElement();
  });

  it('does not render an internal Open Sermon action for archive-only results', () => {
    const archive: SermonRecommendation = {
      sermonId: 'archive-video-record',
      source: 'archive',
      title: 'The Father Runs',
      speaker: 'Pastor Test',
      sermonDate: '2026-08-25',
      excerpt: 'A verified archive excerpt.',
      reason: 'Matches an approved ICC sermon archive segment at 12:34.',
      watchUrl: 'https://www.youtube.com/watch?v=verified123&t=754s',
      watchTimestampSeconds: 754,
      listenAvailable: false,
    };

    render(<SermonRecommendationCard sermon={archive} />);

    expect(screen.queryByRole('button', { name: 'Open Sermon' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Watch · 12:34' })).toHaveAttribute(
      'href',
      archive.watchUrl,
    );
  });
});