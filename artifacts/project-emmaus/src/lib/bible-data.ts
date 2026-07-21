// ─── Bible Engine v1.0 — Seed Data ──────────────────────────────────────────
// Translation: King James Version (KJV) — Public Domain
// John 1–3 fully seeded. John 4–21 use development placeholders.
// Architecture supports future licensed providers without UI changes.

// ─── Types ───────────────────────────────────────────────────────────────────

export type BibleVerse = {
  verse: number;
  text: string;
};

export type GoDeeperItem = {
  type: 'cross-reference' | 'journey' | 'emmaus-journey' | 'devotional' | 'sermon' | 'resource';
  title: string;
  description: string;
  reference?: string;
  journeyId?: string;
  isDevelopmentCard?: boolean;
};

export type AskEmmausQA = {
  prompt: string;
  answer: {
    explanation: string;
    historicalContext: string;
    practicalApplication: string;
    churchInsight?: string;
  };
};

export type BibleChapter = {
  bookId: string;
  chapter: number;
  heading: string;
  readingMinutes: number;
  sermonRefs: string[];           // IDs matching Sermon.id in admin-demo-data
  verses: BibleVerse[];           // Empty for unavailable chapters
  isPlaceholder?: boolean;        // true for chapters 4–21 in this phase
  // Walk Through John journey content
  journeyIntro?: string;
  prayerPrompt?: string;
  goDeeper?: GoDeeperItem[];
  askEmmaus?: AskEmmausQA[];
};

export type BibleBook = {
  id: string;
  name: string;
  shortName: string;
  testament: 'OT' | 'NT';
  chapters: number;
  available: boolean;
  description?: string;
  genre?: string;
};

export type BibleJourney = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  bookId: string;
  chapterCount: number;
  available: boolean;
  coverLabel?: string;
};

export type WeeklyMemoryVerse = {
  reference: string;
  text: string;
  weekOf: string;
};

// ─── 66 Books Catalogue ──────────────────────────────────────────────────────

