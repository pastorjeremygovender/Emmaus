import React from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp } from "lucide-react";
import { SectionHeader, SectionLoader, SectionError, StatRow, EmptyState } from "./shared";
import type { SpiritualGrowthData } from "@/lib/analytics-api";

interface Props { data: SpiritualGrowthData | null; loading: boolean; error?: string; }

export function SpiritualGrowthSection({ data, loading, error }: Props) {
  if (loading) return <SectionLoader />;
  if (error || !data) return <SectionError msg={error} />;

  const chartData = data.signalTrend.map((t) => ({
    week: t.week.slice(5),
    Growing: t.growth,
    "Needs Attention": t.attention,
  }));

  return (
    <section className="mb-10">
      <SectionHeader
        icon={TrendingUp}
        title="Spiritual Growth"
        subtitle="Growth signals, disengagement trends, and attendance consistency"
        iconColor="text-emerald-500"
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Growing (signals)",     value: data.growing,        color: "text-emerald-600" },
          { label: "Disengaging (signals)", value: data.disengaging,    color: "text-red-500" },
          { label: "Attendance Consistency",value: `${data.avgAttendanceConsistency}%`, color: "text-blue-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {chartData.length > 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[12px] font-semibold text-gray-700 mb-3">Signal Trend (last 8 weeks)</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="attnGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="Growing" stroke="#10b981" fill="url(#growthGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="Needs Attention" stroke="#ef4444" fill="url(#attnGrad)" strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState message="Signal trend data will appear as the engine runs." />
      )}
    </section>
  );
}
