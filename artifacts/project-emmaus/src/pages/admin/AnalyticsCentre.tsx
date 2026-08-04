/**
 * AnalyticsCentre.tsx — Emmaus Analytics Centre (Checkpoint 6).
 * 15-section discipleship analytics and reporting system.
 * Each section fetches independently; no section blocks another.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { AdminNav } from "@/pages/Admin";
import * as api from "@/lib/analytics-api";

import { ChurchHealthSection }       from "./analytics/ChurchHealthSection";
import { AttendanceTrendsSection }   from "./analytics/AttendanceTrendsSection";
import { DiscipleshipSection }       from "./analytics/DiscipleshipSection";
import { RetentionFunnelSection }    from "./analytics/RetentionFunnelSection";
import { SpiritualGrowthSection }    from "./analytics/SpiritualGrowthSection";
import { RoomAnalyticsSection }      from "./analytics/RoomAnalyticsSection";
import { SermonAnalyticsSection }    from "./analytics/SermonAnalyticsSection";
import { BibleAnalyticsSection }     from "./analytics/BibleAnalyticsSection";
import { PastoralCareSection }       from "./analytics/PastoralCareSection";
import { PredictiveInsightsSection } from "./analytics/PredictiveInsightsSection";
import { ExportsSection }            from "./analytics/ExportsSection";
import { SavedReportsSection }       from "./analytics/SavedReportsSection";

// ─── Section navigation ───────────────────────────────────────────────────────

const SECTIONS = [
  { id: "health",      label: "Church Health" },
  { id: "attendance",  label: "Attendance" },
  { id: "discipleship",label: "Discipleship" },
  { id: "retention",   label: "Retention" },
  { id: "growth",      label: "Spiritual Growth" },
  { id: "rooms",       label: "Rooms" },
  { id: "sermons",     label: "Sermons" },
  { id: "bible",       label: "Bible" },
  { id: "care",        label: "Pastoral Care" },
  { id: "insights",    label: "Insights" },
  { id: "exports",     label: "Exports" },
  { id: "saved",       label: "Saved Reports" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

// ─── useSection hook — independent fetch with auto-refresh ───────────────────

function useSection<T>(
  fetcher: () => Promise<T>,
  refreshMs = 60_000,
): { data: T | null; loading: boolean; error: string | undefined; refetch: () => void } {
  const [data,    setData]    = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | undefined>();
  // Keep a stable ref to the latest fetcher so the interval always calls the
  // most recent version without needing to be in deps (avoids infinite loops).
  const fetcherRef = useRef<() => Promise<T>>(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(undefined);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
    const timer = setInterval(run, refreshMs);
    return () => clearInterval(timer);
  }, [run, refreshMs]);

  return { data, loading, error, refetch: run };
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { onNavigate: (nav: AdminNav) => void }

export default function AnalyticsCentre({ onNavigate }: Props) {
  const { user } = useAuth();
  const auth: api.AuthHeaders = { userId: user?.id ?? "", userRole: user?.role ?? "admin" };
  const [activeSection, setActiveSection] = useState<SectionId>("health");

  // ── Independent data fetchers ─────────────────────────────────────────────
  const kpis        = useSection(() => api.getHealthKpis(auth));
  const attendance  = useSection(() => api.getAttendanceTrends(auth));
  const discipleship= useSection(() => api.getDiscipleshipAnalytics(auth));
  const retention   = useSection(() => api.getRetentionFunnel(auth));
  const growth      = useSection(() => api.getSpiritualGrowth(auth));
  const rooms       = useSection(() => api.getRoomAnalytics(auth));
  const sermons     = useSection(() => api.getSermonAnalytics(auth));
  const bible       = useSection(() => api.getBibleAnalytics(auth));
  const care        = useSection(() => api.getPastoralCareAnalytics(auth));
  const insights    = useSection(() => api.getInsights(auth));
  const saved       = useSection(() => api.listSavedReports(auth));

  // ── Saved report CRUD ─────────────────────────────────────────────────────
  async function handleSaveReport(name: string, description: string) {
    await api.createSavedReport(auth, { name, description });
    saved.refetch();
  }
  async function handleDeleteReport(id: string) {
    await api.deleteSavedReport(auth, id);
    saved.refetch();
  }

  // ── Section content ───────────────────────────────────────────────────────
  function renderSection() {
    switch (activeSection) {
      case "health":
        return <ChurchHealthSection data={kpis.data} loading={kpis.loading} error={kpis.error} />;
      case "attendance":
        return <AttendanceTrendsSection data={attendance.data} loading={attendance.loading} error={attendance.error} />;
      case "discipleship":
        return <DiscipleshipSection data={discipleship.data} loading={discipleship.loading} error={discipleship.error} />;
      case "retention":
        return <RetentionFunnelSection data={retention.data} loading={retention.loading} error={retention.error} />;
      case "growth":
        return <SpiritualGrowthSection data={growth.data} loading={growth.loading} error={growth.error} />;
      case "rooms":
        return <RoomAnalyticsSection data={rooms.data} loading={rooms.loading} error={rooms.error} />;
      case "sermons":
        return <SermonAnalyticsSection data={sermons.data} loading={sermons.loading} error={sermons.error} />;
      case "bible":
        return <BibleAnalyticsSection data={bible.data} loading={bible.loading} error={bible.error} />;
      case "care":
        return <PastoralCareSection data={care.data} loading={care.loading} error={care.error} />;
      case "insights":
        return <PredictiveInsightsSection data={insights.data} loading={insights.loading} error={insights.error} />;
      case "exports":
        return (
          <ExportsSection
            allData={{
              kpis: kpis.data as Record<string, number | string> | null,
              attendance: attendance.data,
              discipleship: discipleship.data,
              rooms: rooms.data,
            }}
          />
        );
      case "saved":
        return (
          <SavedReportsSection
            data={saved.data}
            loading={saved.loading}
            error={saved.error}
            onSave={handleSaveReport}
            onDelete={handleDeleteReport}
          />
        );
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-[17px] font-bold text-gray-900">Analytics Centre</h1>
          <p className="text-[12px] text-gray-500 mt-0.5">
            Live discipleship analytics • What is happening in our church?
          </p>
        </div>
      </div>

      {/* Section nav */}
      <div className="bg-white border-b border-gray-200 px-6 overflow-x-auto">
        <div className="max-w-7xl mx-auto flex gap-0">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`
                px-4 py-3 text-[12px] font-medium whitespace-nowrap border-b-2 transition-colors
                ${activeSection === s.id
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"}
              `}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {renderSection()}
      </div>
    </div>
  );
}