export const BIBLE_BOOKS: BibleBook[] = [
  // Old Testament
  { id: 'genesis',       name: 'Genesis',          shortName: 'Gen',   testament: 'OT', chapters: 50,  available: false, genre: 'Law' },
  { id: 'exodus',        name: 'Exodus',            shortName: 'Ex',    testament: 'OT', chapters: 40,  available: false, genre: 'Law' },
  { id: 'leviticus',     name: 'Leviticus',         shortName: 'Lev',   testament: 'OT', chapters: 27,  available: false, genre: 'Law' },
  { id: 'numbers',       name: 'Numbers',           shortName: 'Num',   testament: 'OT', chapters: 36,  available: false, genre: 'Law' },
  { id: 'deuteronomy',   name: 'Deuteronomy',       shortName: 'Deut',  testament: 'OT', chapters: 34,  available: false, genre: 'Law' },
  { id: 'joshua',        name: 'Joshua',            shortName: 'Josh',  testament: 'OT', chapters: 24,  available: false, genre: 'History' },
  { id: 'judges',        name: 'Judges',            shortName: 'Judg',  testament: 'OT', chapters: 21,  available: false, genre: 'History' },
  { id: 'ruth',          name: 'Ruth',              shortName: 'Ruth',  testament: 'OT', chapters: 4,   available: false, genre: 'History' },
  { id: '1samuel',       name: '1 Samuel',          shortName: '1 Sam', testament: 'OT', chapters: 31,  available: false, genre: 'History' },
  { id: '2samuel',       name: '2 Samuel',          shortName: '2 Sam', testament: 'OT', chapters: 24,  available: false, genre: 'History' },
  { id: '1kings',        name: '1 Kings',           shortName: '1 Kgs', testament: 'OT', chapters: 22,  available: false, genre: 'History' },
  { id: '2kings',        name: '2 Kings',           shortName: '2 Kgs', testament: 'OT', chapters: 25,  available: false, genre: 'History' },
  { id: '1chronicles',   name: '1 Chronicles',      shortName: '1 Chr', testament: 'OT', chapters: 29,  available: false, genre: 'History' },
  { id: '2chronicles',   name: '2 Chronicles',      shortName: '2 Chr', testament: 'OT', chapters: 36,  available: false, genre: 'History' },
  { id: 'ezra',          name: 'Ezra',              shortName: 'Ezra',  testament: 'OT', chapters: 10,  available: false, genre: 'History' },
  { id: 'nehemiah',      name: 'Nehemiah',          shortName: 'Neh',   testament: 'OT', chapters: 13,  available: false, genre: 'History' },
  { id: 'esther',        name: 'Esther',            shortName: 'Est',   testament: 'OT', chapters: 10,  available: false, genre: 'History' },
  { id: 'job',           name: 'Job',               shortName: 'Job',   testament: 'OT', chapters: 42,  available: false, genre: 'Wisdom' },
  { id: 'psalms',        name: 'Psalms',            shortName: 'Ps',    testament: 'OT', chapters: 150, available: false, genre: 'Wisdom' },
  { id: 'proverbs',      name: 'Proverbs',          shortName: 'Prov',  testament: 'OT', chapters: 31,  available: false, genre: 'Wisdom' },
  { id: 'ecclesiastes',  name: 'Ecclesiastes',      shortName: 'Eccl',  testament: 'OT', chapters: 12,  available: false, genre: 'Wisdom' },
  { id: 'songofsolomon', name: 'Song of Solomon',   shortName: 'Song',  testament: 'OT', chapters: 8,   available: false, genre: 'Wisdom' },
  { id: 'isaiah',        name: 'Isaiah',            shortName: 'Isa',   testament: 'OT', chapters: 66,  available: false, genre: 'Prophecy' },
  { id: 'jeremiah',      name: 'Jeremiah',          shortName: 'Jer',   testament: 'OT', chapters: 52,  available: false, genre: 'Prophecy' },
  { id: 'lamentations',  name: 'Lamentations',      shortName: 'Lam',   testament: 'OT', chapters: 5,   available: false, genre: 'Prophecy' },
  { id: 'ezekiel',       name: 'Ezekiel',           shortName: 'Ezek',  testament: 'OT', chapters: 48,  available: false, genre: 'Prophecy' },
  { id: 'daniel',        name: 'Daniel',            shortName: 'Dan',   testament: 'OT', chapters: 12,  available: false, genre: 'Prophecy' },
  { id: 'hosea',         name: 'Hosea',             shortName: 'Hos',   testament: 'OT', chapters: 14,  available: false, genre: 'Prophecy' },
  { id: 'joel',          name: 'Joel',              shortName: 'Joel',  testament: 'OT', chapters: 3,   available: false, genre: 'Prophecy' },
  { id: 'amos',          name: 'Amos',              shortName: 'Amos',  testament: 'OT', chapters: 9,   available: false, genre: 'Prophecy' },
  { id: 'obadiah',       name: 'Obadiah',           shortName: 'Obad',  testament: 'OT', chapters: 1,   available: false, genre: 'Prophecy' },
  { id: 'jonah',         name: 'Jonah',             shortName: 'Jon',   testament: 'OT', chapters: 4,   available: false, genre: 'Prophecy' },
  { id: 'micah',         name: 'Micah',             shortName: 'Mic',   testament: 'OT', chapters: 7,   available: false, genre: 'Prophecy' },
  { id: 'nahum',         name: 'Nahum',             shortName: 'Nah',   testament: 'OT', chapters: 3,   available: false, genre: 'Prophecy' },
  { id: 'habakkuk',      name: 'Habakkuk',          shortName: 'Hab',   testament: 'OT', chapters: 3,   available: false, genre: 'Prophecy' },
  { id: 'zephaniah',     name: 'Zephaniah',         shortName: 'Zeph',  testament: 'OT', chapters: 3,   available: false, genre: 'Prophecy' },
  { id: 'haggai',        name: 'Haggai',            shortName: 'Hag',   testament: 'OT', chapters: 2,   available: false, genre: 'Prophecy' },
  { id: 'zechariah',     name: 'Zechariah',         shortName: 'Zech',  testament: 'OT', chapters: 14,  available: false, genre: 'Prophecy' },
  { id: 'malachi',       name: 'Malachi',           shortName: 'Mal',   testament: 'OT', chapters: 4,   available: false, genre: 'Prophecy' },
  // New Testament
  { id: 'matthew',       name: 'Matthew',           shortName: 'Matt',  testament: 'NT', chapters: 28,  available: false, genre: 'Gospel' },
  { id: 'mark',          name: 'Mark',              shortName: 'Mark',  testament: 'NT', chapters: 16,  available: false, genre: 'Gospel' },
  { id: 'luke',          name: 'Luke',              shortName: 'Luke',  testament: 'NT', chapters: 24,  available: false, genre: 'Gospel' },
  {
    id: 'john', name: 'John', shortName: 'John', testament: 'NT', chapters: 21, available: true, genre: 'Gospel',
    description: 'The Gospel of John presents Jesus as the eternal Word of God made flesh. Written so that you may believe that Jesus is the Messiah, the Son of God, and that by believing you may have life in his name.',
  },
  { id: 'acts',          name: 'Acts',              shortName: 'Acts',  testament: 'NT', chapters: 28,  available: false, genre: 'History' },
  { id: 'romans',        name: 'Romans',            shortName: 'Rom',   testament: 'NT', chapters: 16,  available: false, genre: 'Epistle' },
  { id: '1corinthians',  name: '1 Corinthians',     shortName: '1 Cor', testament: 'NT', chapters: 16,  available: false, genre: 'Epistle' },
  { id: '2corinthians',  name: '2 Corinthians',     shortName: '2 Cor', testament: 'NT', chapters: 13,  available: false, genre: 'Epistle' },
  { id: 'galatians',     name: 'Galatians',         shortName: 'Gal',   testament: 'NT', chapters: 6,   available: false, genre: 'Epistle' },
  { id: 'ephesians',     name: 'Ephesians',         shortName: 'Eph',   testament: 'NT', chapters: 6,   available: false, genre: 'Epistle' },
  { id: 'philippians',   name: 'Philippians',       shortName: 'Phil',  testament: 'NT', chapters: 4,   available: false, genre: 'Epistle' },
  { id: 'colossians',    name: 'Colossians',        shortName: 'Col',   testament: 'NT', chapters: 4,   available: false, genre: 'Epistle' },
  { id: '1thessalonians',name: '1 Thessalonians',   shortName: '1 Th',  testament: 'NT', chapters: 5,   available: false, genre: 'Epistle' },
  { id: '2thessalonians',name: '2 Thessalonians',   shortName: '2 Th',  testament: 'NT', chapters: 3,   available: false, genre: 'Epistle' },
  { id: '1timothy',      name: '1 Timothy',         shortName: '1 Tim', testament: 'NT', chapters: 6,   available: false, genre: 'Epistle' },
  { id: '2timothy',      name: '2 Timothy',         shortName: '2 Tim', testament: 'NT', chapters: 4,   available: false, genre: 'Epistle' },
  { id: 'titus',         name: 'Titus',             shortName: 'Tit',   testament: 'NT', chapters: 3,   available: false, genre: 'Epistle' },
  { id: 'philemon',      name: 'Philemon',          shortName: 'Phlm',  testament: 'NT', chapters: 1,   available: false, genre: 'Epistle' },
  { id: 'hebrews',       name: 'Hebrews',           shortName: 'Heb',   testament: 'NT', chapters: 13,  available: false, genre: 'Epistle' },
  { id: 'james',         name: 'James',             shortName: 'Jas',   testament: 'NT', chapters: 5,   available: false, genre: 'Epistle' },
  { id: '1peter',        name: '1 Peter',           shortName: '1 Pet', testament: 'NT', chapters: 5,   available: false, genre: 'Epistle' },
  { id: '2peter',        name: '2 Peter',           shortName: '2 Pet', testament: 'NT', chapters: 3,   available: false, genre: 'Epistle' },
  { id: '1john',         name: '1 John',            shortName: '1 Jn',  testament: 'NT', chapters: 5,   available: false, genre: 'Epistle' },
  { id: '2john',         name: '2 John',            shortName: '2 Jn',  testament: 'NT', chapters: 1,   available: false, genre: 'Epistle' },
  { id: '3john',         name: '3 John',            shortName: '3 Jn',  testament: 'NT', chapters: 1,   available: false, genre: 'Epistle' },
  { id: 'jude',          name: 'Jude',              shortName: 'Jude',  testament: 'NT', chapters: 1,   available: false, genre: 'Epistle' },
  { id: 'revelation',    name: 'Revelation',        shortName: 'Rev',   testament: 'NT', chapters: 22,  available: false, genre: 'Prophecy' },
];

