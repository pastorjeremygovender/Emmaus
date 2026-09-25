export interface BibleMapPlace {
  id: string;
  name: string;
  coordinates: [number, number]; // longitude, latitude
  region: 'Galilee' | 'Judea';
  locationNote: string;
  description: string;
  source: string;
  passage: { label: string; book: string; chapter: number; start: number; end: number };
}

// Coordinates adapted from OpenBible.info, CC BY 4.0, accessed 2026-09-25.
// These identify places/areas, never the exact spot where an event occurred.
export const bibleMapPlaces: BibleMapPlace[] = [
  { id: 'nazareth', name: 'Nazareth', coordinates: [35.297690, 32.702140], region: 'Galilee',
    locationNote: 'Town location; event site unspecified.',
    description: 'Jesus returned to Nazareth, where He had grown up, and read from Isaiah in the synagogue.',
    source: 'https://www.openbible.info/geo/modern/mb3f688/nazareth',
    passage: { label: 'Luke 4:16–21', book: 'luke', chapter: 4, start: 16, end: 21 } },
  { id: 'bethlehem', name: 'Bethlehem', coordinates: [35.207639, 31.704306], region: 'Judea',
    locationNote: 'Town location; event site unspecified.',
    description: 'Joseph and Mary travelled to Bethlehem, where Jesus was born. The shepherds came to see Him.',
    source: 'https://www.openbible.info/geo/modern/m9b8daa/bethlehem',
    passage: { label: 'Luke 2:4–20', book: 'luke', chapter: 2, start: 4, end: 20 } },
  { id: 'capernaum', name: 'Capernaum', coordinates: [35.575000, 32.881111], region: 'Galilee',
    locationNote: 'Commonly identified with Tell Hum; other proposals exist.',
    description: 'Jesus taught in the synagogue at Capernaum. The people were astonished at the authority of His teaching.',
    source: 'https://www.openbible.info/geo/modern/m66efd0/tell-hum',
    passage: { label: 'Mark 1:21–28', book: 'mark', chapter: 1, start: 21, end: 28 } },
  { id: 'sea-of-galilee', name: 'Sea of Galilee', coordinates: [35.590033, 32.818906], region: 'Galilee',
    locationNote: 'Lake location; the storm’s exact location is unknown.',
    description: 'As Jesus and His disciples crossed the lake, a storm arose. Jesus calmed the wind and the waves.',
    source: 'https://www.openbible.info/geo/modern/m0438ff/sea-of-galilee',
    passage: { label: 'Mark 4:35–41', book: 'mark', chapter: 4, start: 35, end: 41 } },
  { id: 'jerusalem', name: 'Jerusalem', coordinates: [35.234167, 31.776667], region: 'Judea',
    locationNote: 'City location; this marker does not identify the tomb.',
    description: 'The women found the tomb empty. The risen Jesus later appeared to His disciples in Jerusalem.',
    source: 'https://www.openbible.info/geo/modern/m66c5b8/jerusalem',
    passage: { label: 'Luke 24:33–49', book: 'luke', chapter: 24, start: 33, end: 49 } },
  { id: 'emmaus', name: 'Emmaus · possible location', coordinates: [34.989458, 31.839300], region: 'Judea',
    locationNote: 'Disputed. Nicopolis is one of several proposed locations; the route is unknown.',
    description: 'The risen Jesus walked with two disciples, opened the Scriptures to them, and was recognised in the breaking of bread.',
    source: 'https://www.openbible.info/geo/ancient/ae7274b/emmaus',
    passage: { label: 'Luke 24:13–35', book: 'luke', chapter: 24, start: 13, end: 35 } },
];

export function bibleMapPassageUrl(place: BibleMapPlace) {
  const p = place.passage;
  const query = new URLSearchParams({ startVerse: String(p.start), endVerse: String(p.end), returnTo: `/bible/maps?place=${place.id}` });
  return `/bible/read/${p.book}/${p.chapter}?${query}`;
}
