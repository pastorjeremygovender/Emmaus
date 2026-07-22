// KJV John — Scripture Data (Public Domain)
// Chapters 1–3 with full KJV text; 4–21 kept as placeholders.
// Maintained for backward compatibility while Luke is the flagship book.

import type { BibleVerse } from '../lib/bible-provider';

export const JOHN_HEADINGS: Record<number, string> = {
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
  13: "Jesus Washes His Disciples' Feet",
  14: 'Jesus Comforts His Disciples',
  15: 'The Vine and the Branches',
  16: 'The Work of the Holy Spirit',
  17: 'Jesus Prays for His Disciples',
  18: 'The Arrest and Trial of Jesus',
  19: 'The Crucifixion',
  20: 'The Resurrection',
  21: 'Jesus Appears by the Sea',
};

export const JOHN_READING_MINUTES: Record<number, number> = {
  1: 7, 2: 4, 3: 5, 4: 7, 5: 6, 6: 9, 7: 7, 8: 8,
  9: 6, 10: 6, 11: 7, 12: 7, 13: 5, 14: 4, 15: 4,
  16: 5, 17: 4, 18: 5, 19: 6, 20: 4, 21: 4,
};

export const JOHN_SERMON_REFS_MAP: Record<number, string[]> = {
  1: [], 2: [], 3: ['sermon-john-3'],
};

// ─── John 1 (KJV) ────────────────────────────────────────────────────────────

const JOHN_1: BibleVerse[] = [
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
  { verse: 27, text: "He it is, who coming after me is preferred before me, whose shoe's latchet I am not worthy to unloose." },
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
  { verse: 40, text: "One of the two which heard John speak, and followed him, was Andrew, Simon Peter's brother." },
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

// ─── John 2 (KJV) ────────────────────────────────────────────────────────────

const JOHN_2: BibleVerse[] = [
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

// ─── John 3 (KJV) ────────────────────────────────────────────────────────────

const JOHN_3: BibleVerse[] = [
  { verse: 1, text: 'There was a man of the Pharisees, named Nicodemus, a ruler of the Jews:' },
  { verse: 2, text: 'The same came to Jesus by night, and said unto him, Rabbi, we know that thou art a teacher come from God: for no man can do these miracles that thou doest, except God be with him.' },
  { verse: 3, text: 'Jesus answered and said unto him, Verily, verily, I say unto thee, Except a man be born again, he cannot see the kingdom of God.' },
  { verse: 4, text: "Nicodemus saith unto him, How can a man be born when he is old? can he enter the second time into his mother's womb, and be born?" },
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
  { verse: 29, text: "He that hath the bride is the bridegroom: but the friend of the bridegroom, which standeth and heareth him, rejoiceth greatly because of the bridegroom's voice: this my joy therefore is fulfilled." },
  { verse: 30, text: 'He must increase, but I must decrease.' },
  { verse: 31, text: 'He that cometh from above is above all: he that is of the earth is earthly, and speaketh of the earth: he that cometh from heaven is above all.' },
  { verse: 32, text: 'And what he hath seen and heard, that he testifieth; and no man receiveth his testimony.' },
  { verse: 33, text: 'He that hath received his testimony hath set to his seal that God is true.' },
  { verse: 34, text: 'For he whom God hath sent speaketh the words of God: for God giveth not the Spirit by measure unto him.' },
  { verse: 35, text: 'The Father loveth the Son, and hath given all things into his hand.' },
  { verse: 36, text: 'He that believeth on the Son hath everlasting life: and he that believeth not the Son shall not see life; but the wrath of God abideth on him.' },
];

// ─── Placeholder generator for chapters 4–21 ─────────────────────────────────

function placeholder(chapter: number): BibleVerse[] {
  return [
    {
      verse: 1,
      text: `[John ${chapter} — full text available when the complete Bible is connected. The provider architecture is ready for a licensed translation.]`,
    },
  ];
}

// ─── JOHN_CHAPTERS export ─────────────────────────────────────────────────────

export const JOHN_CHAPTERS: Record<number, BibleVerse[]> = {
  1: JOHN_1,
  2: JOHN_2,
  3: JOHN_3,
  4:  placeholder(4),  5:  placeholder(5),  6:  placeholder(6),
  7:  placeholder(7),  8:  placeholder(8),  9:  placeholder(9),
  10: placeholder(10), 11: placeholder(11), 12: placeholder(12),
  13: placeholder(13), 14: placeholder(14), 15: placeholder(15),
  16: placeholder(16), 17: placeholder(17), 18: placeholder(18),
  19: placeholder(19), 20: placeholder(20), 21: placeholder(21),
};
