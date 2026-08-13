/**
 * voice-intent.ts — Lean intent classifier for Emmaus Voice Mode.
 *
 * PHILOSOPHY (per spec):
 *   Only classify CLEARLY DETERMINISTIC intents.
 *   Everything ambiguous, conversational, or follow-up falls through as
 *   'converse' and is handled by the existing Ask Emmaus pipeline with
 *   the user's current app context injected — Emmaus does the thinking.
 *
 *   This is a routing helper, not a command vocabulary.
 *   The user should feel like they are talking naturally to Emmaus,
 *   not memorising a set of commands.
 */

// ─── Intent types ─────────────────────────────────────────────────────────────

export type NavigateTarget = 'walk' | 'bible' | 'discover' | 'back' | 'journeys';
export type ReadingCommand  = 'pause' | 'continue' | 'repeat' | 'next-section' | 'explain' | 'pray';
export type ReadContentType = 'daily-rhythm' | 'devotional' | 'sermon-companion' | 'bible';

export interface BibleRef {
  bookId:   string;
  bookName: string;
  chapter:  number;
  verse?:   number;
}

export type VoiceIntent =
  | { type: 'converse' }                                        // default → Emmaus with context
  | { type: 'get-steps' }                                       // "what's on today's steps?"
  | { type: 'navigate'; target: NavigateTarget }                // "open my bible"
  | { type: 'reading-command'; command: ReadingCommand }        // "pause", "explain that"
  | { type: 'read-content'; content: ReadContentType; bibleRef?: BibleRef }
  | { type: 'continue-walk'; hint?: string }                    // "continue my walk"
  | { type: 'continue-reading' };                               // "continue reading / next chapter"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function norm(text: string): string {
  return text.toLowerCase().trim().replace(/[.,!?'"]+/g, '').replace(/\s+/g, ' ');
}

// ─── Bible book name → canonical bookId ──────────────────────────────────────
// Covers the books most commonly referenced by voice.

const BOOK_MAP: Record<string, { id: string; name: string }> = {
  genesis:                 { id: 'genesis',        name: 'Genesis' },
  gen:                     { id: 'genesis',        name: 'Genesis' },
  exodus:                  { id: 'exodus',         name: 'Exodus' },
  leviticus:               { id: 'leviticus',      name: 'Leviticus' },
  numbers:                 { id: 'numbers',        name: 'Numbers' },
  deuteronomy:             { id: 'deuteronomy',    name: 'Deuteronomy' },
  joshua:                  { id: 'joshua',         name: 'Joshua' },
  judges:                  { id: 'judges',         name: 'Judges' },
  ruth:                    { id: 'ruth',           name: 'Ruth' },
  'first samuel':          { id: '1samuel',        name: '1 Samuel' },
  '1 samuel':              { id: '1samuel',        name: '1 Samuel' },
  'second samuel':         { id: '2samuel',        name: '2 Samuel' },
  '2 samuel':              { id: '2samuel',        name: '2 Samuel' },
  'first kings':           { id: '1kings',         name: '1 Kings' },
  '1 kings':               { id: '1kings',         name: '1 Kings' },
  'second kings':          { id: '2kings',         name: '2 Kings' },
  '2 kings':               { id: '2kings',         name: '2 Kings' },
  'first chronicles':      { id: '1chronicles',    name: '1 Chronicles' },
  '1 chronicles':          { id: '1chronicles',    name: '1 Chronicles' },
  'second chronicles':     { id: '2chronicles',    name: '2 Chronicles' },
  '2 chronicles':          { id: '2chronicles',    name: '2 Chronicles' },
  ezra:                    { id: 'ezra',           name: 'Ezra' },
  nehemiah:                { id: 'nehemiah',       name: 'Nehemiah' },
  esther:                  { id: 'esther',         name: 'Esther' },
  job:                     { id: 'job',            name: 'Job' },
  psalm:                   { id: 'psalms',         name: 'Psalm' },
  psalms:                  { id: 'psalms',         name: 'Psalms' },
  ps:                      { id: 'psalms',         name: 'Psalms' },
  proverbs:                { id: 'proverbs',       name: 'Proverbs' },
  prov:                    { id: 'proverbs',       name: 'Proverbs' },
  ecclesiastes:            { id: 'ecclesiastes',   name: 'Ecclesiastes' },
  'song of songs':         { id: 'songofsolomon',  name: 'Song of Songs' },
  'song of solomon':       { id: 'songofsolomon',  name: 'Song of Solomon' },
  isaiah:                  { id: 'isaiah',         name: 'Isaiah' },
  isa:                     { id: 'isaiah',         name: 'Isaiah' },
  jeremiah:                { id: 'jeremiah',       name: 'Jeremiah' },
  lamentations:            { id: 'lamentations',   name: 'Lamentations' },
  ezekiel:                 { id: 'ezekiel',        name: 'Ezekiel' },
  daniel:                  { id: 'daniel',         name: 'Daniel' },
  hosea:                   { id: 'hosea',          name: 'Hosea' },
  joel:                    { id: 'joel',           name: 'Joel' },
  amos:                    { id: 'amos',           name: 'Amos' },
  obadiah:                 { id: 'obadiah',        name: 'Obadiah' },
  jonah:                   { id: 'jonah',          name: 'Jonah' },
  micah:                   { id: 'micah',          name: 'Micah' },
  nahum:                   { id: 'nahum',          name: 'Nahum' },
  habakkuk:                { id: 'habakkuk',       name: 'Habakkuk' },
  zephaniah:               { id: 'zephaniah',      name: 'Zephaniah' },
  haggai:                  { id: 'haggai',         name: 'Haggai' },
  zechariah:               { id: 'zechariah',      name: 'Zechariah' },
  malachi:                 { id: 'malachi',        name: 'Malachi' },
  matthew:                 { id: 'matthew',        name: 'Matthew' },
  matt:                    { id: 'matthew',        name: 'Matthew' },
  mark:                    { id: 'mark',           name: 'Mark' },
  luke:                    { id: 'luke',           name: 'Luke' },
  john:                    { id: 'john',           name: 'John' },
  acts:                    { id: 'acts',           name: 'Acts' },
  romans:                  { id: 'romans',         name: 'Romans' },
  rom:                     { id: 'romans',         name: 'Romans' },
  'first corinthians':     { id: '1corinthians',   name: '1 Corinthians' },
  '1 corinthians':         { id: '1corinthians',   name: '1 Corinthians' },
  'second corinthians':    { id: '2corinthians',   name: '2 Corinthians' },
  '2 corinthians':         { id: '2corinthians',   name: '2 Corinthians' },
  galatians:               { id: 'galatians',      name: 'Galatians' },
  gal:                     { id: 'galatians',      name: 'Galatians' },
  ephesians:               { id: 'ephesians',      name: 'Ephesians' },
  eph:                     { id: 'ephesians',      name: 'Ephesians' },
  philippians:             { id: 'philippians',    name: 'Philippians' },
  phil:                    { id: 'philippians',    name: 'Philippians' },
  colossians:              { id: 'colossians',     name: 'Colossians' },
  col:                     { id: 'colossians',     name: 'Colossians' },
  'first thessalonians':   { id: '1thessalonians', name: '1 Thessalonians' },
  '1 thessalonians':       { id: '1thessalonians', name: '1 Thessalonians' },
  'second thessalonians':  { id: '2thessalonians', name: '2 Thessalonians' },
  '2 thessalonians':       { id: '2thessalonians', name: '2 Thessalonians' },
  'first timothy':         { id: '1timothy',       name: '1 Timothy' },
  '1 timothy':             { id: '1timothy',       name: '1 Timothy' },
  'second timothy':        { id: '2timothy',       name: '2 Timothy' },
  '2 timothy':             { id: '2timothy',       name: '2 Timothy' },
  titus:                   { id: 'titus',          name: 'Titus' },
  philemon:                { id: 'philemon',       name: 'Philemon' },
  hebrews:                 { id: 'hebrews',        name: 'Hebrews' },
  heb:                     { id: 'hebrews',        name: 'Hebrews' },
  james:                   { id: 'james',          name: 'James' },
  jas:                     { id: 'james',          name: 'James' },
  'first peter':           { id: '1peter',         name: '1 Peter' },
  '1 peter':               { id: '1peter',         name: '1 Peter' },
  'second peter':          { id: '2peter',         name: '2 Peter' },
  '2 peter':               { id: '2peter',         name: '2 Peter' },
  'first john':            { id: '1john',          name: '1 John' },
  '1 john':                { id: '1john',          name: '1 John' },
  'second john':           { id: '2john',          name: '2 John' },
  '2 john':                { id: '2john',          name: '2 John' },
  'third john':            { id: '3john',          name: '3 John' },
  '3 john':                { id: '3john',          name: '3 John' },
  jude:                    { id: 'jude',           name: 'Jude' },
  revelation:              { id: 'revelation',     name: 'Revelation' },
  rev:                     { id: 'revelation',     name: 'Revelation' },
};

/**
 * Parse a Bible reference from normalised text.
 * Supports: "psalm 23", "john 3", "romans 8 28", "romans 8 verse 28"
 */
function parseBibleRef(t: string): BibleRef | null {
  // Sort entries longest-first so "first corinthians" matches before "corinthians"
  const entries = Object.entries(BOOK_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [spoken, book] of entries) {
    const escaped = spoken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/, '\\s+');
    const pattern = new RegExp(
      `(?:^|\\s)${escaped}\\s+(\\d+)(?:\\s+(?:verse\\s+|:)?(\\d+))?`,
      'i',
    );
    const m = pattern.exec(t);
    if (m) {
      return {
        bookId:   book.id,
        bookName: book.name,
        chapter:  parseInt(m[1], 10),
        verse:    m[2] ? parseInt(m[2], 10) : undefined,
      };
    }
  }
  return null;
}

