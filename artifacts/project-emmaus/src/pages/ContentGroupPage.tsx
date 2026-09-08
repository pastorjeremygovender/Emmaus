/**
 * ContentGroupPage — member-facing manual content group.
 *
 * Groups deliberately stay separate from Journey Collections. This page uses the
 * personalised Next Steps catalogue so every card retains the same publication,
 * progress and reader-navigation rules as Discover.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useParams, useSearch } from 'wouter';
import { ChevronLeft, Layers2, Loader2 } from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import { isExemptJourney, useEnrollment } from '@/lib/enrollment';
import { navigatorRoute } from '@/lib/content-navigation';
import { goBackOrFallback } from '@/lib/return-context';
import {
  fetchNextSteps,
  resumeEngagement,
  startSeries,
  type ContentGroupEntry,
  type NextStepsItem,
} from '@/lib/next-steps-api';

type GroupFilter = 'journey' | 'daily-rhythm' | 'daily-devotional' | null;

function parseFilter(search: string): GroupFilter {
  const type = new URLSearchParams(search).get('type');
  return type === 'journey' || type === 'daily-rhythm' || type === 'daily-devotional'
    ? type
    : null;
}

function itemMatchesFilter(item: NextStepsItem, filter: GroupFilter): boolean {
  if (!filter) return true;
  if (filter === 'daily-devotional') return item.contentType === 'daily-devotional';
  if (filter === 'daily-rhythm') return item.contentType === 'daily-rhythm';
  return item.contentType === 'journey' || item.contentType === 'bible-study';
}

function itemKindLabel(item: NextStepsItem): string {
  if (item.contentType === 'daily-rhythm') return 'Daily Rhythm';
  if (item.contentType === 'daily-devotional') return 'Daily Devotional';
  if (item.contentType === 'bible-study') return 'Bible Study';
  return 'Walk';
}

function withSource(route: string): string {
  return `${route}${route.includes('?') ? '&' : '?'}source=contentGroup`;
}

export default function ContentGroupPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { journeys, progress } = useJourney();
  const { canActivateMore } = useEnrollment();

  const filter = parseFilter(search);
  const [group, setGroup] = useState<ContentGroupEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchNextSteps();
      setGroup(data.contentGroups.find(entry => entry.id === id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not load this group.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const items = useMemo(
    () => (group?.items ?? []).filter(item => itemMatchesFilter(item, filter)),
    [group, filter],
  );

  const openItem = async (item: NextStepsItem) => {
    setOpeningId(item.id);
    try {
      if (item.contentType === 'daily-rhythm') {
        const route = navigatorRoute('daily-rhythm', item.id, item.memberProgressState) ?? item.route;
        setLocation(withSource(route));
        return;
      }

      if (item.contentType === 'daily-devotional') {
        if (item.memberProgressState === 'paused') {
          await resumeEngagement('devotional', item.id);
          await load();
          return;
        }
        if (item.memberProgressState === 'not-started') {
          if (!user) {
            setLocation('/auth');
            return;
          }
          await startSeries(item.id, { userId: user.id });
          setLocation(withSource(item.route));
          return;
        }
        const route = navigatorRoute('devotional', item.id, item.memberProgressState) ?? item.route;
        setLocation(withSource(route));
        return;
      }


      if (item.memberProgressState === 'completed') {
        setLocation(`/journeys/${item.id}?source=contentGroup`);
        return;
      }
      if (item.memberProgressState !== 'not-started') {
        setLocation(withSource(navigatorRoute('journey', item.id, item.memberProgressState) ?? item.route));
        return;
      }

      const journey = journeys.find(candidate => candidate.id === item.id);
      const startedIds = new Set(Object.keys(progress));
      if (journey && !isExemptJourney(journey) && !canActivateMore(journeys, startedIds)) {
        setLocation(`/journeys/${item.id}?source=contentGroup`);
        return;
      }

      // Sending a member to the established walk detail page preserves the
      // existing choice between starting alone and with a Room.
      setLocation(`/journeys/${item.id}?source=contentGroup`);
    } catch {
      setError(`We couldn't open ${item.title}. Please try again.`);
    } finally {
      setOpeningId(null);
    }
  };

  const filterLabel = filter === 'daily-devotional'
    ? 'Daily Devotionals'
    : filter === 'daily-rhythm'
      ? 'Daily Rhythm'
      : filter === 'journey'
        ? 'Walks'
        : 'Content';

  return (
    <div className="min-h-screen bg-background pb-page-safe">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-[720px] mx-auto flex items-center gap-3 px-5 pt-10 pb-4">
          <button
            onClick={() => goBackOrFallback('/journeys', setLocation)}
            className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors shrink-0"
            aria-label="Go back"
          >
            <ChevronLeft size={22} />
          </button>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Content group</p>
            <h1 className="text-[20px] font-semibold text-foreground truncate">
              {group?.title ?? 'Content group'}
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-[720px] mx-auto px-5 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
            <Loader2 size={18} className="animate-spin" /> Loading group…
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-5 space-y-3">
            <p className="text-[14px] text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : !group ? (
          <div className="py-24 text-center space-y-3">
            <Layers2 size={24} className="mx-auto text-muted-foreground/50" />
            <p className="text-[14px] text-muted-foreground">This group is no longer available.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {group.coverImageUrl && (
              <img src={group.coverImageUrl} alt="" className="h-36 w-full rounded-2xl object-cover border border-border" />
            )}
            {group.description && (
              <p className="text-[14px] leading-relaxed text-muted-foreground">{group.description}</p>
            )}
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">{filterLabel}</h2>
              <span className="text-[12px] text-muted-foreground">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
            </div>

            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                <p className="text-[14px] text-muted-foreground">No {filterLabel.toLowerCase()} are available in this group yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map(item => {
                  const cta = item.memberProgressState === 'not-started'
                      ? 'Open'
                      : item.memberProgressState === 'completed'
                        ? 'Review'
                        : item.memberProgressState === 'paused'
                          ? 'Resume'
                          : 'Continue';
                  return (
                    <button
                      key={`${item.contentType}-${item.id}`}
                      onClick={() => void openItem(item)}
                      disabled={openingId === item.id}
                      className="w-full text-left rounded-2xl border border-border bg-card px-4 py-4 hover:border-primary/30 active:bg-muted/30 transition-colors disabled:opacity-60"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-[12px] font-semibold">
                          {itemKindLabel(item).slice(0, 1)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[15px] font-semibold text-foreground truncate">{item.title}</p>
                              <p className="mt-0.5 text-[12px] text-muted-foreground">{itemKindLabel(item)}</p>
                            </div>
                            <span className="shrink-0 text-[13px] font-medium text-primary">{cta}</span>
                          </div>
                          {item.description && (
                            <p className="mt-2 text-[13px] leading-snug text-muted-foreground line-clamp-2">{item.description}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}