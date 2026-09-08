/**
 * Shared Emmaus intent contract.
 *
 * Bible references are evidence, not navigation commands.  An explicit,
 * anchored imperative is required before a READ or OPEN action is returned.
 * Both typed Ask Emmaus and Voice use this pure classifier as a first pass;
 * the server still validates the resulting resource before executing it.
 */

export type EmmausIntentMode = "ASK" | "READ" | "OPEN" | "FIND";

export interface CanonicalBibleReference {
  bookId: string;
  bookName: string;
  chapter: number;
  verse?: number;
  translationId?: string;
}

export interface EmmausIntent {
  mode: EmmausIntentMode;
  bibleRef?: CanonicalBibleReference;
  query?: string;
  target?: "bible";
}

const SPOKEN_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
};

const BOOK_MAP: Record<string, { id: string; name: string }> = {
  genesis: { id: "genesis", name: "Genesis" }, gen: { id: "genesis", name: "Genesis" },
  exodus: { id: "exodus", name: "Exodus" }, leviticus: { id: "leviticus", name: "Leviticus" },
  numbers: { id: "numbers", name: "Numbers" }, deuteronomy: { id: "deuteronomy", name: "Deuteronomy" },
  joshua: { id: "joshua", name: "Joshua" }, judges: { id: "judges", name: "Judges" },
  ruth: { id: "ruth", name: "Ruth" }, job: { id: "job", name: "Job" },
  psalm: { id: "psalms", name: "Psalm" }, psalms: { id: "psalms", name: "Psalms" },
  ps: { id: "psalms", name: "Psalms" }, proverbs: { id: "proverbs", name: "Proverbs" },
  ecclesiastes: { id: "ecclesiastes", name: "Ecclesiastes" },
  "song of songs": { id: "songofsolomon", name: "Song of Songs" },
  "song of solomon": { id: "songofsolomon", name: "Song of Solomon" },
  isaiah: { id: "isaiah", name: "Isaiah" }, isa: { id: "isaiah", name: "Isaiah" },
  jeremiah: { id: "jeremiah", name: "Jeremiah" }, lamentations: { id: "lamentations", name: "Lamentations" },
  ezekiel: { id: "ezekiel", name: "Ezekiel" }, daniel: { id: "daniel", name: "Daniel" },
  hosea: { id: "hosea", name: "Hosea" }, joel: { id: "joel", name: "Joel" },
  amos: { id: "amos", name: "Amos" }, obadiah: { id: "obadiah", name: "Obadiah" },
  jonah: { id: "jonah", name: "Jonah" }, micah: { id: "micah", name: "Micah" },
  nahum: { id: "nahum", name: "Nahum" }, habakkuk: { id: "habakkuk", name: "Habakkuk" },
  zephaniah: { id: "zephaniah", name: "Zephaniah" }, haggai: { id: "haggai", name: "Haggai" },
  zechariah: { id: "zechariah", name: "Zechariah" }, malachi: { id: "malachi", name: "Malachi" },
  matthew: { id: "matthew", name: "Matthew" }, matt: { id: "matthew", name: "Matthew" },
  mark: { id: "mark", name: "Mark" }, luke: { id: "luke", name: "Luke" }, john: { id: "john", name: "John" },
  acts: { id: "acts", name: "Acts" }, romans: { id: "romans", name: "Romans" },
  galatians: { id: "galatians", name: "Galatians" }, gal: { id: "galatians", name: "Galatians" },
  ephesians: { id: "ephesians", name: "Ephesians" }, eph: { id: "ephesians", name: "Ephesians" },
  philippians: { id: "philippians", name: "Philippians" }, phil: { id: "philippians", name: "Philippians" },
  colossians: { id: "colossians", name: "Colossians" },
  titus: { id: "titus", name: "Titus" }, philemon: { id: "philemon", name: "Philemon" },
  hebrews: { id: "hebrews", name: "Hebrews" }, heb: { id: "hebrews", name: "Hebrews" },
  james: { id: "james", name: "James" }, jude: { id: "jude", name: "Jude" },
  revelation: { id: "revelation", name: "Revelation" }, rev: { id: "revelation", name: "Revelation" },
};

for (const [prefix, canonical] of [
  ["first", "1"], ["second", "2"], ["third", "3"],
] as const) {
  for (const book of ["samuel", "kings", "chronicles", "corinthians", "thessalonians", "timothy", "peter", "john"]) {
    const key = `${prefix} ${book}`;
    const id = `${canonical}${book}`;
    BOOK_MAP[key] = { id, name: `${canonical} ${book.charAt(0).toUpperCase()}${book.slice(1)}` };
  }
}