// ─── Main classifier ──────────────────────────────────────────────────────────

/**
 * Classify a voice transcript into a routing intent.
 *
 * @param transcript  Raw transcript text from Whisper.
 * @param isReading   True when a reading session is currently active.
 *                    Reading commands are only classified when this is true,
 *                    to avoid false positives during normal conversation.
 */
export function resolveIntent(transcript: string, isReading: boolean): VoiceIntent {
  const t = norm(transcript);

  // ─── Reading commands (only when a session is active) ───────────────────
  // These are short, unambiguous phrases that control the reading engine.
  if (isReading) {
    if (/^(pause|stop reading|pause that|stop)$/.test(t))
      return { type: 'reading-command', command: 'pause' };

    if (/^(continue|resume|carry on|keep going|keep reading|play|go ahead)$/.test(t))
      return { type: 'reading-command', command: 'continue' };

    if (/^(repeat|read that again|say that again|repeat that|again)$/.test(t))
      return { type: 'reading-command', command: 'repeat' };

    if (/^(next|next section|skip that|move on|skip|next part)$/.test(t))
      return { type: 'reading-command', command: 'next-section' };

    // "explain that" / "what does that mean" — falls through to Emmaus with section context
    if (/^(explain|explain that|explain this|what does (that|this) mean|tell me more|elaborate)$/.test(t))
      return { type: 'reading-command', command: 'explain' };

    // "pray with me" — falls through to Emmaus with section context
    if (/^(pray|pray with me|lets pray|let us pray|pray about (this|that))$/.test(t))
      return { type: 'reading-command', command: 'pray' };
  }

  // ─── Today's Steps ──────────────────────────────────────────────────────
  if (
    /what('?s| is| are)?\s+(on\s+)?(my\s+)?(today'?s?\s+steps?|steps? today|daily steps?)/.test(t) ||
    /what do i (have|need to do) today/.test(t) ||
    /what'?s?\s+(happening|on)\s+today/.test(t) ||
    /show me (my\s+)?today'?s? steps?/.test(t) ||
    /open\s+today'?s?\s+steps?/.test(t)
  ) {
    return { type: 'get-steps' };
  }

  // ─── Clear navigation commands ───────────────────────────────────────────
  // Only match when the ENTIRE utterance is a navigation command.
  if (/^(go back|back|go to previous|previous page)$/.test(t))
    return { type: 'navigate', target: 'back' };

  if (/open (my\s+)?bible|take me to (my\s+)?bible|go to (my\s+)?bible/.test(t))
    return { type: 'navigate', target: 'bible' };

  if (/open discover|go to discover|take me to discover/.test(t))
    return { type: 'navigate', target: 'discover' };

  if (/open (my\s+)?(walks?|journeys?)\s*(page)?$|go to (my\s+)?(walks?|journeys?)\s*$/.test(t))
    return { type: 'navigate', target: 'journeys' };

  // ─── Bible reading — "read [book] [chapter]" ────────────────────────────
  // Only match when the sentence begins with "read" and contains a parsed reference.
  if (/^read\s+/.test(t)) {
    const ref = parseBibleRef(t);
    if (ref) return { type: 'read-content', content: 'bible', bibleRef: ref };
  }

  // ─── Continue reading (no book specified) ───────────────────────────────
  if (/^(continue reading|next chapter|previous chapter|read next chapter)$/.test(t))
    return { type: 'continue-reading' };

  // ─── Daily Rhythm / 10 Minutes with Jesus ───────────────────────────────
  if (
    /10 minutes with jesus|daily rhythm/.test(t) ||
    /^(read|open|continue|start|lets do|let'?s do)\s+(today'?s?\s+)?(my\s+)?(daily rhythm|10 minutes with jesus)/.test(t)
  ) {
    return { type: 'read-content', content: 'daily-rhythm' };
  }

  // ─── Devotional ─────────────────────────────────────────────────────────
  // Only classify when clearly requesting devotional content, not asking a question about it.
  if (
    /^(read|open|continue|start)\s+(today'?s?\s+)?(my\s+)?(\w+\s+)?devotional$/.test(t) ||
    /^(lets do|let'?s do)\s+(my\s+)?(\w+\s+)?devotional$/.test(t)
  ) {
    return { type: 'read-content', content: 'devotional' };
  }

  // ─── Sermon Companion ───────────────────────────────────────────────────
  if (
    /^(read|open|continue|start)\s+(today'?s?\s+)?(the\s+)?sermon companion$/.test(t) ||
    /^continue\s+(the\s+)?sermon devotional$/.test(t)
  ) {
    return { type: 'read-content', content: 'sermon-companion' };
  }

  // ─── Continue Walk / Journey (clearly stated) ───────────────────────────
  if (/^(continue|open|start)\s+(my\s+)?(walk|journey)$/.test(t) ||
      /^what'?s?\s+(my\s+)?next (walk|step)$/.test(t)) {
    return { type: 'continue-walk' };
  }

  // Journey by name — "continue [name]" / "open [name]"
  if (/^(continue|open)\s+(.+?)\s*(journey|walk)?$/.test(t) && !/^(continue|open) (my |the )?(walk|journey)$/.test(t)) {
    const m = /^(?:continue|open)\s+(?:my\s+|the\s+)?(.+?)(?:\s+(?:journey|walk))?$/.exec(t);
    if (m && m[1].length > 2 && m[1].length < 50) {
      return { type: 'continue-walk', hint: m[1].trim() };
    }
  }

  // ─── Default: everything else goes to Emmaus with enriched context ───────
  return { type: 'converse' };
}
