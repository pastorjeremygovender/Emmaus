import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildUnavailableTranslationNotice,
  getUserBibleTranslation,
  resolveVoiceTranslation,
} from '@/lib/voice-bible';
import { accountStorageKey } from '@/lib/account-storage';

describe('Voice Bible translation policy', () => {
  beforeEach(() => localStorage.clear());

  it('defaults a new account to NIV without substituting another translation', () => {
    const result = resolveVoiceTranslation(null, 'new-account');
    expect(result).toMatchObject({
      resolvedId: 'niv',
      userPrefId: 'niv',
      substituted: false,
      availableForTts: false,
    });
  });

  it('preserves an explicit BSB preference and allows Voice reading', () => {
    localStorage.setItem(
      accountStorageKey('emmaus_bible_translation', 'bsb-account'),
      JSON.stringify('bsb'),
    );
    expect(getUserBibleTranslation('bsb-account')).toBe('bsb');
    expect(resolveVoiceTranslation(null, 'bsb-account')).toMatchObject({
      resolvedId: 'bsb',
      availableForTts: true,
      substituted: false,
    });
  });

  it('keeps NIV selected and clearly reports that TTS is unavailable', () => {
    const result = resolveVoiceTranslation('niv', 'account');
    expect(result.resolvedId).toBe('niv');
    expect(result.substituted).toBe(false);
    expect(result.availableForTts).toBe(false);
    expect(buildUnavailableTranslationNotice('niv', result.resolvedName)).toContain(
      'I have not switched translations',
    );
  });
});