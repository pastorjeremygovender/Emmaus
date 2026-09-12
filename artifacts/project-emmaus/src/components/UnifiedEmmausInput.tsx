/**
 * UnifiedEmmausInput — ONE intelligent input bar replacing both AskEmmausBar and
 * the separate search field.
 *
 * Emmaus decides automatically:
 *   • Natural-language question  →  opens Ask Emmaus conversation with message pre-filled
 *   • Short keyword / title / Bible ref  →  shows live search results grouped by type
 *
 * Usage:
 *   <UnifiedEmmausInput onActiveChange={(active) => setHideTabs(active)} />
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Search, Mic, X, Loader2, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useVoiceEnabled } from '@/hooks/useVoiceEnabled';
import { useJourney } from '@/contexts/JourneyContext';
import { useBible } from '@/contexts/BibleContext';
import { cn } from '@/lib/utils';
import { globalSearch, type SearchResult, CONTENT_TYPE_LABEL } from '@/lib/search-api';
import {
  setPendingMessage,
  setPendingContext,
  setReturnDestination,
  sourceSectionFromPath,
} from '@/lib/emmaus-pending';
import type { FlatContext } from '@/lib/emmaus-client';
import { buildEmmausScreenContext } from '@/lib/emmaus-screen-context';
import { unlockVoiceAudio } from '@/lib/voice-audio-unlock';

// ─── Intent detection ─────────────────────────────────────────────────────────

const QUESTION_STARTERS = new Set([
  'how', 'why', 'what', 'who', 'where', 'when',
  'can', 'should', 'would', 'could', 'will',
  'does', 'do', 'is', 'are', 'was', 'were', 'am',
  'help', 'tell',
]);

// Bible book names — queries matching these are treated as searches, not questions.
// Includes abbreviated/shared names (e.g. "corinthians" covers 1 & 2 Corinthians).
// "song" catches "Song of Solomon" / "Song of Songs".
const BIBLE_BOOKS = new Set([
  'genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy', 'joshua', 'judges',
  'ruth', 'samuel', 'kings', 'chronicles', 'ezra', 'nehemiah', 'esther', 'job',
  'psalm', 'psalms', 'proverbs', 'ecclesiastes', 'song', 'isaiah', 'jeremiah',
  'lamentations', 'ezekiel', 'daniel', 'hosea', 'joel', 'amos', 'obadiah',
  'jonah', 'micah', 'nahum', 'habakkuk', 'zephaniah', 'haggai', 'zechariah',
  'malachi', 'matthew', 'mark', 'luke', 'john', 'acts', 'romans',
  'corinthians', 'galatians', 'ephesians', 'philippians', 'colossians',
  'thessalonians', 'timothy', 'titus', 'philemon', 'hebrews', 'james',
  'peter', 'jude', 'revelation',
]);

function detectIntent(input: string): 'question' | 'search' {
  const text = input.trim().toLowerCase();
  if (!text || text.length < 2) return 'search';

  // Explicit question marker
  if (text.endsWith('?')) return 'question';

  // First-person / personal openers
  if (/^i['']?m\b/.test(text) || /^i\s+\w/.test(text) || /^my\s/.test(text)) return 'question';

  const words = text.split(/\s+/);
  const firstWord = words[0];

  // Question word at start
  if (QUESTION_STARTERS.has(firstWord)) return 'question';

  // Bible reference — bare or with chapter/verse keywords (e.g. "John 3", "Romans 8:28",
  // "Romans chapter 8 verse 28"). Up to 6 tokens to cover "Book chapter N verse N".
  if (BIBLE_BOOKS.has(firstWord) && words.length <= 6) return 'search';

  // Numbered Bible books (e.g. "1 John 3", "2 Corinthians chapter 13 verse 4").
  // First token is a digit; second token is a recognised book name.
  if (/^\d+$/.test(firstWord) && words.length >= 2 && BIBLE_BOOKS.has(words[1]) && words.length <= 6) return 'search';

  // Long natural-language sentences are questions
  if (words.length >= 5) return 'question';

  return 'search';
}

// ─── Result grouping ──────────────────────────────────────────────────────────

type GroupedResults = Record<string, SearchResult[]>;

// Canonical display order for result groups
const TYPE_ORDER = [
  'journey', 'bible-study', 'daily-rhythm',
  'devotional', 'sermon-companion', 'sermon',
  'bible-chapter', 'bible-verse',
];

function groupResults(results: SearchResult[]): GroupedResults {
  const grouped: GroupedResults = {};
  for (const r of results) {
    const key = r.contentType;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }
  return grouped;
}

function sortedGroups(grouped: GroupedResults): [string, SearchResult[]][] {
  const known = TYPE_ORDER.filter((t) => grouped[t]);
  const rest = Object.keys(grouped).filter((t) => !TYPE_ORDER.includes(t));
  return [...known, ...rest].map((t) => [t, grouped[t]]);
}

// ─── Context builder (same logic as AskEmmausBar) ─────────────────────────────

function buildContext(
  path: string,
  lastRead: ReturnType<typeof useBible>['lastRead'],
  journeys: ReturnType<typeof useJourney>['journeys'],
  progress: ReturnType<typeof useJourney>['progress'],
  getStep: ReturnType<typeof useJourney>['getStep'],
): FlatContext {
  return buildEmmausScreenContext(path, { journeys, progress, getStep, lastRead });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface UnifiedEmmausInputProps {
  className?: string;
  /** Called when the input becomes active (query typed) or inactive (cleared). */
  onActiveChange?: (isActive: boolean) => void;
  /**
   * When true the bar is a styled launcher button — same visual appearance but
   * tapping the bar opens the Ask Emmaus home page instead of typing inline.
   * The mic button still routes directly to voice mode.
   */
  launchOnly?: boolean;
}

