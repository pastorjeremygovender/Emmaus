import { describe, expect, it } from 'vitest';
import { resolveReturn } from '../return-context';

describe('resolveReturn', () => {
  it.each([
    ['today', '/walk', "Today's Steps"],
    ['walk', '/walk', "Today's Steps"],
    ['nextStepsDevotionals', '/journeys?tab=devotionals', 'Discover'],
    ['nextStepsJourneys', '/journeys?tab=journeys', 'Discover'],
    ['nextStepsWalks', '/journeys?tab=walks', 'Discover'],
    ['nextStepsSermons', '/journeys?tab=sermons', 'Discover'],
    ['nextSteps', '/journeys', 'Discover'],
    ['myJourney', '/my-journey', 'My Journey'],
  ])('%s always resolves to its parent destination', (source, path, label) => {
    expect(resolveReturn(source)).toEqual({ path, label });
  });

  it('returns a devotional step to its own previous-days list', () => {
    expect(resolveReturn('devotionalPrevious', 'psalms')).toEqual({
      path: '/devotional/psalms/previous',
      label: 'Previous Steps',
    });
  });

  it('returns a sermon companion step to its own previous-steps list', () => {
    expect(resolveReturn('sermonCompanionPrevious', 'companion-1')).toEqual({
      path: '/sermon-companion/companion-1/previous',
      label: 'Previous Steps',
    });
  });

  it('returns a sermon companion to the sermon it came from', () => {
    expect(resolveReturn('sermonHome', 'sermon-1')).toEqual({
      path: '/sermon/sermon-1',
      label: "This Week's Sermon",
    });
  });

  it('uses the content-specific fallback for missing or unknown sources', () => {
    expect(resolveReturn(null, null, '/journeys?tab=devotionals')).toEqual({
      path: '/journeys?tab=devotionals',
      label: 'Discover',
    });
    expect(resolveReturn('stale-source', null, '/bible')).toEqual({
      path: '/bible',
      label: 'My Bible',
    });
  });
});