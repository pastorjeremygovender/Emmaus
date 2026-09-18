import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from "recharts";
import { Shield } from "lucide-react";
import { SectionHeader, SectionLoader, SectionError, StatRow, EmptyState } from "./shared";
import type { PastoralCareAnalytics } from "@/lib/analytics-api";

interface Props { data: PastoralCareAnalytics | null; loading: boolean; error?: string; }

const CATEGORY_COLORS: Record<string, string> = {
  celebration: "#10b981",
  growth:      "#3b82f6",
  attention:   "#f59e0b",
  follow_up:   "#ef4444",
  significant: "#8b5cf6",
};

export function PastoralCareSection({ data, loading, error }: Props) {
  if (loading) return <SectionLoader />;
  if (error || !data) return <SectionError msg={error} />;

  const chartData = data.byCategory.map((c) => ({
    name: c.category.replace("_", " "),
    Open: c.open,
    Resolved: c.resolved,
    fill: CATEGORY_COLORS[c.category] ?? "#94a3b8",
  }));

  return (
    <section className="mb-10">
      <SectionHeader
        icon={Shield}
        title="Pastoral Care Analytics"
        subtitle="Care signal activity, response times, and resolution rates"
        iconColor="text-violet-500"
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Open Signals",      value: data.openSignals,     color: "text-red-500" },
          { label: "Resolved Signals",  value: data.resolvedSignals, color: "text-green-600" },
          { label: "Total Signals",     value: data.totalSignals,    color: "text-gray-900" },
          { label: "Avg Days to Act",   value: data.avgDaysToAcknowledge !== null ? `${data.avgDaysToAcknowledge}d` : "—", color: "text-gray-900" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {chartData.length === 0 ? (
        <EmptyState message="No care signals recorded yet." />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[12px] font-semibold text-gray-700 mb-3">By Category</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Open" fill="#ef4444" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Resolved" fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
