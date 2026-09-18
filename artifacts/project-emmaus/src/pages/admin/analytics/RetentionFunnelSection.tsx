import React from "react";
import { ArrowDown, Filter } from "lucide-react";
import { SectionHeader, SectionLoader, SectionError, EmptyState } from "./shared";
import type { FunnelStage } from "@/lib/analytics-api";

interface Props { data: FunnelStage[] | null; loading: boolean; error?: string; }

const STAGE_COLORS = [
  "bg-indigo-500", "bg-blue-500", "bg-teal-500", "bg-green-500",
  "bg-emerald-500", "bg-amber-500", "bg-orange-500", "bg-rose-500",
];

export function RetentionFunnelSection({ data, loading, error }: Props) {
  if (loading) return <SectionLoader />;
  if (error || !data) return <SectionError msg={error} />;
  if (data.every((s) => s.count === 0)) {
    return (
      <section className="mb-10">
        <SectionHeader icon={Filter} title="Retention Funnel" iconColor="text-teal-500" />
        <EmptyState message="Not enough data to build the funnel yet." />
      </section>
    );
  }

  return (
    <section className="mb-10">
      <SectionHeader
        icon={Filter}
        title="Retention Funnel"
        subtitle="Movement from first visit to long-term discipleship"
        iconColor="text-teal-500"
      />
      <div className="max-w-lg mx-auto">
        {data.map((stage, i) => {
          const dropPct = i > 0 ? Math.max(0, 100 - stage.pct) : 0;
          const color = STAGE_COLORS[i % STAGE_COLORS.length];
          return (
            <div key={stage.label}>
              {i > 0 && (
                <div className="flex flex-col items-center my-1 text-gray-300">
                  <ArrowDown size={14} />
                  {dropPct > 0 && (
                    <span className="text-[10px] text-red-400 font-medium">−{dropPct}%</span>
                  )}
                </div>
              )}
              <div className="relative bg-gray-100 rounded-xl overflow-hidden h-12">
                <div
                  className={`absolute inset-y-0 left-0 ${color} opacity-20 transition-all`}
                  style={{ width: `${stage.pct}%` }}
                />
                <div className="relative flex items-center justify-between h-full px-4">
                  <span className="text-[13px] font-medium text-gray-800">{stage.label}</span>
                  <div className="text-right">
                    <span className="text-[13px] font-bold text-gray-900 tabular-nums">{stage.count}</span>
                    <span className="text-[11px] text-gray-500 ml-2">({stage.pct}%)</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
