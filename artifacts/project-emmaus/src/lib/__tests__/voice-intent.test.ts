import { describe, expect, it } from 'vitest';
import { resolveIntent } from '@/lib/voice-intent';

describe('Ask Emmaus voice intent normalization', () => {
  it.each([
    'Read John 3:16',
    'Please read John chapter 3 verse 16',
    'Can you read John 3:16 for me',
    'Take me to John 3:16 and read it',
  ])('recognizes a natural Scripture reading request: %s', (utterance) => {
    const intent = resolveIntent(utterance, false);
    expect(intent.type).toBe('read-content');
    expect(intent.content).toBe('bible');
    expect(intent.bibleRef).toMatchObject({ bookId: 'john', chapter: 3, verse: 16 });
  });

  it('recognizes Scripture questions as conversation, not navigation', () => {
    expect(resolveIntent('What does John 3:16 mean?', false)).toEqual({ type: 'converse' });
  });

  it.each([
    ['Read Psalm 23', 'psalms'],
    ['Read First Corinthians 13', '1corinthians'],
    ['Read Second Corinthians 5:17', '2corinthians'],
    ['Read First Thessalonians 5:16', '1thessalonians'],
    ['Read First John 1:9', '1john'],
  ])('normalizes %s', (utterance, bookId) => {
    const intent = resolveIntent(utterance, false);
    expect(intent.type).toBe('read-content');
    expect(intent.bibleRef?.bookId).toBe(bookId);
  });

  it.each([
    ['Pause', 'pause'],
    ['Resume', 'continue'],
    ['Repeat that', 'repeat'],
    ['Stop reading', 'pause'],
  ])('recognizes playback control %s', (utterance, command) => {
    expect(resolveIntent(utterance, true)).toMatchObject({
      type: 'reading-command',
      command,
    });
  });
});