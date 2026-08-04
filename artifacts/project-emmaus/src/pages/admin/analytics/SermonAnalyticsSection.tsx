import React from "react";
import { Mic } from "lucide-react";
import { SectionHeader, SectionLoader, SectionError, StatRow, EmptyState } from "./shared";
import type { SermonAnalytics } from "@/lib/analytics-api";

interface Props { data: SermonAnalytics | null; loading: boolean; error?: string; }

export function SermonAnalyticsSection({ data, loading, error }: Props) {
  if (loading) return <SectionLoader />;
  if (error || !data) return <SectionError msg={error} />;

  return (
    <section className="mb-10">
      <SectionHeader
        icon={Mic}
        title="Sermon Analytics"
        subtitle="Companion engagement and completion by sermon"
        iconColor="text-rose-500"
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {[
          { label: "Companion Starts",       value: data.totalCompanionStarts },
          { label: "Companion Completions",  value: data.totalCompanionCompletions },
          { label: "Avg Completion",         value: `${data.overallAvgCompletionPct}%` },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-xl font-bold text-gray-900 tabular-nums">{s.value}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {data.companions.length === 0 ? (
        <EmptyState message="No published sermon companions yet." />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[12px] font-semibold text-gray-700 mb-3">By Companion</p>
          {data.companions.map((c) => (
            <div key={c.id} className="py-2.5 border-b border-gray-100 last:border-b-0">
              <p className="text-[12px] font-medium text-gray-800 truncate">{c.title}</p>
              <div className="flex gap-3 mt-1">
                <span className="text-[11px] text-gray-500">{c.starts} started</span>
                <span className="text-[11px] text-gray-500">{c.completions} completed</span>
              </div>
              <div className="mt-1.5 w-full bg-gray-100 rounded-full h-1">
                <div className="bg-rose-400 h-1 rounded-full" style={{ width: `${c.avgCompletionPct}%` }} />
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">{c.avgCompletionPct}% avg completion</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