// ─── Helper ──────────────────────────────────────────────────────────────────

export function getBibleBook(id: string): BibleBook | undefined {
  return BIBLE_BOOKS.find(b => b.id === id);
}

// ─── John — Chapter metadata (all 21) ────────────────────────────────────────

const JOHN_HEADINGS: Record<number, string> = {
  1: 'The Word Became Flesh',
  2: 'Water into Wine · Cleansing the Temple',
  3: 'Jesus and Nicodemus',
  4: 'The Woman at the Well',
  5: 'The Healing at the Pool',
  6: 'Bread of Life',
  7: 'Jesus at the Festival',
  8: 'Light of the World',
  9: 'The Man Born Blind',
  10: 'The Good Shepherd',
  11: 'The Raising of Lazarus',
  12: 'The Triumphal Entry',
  13: 'Jesus Washes His Disciples\' Feet',
  14: 'Jesus Comforts His Disciples',
  15: 'The Vine and the Branches',
  16: 'The Work of the Holy Spirit',
  17: 'Jesus Prays for His Disciples',
  18: 'The Arrest and Trial of Jesus',
  19: 'The Crucifixion',
  20: 'The Resurrection',
  21: 'Jesus Appears by the Sea',
};

const JOHN_READING_MINUTES: Record<number, number> = {
  1: 7, 2: 4, 3: 5, 4: 7, 5: 6, 6: 9, 7: 7, 8: 8,
  9: 6, 10: 6, 11: 7, 12: 7, 13: 5, 14: 4, 15: 4,
  16: 5, 17: 4, 18: 5, 19: 6, 20: 4, 21: 4,
};

// Sermon ref for John 3 → links to DEMO_JOHN_SERMON in admin-demo-data
const JOHN_SERMON_REFS: Record<number, string[]> = {
  3: ['sermon-john-3'],
  1: [],
  2: [],
};

// Sermon segments with timestamps for Preached Here
export const JOHN_SERMON_LINKS: Record<number, Array<{ sermonId: string; timestampSeconds: number; note?: string }>> = {
  3: [{ sermonId: 'sermon-john-3', timestampSeconds: 1274, note: 'Jesus explains what it means to be born again' }],
};

// ─── John 1 verses (KJV — Public Domain) ─────────────────────────────────────

