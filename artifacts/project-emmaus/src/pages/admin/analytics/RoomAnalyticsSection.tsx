import React from "react";
import { Home, MessageSquare, Users } from "lucide-react";
import { SectionHeader, SectionLoader, SectionError, StatRow, EmptyState } from "./shared";
import type { RoomAnalytics } from "@/lib/analytics-api";

interface Props { data: RoomAnalytics | null; loading: boolean; error?: string; }

export function RoomAnalyticsSection({ data, loading, error }: Props) {
  if (loading) return <SectionLoader />;
  if (error || !data) return <SectionError msg={error} />;

  return (
    <section className="mb-10">
      <SectionHeader
        icon={Home}
        title="Group Analytics"
        subtitle="Activity, participation, and growth across all Groups"
        iconColor="text-amber-500"
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Groups",     value: data.totalRooms },
          { label: "Active Groups",   value: data.activeRooms },
          { label: "Avg Members",     value: data.avgMembersPerRoom },
          { label: "Total Messages",  value: data.totalMessages },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-xl font-bold text-gray-900 tabular-nums">{s.value}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {data.rooms.length === 0 ? (
        <EmptyState message="No rooms have been created yet." />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Room</th>
                <th className="text-right px-4 py-3 font-medium"><Users size={12} className="inline mr-1" />Members</th>
                <th className="text-right px-4 py-3 font-medium"><MessageSquare size={12} className="inline mr-1" />Messages</th>
                <th className="text-right px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rooms.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{r.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.memberCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.messageCount}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      r.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {r.isActive ? "Active" : "Quiet"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
