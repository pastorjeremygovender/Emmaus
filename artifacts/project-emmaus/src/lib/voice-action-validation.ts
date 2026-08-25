import type { VoiceAppContext } from '@/lib/voice-context';

export type ValidatedVoiceAction =
  | { ok: true; action: 'read-content'; content: 'bible' | 'daily-rhythm' | 'devotional' | 'sermon-companion' | 'walk'; bibleBook?: string; bibleChapter?: number; titleHint?: string }
  | { ok: false; code: string; message: string };

const BIBLE_BOOKS = new Set([
  'genesis','exodus','leviticus','numbers','deuteronomy','joshua','judges','ruth',
  '1samuel','2samuel','1kings','2kings','1chronicles','2chronicles','ezra','nehemiah',
  'esther','job','psalms','proverbs','ecclesiastes','songofsolomon','isaiah','jeremiah',
  'lamentations','ezekiel','daniel','hosea','joel','amos','obadiah','jonah','micah',
  'nahum','habakkuk','zephaniah','haggai','zechariah','malachi','matthew','mark','luke',
  'john','acts','romans','1corinthians','2corinthians','galatians','ephesians',
  'philippians','colossians','1thessalonians','2thessalonians','1timothy','2timothy',
  'titus','philemon','hebrews','james','1peter','2peter','1john','2john','3john','jude',
  'revelation',
]);

function reject(code: string, message: string): ValidatedVoiceAction {
  return { ok: false, code, message };
}

export function validateVoiceReadAction(
  args: { type?: unknown; bibleBook?: unknown; bibleChapter?: unknown; titleHint?: unknown },
  context: VoiceAppContext | null,
): ValidatedVoiceAction {
  const type = typeof args.type === 'string' ? args.type : '';
  if (!['bible', 'daily-rhythm', 'devotional', 'sermon-companion', 'walk'].includes(type)) {
    return reject('VOICE_INVALID_CONTENT_TYPE', 'I could not identify that content type.');
  }

  if (type === 'bible') {
    let book = typeof args.bibleBook === 'string'
      ? args.bibleBook.toLowerCase().replace(/[\s_-]+/g, '') : '';
    book = book.replace(/^first(?=samuel|kings|chronicles|corinthians|thessalonians|timothy|peter|john)/, '1')
      .replace(/^second(?=samuel|kings|chronicles|corinthians|thessalonians|timothy|peter|john)/, '2')
      .replace(/^third(?=john)/, '3');
    const chapter = Number(args.bibleChapter);
    if (!BIBLE_BOOKS.has(book)) return reject('VOICE_INVALID_BIBLE_BOOK', 'I could not identify that Bible book.');
    if (!Number.isInteger(chapter) || chapter < 1 || chapter > 150) {
      return reject('VOICE_INVALID_BIBLE_CHAPTER', 'I could not identify a valid Bible chapter.');
    }
    return { ok: true, action: 'read-content', content: 'bible', bibleBook: book, bibleChapter: chapter };
  }

  if (!context) return reject('VOICE_CONTEXT_UNAVAILABLE', 'I could not verify your available content yet.');
  if (type === 'daily-rhythm' && !context.dailyRhythm) {
    return reject('VOICE_DAILY_RHYTHM_INELIGIBLE', 'There is no eligible Daily Rhythm reading available today.');
  }
  if (type === 'devotional' && context.activeDevotionals.length === 0) {
    return reject('VOICE_DEVOTIONAL_UNAVAILABLE', 'There is no active devotional available to read.');
  }
  if (type === 'sermon-companion' && !context.sermonCompanion) {
    return reject('VOICE_COMPANION_UNAVAILABLE', 'There is no available Sermon Companion to read.');
  }
  if (type === 'walk' && context.activeWalks.length === 0) {
    return reject('VOICE_WALK_UNAVAILABLE', 'There is no active Walk available to read.');
  }

  const titleHint = typeof args.titleHint === 'string' ? args.titleHint.trim().slice(0, 80) : undefined;
  return { ok: true, action: 'read-content', content: type, ...(titleHint ? { titleHint } : {}) };
}

export function isSafeVoiceRoute(route: unknown): route is string {
  if (typeof route !== 'string' || route.length > 300 || /^(?:javascript|data|blob):/i.test(route)) return false;
  return /^\/(?:walk|bible|bible\/read\/[A-Za-z0-9_-]+\/\d+|discover(?:\?q=[^#]*)?|journeys|personal\/ask-emmaus\/voice|journey\/[A-Za-z0-9_-]+\/day\/\d+)$/.test(route);
}