/**
 * startup-routing.test.ts
 *
 * Confirms the startup redirect logic that ensures a member always lands on
 * Today's Steps (/walk) after closing and reopening the app from any Bible or
 * Journeys sub-page.
 *
 * Spec:
 *   - isTabPath() must return true for the exact tab root AND any deep sub-path
 *     under /bible, /journeys, and /personal.
 *   - isTabPath() must return false for / , /walk , /admin and every other path
 *     that should NOT trigger the startup redirect.
 *   - resolveEntryRoute() must always return '/walk' regardless of arguments,
 *     ensuring the Welcome screen never sends an authenticated member anywhere
 *     other than Today's Steps on a normal launch.
 */

import { describe, it, expect } from 'vitest';
import { isTabPath } from '@/lib/tab-paths';
import { resolveEntryRoute } from '@/lib/entry-route';

// ── isTabPath ────────────────────────────────────────────────────────────────

describe('isTabPath — Bible paths', () => {
  // Tab roots
  it('returns true for /bible (tab root)', () => {
    expect(isTabPath('/bible')).toBe(true);
  });

  // Deep paths — these were the broken cases before startsWith matching
  it('returns true for /bible/read/john/1 (chapter reader)', () => {
    expect(isTabPath('/bible/read/john/1')).toBe(true);
  });

  it('returns true for /bible/books (browse books)', () => {
    expect(isTabPath('/bible/books')).toBe(true);
  });

  it('returns true for /bible/books/john (book detail)', () => {
    expect(isTabPath('/bible/books/john')).toBe(true);
  });

  it('returns true for /bible/search', () => {
    expect(isTabPath('/bible/search')).toBe(true);
  });

  it('returns true for /bible/history', () => {
    expect(isTabPath('/bible/history')).toBe(true);
  });

  it('returns true for /bible/journey/some-id (Bible journey)', () => {
    expect(isTabPath('/bible/journey/some-id')).toBe(true);
  });
});

describe('isTabPath — Journeys paths', () => {
  it('returns true for /journeys (tab root)', () => {
    expect(isTabPath('/journeys')).toBe(true);
  });

  it('returns true for /journeys/explore', () => {
    expect(isTabPath('/journeys/explore')).toBe(true);
  });

  it('returns true for /journeys/collections/some-id', () => {
    expect(isTabPath('/journeys/collections/some-id')).toBe(true);
  });

  it('returns true for /journeys/my-journey-id', () => {
    expect(isTabPath('/journeys/my-journey-id')).toBe(true);
  });
});

describe('isTabPath — Personal paths', () => {
  it('returns true for /personal (tab root)', () => {
    expect(isTabPath('/personal')).toBe(true);
  });

  it('returns true for /personal/ask-emmaus', () => {
    expect(isTabPath('/personal/ask-emmaus')).toBe(true);
  });

  it('returns true for /personal/ask-emmaus/conversation', () => {
    expect(isTabPath('/personal/ask-emmaus/conversation')).toBe(true);
  });
});

describe('isTabPath — paths that must NOT trigger the redirect', () => {
  it('returns false for / (splash/Welcome)', () => {
    expect(isTabPath('/')).toBe(false);
  });

  it('returns false for /walk (Today\'s Steps home)', () => {
    expect(isTabPath('/walk')).toBe(false);
  });

  it('returns false for /auth', () => {
    expect(isTabPath('/auth')).toBe(false);
  });

  it('returns false for /onboarding', () => {
    expect(isTabPath('/onboarding')).toBe(false);
  });

  it('returns false for /admin', () => {
    expect(isTabPath('/admin')).toBe(false);
  });

  it('returns false for /daily-rhythm/day/1', () => {
    expect(isTabPath('/daily-rhythm/day/1')).toBe(false);
  });

  it('returns false for /journey/some-id/day/2', () => {
    expect(isTabPath('/journey/some-id/day/2')).toBe(false);
  });

  it('returns false for /rooms', () => {
    expect(isTabPath('/rooms')).toBe(false);
  });

  // Regression: must not accidentally match a path that merely contains a
  // prefix as a substring but is not a sub-path (e.g. /biblefoo).
  it('returns false for /biblefoo (not a real sub-path)', () => {
    expect(isTabPath('/biblefoo')).toBe(false);
  });

  it('returns false for /journeysfoo', () => {
    expect(isTabPath('/journeysfoo')).toBe(false);
  });
});

// ── resolveEntryRoute ────────────────────────────────────────────────────────

describe('resolveEntryRoute — always returns /walk', () => {
  it('returns /walk with no arguments', () => {
    expect(resolveEntryRoute()).toBe('/walk');
  });

  it('returns /walk regardless of journey/progress arguments', () => {
    expect(resolveEntryRoute([], {}, () => [])).toBe('/walk');
  });

  it('returns /walk even when called multiple times', () => {
    expect(resolveEntryRoute()).toBe('/walk');
    expect(resolveEntryRoute()).toBe('/walk');
    expect(resolveEntryRoute()).toBe('/walk');
  });
});
