import React from "react";
import { Zap, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { SectionHeader, SectionLoader, SectionError, EmptyState } from "./shared";
import type { PredictiveInsight } from "@/lib/analytics-api";

interface Props { data: PredictiveInsight[] | null; loading: boolean; error?: string; }

const TYPE_STYLES = {
  positive: {
    bg:   "bg-emerald-50 border-emerald-200",
    icon: <TrendingUp size={16} className="text-emerald-600" />,
    badge: "bg-emerald-100 text-emerald-700",
  },
  warning: {
    bg:   "bg-amber-50 border-amber-200",
    icon: <TrendingDown size={16} className="text-amber-600" />,
    badge: "bg-amber-100 text-amber-700",
  },
  neutral: {
    bg:   "bg-gray-50 border-gray-200",
    icon: <Minus size={16} className="text-gray-500" />,
    badge: "bg-gray-100 text-gray-600",
  },
};

export function PredictiveInsightsSection({ data, loading, error }: Props) {
  if (loading) return <SectionLoader />;
  if (error || !data) return <SectionError msg={error} />;

  return (
    <section className="mb-10">
      <SectionHeader
        icon={Zap}
        title="Predictive Insights"
        subtitle="Pattern-based observations from your historical data"
        iconColor="text-yellow-500"
      />

      {data.length === 0 ? (
        <EmptyState message="No notable patterns detected yet. Insights appear as more data is collected." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.map((insight) => {
            const style = TYPE_STYLES[insight.type];
            return (
              <div
                key={insight.id}
                className={`rounded-2xl border p-4 ${style.bg}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">{style.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-[13px] font-semibold text-gray-900">{insight.title}</p>
                      {insight.metric && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${style.badge}`}>
                          {insight.metric}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-gray-700 leading-relaxed">{insight.body}</p>
                    {insight.change !== undefined && (
                      <p className={`text-[11px] font-semibold mt-1.5 ${insight.change > 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {insight.change > 0 ? "▲" : "▼"} {Math.abs(insight.change)}%
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
