import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { BookOpen, TrendingDown, TrendingUp } from "lucide-react";
import { SectionHeader, SectionLoader, SectionError, StatRow, EmptyState } from "./shared";
import type { DiscipleshipAnalytics } from "@/lib/analytics-api";

interface Props { data: DiscipleshipAnalytics | null; loading: boolean; error?: string; }

export function DiscipleshipSection({ data, loading, error }: Props) {
  if (loading) return <SectionLoader />;
  if (error || !data) return <SectionError msg={error} />;

  const weeklyChartData = data.weeklyWalkStarts.map((w, i) => ({
    week: w.week.slice(5), // MM-DD
    Starts: w.count,
    Completions: data.weeklyWalkCompletions[i]?.count ?? 0,
  }));

  return (
    <section className="mb-10">
      <SectionHeader
        icon={BookOpen}
        title="Discipleship Analytics"
        subtitle="Walk, devotional, daily rhythm, and companion engagement"
        iconColor="text-purple-500"
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Walk Starts",        value: data.totalWalkStarts },
          { label: "Walk Completions",   value: data.totalWalkCompletions },
          { label: "Avg Completion",     value: `${data.overallAvgCompletionPct}%` },
          { label: "Devotional Users",   value: data.devotionalEngagements },
          { label: "Devotional Avg Progress", value: `${data.devotionalAvgCompletionPct}%` },
          { label: "Daily Rhythm",       value: data.dailyRhythmEnrollments },
          { label: "Rhythm Completed",   value: data.dailyRhythmCompletions },
          { label: "Companion Users",    value: data.companionEngagements },
          { label: "Active Journeys",    value: data.walkStats.length },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-xl font-bold text-gray-900 tabular-nums">{s.value}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Walk starts chart */}
      {weeklyChartData.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
          <p className="text-[12px] font-semibold text-gray-700 mb-3">Walk Activity (last 12 weeks)</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weeklyChartData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Starts" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Completions" fill="#c4b5fd" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Highlight cards */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[12px] font-semibold text-gray-700 mb-3">Walk Highlights</p>
          {data.mostCompleted && (
            <div className="flex items-start gap-2 mb-3 p-3 bg-green-50 rounded-xl">
              <TrendingUp size={14} className="text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-[12px] font-medium text-green-900">Most Completed</p>
                <p className="text-[12px] text-green-700">"{data.mostCompleted.title}"</p>
                <p className="text-[11px] text-green-600">{data.mostCompleted.completionPct}% completion rate</p>
              </div>
            </div>
          )}
          {data.mostAbandoned && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl">
              <TrendingDown size={14} className="text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-[12px] font-medium text-amber-900">Most Abandoned</p>
                <p className="text-[12px] text-amber-700">"{data.mostAbandoned.title}"</p>
                <p className="text-[11px] text-amber-600">{data.mostAbandoned.abandonPct}% abandon rate</p>
              </div>
            </div>
          )}
          {!data.mostCompleted && !data.mostAbandoned && <EmptyState message="No walk data yet." />}
        </div>

        {/* Per-journey table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[12px] font-semibold text-gray-700 mb-3">Per Walk</p>
          {data.walkStats.length === 0 ? (
            <EmptyState message="No walks started yet." />
          ) : (
            data.walkStats.map((w) => (
              <div key={w.journeyId} className="py-2.5 border-b border-gray-100 last:border-b-0">
                <p className="text-[12px] font-medium text-gray-800 truncate">{w.title}</p>
                <div className="flex gap-3 mt-1">
                  <span className="text-[11px] text-gray-500">{w.starts} started</span>
                  <span className="text-[11px] text-gray-500">{w.completions} completed</span>
                  <span className="text-[11px] text-gray-500">{w.avgCompletionPct}% avg</span>
                  {w.avgDaysToComplete && (
                    <span className="text-[11px] text-gray-500">{w.avgDaysToComplete}d avg</span>
                  )}
                </div>
                {/* Progress bar */}
                <div className="mt-1.5 w-full bg-gray-100 rounded-full h-1">
                  <div
                    className="bg-purple-500 h-1 rounded-full"
                    style={{ width: `${w.avgCompletionPct}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
