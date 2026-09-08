import { describe, expect, it } from 'vitest';
import { sanitizeSpeechText, selectDeviceVoice } from '../voice-client';

describe('device Voice speech policy', () => {
  it('removes markup and URLs before handing text to the device engine', () => {
    expect(sanitizeSpeechText('<b>Hello</b> https://example.com Emmaus')).toBe('Hello Emmaus');
  });

  it('prefers South African English, then British English, deterministically', () => {
    const voice = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice;
    expect(selectDeviceVoice([
      voice('US', 'en-US'),
      voice('GB', 'en-GB'),
      voice('ZA', 'en-ZA'),
    ])?.name).toBe('ZA');
    expect(selectDeviceVoice([
      voice('US', 'en-US'),
      voice('GB', 'en-GB'),
    ])?.name).toBe('GB');
  });
});