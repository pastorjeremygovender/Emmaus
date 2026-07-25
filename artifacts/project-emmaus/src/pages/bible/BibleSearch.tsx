import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Search, BookOpen, Loader2 } from 'lucide-react';
import { useBible } from '@/contexts/BibleContext';
import { BottomNav } from '@/components/BottomNav';

type SearchResult = {
  bookId: string;
  bookName: string;
  chapter: number;
  verse: number;
  text: string;
  isReference: boolean;
};

export default function BibleSearch() {
  const [, setLocation] = useLocation();
  const { translationId } = useBible();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearched(false);
      setError(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(query.trim());
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, translationId]);

  async function doSearch(q: string) {
    setLoading(true);
    setError(null);
    try {
      const apiBase = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';
      const res = await fetch(`${apiBase}/api/bible/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, translation: translationId }),
      });
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data = await res.json() as { results: SearchResult[] };
      setResults(data.results ?? []);
      setSearched(true);
    } catch {
      setError('Search is not available right now.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function highlightMatch(text: string, q: string): React.ReactNode {
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-amber-200/70 dark:bg-amber-800/50 rounded-sm px-0.5">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[520px] mx-auto gap-3">
          <button
            onClick={() => setLocation('/bible')}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
            aria-label="Back"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 flex items-center gap-2 bg-muted/60 rounded-xl px-3 h-10">
            <Search size={16} className="text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search the Bible (${translationId.toUpperCase()})…`}
              className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground outline-none"
            />
            {loading && <Loader2 size={15} className="text-muted-foreground animate-spin shrink-0" />}
          </div>
        </div>
      </header>

      <main className="px-5 pt-5 max-w-[520px] mx-auto">
        {!searched && !loading && query.length < 2 && (
          <div className="space-y-5 pt-4">
            <p className="text-[13px] text-muted-foreground text-center">
              Search by word, phrase, or reference — e.g. "John 3:16", "Luke 15", "lost sheep"
            </p>
            <div className="space-y-2">
              {['John 3:16', 'Psalm 23:1', 'Isaiah 53', 'Romans 8:28', 'Luke 15'].map(s => (
                <button
                  key={s}
                  onClick={() => setQuery(s)}
                  className="w-full text-left px-4 py-3 rounded-xl bg-card border border-border text-[15px] text-foreground hover:border-primary/30 hover:bg-primary/5 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="text-[14px] text-muted-foreground text-center py-12">{error}</p>
        )}

        {searched && !loading && results.length === 0 && !error && (
          <div className="text-center py-16">
            <p className="text-[16px] text-muted-foreground">No results for "{query}"</p>
            <p className="text-[13px] text-muted-foreground mt-2">Try a different word or reference.</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-[12px] text-muted-foreground">
              {results.length} result{results.length !== 1 ? 's' : ''} in {translationId.toUpperCase()}
            </p>
            <div className="space-y-2">
              {results.map((r, i) => (
                <button
                  key={`${r.bookId}-${r.chapter}-${r.verse}-${i}`}
                  onClick={() => setLocation(`/bible/read/${r.bookId}/${r.chapter}`)}
                  className="w-full text-left p-4 rounded-xl bg-card border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors space-y-1.5"
                >
                  <div className="flex items-center gap-2">
                    <BookOpen size={12} className="text-primary shrink-0" />
                    <span className="text-[12px] font-semibold text-primary uppercase tracking-widest">
                      {r.bookName} {r.chapter}:{r.verse}
                    </span>
                  </div>
                  <p className="text-[14px] text-foreground leading-relaxed font-serif">
                    {r.isReference ? r.text : highlightMatch(r.text, query)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
