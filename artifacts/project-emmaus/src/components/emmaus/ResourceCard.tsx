/**
 * ResourceCard — optional resource links (Journey, Sermon, Prayer, Room, Pastor).
 * Shows up to three per response, below the NextStepCard.
 *
 * When recommendation.label === "Preached Here", renders a dedicated Preached Here
 * card layout with speaker, summary excerpt, and a Watch button.
 */

import { Map, Mic2, HandIcon, Users, User, Play, BookOpen, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useLocation } from 'wouter';
import type { Recommendation } from '@/lib/emmaus-client';

interface ResourceCardProps {
  recommendation: Recommendation;
  actions?: Array<{
    kind: 'OPEN' | 'READ' | 'CONTINUE';
    resourceType: string;
    resourceId: string;
    parentId?: string;
    route: string;
  }>;
}

const TYPE_CONFIG: Record<
  Recommendation['type'],
  { label: string; icon: React.ReactNode; color: string }
> = {
  journey: {
    label: 'Journey',
    icon: <Map size={15} />,
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  walk: {
    label: 'Walk',
    icon: <Map size={15} />,
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  sermon: {
    label: 'Sermon',
    icon: <Mic2 size={15} />,
    color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  bible: {
    label: 'Scripture',
    icon: <span className="text-[13px] font-sans font-bold">B</span>,
    color: 'bg-primary/10 text-primary',
  },
  prayer: {
    label: 'Prayer',
    icon: <HandIcon size={15} />,
    color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  },
  room: {
    label: 'Group',
    icon: <Users size={15} />,
    color: 'bg-green-500/10 text-green-600 dark:text-green-400',
  },
  pastor: {
    label: 'Speak to someone',
    icon: <User size={15} />,
    color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  },
  'daily-rhythm': {
    label: 'Daily Rhythm',
    icon: <Map size={15} />,
    color: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  },
  devotional: {
    label: 'Devotional',
    icon: <BookOpen size={15} />,
    color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  },
  'bible-study': {
    label: 'Bible Study',
    icon: <BookOpen size={15} />,
    color: 'bg-primary/10 text-primary',
  },
  'sermon-companion': {
    label: 'Sermon Companion',
    icon: <Mic2 size={15} />,
    color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
};

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ResourceCard({ recommendation, actions = [] }: ResourceCardProps) {
  const [, setLocation] = useLocation();
  const config = TYPE_CONFIG[recommendation.type] ?? TYPE_CONFIG.bible;
  const isPreachedHere = recommendation.label === 'Preached Here';

  function openRoute(path: string | undefined) {
    if (!path) return;
    if (/^https?:\/\//i.test(path)) {
      window.open(path, '_blank', 'noopener,noreferrer');
    } else if (
      path.startsWith('/') &&
      !path.startsWith('//') &&
      !path.includes('\n') &&
      !path.includes('\r')
    ) {
      setLocation(path);
    }
  }

  function handleClick() {
    openRoute(recommendation.path);
  }

  const safeActions = actions.filter((action, index, all) =>
    action.resourceId === recommendation.resourceId &&
    all.findIndex((candidate) => candidate.kind === action.kind && candidate.route === action.route) === index
  );
  const actionLabel = (kind: 'OPEN' | 'READ' | 'CONTINUE') =>
    kind === 'CONTINUE' ? 'Continue' : kind === 'READ' ? 'Read' : 'Open';

  if (isPreachedHere) {
    // ── Preached Here card ─────────────────────────────────────────────────
    const isExternalWatch = Boolean(recommendation.path && /^https?:\/\//i.test(recommendation.path));
    const watchLabel = isExternalWatch
      ? recommendation.timestampSeconds
        ? `Watch from ${formatTimestamp(recommendation.timestampSeconds)}`
        : 'Watch sermon'
      : 'Open sermon';

    return (
      <button
        onClick={handleClick}
        className="w-full text-left"
        disabled={!recommendation.path}
      >
        <Card className="border-amber-200/60 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/20 hover:border-amber-400/60 dark:hover:border-amber-600/50 transition-all">
          <CardContent className="p-4 space-y-2">
            {/* Badge row */}
            <div className="flex items-center gap-1.5">
              <div
                className="w-5 h-5 rounded flex items-center justify-center bg-amber-500/15 text-amber-700 dark:text-amber-400"
                aria-hidden="true"
              >
                <Mic2 size={12} />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">
                Preached Here
              </p>
            </div>

            {/* Title */}
            <p className="text-[14px] font-semibold text-foreground leading-snug">
              {recommendation.title}
            </p>

            {/* Speaker */}
            {recommendation.speakerName && (
              <p className="text-[12px] text-muted-foreground">
                {recommendation.speakerName}
              </p>
            )}

            {/* Summary excerpt */}
            {recommendation.description && (
              <p className="text-[12px] text-muted-foreground leading-snug line-clamp-2">
                {recommendation.description}
              </p>
            )}

            {/* Watch button */}
            <div className="flex items-center gap-1.5 pt-1">
              {isExternalWatch ? (
                <Play size={11} className="text-amber-700 dark:text-amber-400 fill-current" aria-hidden="true" />
              ) : (
                <ExternalLink size={11} className="text-amber-700 dark:text-amber-400" aria-hidden="true" />
              )}
              <span className="text-[12px] font-semibold text-amber-700 dark:text-amber-400">
                {watchLabel}
              </span>
            </div>
          </CardContent>
        </Card>
      </button>
    );
  }

  // ── Standard resource card ─────────────────────────────────────────────────
  return (
    <Card className="border-border bg-card hover:border-primary/30 transition-all">
      <CardContent className="p-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <button
            type="button"
            onClick={handleClick}
            className="flex items-start gap-3 flex-1 min-w-0 text-left"
            disabled={!recommendation.path}
          >
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${config.color}`}
              aria-hidden="true"
            >
              {config.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                {recommendation.label ?? config.label}
              </p>
              <p className="text-[14px] font-medium text-foreground leading-snug break-words">
                {recommendation.title}
              </p>
              {recommendation.description && (
                <p className="text-[13px] text-muted-foreground mt-0.5 line-clamp-2 leading-snug break-words">
                  {recommendation.description}
                </p>
              )}
            </div>
          </button>
          {safeActions.length > 0 && (
            <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:max-w-[48%] sm:shrink-0 sm:justify-end">
              {safeActions.map((action) => (
                <button
                  key={`${action.kind}:${action.route}`}
                  type="button"
                  onClick={() => openRoute(action.route)}
                  className="min-h-8 rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10 whitespace-nowrap"
                >
                  {actionLabel(action.kind)}
                </button>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
