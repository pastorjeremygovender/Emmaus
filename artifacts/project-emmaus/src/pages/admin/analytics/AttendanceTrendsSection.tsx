import React, { useState } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Calendar, TrendingUp } from "lucide-react";
import { SectionHeader, SectionLoader, SectionError, StatRow, TrendBadge, EmptyState } from "./shared";
import type { AttendanceTrends } from "@/lib/analytics-api";

function fmt(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function fmtMonth(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

interface Props { data: AttendanceTrends | null; loading: boolean; error?: string; }

type View = "weekly" | "monthly";

export function AttendanceTrendsSection({ data, loading, error }: Props) {
  const [view, setView] = useState<View>("weekly");

  if (loading) return <SectionLoader />;
  if (error || !data) return <SectionError msg={error} />;

  const chartData = (view === "weekly" ? data.weekly : data.monthly).map((d) => ({
    ...d,
    label: view === "weekly" ? fmt(d.date) : fmtMonth(d.date),
  }));

  // Trend: last 4 vs prior 4 periods
  const recent4 = chartData.slice(-4);
  const prior4 = chartData.slice(-8, -4);
  const recentAvg = recent4.reduce((s, r) => s + r.present, 0) / Math.max(recent4.length, 1);
  const priorAvg  = prior4.reduce((s, r) => s + r.present, 0) / Math.max(prior4.length, 1);
  const changePct = priorAvg > 0 ? Math.round(((recentAvg - priorAvg) / priorAvg) * 100) : 0;

  return (
    <section className="mb-10">
      <SectionHeader
        icon={Calendar}
        title="Attendance Trends"
        subtitle="Session attendance over time"
        iconColor="text-blue-500"
      />

      <div className="flex items-center gap-4 mb-4">
        {(["weekly", "monthly"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`text-[12px] font-medium px-3 py-1.5 rounded-lg transition-colors ${
              view === v ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
        <span className="ml-auto text-[12px] text-gray-500">
          Trend vs prior period: <TrendBadge change={changePct} />
        </span>
      </div>

      {chartData.length === 0 ? (
        <EmptyState message="No attendance data yet. Record sessions to see trends." />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="presentGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="visitorGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="present" name="Present" stroke="#3b82f6" fill="url(#presentGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="visitors" name="Visitors" stroke="#f59e0b" fill="url(#visitorGrad)" strokeWidth={1.5} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* By meeting type */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[12px] font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <TrendingUp size={13} className="text-blue-500" /> By Meeting
          </p>
          {data.byMeeting.length === 0 ? (
            <EmptyState message="No sessions recorded." />
          ) : (
            data.byMeeting.map((m) => (
              <StatRow
                key={m.meetingType}
                label={m.meetingType}
                value={`avg ${m.avgPresent}`}
                sub={`${m.sessionCount} sessions`}
              />
            ))
          )}
        </div>

        {/* Retention */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[12px] font-semibold text-gray-700 mb-3">Retention & Visitors</p>
          <StatRow label="Retention rate (6 months)" value={`${data.retentionPct}%`} />
          {data.visitorBreakdown.map((v) => (
            <React.Fragment key={v.periodLabel}>
              <StatRow label="Recent visitors" value={v.firstTime + v.returning} sub={v.periodLabel} />
              <StatRow label="— first-time" value={v.firstTime} />
              <StatRow label="— returning" value={v.returning} />
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
