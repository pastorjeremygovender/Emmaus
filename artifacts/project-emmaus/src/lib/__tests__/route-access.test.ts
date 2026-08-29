import { describe, expect, it } from 'vitest';
import {
  bypassesDailyRhythmOpening,
  isBibleRoute,
  routePathname,
} from '../route-access';

describe('route access policy', () => {
  it('recognizes the Bible root and nested Bible routes', () => {
    expect(isBibleRoute('/bible')).toBe(true);
    expect(isBibleRoute('/bible/read/john/3')).toBe(true);
    expect(bypassesDailyRhythmOpening('/bible/search?translation=esv#results')).toBe(true);
  });

  it('does not treat near matches as Bible routes', () => {
    expect(isBibleRoute('/bible-study')).toBe(false);
    expect(bypassesDailyRhythmOpening('/bibles/read/john/3')).toBe(false);
  });

  it('removes query strings and hashes when deriving a pathname', () => {
    expect(routePathname('/bible/read/john/3?translation=esv#verse-16'))
      .toBe('/bible/read/john/3');
    expect(routePathname('/bible#books')).toBe('/bible');
  });
});