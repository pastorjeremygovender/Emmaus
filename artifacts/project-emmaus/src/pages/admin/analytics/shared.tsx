/**
 * shared.tsx — Shared primitives for Analytics Centre sections.
 */

import React from "react";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";

// ─── Loading / Error states ───────────────────────────────────────────────────

export function SectionLoader() {
  return (
    <div className="flex items-center justify-center py-16 text-gray-400">
      <Loader2 size={20} className="animate-spin mr-2" />
      <span className="text-sm">Loading…</span>
    </div>
  );
}

export function SectionError({ msg }: { msg?: string }) {
  return (
    <div className="py-8 text-center text-sm text-gray-400">
      {msg ?? "Could not load data."}
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

interface KpiProps {
  label: string;
  value: number | string;
  suffix?: string;
  icon: React.ReactNode;
  color: string;   // tailwind bg class
  onClick?: () => void;
}

export function KpiCard({ label, value, suffix, icon, color, onClick }: KpiProps) {
  return (
    <button
      onClick={onClick}
      className={`
        rounded-2xl p-5 flex flex-col gap-3 text-left transition-transform
        ${onClick ? "hover:scale-[1.02] cursor-pointer" : "cursor-default"}
        bg-white border border-gray-100 shadow-sm
      `}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 tabular-nums">
          {value}{suffix && <span className="text-sm font-medium text-gray-500 ml-0.5">{suffix}</span>}
        </p>
        <p className="text-[12px] text-gray-500 mt-0.5">{label}</p>
      </div>
    </button>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

export function SectionHeader({
  icon,
  title,
  subtitle,
  iconColor = "text-gray-500",
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  iconColor?: string;
}) {
  const Icon = icon;
  return (
    <div className="flex items-start gap-3 mb-6">
      <div className="mt-0.5">
        <Icon size={18} className={iconColor} />
      </div>
      <div>
        <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-[12px] text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── Trend badge ──────────────────────────────────────────────────────────────

export function TrendBadge({ change }: { change?: number }) {
  if (change === undefined || change === null) return null;
  if (Math.abs(change) < 1) return <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-400"><Minus size={10} /> Flat</span>;
  const positive = change > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${positive ? "text-emerald-600" : "text-red-500"}`}>
      {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {positive ? "+" : ""}{change}%
    </span>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-10 text-gray-400 text-sm">{message}</div>
  );
}

// ─── Stat row ─────────────────────────────────────────────────────────────────

export function StatRow({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-b-0">
      <span className="text-[13px] text-gray-700">{label}</span>
      <div className="text-right">
        <span className="text-[13px] font-semibold text-gray-900 tabular-nums">{value}</span>
        {sub && <span className="block text-[10px] text-gray-400">{sub}</span>}
      </div>
    </div>
  );
}
