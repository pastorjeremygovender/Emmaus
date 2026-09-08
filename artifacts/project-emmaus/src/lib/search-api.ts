/**
 * Global Search API — unified search across all Emmaus content.
 */

export interface SearchResult {
  id: string;
  contentType: string;
  title: string;
  subtitle?: string;
  route: string;
}

export const CONTENT_TYPE_LABEL: Record<string, string> = {
  journey:           'Walk',
  'daily-rhythm':    'Daily Walk',
  'bible-study':     'Bible Study',
  devotional:        'Daily Devotional',
  'sermon-companion': 'Sermon Companion',
  sermon:            'Sermon',
  'bible-verse':     'Bible Verse',
  'bible-chapter':   'Bible Chapter',
};

export async function globalSearch(query: string): Promise<SearchResult[]> {
  if (!query.trim() || query.trim().length < 2) return [];
  const params = new URLSearchParams({ q: query });
  const res = await fetch(`/api/search?${params.toString()}`);
  if (!res.ok) throw new Error('Search failed');
  const data = (await res.json()) as { results: SearchResult[] };
  return data.results;
}
