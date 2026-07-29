/**
 * EmmausCompletionCard preview — shows all four content-type variants
 * side by side for verification against the spec.
 */
import { CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';

// ─── Inlined card (no project-emmaus path dependency needed) ─────────────────

function EmmausCompletionCard({
  heading,
  subMessage,
  returnLabel,
}: {
  heading: string;
  subMessage?: string;
  returnLabel: string;
}) {
  return (
    <div className="bg-teal-50 border border-teal-200 rounded-2xl px-5 py-6 text-center space-y-4">
      <CheckCircle2 size={28} className="text-green-500 mx-auto" />
      <p className="text-[16px] font-medium text-teal-900 leading-snug">{heading}</p>
      {subMessage && (
        <p className="text-[13px] text-teal-700 leading-relaxed">{subMessage}</p>
      )}
      <Button className="w-full rounded-xl h-11 text-[15px]">
        {returnLabel}
      </Button>
    </div>
  );
}

// ─── Four-variant gallery ─────────────────────────────────────────────────────

export default function EmmausCompletionCardPreview() {
  const variants = [
    {
      label: '10 Minutes with Jesus',
      heading: "Today's time with Jesus is complete.",
      subMessage: "We'll continue walking together tomorrow.",
      returnLabel: "Back to Today's Steps",
    },
    {
      label: 'Daily Devotional',
      heading: 'Devotional complete.',
      subMessage: "Tomorrow's devotional will be ready.",
      returnLabel: 'Back to Next Steps',
    },
    {
      label: 'Journey (mid-step)',
      heading: 'Day 3 complete.',
      subMessage: "We'll continue walking together tomorrow.",
      returnLabel: 'Back to Next Steps',
    },
    {
      label: 'Sermon Companion (final day)',
      heading: 'Companion complete.',
      subMessage: 'May the Lord continue His work in your heart today.',
      returnLabel: 'Back to Next Steps',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-[560px] mx-auto space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold text-gray-800">EmmausCompletionCard</h1>
          <p className="text-sm text-gray-500 mt-1">All four content-type variants — design locked</p>
        </div>
        {variants.map((v) => (
          <div key={v.label}>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2 pl-1">
              {v.label}
            </p>
            <EmmausCompletionCard
              heading={v.heading}
              subMessage={v.subMessage}
              returnLabel={v.returnLabel}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
