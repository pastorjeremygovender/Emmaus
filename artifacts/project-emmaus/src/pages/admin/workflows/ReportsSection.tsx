import React, { useState, useEffect } from "react";
import { BarChart3 } from "lucide-react";
import * as api from "@/lib/workflows-api";
import { SectionLoader, SectionError, StatCard, EmptyState } from "./shared";

interface Props {
  auth: api.AuthHeaders;
}

export function ReportsSection({ auth }: Props) {
  const [data, setData] = useState<api.WorkflowReports | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getWorkflowReports(auth)
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SectionLoader />;
  if (error) return <SectionError message={error} />;
  if (!data) return null;

  const SOURCE_LABELS: Record<string, string> = {
    care_signal: "Care Signal", manual: "Manual", attendance: "Attendance",
    walk: "Walk", prayer_request: "Prayer Request",
  };

  return (
    <div className="space-y-6">
      {/* Top stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Total Completed" value={data.totalCompleted} accent="green" />
        <StatCard label="This Week" value={data.completedThisWeek} />
        <StatCard label="This Month" value={data.completedThisMonth} />
        <StatCard label="Outstanding" value={data.outstanding} accent={data.outstanding > 0 ? "blue" : "default"} />
        <StatCard label="Overdue" value={data.overdueCount} accent={data.overdueCount > 0 ? "red" : "default"} />
        <StatCard
          label="Avg Days to Complete"
          value={data.avgDaysToComplete != null ? `${data.avgDaysToComplete}d` : "—"}
        />
      </div>

      {/* By Source */}
      {data.bySource.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Tasks by Source</h3>
          <div className="space-y-2">
            {data.bySource.map(({ source, count }) => {
              const max = Math.max(...data.bySource.map((s) => s.count), 1);
              return (
                <div key={source} className="flex items-center gap-3 text-sm">
                  <span className="text-gray-600 w-36 flex-shrink-0">{SOURCE_LABELS[source] ?? source}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-teal-600 h-2 rounded-full"
                      style={{ width: `${(count / max) * 100}%` }}
                    />
                  </div>
                  <span className="text-gray-500 text-xs w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* By Team */}
      {data.byTeam.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Tasks by Ministry Team</h3>
          <div className="space-y-2">
            {data.byTeam.map(({ team, count }) => {
              const max = Math.max(...data.byTeam.map((t) => t.count), 1);
              return (
                <div key={team} className="flex items-center gap-3 text-sm">
                  <span className="text-gray-600 w-36 flex-shrink-0">{team}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${(count / max) * 100}%` }}
                    />
                  </div>
                  <span className="text-gray-500 text-xs w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* By Leader */}
      {data.byLeader.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Leader Performance</h3>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Leader</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Completed</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.byLeader.map(({ leader, completed, active }) => (
                  <tr key={leader} className="bg-white">
                    <td className="px-4 py-2.5 text-gray-700">{leader}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-700 font-medium">{completed}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{active}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.totalCompleted === 0 && data.outstanding === 0 && (
        <EmptyState icon={<BarChart3 />} title="No data yet" sub="Reports will appear once tasks are created and completed." />
      )}
    </div>
  );
}
