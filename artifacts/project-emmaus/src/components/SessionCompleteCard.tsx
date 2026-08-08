/**
 * SessionCompleteCard.tsx — Full-screen overlay shown to ALL room members when
 * the leader formally completes the session.
 *
 * Displays which modes were actually entered (Studied / Discussed / Prayed),
 * session summary counts, and a dismiss button.
 */

import { CheckCircle2, Circle, HandHeart, MessageSquare, BookOpen, X } from 'lucide-react';
import type { SessionCompleteSummary } from '@/lib/rooms-types';

interface SessionCompleteCardProps {
  summary: SessionCompleteSummary;
  onDismiss: () => void;
}

export function SessionCompleteCard({ summary, onDismiss }: SessionCompleteCardProps) {
  const { modesEntered, memberCount, prayerRequestCount, sharedNoteCount } = summary;

  const studied = true; // sessions always start in study mode
  const discussed = modesEntered.includes('discussion');
  const prayed = modesEntered.includes('prayer');

  const moments = [
    {
      key: 'studied',
      done: studied,
      icon: <BookOpen size={17} />,
      label: 'Studied the Word together',
    },
    {
      key: 'discussed',
      done: discussed,
      icon: <MessageSquare size={17} />,
      label: 'Discussed together',
    },
    {
      key: 'prayed',
      done: prayed,
      icon: <HandHeart size={17} />,
      label: 'Prayed together',
    },
  ];

  const stats = [
    memberCount > 0 && `${memberCount} member${memberCount !== 1 ? 's' : ''} attended`,
    prayerRequestCount > 0 && `${prayerRequestCount} prayer request${prayerRequestCount !== 1 ? 's' : ''}`,
    sharedNoteCount > 0 && `${sharedNoteCount} shared note${sharedNoteCount !== 1 ? 's' : ''}`,
  ].filter(Boolean) as string[];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onDismiss} />

      {/* Card */}
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[60] max-w-[400px] mx-auto">
        <div className="bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
          {/* Header band */}
          <div className="bg-emerald-600 dark:bg-emerald-700 px-6 py-6 text-center relative">
            <button
              onClick={onDismiss}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 size={30} className="text-white" />
            </div>
            <p className="text-[22px] font-bold text-white leading-tight">Session Complete</p>
            <p className="text-[13px] text-emerald-100 mt-1">Great work together today</p>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Moments checklist */}
            <div className="space-y-3">
              {moments.map(m => (
                <div key={m.key} className="flex items-center gap-3">
                  <div className={`shrink-0 ${m.done ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/30'}`}>
                    {m.done
                      ? <CheckCircle2 size={20} />
                      : <Circle size={20} />}
                  </div>
                  <div className={`flex items-center gap-2 ${m.done ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                    <span className="shrink-0">{m.icon}</span>
                    <p className={`text-[15px] font-medium ${m.done ? '' : 'line-through'}`}>{m.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Stats */}
            {stats.length > 0 && (
              <div className="px-4 py-3 rounded-2xl bg-muted/50 border border-border/60">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {stats.map(s => (
                    <p key={s} className="text-[13px] text-muted-foreground">{s}</p>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={onDismiss}
              className="w-full py-3.5 rounded-2xl bg-emerald-600 text-white font-semibold text-[15px] hover:bg-emerald-700 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
