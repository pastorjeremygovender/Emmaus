/**
 * JourneyTimeline — vertical timeline of discipleship events, newest first.
 * Grouped by relative time period (Today / Yesterday / This week / Month Year).
 * Designed to be extended: future modules add events without touching this file.
 */
import React, { useState } from 'react';
import {
  CalendarDays, BookOpen, Heart, Users, Mic, Star,
  CheckCircle2, TrendingUp, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';
import type { TimelineEvent, TimelineEventType } from '@/lib/pastoral-api';

interface Props {
  events: TimelineEvent[];
  loading?: boolean;
}

// ── Icon + colour config per event type ─────────────────────────────────────

const EVENT_STYLE: Record<TimelineEventType, {
  icon: React.ElementType; bg: string; text: string; dot: string;
}> = {
  attendance:                { icon: CalendarDays,  bg: 'bg-blue-50',   text: 'text-blue-600',  dot: 'bg-blue-400' },
  walk_started:              { icon: BookOpen,      bg: 'bg-teal-50',   text: 'text-teal-600',  dot: 'bg-teal-400' },
  walk_completed:            { icon: CheckCircle2,  bg: 'bg-green-50',  text: 'text-green-600', dot: 'bg-green-500' },
  devotional_started:        { icon: Heart,         bg: 'bg-rose-50',   text: 'text-rose-500',  dot: 'bg-rose-400' },
  devotional_completed:      { icon: CheckCircle2,  bg: 'bg-green-50',  text: 'text-green-600', dot: 'bg-green-500' },
  room_joined:               { icon: Users,         bg: 'bg-purple-50', text: 'text-purple-600',dot: 'bg-purple-400' },
  sermon_companion_started:  { icon: Mic,           bg: 'bg-amber-50',  text: 'text-amber-600', dot: 'bg-amber-400' },
  milestone:                 { icon: Star,          bg: 'bg-yellow-50', text: 'text-yellow-600',dot: 'bg-yellow-500' },
  care_alert:                { icon: CalendarDays,  bg: 'bg-rose-50',   text: 'text-rose-600',  dot: 'bg-rose-500' },
  visit_scheduled:           { icon: TrendingUp,    bg: 'bg-teal-50',   text: 'text-teal-600',  dot: 'bg-teal-400' },
};

// ── Time-period grouping ─────────────────────────────────────────────────────

function getPeriodLabel(isoDate: string): string {
  const d = new Date(isoDate);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)  return 'This week';
  // Month + Year for everything older
  return d.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
}

function fmtDate(isoDate: string) {
  const d = new Date(isoDate);
  const diffDays = Math.floor((new Date().getTime() - d.getTime()) / 86_400_000);
  if (diffDays < 7) {
    return d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Component ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 12;

export default function JourneyTimeline({ events, loading }: Props) {
  const [showAll, setShowAll] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-gray-400">
        <Loader2 size={14} className="animate-spin" />
        <span className="text-[12px]">Building timeline…</span>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-8">
        <CalendarDays size={24} className="mx-auto mb-2 text-gray-200" />
        <p className="text-[12px] text-gray-400">No events recorded yet.</p>
      </div>
    );
  }

  const visible = showAll ? events : events.slice(0, PAGE_SIZE);

  // Group events into time periods
  const groups: { period: string; items: TimelineEvent[] }[] = [];
  let currentPeriod = '';
  for (const ev of visible) {
    const period = getPeriodLabel(ev.date);
    if (period !== currentPeriod) {
      currentPeriod = period;
      groups.push({ period, items: [] });
    }
    groups[groups.length - 1].items.push(ev);
  }

  return (
    <div className="space-y-0">
      {groups.map((group) => (
        <div key={group.period}>
          {/* Period header */}
          <div className="flex items-center gap-2 py-2 sticky top-0 bg-white z-10">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              {group.period}
            </span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* Events in this period */}
          <div className="relative ml-4 border-l border-gray-100 space-y-0">
            {group.items.map((ev) => {
              const style = EVENT_STYLE[ev.eventType] ?? EVENT_STYLE.attendance;
              const Icon = style.icon;
              return (
                <div key={ev.id} className="relative flex items-start gap-3 pl-4 pb-3 group">
                  {/* Timeline dot */}
                  <div className={`absolute -left-[9px] top-1.5 w-[14px] h-[14px] rounded-full border-2 border-white flex items-center justify-center ${style.dot}`}>
                    <Icon size={7} className="text-white" />
                  </div>

                  {/* Event content */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-gray-900 leading-snug">{ev.title}</p>
                        {ev.subtitle && (
                          <p className="text-[11px] text-gray-400 mt-0.5">{ev.subtitle}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-[10px] text-gray-300 mt-0.5 whitespace-nowrap">
                        {fmtDate(ev.date)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {events.length > PAGE_SIZE && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[12px] text-gray-400 hover:text-gray-700 transition-colors"
        >
          {showAll
            ? <><ChevronUp size={12} /> Show less</>
            : <><ChevronDown size={12} /> Show all {events.length} events</>}
        </button>
      )}
    </div>
  );
}