const JOHN_1_VERSES: BibleVerse[] = [
  { verse: 1, text: 'In the beginning was the Word, and the Word was with God, and the Word was God.' },
  { verse: 2, text: 'The same was in the beginning with God.' },
  { verse: 3, text: 'All things were made by him; and without him was not any thing made that was made.' },
  { verse: 4, text: 'In him was life; and the life was the light of men.' },
  { verse: 5, text: 'And the light shineth in darkness; and the darkness comprehended it not.' },
  { verse: 6, text: 'There was a man sent from God, whose name was John.' },
  { verse: 7, text: 'The same came for a witness, to bear witness of the Light, that all men through him might believe.' },
  { verse: 8, text: 'He was not that Light, but was sent to bear witness of that Light.' },
  { verse: 9, text: 'That was the true Light, which lighteth every man that cometh into the world.' },
  { verse: 10, text: 'He was in the world, and the world was made by him, and the world knew him not.' },
  { verse: 11, text: 'He came unto his own, and his own received him not.' },
  { verse: 12, text: 'But as many as received him, to them gave he power to become the sons of God, even to them that believe on his name:' },
  { verse: 13, text: 'Which were born, not of blood, nor of the will of the flesh, nor of the will of man, but of God.' },
  { verse: 14, text: 'And the Word was made flesh, and dwelt among us, (and we beheld his glory, the glory as of the only begotten of the Father,) full of grace and truth.' },
  { verse: 15, text: 'John bare witness of him, and cried, saying, This was he of whom I spake, He that cometh after me is preferred before me: for he was before me.' },
  { verse: 16, text: 'And of his fulness have all we received, and grace for grace.' },
  { verse: 17, text: 'For the law was given by Moses, but grace and truth came by Jesus Christ.' },
  { verse: 18, text: 'No man hath seen God at any time; the only begotten Son, which is in the bosom of the Father, he hath declared him.' },
  { verse: 19, text: 'And this is the record of John, when the Jews sent priests and Levites from Jerusalem to ask him, Who art thou?' },
  { verse: 20, text: 'And he confessed, and denied not; but confessed, I am not the Christ.' },
  { verse: 21, text: 'And they asked him, What then? Art thou Elias? And he saith, I am not. Art thou that prophet? And he answered, No.' },
  { verse: 22, text: 'Then said they unto him, Who art thou? that we may give an answer to them that sent us. What sayest thou of thyself?' },
  { verse: 23, text: 'He said, I am the voice of one crying in the wilderness, Make straight the way of the Lord, as said the prophet Esaias.' },
  { verse: 24, text: 'And they which were sent were of the Pharisees.' },
  { verse: 25, text: 'And they asked him, and said unto him, Why baptizest thou then, if thou be not that Christ, nor Elias, neither that prophet?' },
  { verse: 26, text: 'John answered them, saying, I baptize with water: but there standeth one among you, whom ye know not;' },
  { verse: 27, text: 'He it is, who coming after me is preferred before me, whose shoe\'s latchet I am not worthy to unloose.' },
  { verse: 28, text: 'These things were done in Bethabara beyond Jordan, where John was baptizing.' },
  { verse: 29, text: 'The next day John seeth Jesus coming unto him, and saith, Behold the Lamb of God, which taketh away the sin of the world.' },
  { verse: 30, text: 'This is he of whom I said, After me cometh a man which is preferred before me: for he was before me.' },
  { verse: 31, text: 'And I knew him not: but that he should be made manifest to Israel, therefore am I come baptizing with water.' },
  { verse: 32, text: 'And John bare record, saying, I saw the Spirit descending from heaven like a dove, and it abode upon him.' },
  { verse: 33, text: 'And I knew him not: but he that sent me to baptize with water, the same said unto me, Upon whom thou shalt see the Spirit descending, and remaining on him, the same is he which baptizeth with the Holy Ghost.' },
  { verse: 34, text: 'And I saw, and bare record that this is the Son of God.' },
  { verse: 35, text: 'Again the next day after John stood, and two of his disciples;' },
  { verse: 36, text: 'And looking upon Jesus as he walked, he saith, Behold the Lamb of God!' },
  { verse: 37, text: 'And the two disciples heard him speak, and they followed Jesus.' },
  { verse: 38, text: 'Then Jesus turned, and saw them following, and saith unto them, What seek ye? They said unto him, Rabbi, (which is to say, being interpreted, Master,) where dwellest thou?' },
  { verse: 39, text: 'He saith unto them, Come and see. They came and saw where he dwelt, and abode with him that day: for it was about the tenth hour.' },
  { verse: 40, text: 'One of the two which heard John speak, and followed him, was Andrew, Simon Peter\'s brother.' },
  { verse: 41, text: 'He first findeth his own brother Simon, and saith unto him, We have found the Messias, which is, being interpreted, the Christ.' },
  { verse: 42, text: 'And he brought him to Jesus. And when Jesus beheld him, he said, Thou art Simon the son of Jona: thou shalt be called Cephas, which is by interpretation, A stone.' },
  { verse: 43, text: 'The day following Jesus would go forth into Galilee, and findeth Philip, and saith unto him, Follow me.' },
  { verse: 44, text: 'Now Philip was of Bethsaida, the city of Andrew and Peter.' },
  { verse: 45, text: 'Philip findeth Nathanael, and saith unto him, We have found him, of whom Moses in the law, and the prophets, did write, Jesus of Nazareth, the son of Joseph.' },
  { verse: 46, text: 'And Nathanael said unto him, Can there any good thing come out of Nazareth? Philip saith unto him, Come and see.' },
  { verse: 47, text: 'Jesus saw Nathanael coming to him, and saith of him, Behold an Israelite indeed, in whom is no guile!' },
  { verse: 48, text: 'Nathanael saith unto him, Whence knowest thou me? Jesus answered and said unto him, Before that Philip called thee, when thou wast under the fig tree, I saw thee.' },
  { verse: 49, text: 'Nathanael answered and saith unto him, Rabbi, thou art the Son of God; thou art the King of Israel.' },
  { verse: 50, text: 'Jesus answered and said unto him, Because I said unto thee, I saw thee under the fig tree, believest thou? thou shalt see greater things than these.' },
  { verse: 51, text: 'And he saith unto him, Verily, verily, I say unto you, Hereafter ye shall see heaven open, and the angels of God ascending and descending upon the Son of man.' },
];

// ─── John 2 verses (KJV) ─────────────────────────────────────────────────────