export function UnifiedEmmausInput({ className, onActiveChange, launchOnly }: UnifiedEmmausInputProps) {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const voiceEnabled = useVoiceEnabled(user?.id);
  const { journeys, progress, getStep } = useJourney();
  const { lastRead } = useBible();

  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState<GroupedResults | null>(null);
  const [loading, setLoading]       = useState(false);
  const [isFocused, setIsFocused]   = useState(false);
  const inputRef                    = useRef<HTMLInputElement>(null);
  const containerRef                = useRef<HTMLDivElement>(null);
  const timerRef                    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const intent   = detectIntent(query);
  const hasQuery = query.trim().length >= 2;
  const isActive = isFocused && hasQuery;

  // Notify parent when active state changes
  useEffect(() => { onActiveChange?.(isActive); }, [isActive, onActiveChange]);

  // Live search (debounced 350ms) — only fires for search intent
  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 2 || intent === 'question') {
      if (intent === 'question') setResults(null);
      if (!q || q.length < 2) { setResults(null); setLoading(false); }
      return;
    }
    setLoading(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const raw = await globalSearch(q);
        setResults(groupResults(raw));
      } catch { setResults({}); }
      finally { setLoading(false); }
    }, 350);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, intent]);

  // Click outside → dismiss
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleClear = useCallback(() => {
    setQuery('');
    setResults(null);
    setLoading(false);
    inputRef.current?.focus();
  }, []);

  function submitQuestion(text: string) {
    const ctx = buildContext(location, lastRead, journeys, progress, getStep);
    setReturnDestination({
      pathname: location,
      scrollY: Math.round(window.scrollY),
      sourceSection: sourceSectionFromPath(location),
    });
    setPendingMessage(text.trim(), ctx);
    setIsFocused(false);
    setQuery('');
    navigate('/personal/ask-emmaus/conversation');
  }

  function handleMic(e: React.MouseEvent) {
    e.stopPropagation();
    // Unlock audio synchronously while we are still in the gesture stack.
    // Must happen before navigate() triggers any async React work.
    // See lib/voice-audio-unlock.ts for the full rationale.
    unlockVoiceAudio();
    setReturnDestination({
      pathname: location,
      scrollY: Math.round(window.scrollY),
      sourceSection: sourceSectionFromPath(location),
    });
    const ctx = buildContext(location, lastRead, journeys, progress, getStep);
    setPendingContext(ctx);
    navigate('/personal/ask-emmaus/voice');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = query.trim();
      if (!q) return;
      if (intent === 'question') {
        submitQuestion(q);
      }
      // For search: results are already showing, nothing extra needed
    }
    if (e.key === 'Escape') {
      setIsFocused(false);
      setQuery('');
    }
  }

  function handleResultClick(route: string) {
    setIsFocused(false);
    setQuery('');
    navigate(route);
  }

  const showPanel = isFocused && hasQuery;

  if (!user) return null;

  // ── Launch-only mode ───────────────────────────────────────────────────────
  // Looks identical to the bar below but the whole thing is a button that opens
  // the Ask Emmaus home page. Mic still routes directly to voice mode.
  if (launchOnly) {
    function handleLaunch() {
      setReturnDestination({
        pathname: location,
        scrollY: Math.round(window.scrollY),
        sourceSection: sourceSectionFromPath(location),
      });
      const ctx = buildContext(location, lastRead, journeys, progress, getStep);
      setPendingContext(ctx);
      navigate('/personal/ask-emmaus');
    }

    return (
      <div className={cn('relative', className)}>
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-full border border-border bg-card shadow-sm hover:border-primary/25 hover:shadow-md transition-all">
          <Search size={15} className="shrink-0 text-muted-foreground/50" strokeWidth={1.8} />
          <button
            onClick={handleLaunch}
            className="flex-1 text-left text-[14px] text-muted-foreground/50 focus:outline-none"
            aria-label="Ask Emmaus anything"
          >
            Ask Emmaus anything…
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>

      {/* ── Input bar ─────────────────────────────────────────────────────── */}
      <div
        className={cn(
          'flex items-center gap-2.5 px-4 py-3 rounded-full border bg-card shadow-sm transition-all',
          isFocused
            ? 'border-primary/40 ring-2 ring-primary/15 shadow-md'
            : 'border-border hover:border-primary/25 hover:shadow-md',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {/* Search icon */}
        <Search
          size={15}
          className={cn('shrink-0 transition-colors', isFocused ? 'text-primary' : 'text-muted-foreground/50')}
          strokeWidth={1.8}
        />

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          placeholder="Ask Emmaus anything, or search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none min-w-0"
          aria-label="Ask Emmaus or search"
          autoComplete="off"
        />

        {/* Clear */}
        {query ? (
          <button
            onClick={(e) => { e.stopPropagation(); handleClear(); }}
            className="shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors"
            aria-label="Clear"
            tabIndex={-1}
          >
            <X size={14} />
          </button>
        ) : null}

        {/* Mic — colored pill button so it's clearly tappable */}
        {voiceEnabled === true && (
          <button
            onClick={handleMic}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 transition-colors focus-visible:outline-none"
            aria-label="Speak to Emmaus"
            tabIndex={-1}
          >
            <Mic size={15} className="text-primary" strokeWidth={1.8} />
          </button>
        )}
      </div>

      {/* ── Results / question CTA panel ──────────────────────────────────── */}
      {showPanel && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl border border-border bg-card shadow-lg overflow-hidden max-h-[65vh] overflow-y-auto">

          {/* Question intent → one-tap CTA to start conversation */}
          {intent === 'question' && (
            <button
              onClick={() => submitQuestion(query)}
              className="w-full flex items-center gap-3 px-4 py-4 hover:bg-muted/50 transition-colors text-left"
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Search size={14} className="text-primary" strokeWidth={1.8} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-foreground">Ask Emmaus</p>
                <p className="text-[12px] text-muted-foreground truncate">"{query}"</p>
              </div>
              <ChevronRight size={14} className="text-muted-foreground shrink-0" />
            </button>
          )}

          {/* Search intent → live results */}
          {intent === 'search' && (
            <>
              {loading && (
                <div className="flex items-center gap-2 px-4 py-4 text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-[13px]">Searching…</span>
                </div>
              )}
              {!loading && results && Object.keys(results).length === 0 && (
                <div className="px-4 py-6 text-center">
                  <p className="text-[13px] text-muted-foreground">
                    No results for <strong>"{query}"</strong>
                  </p>
                  <button
                    onClick={() => submitQuestion(`Tell me about ${query}`)}
                    className="mt-3 text-[13px] text-primary hover:underline font-medium"
                  >
                    Ask Emmaus about "{query}" →
                  </button>
                </div>
              )}
              {!loading && results && Object.keys(results).length > 0 && (
                <div>
                  {sortedGroups(results).map(([type, items]) => (
                    <div key={type}>
                      {/* Group header */}
                      <div className="px-4 pt-3 pb-1.5">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                          {CONTENT_TYPE_LABEL[type] ?? type}
                        </p>
                      </div>
                      {/* Items */}
                      {items.map((r) => (
                        <button
                          key={`${r.contentType}-${r.id}`}
                          onClick={() => handleResultClick(r.route)}
                          className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] text-foreground leading-snug truncate">{r.title}</p>
                            {r.subtitle && (
                              <p className="text-[12px] text-muted-foreground truncate mt-0.5">{r.subtitle}</p>
                            )}
                          </div>
                          <ChevronRight size={13} className="text-muted-foreground/50 shrink-0" />
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
