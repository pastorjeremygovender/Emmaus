import { afterEach, describe, expect, it } from 'vitest';
import {
  canonicalCurrentEmmausUrl,
  canonicalEmmausUrl,
  EMMAUS_APP_URL,
} from '@/lib/canonical-app';
import { buildShareText } from '@/lib/share';

describe('canonical Emmaus sharing', () => {
  const originalUrl = window.location.href;

  afterEach(() => {
    window.history.replaceState({}, '', originalUrl);
  });

  it('always uses the public domain for explicit paths', () => {
    expect(canonicalEmmausUrl('/app')).toBe('https://emmaus.co.za/app');
    expect(EMMAUS_APP_URL).toBe('https://emmaus.co.za/app');
  });

  it('replaces a preview origin while preserving the current route', () => {
    window.history.replaceState({}, '', '/journey/faith/day/2?source=share#today');
    expect(canonicalCurrentEmmausUrl()).toBe(
      'https://emmaus.co.za/journey/faith/day/2?source=share#today',
    );
  });

  it('uses the canonical current URL when content does not supply a link', () => {
    window.history.replaceState({}, '', '/daily-rhythm/day/4');
    expect(buildShareText({ title: 'Daily Rhythm' })).toContain(
      'Continue your journey in Emmaus:\nhttps://emmaus.co.za/daily-rhythm/day/4',
    );
  });
});
