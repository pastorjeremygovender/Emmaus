import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  goBackOrFallback,
  installAppHistoryTracking,
  resolveReturn,
} from '../return-context';

const originalUrl = window.location.href;
const originalState = window.history.state;

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(originalState, '', originalUrl);
});

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

describe('goBackOrFallback', () => {
  it('pops one earlier Emmaus route when the current entry has app history', () => {
    window.history.replaceState(
      { __emmausHistory: true, __emmausHistoryDepth: 1 },
      '',
      '/journey/example/day/1',
    );
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const setLocation = vi.fn();

    goBackOrFallback('/walk', setLocation);

    expect(back).toHaveBeenCalledTimes(1);
    expect(setLocation).not.toHaveBeenCalled();
  });

  it('replaces the fallback for a direct link instead of pushing a loop', () => {
    window.history.replaceState(null, '', '/journey/example/day/1');
    const setLocation = vi.fn();

    goBackOrFallback('/walk', setLocation);

    expect(setLocation).toHaveBeenCalledWith('/walk', { replace: true });
  });

  it('does nothing when the fallback already is the current route', () => {
    window.history.replaceState(null, '', '/walk');
    const setLocation = vi.fn();

    goBackOrFallback('/walk', setLocation);

    expect(setLocation).not.toHaveBeenCalled();
  });
});

describe('installAppHistoryTracking', () => {
  it('marks pushed routes with increasing in-app depth', () => {
    window.history.replaceState(null, '', '/walk');
    const cleanup = installAppHistoryTracking();

    expect(window.history.state).toMatchObject({
      __emmausHistory: true,
      __emmausHistoryDepth: 0,
    });

    window.history.pushState(null, '', '/journeys');

    expect(window.history.state).toMatchObject({
      __emmausHistory: true,
      __emmausHistoryDepth: 1,
    });

    cleanup();
  });
});