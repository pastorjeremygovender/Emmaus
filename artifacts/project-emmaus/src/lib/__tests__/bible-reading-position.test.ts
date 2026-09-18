import { beforeEach, describe, expect, it } from 'vitest';
import {
  BIBLE_READING_POSITION_STORAGE_KEY,
  getRememberedBibleChapter,
  loadBibleReadingPositions,
  rememberBibleChapter,
  saveBibleReadingPositions,
  type BibleReadingPositions,
} from '@/lib/bible-reading-position';
import { accountStorageKey } from '@/lib/account-storage';

const subject = 'member-1';

describe('Bible per-book reading positions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('remembers Daniel 4 and Matthew 3 independently', () => {
    let positions: BibleReadingPositions = {};
    positions = rememberBibleChapter(positions, 'niv', 'daniel', 4);
    positions = rememberBibleChapter(positions, 'niv', 'matthew', 3);

    expect(getRememberedBibleChapter(positions, 'niv', 'daniel')).toBe(4);
    expect(getRememberedBibleChapter(positions, 'niv', 'matthew')).toBe(3);
  });

  it('keeps different translations independent', () => {
    let positions: BibleReadingPositions = {};
    positions = rememberBibleChapter(positions, 'niv', 'daniel', 4);
    positions = rememberBibleChapter(positions, 'bsb', 'daniel', 2);

    expect(getRememberedBibleChapter(positions, 'niv', 'daniel')).toBe(4);
    expect(getRememberedBibleChapter(positions, 'bsb', 'daniel')).toBe(2);
  });

  it('validates stored chapter ranges and falls back to chapter 1', () => {
    const key = accountStorageKey(BIBLE_READING_POSITION_STORAGE_KEY, subject);
    localStorage.setItem(key, JSON.stringify({
      'niv:daniel': 99,
      'niv:matthew': 0,
      'niv:john': '4',
      'niv:psalms': 3,
    }));

    const positions = loadBibleReadingPositions(subject);
    expect(getRememberedBibleChapter(positions, 'niv', 'daniel')).toBeNull();
    expect(getRememberedBibleChapter(positions, 'niv', 'matthew')).toBeNull();
    expect(getRememberedBibleChapter(positions, 'niv', 'john')).toBeNull();
    expect(getRememberedBibleChapter(positions, 'niv', 'psalms')).toBe(3);
  });

  it('scopes saved positions to the signed-in account', () => {
    const first = rememberBibleChapter({}, 'niv', 'daniel', 4);
    saveBibleReadingPositions(subject, first);
    saveBibleReadingPositions('member-2', rememberBibleChapter({}, 'niv', 'daniel', 1));

    expect(loadBibleReadingPositions(subject)).toEqual({ 'niv:daniel': 4 });
    expect(loadBibleReadingPositions('member-2')).toEqual({ 'niv:daniel': 1 });
  });

});