const JOHN_2_VERSES: BibleVerse[] = [
  { verse: 1, text: 'And the third day there was a marriage in Cana of Galilee; and the mother of Jesus was there:' },
  { verse: 2, text: 'And both Jesus was called, and his disciples, to the marriage.' },
  { verse: 3, text: 'And when they wanted wine, the mother of Jesus saith unto him, They have no wine.' },
  { verse: 4, text: 'Jesus saith unto her, Woman, what have I to do with thee? mine hour is not yet come.' },
  { verse: 5, text: 'His mother saith unto the servants, Whatsoever he saith unto you, do it.' },
  { verse: 6, text: 'And there were set there six waterpots of stone, after the manner of the purifying of the Jews, containing two or three firkins apiece.' },
  { verse: 7, text: 'Jesus saith unto them, Fill the waterpots with water. And they filled them up to the brim.' },
  { verse: 8, text: 'And he saith unto them, Draw out now, and bear unto the governor of the feast. And they bare it.' },
  { verse: 9, text: 'When the ruler of the feast had tasted the water that was made wine, and knew not whence it was: (but the servants which drew the water knew;) the governor of the feast called the bridegroom,' },
  { verse: 10, text: 'And saith unto him, Every man at the beginning doth set forth good wine; and when men have well drunk, then that which is worse: but thou hast kept the good wine until now.' },
  { verse: 11, text: 'This beginning of miracles did Jesus in Cana of Galilee, and manifested his glory; and his disciples believed on him.' },
  { verse: 12, text: 'After this he went down to Capernaum, he, and his mother, and his brethren, and his disciples: and they continued there not many days.' },
  { verse: 13, text: "And the Jews' passover was at hand, and Jesus went up to Jerusalem." },
  { verse: 14, text: 'And found in the temple those that sold oxen and sheep and doves, and the changers of money sitting:' },
  { verse: 15, text: "And when he had made a scourge of small cords, he drove them all out of the temple, and the sheep, and the oxen; and poured out the changers' money, and overthrew the tables;" },
  { verse: 16, text: "And said unto them that sold doves, Take these things hence; make not my Father's house an house of merchandise." },
  { verse: 17, text: 'And his disciples remembered that it was written, The zeal of thine house hath eaten me up.' },
  { verse: 18, text: 'Then answered the Jews and said unto him, What sign shewest thou unto us, seeing that thou doest these things?' },
  { verse: 19, text: 'Jesus answered and said unto them, Destroy this temple, and in three days I will raise it up.' },
  { verse: 20, text: 'Then said the Jews, Forty and six years was this temple in building, and wilt thou rear it up in three days?' },
  { verse: 21, text: 'But he spake of the temple of his body.' },
  { verse: 22, text: 'When therefore he was risen from the dead, his disciples remembered that he had said this unto them; and they believed the scripture, and the word which Jesus had said.' },
  { verse: 23, text: 'Now when he was in Jerusalem at the passover, in the feast day, many believed in his name, when they saw the miracles which he did.' },
  { verse: 24, text: 'But Jesus did not commit himself unto them, because he knew all men,' },
  { verse: 25, text: 'And needed not that any should testify of man: for he knew what was in man.' },
];

// ─── John 3 verses (KJV) ─────────────────────────────────────────────────────