for (const [number, book] of [["1", "samuel"], ["2", "samuel"], ["1", "kings"], ["2", "kings"],
  ["1", "chronicles"], ["2", "chronicles"], ["1", "corinthians"], ["2", "corinthians"],
  ["1", "thessalonians"], ["2", "thessalonians"], ["1", "timothy"], ["2", "timothy"],
  ["1", "peter"], ["2", "peter"], ["1", "john"], ["2", "john"], ["3", "john"]] as const) {
  BOOK_MAP[`${number} ${book}`] = {
    id: `${number}${book}`,
    name: `${number} ${book.charAt(0).toUpperCase()}${book.slice(1)}`,
  };
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[.,!?'"“”]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/\bchapter\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\b/gi, (_, n) => String(SPOKEN_NUMBERS[n.toLowerCase()]))
    .replace(/\bverse\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\b/gi, (_, n) => String(SPOKEN_NUMBERS[n.toLowerCase()]))
    .replace(/\bchapter\s+/gi, "")
    .replace(/\bverse\s+/gi, " ");
}

function stripPolitePrefix(text: string): string {
  return text.replace(
    /^(?:emmaus[,\s]+|hey emmaus[,\s]+)?(?:(?:can|could|would)\s+you\s+(?:please\s+)?|please\s+)/i,
    "",
  ).trim();
}

export function parseCanonicalBibleReference(input: string): CanonicalBibleReference | null {
  let text = normalize(input);
  let translationId: string | undefined;
  const suffix = text.match(/\s+(?:in|using)\s+(?:the\s+)?(bsb|berean|asv|kjv|niv|gnt|msg|message)\s*$/i);
  if (suffix) {
    const translations: Record<string, string> = {
      bsb: "bsb", berean: "bsb", asv: "asv", kjv: "kjv",
      niv: "niv", gnt: "gnt", msg: "msg", message: "msg",
    };
    translationId = translations[suffix[1].toLowerCase()];
    text = text.slice(0, suffix.index).trim();
  }

  const entries = Object.entries(BOOK_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [spoken, book] of entries) {
    const escaped = spoken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const match = new RegExp(`(?:^|\\s)${escaped}\\s+(\\d+)(?:(?:\\s+|:)(\\d+))?(?:\\s|$)`, "i").exec(text);
    if (!match) continue;
    return {
      bookId: book.id,
      bookName: book.name,
      chapter: Number(match[1]),
      ...(match[2] ? { verse: Number(match[2]) } : {}),
      ...(translationId ? { translationId } : {}),
    };
  }
  return null;
}

function hasQuestionIntent(text: string): boolean {
  return /^(?:what|why|how|when|where|who|explain|meaning|tell me about|can you explain|help me understand)\b/i.test(text)
    || /\b(?:what does|what do|why does|how does|how can|explain how)\b/i.test(text);
}

/**
 * Classify the user's intent before any route or playback action is executed.
 * The default is ASK, including for unrecognised or partial Bible references.
 */
export function classifyEmmausIntent(input: string): EmmausIntent {
  const text = stripPolitePrefix(normalize(input));
  const bibleRef = parseCanonicalBibleReference(text);

  if (hasQuestionIntent(text)) {
    return { mode: "ASK", ...(bibleRef ? { bibleRef } : {}) };
  }

  if (/^(?:find|search for|search|where can i find|do we have)\b/i.test(text)) {
    return { mode: "FIND", ...(bibleRef ? { bibleRef } : {}), query: text };
  }

  if (/^(?:read|recite|read aloud)\b/i.test(text) && bibleRef) {
    return { mode: "READ", bibleRef };
  }

  if (/(?:\s+and\s+read(?:\s+it)?$)/i.test(text) && bibleRef && /^(?:open|go to|take me to)\b/i.test(text)) {
    return { mode: "READ", bibleRef };
  }

  if (/^(?:open|go to|show me|take me to)\b/i.test(text) && bibleRef) {
    return { mode: "OPEN", bibleRef, target: "bible" };
  }

  if (/^(?:open|go to|show me|take me to)\s+(?:my\s+|the\s+|a\s+)?(?:bible|scripture)$/i.test(text)) {
    return { mode: "OPEN", target: "bible" };
  }

  return { mode: "ASK", ...(bibleRef ? { bibleRef } : {}) };
}