/**
 * Preview: PreviousDaysScreen + updated EmmausCompletionCard with "See Previous Days →"
 */
import { CheckCircle2, ArrowLeft, ChevronRight, Lock } from 'lucide-react';
import { Button } from '../ui/button';

// ── Inlined PreviousDaysScreen (no cross-app imports) ────────────────────────

function StatusBadge({ status }: { status: 'completed' | 'current' | 'locked' }) {
  if (status === 'completed') return (
    <span className="flex items-center gap-1 text-[12px] font-medium text-green-600">
      <CheckCircle2 size={13} /> Completed
    </span>
  );
  if (status === 'current') return (
    <span className="text-[12px] font-medium text-blue-500">In Progress</span>
  );
  return (
    <span className="flex items-center gap-1 text-[12px] text-gray-400">
      <Lock size={12} /> Locked
    </span>
  );
}

const sampleEntries = [
  { dayNumber: 5, title: 'The Bread of Life', subtitle: 'John 6:35-40', status: 'completed' as const },
  { dayNumber: 4, title: 'The Living Water', subtitle: 'John 4:13-14', status: 'completed' as const },
  { dayNumber: 3, title: 'Born Again', subtitle: 'John 3:1-8', status: 'completed' as const },
  { dayNumber: 2, title: 'The Wedding at Cana', subtitle: 'John 2:1-11', status: 'completed' as const },
  { dayNumber: 1, title: 'In the Beginning', subtitle: 'John 1:1-14', status: 'completed' as const },
];

function PreviousDaysDemo() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-100">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto">
          <button className="p-2 -ml-2 text-gray-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 text-center px-3">
            <div className="font-medium text-sm text-gray-800">10 Minutes with Jesus</div>
            <div className="text-[12px] text-gray-400">Previous Days</div>
          </div>
          <div className="min-w-[44px]" />
        </div>
      </header>
      <main className="px-5 pt-4 max-w-[480px] mx-auto">
        <div className="divide-y divide-gray-100">
          {sampleEntries.map(entry => (
            <div key={entry.dayNumber} className="py-4 px-1">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">
                    Day {entry.dayNumber}
                  </div>
                  <div className="text-[15px] font-medium text-gray-800 leading-snug">
                    {entry.title}
                  </div>
                  <div className="text-[12px] text-gray-400 mt-0.5">{entry.subtitle}</div>
                  <div className="mt-1.5"><StatusBadge status={entry.status} /></div>
                </div>
                <button className="flex items-center gap-1 text-[14px] font-medium text-blue-600 flex-shrink-0">
                  Review <ChevronRight size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

// ── Inlined completion card with "See Previous Days →" ───────────────────────

function CompletionCardDemo() {
  return (
    <div className="bg-teal-50 border border-teal-200 rounded-2xl px-5 py-6 text-center space-y-4 max-w-[360px]">
      <CheckCircle2 size={28} className="text-green-500 mx-auto" />
      <p className="text-[16px] font-medium text-teal-900 leading-snug">
        Day 5 complete.
      </p>
      <p className="text-[13px] text-teal-700 leading-relaxed">
        We'll continue walking together tomorrow.
      </p>
      <Button className="w-full rounded-xl h-11 text-[15px]">
        Back to Today's Steps
      </Button>
      <button className="text-[13px] text-teal-600 font-medium hover:text-teal-800 transition-colors">
        See Previous Days →
      </button>
    </div>
  );
}

// ── Gallery ───────────────────────────────────────────────────────────────────

export default function PreviousDaysScreenPreview() {
  return (
    <div className="flex gap-6 p-6 bg-gray-50 min-h-screen">
      {/* Left: Previous Days list */}
      <div className="flex-1 max-w-[420px] bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest px-5 pt-4 pb-1">
          /daily-rhythm/previous
        </div>
        <PreviousDaysDemo />
      </div>
      {/* Right: Updated completion card */}
      <div className="flex flex-col gap-4 items-start pt-8">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
          EmmausCompletionCard with "See Previous Days →"
        </p>
        <CompletionCardDemo />
      </div>
    </div>
  );
}
