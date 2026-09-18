import React from "react";
import {
  Users, Activity, Calendar, BookOpen,
  CheckCircle2, Home, MessageSquare, Heart, Star, Droplets,
} from "lucide-react";
import { KpiCard, SectionHeader, SectionLoader, SectionError } from "./shared";
import type { ChurchHealthKpis } from "@/lib/analytics-api";

interface Props {
  data: ChurchHealthKpis | null;
  loading: boolean;
  error?: string;
}

export function ChurchHealthSection({ data, loading, error }: Props) {
  if (loading) return <SectionLoader />;
  if (error || !data) return <SectionError msg={error} />;

  const cards = [
    { label: "Total Members",         value: data.totalMembers,          icon: <Users size={16} className="text-indigo-600" />,   color: "bg-indigo-50" },
    { label: "Active This Week",      value: data.activeThisWeek,        icon: <Activity size={16} className="text-teal-600" />,   color: "bg-teal-50" },
    { label: "Attendance Rate",       value: data.attendancePct,         suffix: "%", icon: <Calendar size={16} className="text-blue-600" />,    color: "bg-blue-50" },
    { label: "Daily Rhythm",          value: data.dailyRhythmPct,        suffix: "%", icon: <BookOpen size={16} className="text-purple-600" />,  color: "bg-purple-50" },
    { label: "Walk Completion",       value: data.walkCompletionPct,     suffix: "%", icon: <CheckCircle2 size={16} className="text-green-600" />,color: "bg-green-50" },
    { label: "Room Participation",    value: data.roomParticipationPct,  suffix: "%", icon: <Home size={16} className="text-amber-600" />,       color: "bg-amber-50" },
    { label: "Prayer Follow-ups",     value: data.openPrayerRequests,    icon: <MessageSquare size={16} className="text-rose-600" />, color: "bg-rose-50" },
    { label: "New Believers (30d)",   value: data.newBelievers,          icon: <Star size={16} className="text-yellow-600" />,     color: "bg-yellow-50" },
    { label: "Serving",               value: data.serving,               icon: <Heart size={16} className="text-pink-600" />,      color: "bg-pink-50" },
    { label: "Baptisms",              value: data.baptisms,              icon: <Droplets size={16} className="text-cyan-600" />,   color: "bg-cyan-50" },
  ];

  return (
    <section className="mb-10">
      <SectionHeader
        icon={Activity}
        title="Church Health Overview"
        subtitle="Key discipleship indicators across the whole church"
        iconColor="text-indigo-500"
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((c) => (
          <KpiCard key={c.label} {...c} />
        ))}
      </div>
    </section>
  );
}
