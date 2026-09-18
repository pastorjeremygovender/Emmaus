/**
 * SessionCompleteCard.tsx — Full-screen overlay shown to ALL room members when
 * the leader formally completes the session.
 *
 * Displays session summary counts and a dismiss button.
 */

import { CheckCircle2, X } from 'lucide-react';
import type { SessionCompleteSummary } from '@/lib/rooms-types';

interface SessionCompleteCardProps {
  summary: SessionCompleteSummary;
  onDismiss: () => void;
}

export function SessionCompleteCard({ summary, onDismiss }: SessionCompleteCardProps) {
  const { memberCount, prayerRequestCount, sharedNoteCount } = summary;

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