const JOHN_3_VERSES: BibleVerse[] = [
  { verse: 1, text: 'There was a man of the Pharisees, named Nicodemus, a ruler of the Jews:' },
  { verse: 2, text: 'The same came to Jesus by night, and said unto him, Rabbi, we know that thou art a teacher come from God: for no man can do these miracles that thou doest, except God be with him.' },
  { verse: 3, text: 'Jesus answered and said unto him, Verily, verily, I say unto thee, Except a man be born again, he cannot see the kingdom of God.' },
  { verse: 4, text: 'Nicodemus saith unto him, How can a man be born when he is old? can he enter the second time into his mother\'s womb, and be born?' },
  { verse: 5, text: 'Jesus answered, Verily, verily, I say unto thee, Except a man be born of water and of the Spirit, he cannot enter into the kingdom of God.' },
  { verse: 6, text: 'That which is born of the flesh is flesh; and that which is born of the Spirit is spirit.' },
  { verse: 7, text: 'Marvel not that I said unto thee, Ye must be born again.' },
  { verse: 8, text: 'The wind bloweth where it listeth, and thou hearest the sound thereof, but canst not tell whence it cometh, and whither it goeth: so is every one that is born of the Spirit.' },
  { verse: 9, text: 'Nicodemus answered and said unto him, How can these things be?' },
  { verse: 10, text: 'Jesus answered and said unto him, Art thou a master of Israel, and knowest not these things?' },
  { verse: 11, text: 'Verily, verily, I say unto thee, We speak that we do know, and testify that we have seen; and ye receive not our witness.' },
  { verse: 12, text: 'If I have told you earthly things, and ye believe not, how shall ye believe, if I tell you of heavenly things?' },
  { verse: 13, text: 'And no man hath ascended up to heaven, but he that came down from heaven, even the Son of man which is in heaven.' },
  { verse: 14, text: 'And as Moses lifted up the serpent in the wilderness, even so must the Son of man be lifted up:' },
  { verse: 15, text: 'That whosoever believeth in him should not perish, but have eternal life.' },
  { verse: 16, text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.' },
  { verse: 17, text: 'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.' },
  { verse: 18, text: 'He that believeth on him is not condemned: but he that believeth not is condemned already, because he hath not believed in the name of the only begotten Son of God.' },
  { verse: 19, text: 'And this is the condemnation, that light is come into the world, and men loved darkness rather than light, because their deeds were evil.' },
  { verse: 20, text: 'For every one that doeth evil hateth the light, neither cometh to the light, lest his deeds should be reproved.' },
  { verse: 21, text: 'But he that doeth truth cometh to the light, that his deeds may be made manifest, that they are wrought in God.' },
  { verse: 22, text: 'After these things came Jesus and his disciples into the land of Judaea; and there he tarried with them, and baptized.' },
  { verse: 23, text: 'And John also was baptizing in Aenon near to Salim, because there was much water there: and they came, and were baptized.' },
  { verse: 24, text: 'For John was not yet cast into prison.' },
  { verse: 25, text: "Then there arose a question between some of John's disciples and the Jews about purifying." },
  { verse: 26, text: 'And they came unto John, and said unto him, Rabbi, he that was with thee beyond Jordan, to whom thou barest witness, behold, the same baptizeth, and all men come to him.' },
  { verse: 27, text: 'John answered and said, A man can receive nothing, except it be given him from heaven.' },
  { verse: 28, text: 'Ye yourselves bear me witness, that I said, I am not the Christ, but that I am sent before him.' },
  { verse: 29, text: 'He that hath the bride is the bridegroom: but the friend of the bridegroom, which standeth and heareth him, rejoiceth greatly because of the bridegroom\'s voice: this my joy therefore is fulfilled.' },
  { verse: 30, text: 'He must increase, but I must decrease.' },
  { verse: 31, text: 'He that cometh from above is above all: he that is of the earth is earthly, and speaketh of the earth: he that cometh from heaven is above all.' },
  { verse: 32, text: 'And what he hath seen and heard, that he testifieth; and no man receiveth his testimony.' },
  { verse: 33, text: 'He that hath received his testimony hath set to his seal that God is true.' },
  { verse: 34, text: 'For he whom God hath sent speaketh the words of God: for God giveth not the Spirit by measure unto him.' },
  { verse: 35, text: 'The Father loveth the Son, and hath given all things into his hand.' },
  { verse: 36, text: 'He that believeth on the Son hath everlasting life: and he that believeth not the Son shall not see life; but the wrath of God abideth on him.' },
];

// ─── Placeholder verses for chapters 4–21 ────────────────────────────────────

function placeholderVerses(chapter: number): BibleVerse[] {
  return [
    {
      verse: 1,
      text: `[Development placeholder — John ${chapter} full text will be available when the complete Bible is connected. The architecture is ready.]`,
    },
  ];
}

// ─── Journey content for John 1–3 ────────────────────────────────────────────

const JOHN_1_JOURNEY_CONTENT = {
  journeyIntro: 'John opens not with a birth narrative but with eternity itself. "In the beginning was the Word." Before anything existed, Jesus existed. As you read this chapter, notice how John answers the question every human heart asks: who is Jesus, really? Watch for the moment John the Baptist points and says, "Behold the Lamb of God."',
  prayerPrompt: 'Lord Jesus, you are the Word who became flesh and dwelt among us. Thank you that you did not stay distant — you came close. Open my eyes today to see who you really are. I want to know you, not just know about you. Amen.',
  goDeeper: [
    { type: 'cross-reference' as const, title: 'Genesis 1:1', description: 'John echoes Genesis deliberately — both begin "In the beginning." Jesus is the new creation.', reference: 'Genesis 1:1' },
    { type: 'cross-reference' as const, title: 'Isaiah 40:3', description: 'John the Baptist\'s role as the voice in the wilderness was foretold 700 years earlier.', reference: 'Isaiah 40:3' },
    { type: 'emmaus-journey' as const, title: '15 Minutes with Jesus', description: 'A short guided journey to help you connect with Jesus daily.', journeyId: '15-minutes-with-jesus' },
  ] as GoDeeperItem[],
  askEmmaus: [
    {
      prompt: 'Who is the Word in John 1?',
      answer: {
        explanation: 'The "Word" (Greek: Logos) is Jesus Christ. John uses this term to introduce Jesus as the one through whom God speaks and acts — the eternal, divine Son who existed before creation and was the agent of all creation.',
        historicalContext: 'Logos was a familiar concept in both Jewish and Greek thought. Jews connected it to God\'s creative word in Genesis. Greeks used it for the rational principle underlying the universe. John takes this familiar term and fills it with new meaning: the Logos is a person.',
        practicalApplication: 'Jesus is not an idea or a system of thought — he is a person who can be known. The same creative power that spoke the universe into being is the same power at work in your life today.',
        churchInsight: 'The opening of John\'s Gospel is one of the clearest statements of the divinity of Christ in all of Scripture. It is foundational to understanding who Jesus is.',
      },
    },
    {
      prompt: 'What does "the Word became flesh" mean?',
      answer: {
        explanation: 'In verse 14, John declares that the eternal, divine Word took on full human nature. Jesus did not merely appear human — he became human while remaining fully God. This is called the Incarnation.',
        historicalContext: 'The Incarnation was a stumbling block for many in the ancient world. Greek philosophy taught that the material world was inferior to the spiritual. The idea that God would take on flesh seemed unthinkable. John asserts it boldly.',
        practicalApplication: 'The Incarnation means God knows what it is to be you. Jesus experienced hunger, tiredness, grief, and temptation. He is not a distant God. He is Emmanuel — God with us.',
      },
    },
    {
      prompt: 'What did Jesus mean by "Come and see"?',
      answer: {
        explanation: 'When the disciples asked where Jesus was staying, he did not give a theological lecture. He simply said, "Come and see." This is an invitation to personal encounter, not just intellectual understanding.',
        historicalContext: 'Rabbi-disciple relationships in first-century Judaism involved following and living with a teacher. Jesus was inviting these men into exactly that kind of life-shaping relationship.',
        practicalApplication: 'Jesus still extends the same invitation. The question is not "Do you understand everything about me?" but "Will you come and see?" Faith begins with a willingness to draw close.',
      },
    },
    {
      prompt: 'Who was John the Baptist?',
      answer: {
        explanation: 'John the Baptist was a prophet sent by God to prepare the way for Jesus. He was not the Messiah, and he was clear about that. His entire purpose was to point people to Jesus: "Behold the Lamb of God."',
        historicalContext: 'John operated in the wilderness near the Jordan River, baptising those who repented. He was a recognisable figure — many wondered if he was the Messiah or the returning Elijah. He consistently denied it.',
        practicalApplication: 'John models a posture we all need: "He must increase, but I must decrease" (3:30). True ministry and true faith point away from ourselves and toward Jesus.',
      },
    },
  ] as AskEmmausQA[],
};

const JOHN_2_JOURNEY_CONTENT = {
  journeyIntro: 'In this chapter, Jesus performs his first miracle — not in the temple or synagogue, but at a wedding. He turns water into wine and then dramatically clears the temple. Both actions are signs that something new and better has arrived. Watch for what these two stories reveal about who Jesus is and what he has come to do.',
  prayerPrompt: 'Jesus, you turned ordinary water into extraordinary wine. You bring life where there is lack, and you are full of surprises. Show me today where you are at work in the ordinary moments of my life. Give me eyes to see your glory. Amen.',
  goDeeper: [
    { type: 'cross-reference' as const, title: 'Malachi 3:1', description: 'The cleansing of the temple echoes the prophecy: "The Lord will suddenly come to his temple."', reference: 'Malachi 3:1' },
    { type: 'cross-reference' as const, title: 'Psalm 69:9', description: 'The disciples remembered this psalm — "Zeal for your house has consumed me" — as they watched Jesus.', reference: 'Psalm 69:9' },
    { type: 'resource' as const, title: 'The Seven Signs of John', description: 'John structures his gospel around seven miracles he calls "signs." The wedding at Cana is the first.', isDevelopmentCard: true },
  ] as GoDeeperItem[],
  askEmmaus: [
    {
      prompt: 'Why did Jesus turn water into wine?',
      answer: {
        explanation: 'This was the first of seven signs John records, chosen to reveal Jesus\'s glory and lead his disciples to believe. Jesus did not merely solve a social embarrassment — he demonstrated that he has authority over the physical world and that he cares about human joy.',
        historicalContext: 'Running out of wine at a wedding would have been a serious shame for the family. Wine in Hebrew thought was also a symbol of joy, abundance, and the blessing of God. Jesus restoring the wine points forward to the fullness of God\'s kingdom.',
        practicalApplication: 'Jesus turns up at ordinary celebrations. He is not confined to religious settings. He cares about your everyday life and he brings abundance, not scarcity, to those who invite him in.',
      },
    },
    {
      prompt: 'Why did Jesus cleanse the temple?',
      answer: {
        explanation: 'The money-changers and animal sellers had turned a space meant for prayer and encounter with God into a marketplace. Jesus was acting as a prophet, declaring that the temple should be a place of genuine worship — and pointing to himself as the new temple.',
        historicalContext: 'The Court of the Gentiles — where the trading occurred — was the only place non-Jews could come to pray. The commercial activity effectively excluded them. Jesus was defending access to God for all people.',
        practicalApplication: 'What are the things in our hearts and churches that crowd out genuine encounter with God? Jesus is still concerned about anything that prevents people from drawing near.',
      },
    },
    {
      prompt: 'What did Jesus mean: "Destroy this temple and in three days I will raise it up"?',
      answer: {
        explanation: 'Jesus was speaking about his own body — his death and resurrection. The disciples only understood this later, after the resurrection. It is one of the earliest hints in John that Jesus knew exactly what was coming.',
        historicalContext: 'Herod\'s temple had been under construction for 46 years. The idea of rebuilding it in three days was absurd to his hearers — which is why they misunderstood. Jesus often spoke in ways that required spiritual perception to grasp.',
        practicalApplication: 'Jesus is the new temple — the meeting place between God and humanity. You do not need to travel to a holy building to encounter God. Through Jesus, God\'s presence is always accessible.',
      },
    },
  ] as AskEmmausQA[],
};

const JOHN_3_JOURNEY_CONTENT = {
  journeyIntro: 'A religious leader comes to Jesus under cover of darkness and leaves transformed by three of the most important words in the Bible: "born again." This chapter contains John 3:16 — perhaps the most memorised verse in Scripture. But do not rush past what surrounds it. Nicodemus represents every person who is religiously serious but still searching for something more.',
  prayerPrompt: 'Father, you loved the world so much that you gave your only Son. Thank you that Jesus did not come to condemn me but to save me. I want to step into the light — to live openly before you. Help me receive your love today. Amen.',
  goDeeper: [
    { type: 'cross-reference' as const, title: 'Numbers 21:4–9', description: 'Jesus refers to Moses lifting up the bronze serpent. This is the Old Testament background to "the Son of Man must be lifted up."', reference: 'Numbers 21:4-9' },
    { type: 'cross-reference' as const, title: 'Ezekiel 36:25–27', description: 'Ezekiel promised a coming day when God would give a new spirit and a new heart — the rebirth Jesus describes.', reference: 'Ezekiel 36:25-27' },
    {
      type: 'emmaus-journey' as const,
      title: 'Understanding Salvation',
      description: 'A journey exploring what it means to be born again and what salvation really is.',
      journeyId: 'understanding-salvation',
      isDevelopmentCard: true,
    },
    { type: 'cross-reference' as const, title: 'John 3:16', description: 'The most famous verse in the Bible is embedded in a nighttime conversation with a religious insider.', reference: 'John 3:16' },
  ] as GoDeeperItem[],
  askEmmaus: [
    {
      prompt: 'What does "born again" mean?',
      answer: {
        explanation: 'To be "born again" (Greek: gennēthē anōthen, also translated "born from above") means to receive new spiritual life from God. It is not a reform of the old self but a new creation — a transformation that only the Holy Spirit can bring about.',
        historicalContext: 'Nicodemus was a Pharisee — one of the most religiously accomplished people in Jewish society. Jesus was telling him that his religious achievement could not earn this new life. It must be received, not achieved.',
        practicalApplication: 'Being born again is not about trying harder. It is about trusting Jesus and receiving his Spirit. If you have never experienced this new life, you can ask for it right now. If you have, remember that your new identity is not based on your performance but on what God has done in you.',
        churchInsight: 'The new birth is the beginning of the Christian life — not its completion. It is the door, not the whole house. The invitation is open to everyone who will receive it.',
      },
    },
    {
      prompt: 'Why did Nicodemus come at night?',
      answer: {
        explanation: 'John notes that Nicodemus came "by night." This may reflect fear — as a member of the Sanhedrin, being seen with Jesus could damage his reputation. But "night" in John is also a theological symbol: Nicodemus was in the darkness and came to the Light.',
        historicalContext: 'The Pharisees were increasingly hostile to Jesus. Nicodemus risked social and religious standing by seeking this conversation. Yet John 7:50 and 19:39 show he grew in courage — eventually he helped bury Jesus.',
        practicalApplication: 'Many people seek Jesus privately, uncertain whether it is safe to be open about their search. Jesus welcomed Nicodemus as he was — and he welcomes you wherever you are in your journey.',
      },
    },
    {
      prompt: 'What is John 3:16 really about?',
      answer: {
        explanation: 'John 3:16 is the heart of the gospel in one sentence: God\'s love is the motivation, the gift of his Son is the means, belief is the response, and everlasting life is the result. It is not primarily about what you must do — it is about what God has already done.',
        historicalContext: 'The word "world" (Greek: kosmos) here means all of humanity — including those considered unworthy, outsiders, and enemies. The scope of God\'s love in this verse is without limit.',
        practicalApplication: 'This verse is not just for memorisation. It is an invitation. God loved you specifically, gave his Son for you specifically, and offers life to you specifically. The question John asks in this gospel is: will you believe?',
        churchInsight: 'Verse 16 must be read in its context. God did not send Jesus to condemn (v.17). The light came into the world (v.19). The question is not whether God is for you — he is. The question is whether you will come to the light.',
      },
    },
    {
      prompt: 'What does the wind mean in John 3:8?',
      answer: {
        explanation: 'Jesus uses the wind as an analogy for the Holy Spirit. In Greek (and Hebrew), the word for "wind," "breath," and "spirit" is the same. You cannot see the wind but you can see its effects. Likewise, you cannot fully explain or control the Spirit — you can only experience his transforming work.',
        historicalContext: 'Nicodemus wanted a logical explanation. Jesus responded with a mystery. This was not evasion — it was an invitation to trust something beyond human reasoning.',
        practicalApplication: 'You do not need to fully understand the Holy Spirit to experience him. You need to be willing to let him blow where he will in your life.',
      },
    },
  ] as AskEmmausQA[],
};

// ─── John Chapters Data ───────────────────────────────────────────────────────

export function getJohnChapter(chapter: number): BibleChapter {
  const base = {
    bookId: 'john',
    chapter,
    heading: JOHN_HEADINGS[chapter] ?? `John ${chapter}`,
    readingMinutes: JOHN_READING_MINUTES[chapter] ?? 5,
    sermonRefs: JOHN_SERMON_REFS[chapter] ?? [],
  };

  if (chapter === 1) return { ...base, verses: JOHN_1_VERSES, ...JOHN_1_JOURNEY_CONTENT };
  if (chapter === 2) return { ...base, verses: JOHN_2_VERSES, ...JOHN_2_JOURNEY_CONTENT };
  if (chapter === 3) return { ...base, verses: JOHN_3_VERSES, ...JOHN_3_JOURNEY_CONTENT };

  // Chapters 4–21: placeholder
  return {
    ...base,
    verses: placeholderVerses(chapter),
    isPlaceholder: true,
    journeyIntro: `[Development placeholder — chapter introduction for John ${chapter} will be seeded when the full Walk Through John journey is completed.]`,
    prayerPrompt: `[Development placeholder — prayer for John ${chapter} coming soon.]`,
    goDeeper: [],
    askEmmaus: [],
  };
}

// ─── Bible Journeys ───────────────────────────────────────────────────────────

export const BIBLE_JOURNEYS: BibleJourney[] = [
  {
    id: 'walk-through-john',
    title: 'Walk Through John',
    subtitle: 'Discover who Jesus is',
    description: 'Journey through all 21 chapters of the Gospel of John. Each chapter is one step. Meet Jesus as he really is — the Word made flesh, the Lamb of God, the resurrection and the life.',
    bookId: 'john',
    chapterCount: 21,
    available: true,
    coverLabel: '21 Chapters',
  },
  {
    id: 'new-to-jesus',
    title: 'New to Jesus',
    subtitle: '7 Days',
    description: 'A 7-day introduction to Jesus for those who are exploring faith for the first time or returning after a long absence.',
    bookId: 'john',
    chapterCount: 7,
    available: false,
    coverLabel: '7 Days',
  },
  {
    id: 'psalms-for-difficult-days',
    title: 'Psalms for Difficult Days',
    subtitle: 'Finding God in the hard places',
    description: 'A journey through the honest prayers of the Psalms — for grief, anxiety, confusion, and the longing for God.',
    bookId: 'psalms',
    chapterCount: 14,
    available: false,
    coverLabel: '14 Days',
  },
  {
    id: 'acts',
    title: 'Acts',
    subtitle: 'The Spirit-empowered church',
    description: 'Walk through the birth of the church and be inspired by the Spirit-filled men and women who turned the world upside down.',
    bookId: 'acts',
    chapterCount: 28,
    available: false,
    coverLabel: '28 Chapters',
  },
  {
    id: 'foundations',
    title: 'Foundations',
    subtitle: 'Core truths of the Christian faith',
    description: 'A journey through key passages that lay the foundation for a lifetime of following Jesus.',
    bookId: 'john',
    chapterCount: 10,
    available: false,
    coverLabel: '10 Days',
  },
];

export function getBibleJourney(id: string): BibleJourney | undefined {
  return BIBLE_JOURNEYS.find(j => j.id === id);
}

// ─── Weekly Memory Verse ──────────────────────────────────────────────────────

export const WEEKLY_MEMORY_VERSE: WeeklyMemoryVerse = {
  reference: 'John 3:16',
  text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
  weekOf: 'This week',
};

// ─── Today\'s Reading (prototype — later driven by journey/plan/recommendation) ─

export const TODAYS_READING = {
  bookId: 'john',
  chapter: 15,
  heading: 'The Vine and the Branches',
  readingMinutes: 4,
};
