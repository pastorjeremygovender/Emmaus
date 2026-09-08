import { describe, expect, it } from 'vitest';
import { isSafeVoiceRoute, validateVoiceReadAction } from '../voice-action-validation';

const context = {
  dailyRhythm: { journeyId: 'dr-1' },
  activeDevotionals: [{ seriesId: 'dev-1' }],
  sermonCompanion: { id: 'comp-1' },
  activeWalks: [{ journeyId: 'walk-1' }],
} as any;

describe('voice action validation', () => {
  it('accepts canonical Bible references and normalizes the book id', () => {
    expect(validateVoiceReadAction({ type: 'bible', bibleBook: 'First Corinthians', bibleChapter: 13 }, context))
      .toMatchObject({ ok: true, content: 'bible', bibleBook: '1corinthians', bibleChapter: 13 });
  });

  it('rejects malformed or out-of-range Bible actions', () => {
    expect(validateVoiceReadAction({ type: 'bible', bibleBook: 'Not A Book', bibleChapter: 1 }, context)).toMatchObject({ ok: false, code: 'VOICE_INVALID_BIBLE_BOOK' });
    expect(validateVoiceReadAction({ type: 'bible', bibleBook: 'John', bibleChapter: 0 }, context)).toMatchObject({ ok: false, code: 'VOICE_INVALID_BIBLE_CHAPTER' });
  });

  it('enforces user-scoped content eligibility before reading', () => {
    expect(validateVoiceReadAction({ type: 'daily-rhythm' }, { ...context, dailyRhythm: null })).toMatchObject({ ok: false, code: 'VOICE_DAILY_RHYTHM_INELIGIBLE' });
    expect(validateVoiceReadAction({ type: 'walk' }, { ...context, activeWalks: [] })).toMatchObject({ ok: false, code: 'VOICE_WALK_UNAVAILABLE' });
  });

  it('only allows application-owned routes', () => {
    expect(isSafeVoiceRoute('/bible/read/john/3')).toBe(true);
    expect(isSafeVoiceRoute('/journey/walk-1/day/2')).toBe(true);
    expect(isSafeVoiceRoute('javascript:alert(1)')).toBe(false);
    expect(isSafeVoiceRoute('https://example.com')).toBe(false);
  });
});