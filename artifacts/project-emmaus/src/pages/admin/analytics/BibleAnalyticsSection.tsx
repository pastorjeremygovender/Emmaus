import React from "react";
import { BookOpen } from "lucide-react";
import { SectionHeader, SectionLoader, SectionError, StatRow, EmptyState } from "./shared";
import type { BibleAnalytics } from "@/lib/analytics-api";

// Map bookId slugs (e.g. "john", "genesis") to display names
function bookLabel(id: string) {
  return id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, " ");
}

interface Props { data: BibleAnalytics | null; loading: boolean; error?: string; }

export function BibleAnalyticsSection({ data, loading, error }: Props) {
  if (loading) return <SectionLoader />;
  if (error || !data) return <SectionError msg={error} />;

  return (
    <section className="mb-10">
      <SectionHeader
        icon={BookOpen}
        title="Bible Analytics"
        subtitle="Study note coverage and user engagement with Scripture"
        iconColor="text-blue-600"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
          <p className="text-xl font-bold text-gray-900 tabular-nums">{data.usersWithData}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Users with saved Bible annotations</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[12px] font-semibold text-gray-700 mb-3">Most Studied Books (by note coverage)</p>
          {data.topAnnotatedBooks.length === 0 ? (
            <EmptyState message="No Bible study notes published yet." />
          ) : (
            data.topAnnotatedBooks.map((b) => (
              <StatRow
                key={b.bookId}
                label={bookLabel(b.bookId)}
                value={`${b.annotationCount} notes`}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}
