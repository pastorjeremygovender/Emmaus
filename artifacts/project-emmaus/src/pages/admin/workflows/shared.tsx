import React from "react";
import type { TaskStatus, TaskPriority } from "@/lib/workflows-api";

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<TaskStatus, string> = {
  new: "bg-slate-100 text-slate-700",
  assigned: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-800",
  waiting: "bg-purple-100 text-purple-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  new: "New",
  assigned: "Assigned",
  in_progress: "In Progress",
  waiting: "Waiting",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── Priority badge ───────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "bg-gray-100 text-gray-500",
  normal: "bg-blue-50 text-blue-600",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${PRIORITY_COLORS[priority]}`}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

// ─── Section loader / error / empty ──────────────────────────────────────────

export function SectionLoader() {
  return (
    <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
      <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      Loading…
    </div>
  );
}

export function SectionError({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
      {message}
    </div>
  );
}

export function EmptyState({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <div className="text-gray-300 text-5xl">{icon}</div>
      <p className="text-gray-600 font-medium">{title}</p>
      {sub && <p className="text-gray-400 text-sm max-w-xs">{sub}</p>}
    </div>
  );
}

// ─── Small stat card ──────────────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "red" | "amber" | "green" | "blue" | "default";
}) {
  const accentClass =
    accent === "red"
      ? "border-red-200 bg-red-50"
      : accent === "amber"
      ? "border-amber-200 bg-amber-50"
      : accent === "green"
      ? "border-emerald-200 bg-emerald-50"
      : accent === "blue"
      ? "border-blue-200 bg-blue-50"
      : "border-gray-200 bg-white";

  const valClass =
    accent === "red"
      ? "text-red-700"
      : accent === "amber"
      ? "text-amber-800"
      : accent === "green"
      ? "text-emerald-700"
      : accent === "blue"
      ? "text-blue-700"
      : "text-gray-900";

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${accentClass}`}>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold ${valClass}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

// ─── Relative date helper ─────────────────────────────────────────────────────

export function relDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric", month: "short", year: "numeric",
  });
}
