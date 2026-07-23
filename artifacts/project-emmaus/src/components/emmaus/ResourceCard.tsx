/**
 * ResourceCard — optional resource links (Journey, Sermon, Prayer, Room, Pastor).
 * Shows up to three per response, below the NextStepCard.
 *
 * When recommendation.label === "Preached Here", renders a dedicated Preached Here
 * card layout with speaker, summary excerpt, and a Watch button.
 */

import { Map, Mic2, HandIcon, Users, User, Play } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useLocation } from 'wouter';
import type { Recommendation } from '@/lib/emmaus-client';

interface ResourceCardProps {
  recommendation: Recommendation;
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
  sermon: {
    label: 'Sermon',
    icon: <Mic2 size={15} />,
    color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  bible: {
    label: 'Scripture',
    icon: <span className="text-[13px] font-serif font-bold">B</span>,
    color: 'bg-primary/10 text-primary',
  },
  prayer: {
    label: 'Prayer',
    icon: <HandIcon size={15} />,
    color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  },
  room: {
    label: 'Room',
    icon: <Users size={15} />,
    color: 'bg-green-500/10 text-green-600 dark:text-green-400',
  },
  pastor: {
    label: 'Speak to someone',
    icon: <User size={15} />,
    color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  },
};

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ResourceCard({ recommendation }: ResourceCardProps) {
  const [, setLocation] = useLocation();
  const config = TYPE_CONFIG[recommendation.type] ?? TYPE_CONFIG.bible;
  const isPreachedHere = recommendation.label === 'Preached Here';

  function handleClick() {
    if (!recommendation.path) return;
    if (recommendation.path.startsWith('http')) {
      window.open(recommendation.path, '_blank', 'noopener noreferrer');
    } else {
      setLocation(recommendation.path);
    }
  }

  if (isPreachedHere) {
    // ── Preached Here card ─────────────────────────────────────────────────
    const watchLabel = recommendation.timestampSeconds
      ? `Watch from ${formatTimestamp(recommendation.timestampSeconds)}`
      : 'Watch sermon';

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
              <Play
                size={11}
                className="text-amber-700 dark:text-amber-400 fill-current"
                aria-hidden="true"
              />
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
    <button
      onClick={handleClick}
      className="w-full text-left"
      disabled={!recommendation.path}
    >
      <Card className="border-border bg-card hover:border-primary/30 transition-all">
        <CardContent className="p-3.5 flex items-start gap-3">
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
            <p className="text-[14px] font-medium text-foreground truncate">
              {recommendation.title}
            </p>
            {recommendation.description && (
              <p className="text-[13px] text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
                {recommendation.description}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </button>
  );
}
